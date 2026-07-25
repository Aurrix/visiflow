import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import {
  appSchema,
  cadenceSchema,
  componentStateSchema,
  componentVisualSchema,
  connectionSchema,
  endpointSchema,
  idSchema,
  parseConfig,
  scenarioSchema,
  screenSchema,
  systemSchema,
  taskSchema,
  textureLayerSchema,
} from './config'
import type {
  ComponentDocument,
  ComponentDocumentMeta,
  LoadedProject,
  ProjectManifestMeta,
  ProjectWorkspace,
  VisiFlowConfig,
} from './types'

const safeProjectPath = z.string().min(1).refine((path) => {
  const normalized = path.replaceAll('\\', '/')
  return !normalized.startsWith('/') && !/^[a-z]+:/i.test(normalized) && !normalized.split('/').includes('..')
}, 'Path must be relative to the project root and cannot contain ".."')

export const projectManifestSchema = z.object({
  visiflow: z.literal(2),
  kind: z.literal('project'),
  app: appSchema.omit({ description: true }),
  screens: z.array(screenSchema).min(1),
  textureLayers: z.array(textureLayerSchema).default([]),
  tasks: z.array(taskSchema),
  systems: z.array(systemSchema),
  scenarios: z.array(scenarioSchema).min(1),
  initialScenarioId: idSchema.optional(),
  componentFiles: z.array(safeProjectPath),
  connections: z.array(connectionSchema).default([]),
})

export const componentCallSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  direction: z.enum(['outgoing', 'incoming']),
  peer: endpointSchema,
  protocol: z.string().min(1),
  method: z.string().optional(),
  endpoint: z.string().optional(),
  description: z.string().default(''),
  cadence: cadenceSchema.optional(),
}).superRefine((value, context) => {
  if (value.peer.kind === 'task' && value.cadence) {
    context.addIssue({ code: 'custom', message: 'Task-related calls inherit cadence from the task trigger', path: ['cadence'] })
  } else if (value.peer.kind !== 'task' && !value.cadence) {
    context.addIssue({ code: 'custom', message: 'Direct calls require cadence', path: ['cadence'] })
  }
})

export const componentDocumentSchema = z.object({
  visiflow: z.literal(2),
  kind: z.literal('component'),
  id: idSchema,
  screenId: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string()).optional(),
  defaultState: componentStateSchema.optional(),
  visual: componentVisualSchema,
  calls: z.array(componentCallSchema).default([]),
})

export const frontmatterSchema = z.discriminatedUnion('kind', [projectManifestSchema, componentDocumentSchema])

export type ParsedMarkdown = {
  meta: z.infer<typeof frontmatterSchema>
  body: string
}

const formatIssues = (error: z.ZodError, path: string) =>
  error.issues.map((issue) => `${path}:${issue.path.join('.') || 'frontmatter'}: ${issue.message}`)

export function parseVisiFlowMarkdown(text: string, path: string): { ok: true; data: ParsedMarkdown } | { ok: false; errors: string[] } {
  const normalized = text.replaceAll('\r\n', '\n')
  const match = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/)
  if (!match) return { ok: false, errors: [`${path}: Missing YAML front matter delimited by "---".`] }
  let input: unknown
  try {
    input = parseYaml(match[1])
  } catch (error) {
    return { ok: false, errors: [`${path}: Invalid YAML: ${error instanceof Error ? error.message : String(error)}`] }
  }
  if (typeof input === 'object' && input !== null && 'visiflow' in input && input.visiflow === 1) {
    return { ok: false, errors: [`${path}: VisiFlow project format v1 must be migrated to v2 before it can be opened.`] }
  }
  const result = frontmatterSchema.safeParse(input)
  if (!result.success) return { ok: false, errors: formatIssues(result.error, path) }
  return { ok: true, data: { meta: result.data, body: match[2].trim() } }
}

export function serializeVisiFlowMarkdown(meta: ProjectManifestMeta | ComponentDocumentMeta, body: string): string {
  return `---\n${stringifyYaml(meta, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`
}

export function assembleProject(
  manifestPath: string,
  manifest: ProjectManifestMeta,
  projectBody: string,
  documents: ComponentDocument[],
  mode: ProjectWorkspace['mode'],
): { ok: true; data: LoadedProject } | { ok: false; errors: string[] } {
  const components = documents.map((document) => ({
    id: document.meta.id,
    screenId: document.meta.screenId,
    name: document.meta.name,
    type: document.meta.type,
    description: document.body,
    tags: document.meta.tags,
    defaultState: document.meta.defaultState,
    visual: document.meta.visual,
  }))
  const connectionOwners = new Map<string, string>()
  const ownedConnections = documents.flatMap((document) => document.meta.calls.map((call) => {
    connectionOwners.set(call.id, document.meta.id)
    const component = { kind: 'component' as const, id: document.meta.id }
    return {
      id: call.id,
      name: call.name,
      source: call.direction === 'outgoing' ? component : call.peer,
      target: call.direction === 'outgoing' ? call.peer : component,
      protocol: call.protocol,
      method: call.method,
      endpoint: call.endpoint,
      description: call.description,
      cadence: call.cadence,
    }
  }))
  const config: VisiFlowConfig = {
    schemaVersion: 2,
    app: { ...manifest.app, description: projectBody },
    screens: manifest.screens,
    textureLayers: manifest.textureLayers ?? [],
    components,
    tasks: manifest.tasks,
    systems: manifest.systems,
    connections: [...manifest.connections, ...ownedConnections],
    scenarios: manifest.scenarios,
    initialScenarioId: manifest.initialScenarioId,
  }
  const assetSources = [
    ...config.screens.flatMap((screen) => screen.backgroundImage ? [screen.backgroundImage] : []),
    ...config.textureLayers.map((layer) => layer.src),
    ...config.components.flatMap((component) => [
      component.visual.src,
      component.visual.states?.active?.src,
      component.visual.states?.inactive?.src,
    ].filter((source): source is string => Boolean(source))),
  ]
  const unsafeAssets = assetSources.filter((source) => {
    if (/^(?:data:|https?:)/i.test(source)) return false
    const normalized = source.replaceAll('\\', '/')
    return normalized.startsWith('/') || /^[a-z]+:/i.test(normalized) || normalized.split('/').includes('..')
  })
  if (unsafeAssets.length) return {
    ok: false,
    errors: unsafeAssets.map((source) => `${manifestPath}: Asset path "${source}" must be relative to the project root and cannot contain "..".`),
  }
  const result = parseConfig(config)
  if (!result.ok) return { ok: false, errors: result.errors.map((error) => `${manifestPath}: ${error}`) }
  return {
    ok: true,
    data: {
      config: result.data,
      workspace: {
        mode,
        name: manifest.app.name,
        manifestPath,
        manifest,
        projectBody,
        components: new Map(documents.map((document) => [document.meta.id, document])),
        connectionOwners,
        pendingAssets: new Map(),
        obsoletePaths: new Set(),
      },
      assetSources: new Map(),
    },
  }
}
