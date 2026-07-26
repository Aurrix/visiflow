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
  screenCrop?: { x: number; y: number; width: number; height: number }
  textureCrop?: { textureId: string; x: number; y: number; width: number; height: number }
}

export interface TextureLayer {
  id: string
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
  order: number
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
  flagged?: boolean
  defaultState?: ComponentState
  visual: ComponentVisual
}

export interface AppScreen {
  id: string
  name: string
  parentId?: string
  group?: string
  order?: number
  width: number
  height: number
  contentHeight?: number
  background?: string
  backgroundImage?: string
  backgroundSize?: string
  backgroundPosition?: string
  showSystemUi?: boolean
  representation?: 'phone' | 'web' | 'desktop' | 'diagram'
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

export type TaskScope =
  | { kind: 'app' }
  | { kind: 'screen'; screenId: string }

export interface BackgroundTask {
  id: string
  name: string
  type: string
  description: string
  flagged?: boolean
  scope: TaskScope
  trigger?: Cadence
  defaultState?: ComponentState
}

export interface EndpointRef {
  kind: 'component' | 'task' | 'system'
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
  cadence?: Cadence
}

export interface Scenario {
  id: string
  name: string
  description?: string
  screenId?: string
  componentStates: Record<string, ComponentState>
  taskStates: Record<string, ComponentState>
}

export interface VisiFlowConfig {
  schemaVersion: 2
  app: {
    id: string
    name: string
    platform: string
    description: string
    device: 'ios' | 'android' | 'web' | 'desktop' | 'custom'
    initialScreenId: string
    accent?: string
    phoneBackgroundColor?: string
  }
  screens: AppScreen[]
  textureLayers: TextureLayer[]
  components: AppComponent[]
  tasks: BackgroundTask[]
  systems: ExternalSystem[]
  connections: Connection[]
  scenarios: Scenario[]
  initialScenarioId?: string
}

export type CallDirection = 'outgoing' | 'incoming'

export interface ComponentCall {
  id: string
  name: string
  direction: CallDirection
  peer: EndpointRef
  protocol: string
  method?: string
  endpoint?: string
  description: string
  cadence?: Cadence
}

export interface ProjectManifestMeta {
  visiflow: 2
  kind: 'project'
  app: Omit<VisiFlowConfig['app'], 'description'>
  screens: AppScreen[]
  textureLayers?: TextureLayer[]
  tasks: BackgroundTask[]
  systems: ExternalSystem[]
  scenarios: Scenario[]
  initialScenarioId?: string
  componentFiles: string[]
  connections: Connection[]
}

export interface ComponentDocumentMeta {
  visiflow: 2
  kind: 'component'
  id: string
  screenId: string
  name: string
  type: string
  tags?: string[]
  defaultState?: ComponentState
  visual: ComponentVisual
  calls: ComponentCall[]
}

export interface ComponentDocument {
  path: string
  meta: ComponentDocumentMeta
  body: string
}

export interface ProjectWorkspace {
  mode: 'directory' | 'http'
  name: string
  manifestPath: string
  manifest: ProjectManifestMeta
  projectBody: string
  components: Map<string, ComponentDocument>
  connectionOwners: Map<string, string>
  directoryHandle?: unknown
  pendingAssets: Map<string, File>
  obsoletePaths: Set<string>
}

export interface LoadedProject {
  config: VisiFlowConfig
  workspace: ProjectWorkspace
  assetSources: Map<string, string>
}
