import { setProjectAssetSources } from './assets'
import { assembleProject, parseVisiFlowMarkdown } from './project-format'
import type { ComponentDocument, LoadedProject, ProjectManifestMeta, VisiFlowConfig } from './types'

export type ProjectLoadResult = { ok: true; data: LoadedProject } | { ok: false; errors: string[] }

export interface WritableHandle {
  write: (data: string | Blob | ArrayBuffer) => Promise<void>
  close: () => Promise<void>
}

export interface ProjectFileHandle {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<WritableHandle>
}

export interface ProjectDirectoryHandle {
  kind: 'directory'
  name: string
  entries: () => AsyncIterableIterator<[string, ProjectFileHandle | ProjectDirectoryHandle]>
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<ProjectDirectoryHandle>
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<ProjectFileHandle>
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<ProjectDirectoryHandle>
}

const normalizePath = (path: string) => path.replaceAll('\\', '/').replace(/^\.\/+/, '')
const isVisiFlowMarkdown = (path: string) => path.toLowerCase().endsWith('.visiflow.md')
const isExternalSource = (source: string) => /^(?:data:|blob:|https?:|\/)/i.test(source)

async function scanDirectory(
  directory: ProjectDirectoryHandle,
  prefix = '',
  files = new Map<string, { file: File; handle: ProjectFileHandle }>(),
) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') await scanDirectory(handle, path, files)
    else files.set(path, { file: await handle.getFile(), handle })
  }
  return files
}

function assetReferences(config: VisiFlowConfig): string[] {
  const sources = [
    ...config.screens.flatMap((screen) => screen.backgroundImage ? [screen.backgroundImage] : []),
    ...config.components.flatMap((component) => [
      component.visual.src,
      component.visual.states?.active?.src,
      component.visual.states?.inactive?.src,
    ].filter((source): source is string => Boolean(source))),
  ]
  return [...new Set(sources.map(normalizePath).filter((source) => !isExternalSource(source)))]
}

function withAssets(project: LoadedProject, sources: Map<string, string>): ProjectLoadResult {
  project.assetSources = sources
  setProjectAssetSources(sources)
  return { ok: true, data: project }
}

export async function loadProjectFromDirectory(directory: ProjectDirectoryHandle): Promise<ProjectLoadResult> {
  try {
    const files = await scanDirectory(directory)
    const documentPaths = [...files.keys()].filter(isVisiFlowMarkdown).sort()
    if (!documentPaths.length) return { ok: false, errors: ['No *.visiflow.md files were found in this folder.'] }

    const parsed = await Promise.all(documentPaths.map(async (path) => {
      const result = parseVisiFlowMarkdown(await files.get(path)!.file.text(), path)
      return { path, result }
    }))
    const errors = parsed.flatMap((item) => item.result.ok ? [] : item.result.errors)
    if (errors.length) return { ok: false, errors }

    const projectDocuments = parsed.filter((item) => item.result.ok && item.result.data.meta.kind === 'project')
    if (projectDocuments.length !== 1) {
      return { ok: false, errors: [`Expected exactly one kind: project manifest; found ${projectDocuments.length}.`] }
    }
    const projectDocument = projectDocuments[0]
    if (projectDocument.path.toLowerCase() !== 'project.visiflow.md') {
      return { ok: false, errors: [`Project manifest must be at the folder root and named "project.visiflow.md"; found "${projectDocument.path}".`] }
    }
    const projectData = projectDocument.result.ok ? projectDocument.result.data : null
    if (!projectData || projectData.meta.kind !== 'project') return { ok: false, errors: ['Project manifest could not be parsed.'] }

    const components: ComponentDocument[] = parsed.flatMap((item) => {
      if (!item.result.ok || item.result.data.meta.kind !== 'component') return []
      return [{ path: item.path, meta: item.result.data.meta, body: item.result.data.body }]
    })
    const discoveredPaths = new Set(components.map((component) => component.path))
    const missing = projectData.meta.componentFiles.filter((path) => !discoveredPaths.has(normalizePath(path)))
    if (missing.length) return { ok: false, errors: missing.map((path) => `${projectDocument.path}: componentFiles references missing file "${path}".`) }

    const manifest: ProjectManifestMeta = { ...projectData.meta, componentFiles: components.map((component) => component.path).sort() }
    const assembled = assembleProject(projectDocument.path, manifest, projectData.body, components, 'directory')
    if (!assembled.ok) return assembled
    assembled.data.workspace.directoryHandle = directory

    const sources = new Map<string, string>()
    const referencedAssets = assetReferences(assembled.data.config)
    const missingAssets = referencedAssets.filter((source) => !files.has(source))
    if (missingAssets.length) return { ok: false, errors: missingAssets.map((source) => `${projectDocument.path}: Missing asset "${source}".`) }
    for (const source of referencedAssets) {
      const entry = files.get(source)
      if (entry) sources.set(source, URL.createObjectURL(entry.file))
    }
    return withAssets(assembled.data, sources)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, errors: ['Folder selection was cancelled.'] }
    return { ok: false, errors: [`Could not read project folder: ${error instanceof Error ? error.message : String(error)}`] }
  }
}

