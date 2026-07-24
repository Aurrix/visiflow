import { serializeVisiFlowMarkdown } from './project-format'
import type { ProjectDirectoryHandle } from './project-loader'
import type {
  ComponentCall,
  ComponentDocumentMeta,
  Connection,
  ProjectWorkspace,
  VisiFlowConfig,
} from './types'

export type ProjectSaveResult = { ok: true; workspace: ProjectWorkspace } | { ok: false; errors: string[] }

const normalizePath = (path: string) => path.replaceAll('\\', '/').replace(/^\.\/+/, '')
const extensionFor = (file: File) => {
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (extension) return extension
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/svg+xml') return 'svg'
  return 'png'
}

export function assetPathFor(file: File, kind: 'screen' | 'component', id: string, state?: 'active' | 'inactive') {
  const folder = kind === 'screen' ? 'screens' : 'components'
  const suffix = state ? `-${state}` : ''
  return `assets/${folder}/${id}${suffix}.${extensionFor(file)}`
}

export function stageAsset(workspace: ProjectWorkspace, path: string, file: File) {
  workspace.pendingAssets.set(normalizePath(path), file)
}

export function assignConnectionOwner(workspace: ProjectWorkspace, connectionId: string, componentId: string) {
  workspace.connectionOwners.set(connectionId, componentId)
}

export function renameWorkspaceComponent(workspace: ProjectWorkspace, oldId: string, nextId: string) {
  const document = workspace.components.get(oldId)
  if (document) {
    workspace.components.delete(oldId)
    document.meta.id = nextId
    workspace.components.set(nextId, document)
  }
  for (const [connectionId, owner] of workspace.connectionOwners) {
    if (owner === oldId) workspace.connectionOwners.set(connectionId, nextId)
  }
}

export function removeWorkspaceComponent(workspace: ProjectWorkspace, componentId: string) {
  const document = workspace.components.get(componentId)
  if (document) {
    workspace.obsoletePaths.add(document.path)
    workspace.components.delete(componentId)
  }
  for (const [connectionId, owner] of workspace.connectionOwners) {
    if (owner === componentId) workspace.connectionOwners.delete(connectionId)
  }
}

function callFromConnection(connection: Connection, ownerId: string): ComponentCall | null {
  const componentIsSource = connection.source.kind === 'component' && connection.source.id === ownerId
  const componentIsTarget = connection.target.kind === 'component' && connection.target.id === ownerId
  if (!componentIsSource && !componentIsTarget) return null
  return {
    id: connection.id,
    name: connection.name,
    direction: componentIsSource ? 'outgoing' : 'incoming',
    peer: componentIsSource ? connection.target : connection.source,
    protocol: connection.protocol,
    method: connection.method,
    endpoint: connection.endpoint,
    description: connection.description,
    cadence: connection.cadence,
  }
}

