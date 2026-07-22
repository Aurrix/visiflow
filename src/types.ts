export type ComponentState = 'active' | 'inactive'

export type VisualKind =
  | 'hotspot'
  | 'container'
  | 'text'
  | 'button'
  | 'input'
  | 'badge'
  | 'image'

export interface VisualStyle {
  background?: string
  color?: string
  borderColor?: string
  borderRadius?: number
  opacity?: number
  text?: string
  src?: string
  imageFit?: 'cover' | 'contain' | 'fill'
  imagePosition?: string
  imageOpacity?: number
}

export interface ComponentVisual extends VisualStyle {
  kind: VisualKind
  x: number
  y: number
  width: number
  height: number
  layout?: {
    horizontal?: 'absolute' | 'start' | 'center' | 'end'
    row?: string
    order?: number
    justify?: 'start' | 'center' | 'end' | 'space-between'
    gap?: number
  }
  states?: Partial<Record<ComponentState, VisualStyle>>
}

export interface AppComponent {
  id: string
  screenId: string
  name: string
  type: string
  description: string
  tags?: string[]
  defaultState?: ComponentState
  visual: ComponentVisual
}

export interface AppScreen {
  id: string
  name: string
  width: number
  height: number
  contentHeight?: number
  background?: string
  backgroundImage?: string
  backgroundSize?: string
  backgroundPosition?: string
  showSystemUi?: boolean
}

export interface ExternalSystem {
  id: string
  name: string
  type: string
  description: string
  color?: string
  icon?: string
  placement?: 'left' | 'right'
}

export interface EndpointRef {
  kind: 'component' | 'system'
  id: string
}

export type CadenceKind =
  | 'user-event'
  | 'lifecycle'
  | 'scheduled'
  | 'recurring'
  | 'polling'
  | 'push'
  | 'continuous'
  | 'custom'

export interface Cadence {
  kind: CadenceKind
  label: string
  intervalMs?: number
  cron?: string
}

export interface Connection {
  id: string
  name: string
  source: EndpointRef
  target: EndpointRef
  protocol: string
  method?: string
  endpoint?: string
  description: string
  cadence: Cadence
}

export interface Scenario {
  id: string
  name: string
  description?: string
  screenId?: string
  componentStates: Record<string, ComponentState>
}

export interface VisiFlowConfig {
  schemaVersion: 1
  app: {
    id: string
    name: string
    platform: string
    description: string
    device: 'ios' | 'android' | 'web' | 'desktop' | 'custom'
    initialScreenId: string
    accent?: string
  }
  screens: AppScreen[]
  components: AppComponent[]
  systems: ExternalSystem[]
  connections: Connection[]
  scenarios: Scenario[]
  initialScenarioId?: string
}
