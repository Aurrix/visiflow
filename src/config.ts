import { z } from 'zod'
import type { VisiFlowConfig } from './types'

const id = z.string().trim().min(1)
const state = z.enum(['active', 'inactive'])
const visualStyle = z.object({
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

const configSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.object({
    id,
    name: z.string().min(1),
    platform: z.string().min(1),
    description: z.string(),
    device: z.enum(['ios', 'android', 'web', 'desktop', 'custom']),
    initialScreenId: id,
    accent: z.string().optional(),
  }),
  screens: z.array(z.object({
    id,
    name: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    contentHeight: z.number().positive().optional(),
    background: z.string().optional(),
    backgroundImage: z.string().optional(),
    backgroundSize: z.string().optional(),
    backgroundPosition: z.string().optional(),
    showSystemUi: z.boolean().optional(),
  })).min(1),
  components: z.array(z.object({
    id,
    screenId: id,
    name: z.string().min(1),
    type: z.string().min(1),
    description: z.string(),
    tags: z.array(z.string()).optional(),
    defaultState: state.optional(),
    visual: visualStyle.extend({
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
      states: z.object({ active: visualStyle.optional(), inactive: visualStyle.optional() }).optional(),
    }),
  })),
  systems: z.array(z.object({
    id,
    name: z.string().min(1),
    type: z.string().min(1),
    description: z.string(),
    color: z.string().optional(),
    icon: z.string().optional(),
    placement: z.enum(['left', 'right']).optional(),
  })),
  connections: z.array(z.object({
    id,
    name: z.string().min(1),
    source: z.object({ kind: z.enum(['component', 'system']), id }),
    target: z.object({ kind: z.enum(['component', 'system']), id }),
    protocol: z.string().min(1),
    method: z.string().optional(),
    endpoint: z.string().optional(),
    description: z.string(),
    cadence: z.object({
      kind: z.enum(['user-event', 'lifecycle', 'scheduled', 'recurring', 'polling', 'push', 'continuous', 'custom']),
      label: z.string().min(1),
      intervalMs: z.number().positive().optional(),
      cron: z.string().optional(),
    }),
  })),
  scenarios: z.array(z.object({
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    screenId: id.optional(),
    componentStates: z.record(z.string(), state),
  })).min(1),
  initialScenarioId: id.optional(),
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
  unique(value.systems, 'systems')
  unique(value.connections, 'connections')
  unique(value.scenarios, 'scenarios')

  const screenIds = new Set(value.screens.map((item) => item.id))
  const componentIds = new Set(value.components.map((item) => item.id))
  const systemIds = new Set(value.systems.map((item) => item.id))
  const scenarioIds = new Set(value.scenarios.map((item) => item.id))
  if (!screenIds.has(value.app.initialScreenId)) context.addIssue({ code: 'custom', message: 'Unknown initial screen', path: ['app', 'initialScreenId'] })
  if (value.initialScenarioId && !scenarioIds.has(value.initialScenarioId)) context.addIssue({ code: 'custom', message: 'Unknown initial scenario', path: ['initialScenarioId'] })
  value.components.forEach((component, index) => {
    const screen = value.screens.find((item) => item.id === component.screenId)
    if (!screen) context.addIssue({ code: 'custom', message: 'Unknown screen', path: ['components', index, 'screenId'] })
    else if (component.visual.x + component.visual.width > screen.width || (screen.contentHeight !== undefined && component.visual.y + component.visual.height > screen.contentHeight)) {
      context.addIssue({ code: 'custom', message: 'Visual bounds exceed the screen', path: ['components', index, 'visual'] })
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
      const valid = ref.kind === 'component' ? componentIds.has(ref.id) : systemIds.has(ref.id)
      if (!valid) context.addIssue({ code: 'custom', message: `Unknown ${ref.kind}`, path: ['connections', index, side, 'id'] })
    })
  })
  value.scenarios.forEach((scenario, index) => {
    if (scenario.screenId && !screenIds.has(scenario.screenId)) context.addIssue({ code: 'custom', message: 'Unknown screen', path: ['scenarios', index, 'screenId'] })
    Object.keys(scenario.componentStates).forEach((componentId) => {
      if (!componentIds.has(componentId)) context.addIssue({ code: 'custom', message: `Unknown component "${componentId}"`, path: ['scenarios', index, 'componentStates', componentId] })
    })
  })
})

export type ConfigResult = { ok: true; data: VisiFlowConfig } | { ok: false; errors: string[] }

export function parseConfig(input: unknown): ConfigResult {
  const result = configSchema.safeParse(input)
  if (result.success) return { ok: true, data: result.data as VisiFlowConfig }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`),
  }
}

export function loadEmbeddedConfig(): ConfigResult {
  const element = document.getElementById('visiflow-config')
  if (!element) return { ok: false, errors: ['Missing <script id="visiflow-config" type="application/json"> block.'] }
  try {
    return parseConfig(JSON.parse(element.textContent || ''))
  } catch (error) {
    return { ok: false, errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`] }
  }
}
