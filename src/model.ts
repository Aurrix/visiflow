import type { AppComponent, CadenceKind, ComponentState, Connection, EndpointRef, Scenario, VisiFlowConfig, VisualStyle } from './types'

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

export function connectionsFor(config: VisiFlowConfig, ref: EndpointRef): Connection[] {
  return config.connections.filter((connection) =>
    (connection.source.kind === ref.kind && connection.source.id === ref.id) ||
    (connection.target.kind === ref.kind && connection.target.id === ref.id))
}

export function endpointName(config: VisiFlowConfig, ref: EndpointRef): string {
  if (ref.kind === 'component') return config.components.find((item) => item.id === ref.id)?.name ?? ref.id
  return config.systems.find((item) => item.id === ref.id)?.name ?? ref.id
}

export function sameRef(a: EndpointRef | null, b: EndpointRef) {
  return a?.kind === b.kind && a.id === b.id
}
