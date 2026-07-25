import { z } from 'zod'
import type { VisiFlowConfig } from './types'

export const idSchema = z.string().trim().min(1)
export const componentStateSchema = z.enum(['active', 'inactive'])
export const visualStyleSchema = z.object({
  background: z.string().optional(),
  color: z.string().optional(),
  borderColor: z.string().optional(),
  borderRadius: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).optional(),
  text: z.string().optional(),
  src: z.string().optional(),
  imageFit: z.enum(['cover', 'contain', 'fill']).optional(),
  imagePosition: z.string().optional(),
  imageOpacity: z.number().min(0).max(1).optional(),
})

export const appSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  platform: z.string().min(1),
  description: z.string(),
  device: z.enum(['ios', 'android', 'web', 'desktop', 'custom']),
  initialScreenId: idSchema,
  accent: z.string().optional(),
  phoneBackgroundColor: z.string().optional(),
})

export const screenSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  parentId: idSchema.optional(),
  group: z.string().trim().min(1).optional(),
  order: z.number().int().optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  contentHeight: z.number().positive().optional(),
  background: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundSize: z.string().optional(),
  backgroundPosition: z.string().optional(),
  showSystemUi: z.boolean().optional(),
})

export const componentVisualSchema = visualStyleSchema.extend({
  kind: z.enum(['hotspot', 'container', 'text', 'button', 'input', 'badge', 'image']),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  layout: z.object({
    horizontal: z.enum(['absolute', 'start', 'center', 'end']).optional(),
    row: z.string().min(1).optional(),
    order: z.number().optional(),
    justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
    gap: z.number().min(0).optional(),
  }).optional(),
  states: z.object({ active: visualStyleSchema.optional(), inactive: visualStyleSchema.optional() }).optional(),
})

export const componentSchema = z.object({
  id: idSchema,
  screenId: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  defaultState: componentStateSchema.optional(),
  visual: componentVisualSchema,
})

export const systemSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string(),
  color: z.string().optional(),
  icon: z.string().optional(),
  placement: z.enum(['left', 'right']).optional(),
})

export const cadenceSchema = z.object({
  kind: z.enum(['user-event', 'lifecycle', 'scheduled', 'recurring', 'polling', 'push', 'continuous', 'custom']),
  label: z.string().min(1),
  intervalMs: z.number().positive().optional(),
  cron: z.string().optional(),
})
export const taskSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string(),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('app') }),
    z.object({ kind: z.literal('screen'), screenId: idSchema }),
  ]),
  trigger: cadenceSchema,
  defaultState: componentStateSchema.optional(),
})
export const endpointSchema = z.object({ kind: z.enum(['component', 'task', 'system']), id: idSchema })
export const connectionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  source: endpointSchema,
  target: endpointSchema,
  protocol: z.string().min(1),
  method: z.string().optional(),
  endpoint: z.string().optional(),
  description: z.string(),
  cadence: cadenceSchema.optional(),
})
export const scenarioSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  screenId: idSchema.optional(),
  componentStates: z.record(z.string(), componentStateSchema),
  taskStates: z.record(z.string(), componentStateSchema),
})