export async function loadProjectFromHttp(manifestUrl: string): Promise<ProjectLoadResult> {
  try {
    const resolvedManifestUrl = new URL(manifestUrl, window.location.href)
    const response = await fetch(resolvedManifestUrl)
    if (!response.ok) return { ok: false, errors: [`${resolvedManifestUrl}: HTTP ${response.status}`] }
    const parsedManifest = parseVisiFlowMarkdown(await response.text(), resolvedManifestUrl.pathname)
    if (!parsedManifest.ok) return parsedManifest
    if (parsedManifest.data.meta.kind !== 'project') return { ok: false, errors: [`${resolvedManifestUrl}: Expected kind: project.`] }
    const manifest = parsedManifest.data.meta
    const componentResults = await Promise.all(manifest.componentFiles.map(async (path) => {
      const normalized = normalizePath(path)
      const url = new URL(normalized, resolvedManifestUrl)
      const componentResponse = await fetch(url)
      if (!componentResponse.ok) return { ok: false as const, errors: [`${normalized}: HTTP ${componentResponse.status}`] }
      const parsed = parseVisiFlowMarkdown(await componentResponse.text(), normalized)
      if (!parsed.ok) return parsed
      if (parsed.data.meta.kind !== 'component') return { ok: false as const, errors: [`${normalized}: Expected kind: component.`] }
      return { ok: true as const, data: { path: normalized, meta: parsed.data.meta, body: parsed.data.body } }
    }))
    const errors = componentResults.flatMap((result) => result.ok ? [] : result.errors)
    if (errors.length) return { ok: false, errors }
    const components = componentResults.flatMap((result) => result.ok ? [result.data] : [])
    const assembled = assembleProject(resolvedManifestUrl.pathname, manifest, parsedManifest.data.body, components, 'http')
    if (!assembled.ok) return assembled
    assembled.data.workspace.name = manifest.app.name

    const sources = new Map<string, string>()
    for (const source of assetReferences(assembled.data.config)) {
      sources.set(source, new URL(source, resolvedManifestUrl).href)
    }
    return withAssets(assembled.data, sources)
  } catch (error) {
    return { ok: false, errors: [`Could not load project: ${error instanceof Error ? error.message : String(error)}`] }
  }
}

export async function pickProjectDirectory(): Promise<ProjectLoadResult> {
  const picker = window as PickerWindow
  if (!picker.showDirectoryPicker) return { ok: false, errors: ['Open Folder requires a browser with the File System Access API.'] }
  try {
    return await loadProjectFromDirectory(await picker.showDirectoryPicker({ mode: 'readwrite' }))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, errors: ['Folder selection was cancelled.'] }
    return { ok: false, errors: [`Could not open folder: ${error instanceof Error ? error.message : String(error)}`] }
  }
}

export function defaultProjectUrl(): string {
  const query = new URLSearchParams(window.location.search).get('project')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="visiflow-project"]')?.content
  return query || meta || 'demo/project.visiflow.md'
}
