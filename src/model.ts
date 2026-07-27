import type { AppComponent, BackgroundTask, Cadence, CadenceKind, ComponentState, Connection, EndpointRef, RequestPath, Scenario, VisiFlowConfig, VisualStyle } from './types'

export type Selection = EndpointRef | null

export const cadenceLabels: Record<CadenceKind, string> = {
  'user-event': 'User event', lifecycle: 'Lifecycle', scheduled: 'Scheduled', recurring: 'Recurring', polling: 'Polling', push: 'Push', continuous: 'Continuous', custom: 'Custom',
}

export function selectionKey(selection: EndpointRef) {
  return `${selection.kind}:${selection.id}`
}

export function componentState(component: AppComponent, scenario: Scenario): ComponentState {
  return scenario.componentStates[component.id] ?? component.defaultState ?? 'active'
}

export function componentStyle(component: AppComponent, scenario: Scenario): VisualStyle {
  const currentState = componentState(component, scenario)
  return { ...component.visual, ...component.visual.states?.[currentState] }
}

export function taskState(task: BackgroundTask, scenario: Scenario): ComponentState {
  return scenario.taskStates[task.id] ?? task.defaultState ?? 'active'
}

export function taskIsVisible(task: BackgroundTask, screenId: string) {
  return task.scope.kind === 'app' || task.scope.screenId === screenId
}

export function connectionCadences(config: VisiFlowConfig, connection: Connection): Cadence[] {
  const taskIds = [connection.source, connection.target]
    .filter((ref) => ref.kind === 'task')
    .map((ref) => ref.id)
  if (taskIds.length) {
    return config.tasks.flatMap((task) => taskIds.includes(task.id) && task.trigger ? [task.trigger] : [])
  }
  return connection.cadence ? [connection.cadence] : []
}

export function connectionMatchesCadence(config: VisiFlowConfig, connection: Connection, cadence: string) {
  return cadence === 'all' || connectionCadences(config, connection).some((item) => item.kind === cadence)
}

export function requestPathCadence(config: VisiFlowConfig, path: RequestPath): Cadence | undefined {
  if (path.trigger) return path.trigger
  const firstPhase = Math.min(...path.steps.map((step) => step.phase))
  const entry = path.steps.filter((step) => step.phase === firstPhase).map((step) => config.connections.find((connection) => connection.id === step.connectionId)).filter((connection): connection is Connection => Boolean(connection))
  return entry.flatMap((connection) => connectionCadences(config, connection))[0]
}

export function connectionsFor(config: VisiFlowConfig, ref: EndpointRef): Connection[] {
  return config.connections.filter((connection) =>
    (connection.source.kind === ref.kind && connection.source.id === ref.id) ||
    (connection.target.kind === ref.kind && connection.target.id === ref.id))
}

export function endpointName(config: VisiFlowConfig, ref: EndpointRef): string {
  if (ref.kind === 'component') return config.components.find((item) => item.id === ref.id)?.name ?? ref.id
  if (ref.kind === 'task') return config.tasks.find((item) => item.id === ref.id)?.name ?? ref.id
  return config.systems.find((item) => item.id === ref.id)?.name ?? ref.id
}

export function sameRef(a: EndpointRef | null, b: EndpointRef) {
  return a?.kind === b.kind && a.id === b.id
}