export const runtimeConfigSchema = z.object({
  schemaVersion: z.literal(2),
  app: appSchema,
  screens: z.array(screenSchema).min(1),
  components: z.array(componentSchema),
  tasks: z.array(taskSchema),
  systems: z.array(systemSchema),
  connections: z.array(connectionSchema),
  scenarios: z.array(scenarioSchema).min(1),
  initialScenarioId: idSchema.optional(),
}).superRefine((value, context) => {
  const unique = (items: { id: string }[], path: string) => {
    const seen = new Set<string>()
    items.forEach((item, index) => {
      if (seen.has(item.id)) context.addIssue({ code: 'custom', message: `Duplicate id "${item.id}"`, path: [path, index, 'id'] })
      seen.add(item.id)
    })
  }
  unique(value.screens, 'screens')
  unique(value.components, 'components')
  unique(value.tasks, 'tasks')
  unique(value.systems, 'systems')
  unique(value.connections, 'connections')
  unique(value.scenarios, 'scenarios')

  const screenIds = new Set(value.screens.map((item) => item.id))
  const screenById = new Map(value.screens.map((item) => [item.id, item]))
  const componentIds = new Set(value.components.map((item) => item.id))
  const taskIds = new Set(value.tasks.map((item) => item.id))
  const systemIds = new Set(value.systems.map((item) => item.id))
  const scenarioIds = new Set(value.scenarios.map((item) => item.id))
  if (!screenIds.has(value.app.initialScreenId)) context.addIssue({ code: 'custom', message: 'Unknown initial screen', path: ['app', 'initialScreenId'] })
  if (value.initialScenarioId && !scenarioIds.has(value.initialScenarioId)) context.addIssue({ code: 'custom', message: 'Unknown initial scenario', path: ['initialScenarioId'] })
  value.screens.forEach((screen, index) => {
    if (!screen.parentId) return
    if (!screenIds.has(screen.parentId)) {
      context.addIssue({ code: 'custom', message: 'Unknown parent screen', path: ['screens', index, 'parentId'] })
      return
    }
    if (screen.parentId === screen.id) {
      context.addIssue({ code: 'custom', message: 'A screen cannot be its own parent', path: ['screens', index, 'parentId'] })
      return
    }
    const visited = new Set([screen.id])
    let ancestor = screenById.get(screen.parentId)
    while (ancestor) {
      if (visited.has(ancestor.id)) {
        context.addIssue({ code: 'custom', message: 'Screen hierarchy contains a cycle', path: ['screens', index, 'parentId'] })
        break
      }
      visited.add(ancestor.id)
      ancestor = ancestor.parentId ? screenById.get(ancestor.parentId) : undefined
    }
    if (screen.group) {
      let root = screenById.get(screen.parentId)
      const rootVisited = new Set<string>()
      while (root?.parentId && !rootVisited.has(root.id)) {
        rootVisited.add(root.id)
        root = screenById.get(root.parentId)
      }
      if (root?.group !== screen.group) {
        context.addIssue({ code: 'custom', message: 'A child screen must inherit its root group', path: ['screens', index, 'group'] })
      }
    }
  })
  value.components.forEach((component, index) => {
    const screen = value.screens.find((item) => item.id === component.screenId)
    if (!screen) context.addIssue({ code: 'custom', message: 'Unknown screen', path: ['components', index, 'screenId'] })
    else if (component.visual.x + component.visual.width > screen.width || (screen.contentHeight !== undefined && component.visual.y + component.visual.height > screen.contentHeight)) {
      context.addIssue({ code: 'custom', message: 'Visual bounds exceed the screen', path: ['components', index, 'visual'] })
    }
  })
  value.tasks.forEach((task, index) => {
    if (task.scope.kind === 'screen' && !screenIds.has(task.scope.screenId)) {
      context.addIssue({ code: 'custom', message: 'Unknown screen', path: ['tasks', index, 'scope', 'screenId'] })
    }
  })
  value.screens.forEach((screen, index) => {
    if (screen.contentHeight !== undefined && screen.contentHeight < screen.height) {
      context.addIssue({ code: 'custom', message: 'Content height must be greater than or equal to viewport height', path: ['screens', index, 'contentHeight'] })
    }
    const rowIds = new Set(value.components.filter((component) => component.screenId === screen.id).flatMap((component) => component.visual.layout?.row ? [component.visual.layout.row] : []))
    rowIds.forEach((rowId) => {
      const members = value.components.filter((component) => component.screenId === screen.id && component.visual.layout?.row === rowId)
      const gap = members[0]?.visual.layout?.gap ?? 12
      const requiredWidth = members.reduce((sum, component) => sum + component.visual.width, 0) + gap * Math.max(0, members.length - 1)
      if (requiredWidth > screen.width) context.addIssue({ code: 'custom', message: `Row "${rowId}" is wider than the screen`, path: ['screens', index] })
    })
  })
  value.connections.forEach((connection, index) => {
    ;(['source', 'target'] as const).forEach((side) => {
      const ref = connection[side]
      const valid = ref.kind === 'component'
        ? componentIds.has(ref.id)
        : ref.kind === 'task' ? taskIds.has(ref.id) : systemIds.has(ref.id)
      if (!valid) context.addIssue({ code: 'custom', message: `Unknown ${ref.kind}`, path: ['connections', index, side, 'id'] })
    })
    const touchesTask = connection.source.kind === 'task' || connection.target.kind === 'task'
    if (touchesTask && connection.cadence) {
      context.addIssue({ code: 'custom', message: 'Task-related connections inherit cadence from the task trigger', path: ['connections', index, 'cadence'] })
    } else if (!touchesTask && !connection.cadence) {
      context.addIssue({ code: 'custom', message: 'Direct connections require cadence', path: ['connections', index, 'cadence'] })
    }
  })
  value.scenarios.forEach((scenario, index) => {
    if (scenario.screenId && !screenIds.has(scenario.screenId)) context.addIssue({ code: 'custom', message: 'Unknown screen', path: ['scenarios', index, 'screenId'] })
    Object.keys(scenario.componentStates).forEach((componentId) => {
      if (!componentIds.has(componentId)) context.addIssue({ code: 'custom', message: `Unknown component "${componentId}"`, path: ['scenarios', index, 'componentStates', componentId] })
    })
    Object.keys(scenario.taskStates).forEach((taskId) => {
      if (!taskIds.has(taskId)) context.addIssue({ code: 'custom', message: `Unknown task "${taskId}"`, path: ['scenarios', index, 'taskStates', taskId] })
    })
  })
})

export type ConfigResult = { ok: true; data: VisiFlowConfig } | { ok: false; errors: string[] }

export function parseConfig(input: unknown): ConfigResult {
  if (typeof input === 'object' && input !== null && 'schemaVersion' in input && input.schemaVersion === 1) {
    return { ok: false, errors: ['schemaVersion: VisiFlow schema v1 must be migrated to v2 before it can be opened.'] }
  }
  const result = runtimeConfigSchema.safeParse(input)
  if (result.success) return { ok: true, data: result.data as VisiFlowConfig }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`),
  }
}