export function synchronizeWorkspace(workspace: ProjectWorkspace, config: VisiFlowConfig): ProjectWorkspace {
  const next: ProjectWorkspace = {
    ...workspace,
    manifest: structuredClone(workspace.manifest),
    components: new Map(workspace.components),
    connectionOwners: new Map(workspace.connectionOwners),
    pendingAssets: new Map(workspace.pendingAssets),
    obsoletePaths: new Set(workspace.obsoletePaths),
  }
  next.projectBody = config.app.description
  const app = {
    id: config.app.id,
    name: config.app.name,
    platform: config.app.platform,
    device: config.app.device,
    initialScreenId: config.app.initialScreenId,
    ...(config.app.accent ? { accent: config.app.accent } : {}),
  }
  next.manifest = {
    visiflow: 2,
    kind: 'project',
    app,
    screens: structuredClone(config.screens),
    tasks: structuredClone(config.tasks),
    systems: structuredClone(config.systems),
    scenarios: structuredClone(config.scenarios),
    initialScenarioId: config.initialScenarioId,
    componentFiles: [],
    connections: [],
  }

  const currentIds = new Set(config.components.map((component) => component.id))
  for (const [id, document] of next.components) {
    if (!currentIds.has(id)) {
      next.obsoletePaths.add(document.path)
      next.components.delete(id)
    }
  }

  for (const connection of config.connections) {
    let owner = next.connectionOwners.get(connection.id)
    const ownerIsAttached = owner && (
      (connection.source.kind === 'component' && connection.source.id === owner) ||
      (connection.target.kind === 'component' && connection.target.id === owner)
    )
    if (!ownerIsAttached) {
      owner = connection.source.kind === 'component'
        ? connection.source.id
        : connection.target.kind === 'component' ? connection.target.id : undefined
    }
    if (owner) next.connectionOwners.set(connection.id, owner)
    else next.connectionOwners.delete(connection.id)
  }

  for (const component of config.components) {
    const existing = next.components.get(component.id)
    const path = existing?.path ?? `screens/${component.screenId}/${component.id}.visiflow.md`
    const calls = config.connections.flatMap((connection) => {
      let owner = next.connectionOwners.get(connection.id)
      if (!owner || !currentIds.has(owner)) {
        owner = connection.source.kind === 'component'
          ? connection.source.id
          : connection.target.kind === 'component' ? connection.target.id : undefined
        if (owner) next.connectionOwners.set(connection.id, owner)
      }
      if (owner !== component.id) return []
      const call = callFromConnection(connection, component.id)
      return call ? [call] : []
    })
    const meta: ComponentDocumentMeta = {
      visiflow: 2,
      kind: 'component',
      id: component.id,
      screenId: component.screenId,
      name: component.name,
      type: component.type,
      tags: component.tags,
      defaultState: component.defaultState,
      visual: structuredClone(component.visual),
      calls,
    }
    next.components.set(component.id, { path, meta, body: component.description })
  }

  next.manifest.connections = config.connections.filter((connection) => !next.connectionOwners.has(connection.id)).map((connection) => structuredClone(connection))
  next.manifest.componentFiles = [...next.components.values()].map((document) => document.path).sort()
  return next
}

async function getParentDirectory(root: ProjectDirectoryHandle, path: string, create: boolean) {
  const parts = normalizePath(path).split('/')
  const fileName = parts.pop()!
  let directory = root
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create })
  return { directory, fileName }
}

async function writeFile(root: ProjectDirectoryHandle, path: string, data: string | File) {
  const { directory, fileName } = await getParentDirectory(root, path, true)
  const handle = await directory.getFileHandle(fileName, { create: true })
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}

async function removeFile(root: ProjectDirectoryHandle, path: string) {
  const { directory, fileName } = await getParentDirectory(root, path, false)
  await directory.removeEntry(fileName)
}

export async function saveProjectWorkspace(workspace: ProjectWorkspace, config: VisiFlowConfig): Promise<ProjectSaveResult> {
  if (workspace.mode !== 'directory' || !workspace.directoryHandle) {
    return { ok: false, errors: ['This project is read-only. Open its folder in the editor to save changes.'] }
  }
  const root = workspace.directoryHandle as ProjectDirectoryHandle
  const synchronized = synchronizeWorkspace(workspace, config)
  try {
    for (const [path, file] of synchronized.pendingAssets) await writeFile(root, path, file)
    for (const document of synchronized.components.values()) {
      await writeFile(root, document.path, serializeVisiFlowMarkdown(document.meta, document.body))
    }
    await writeFile(root, synchronized.manifestPath, serializeVisiFlowMarkdown(synchronized.manifest, synchronized.projectBody))
    for (const path of synchronized.obsoletePaths) {
      try {
        await removeFile(root, path)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
      }
    }
    synchronized.pendingAssets.clear()
    synchronized.obsoletePaths.clear()
    return { ok: true, workspace: synchronized }
  } catch (error) {
    return { ok: false, errors: [`Project save was incomplete: ${error instanceof Error ? error.message : String(error)}`] }
  }
}
