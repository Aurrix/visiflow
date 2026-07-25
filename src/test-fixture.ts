import type { VisiFlowConfig } from './types'

export const testConfig: VisiFlowConfig = {
  schemaVersion: 2,
  app: { id: 'app', name: 'Test App', platform: 'iOS', description: 'Test description', device: 'ios', initialScreenId: 'home' },
  screens: [{ id: 'home', name: 'Home', width: 390, height: 844 }],
  textureLayers: [],
  components: [{
    id: 'button', screenId: 'home', name: 'Pay button', type: 'Action', description: 'Submits payment',
    visual: { kind: 'button', x: 20, y: 80, width: 100, height: 40, text: 'Pay' },
  }],
  tasks: [],
  systems: [{ id: 'api', name: 'Payment API', type: 'Service', description: 'Processes payments' }],
  connections: [{
    id: 'pay', name: 'Create payment', source: { kind: 'component', id: 'button' }, target: { kind: 'system', id: 'api' },
    protocol: 'HTTPS', method: 'POST', endpoint: '/payments', description: 'Creates payment', cadence: { kind: 'user-event', label: 'On click' },
  }],
  scenarios: [
    { id: 'normal', name: 'Normal', componentStates: {}, taskStates: {} },
    { id: 'offline', name: 'Offline', componentStates: { button: 'inactive' }, taskStates: {} },
  ],
  initialScenarioId: 'normal',
}
