import { useMemo, useRef, useState } from 'react'
import { registerProjectAssetSource } from './assets'
import { parseConfig } from './config'
import { EditorCanvas, type Bounds } from './components/EditorCanvas'
import { ScreenTree } from './components/ScreenTree'
import { scaledContentHeight } from './editor-utils'
import {
  assetPathFor,
  assignConnectionOwner,
  stageAsset,
} from './project-workspace'
import { effectiveScreenGroup, screenDescendants } from './screen-tree'
import type {
  AppComponent,
  AppScreen,
  BackgroundTask,
  CadenceKind,
  ComponentState,
  Connection,
  EndpointRef,
  ExternalSystem,
  ProjectWorkspace,
  Scenario,
  VisiFlowConfig,
  VisualKind,
} from './types'

export type EditorEntityKind = 'app' | 'screen' | 'component' | 'task' | 'system' | 'connection' | 'scenario'
export type EditorSelection = { kind: EditorEntityKind; id?: string }
type EntityKind = EditorEntityKind
type Selection = EditorSelection
const cadenceKinds: CadenceKind[] = ['user-event', 'lifecycle', 'scheduled', 'recurring', 'polling', 'push', 'continuous', 'custom']

const uniqueId = (prefix: string, used: string[]) => {
  let candidate = prefix
  let index = 2
  while (used.includes(candidate)) candidate = `${prefix}-${index++}`
  return candidate
}

const endpointFromValue = (value: string): EndpointRef => {
  const [kind, id] = value.split(':')
  return { kind: kind as EndpointRef['kind'], id }
}

const normalizeConnectionCadence = (connection: Connection) => {
  const touchesTask = connection.source.kind === 'task' || connection.target.kind === 'task'
  if (touchesTask) delete connection.cadence
  else connection.cadence ??= { kind: 'user-event', label: 'On user action' }
}

async function readImage(file: File): Promise<{ file: File; width: number; height: number }> {
  const src = URL.createObjectURL(file)
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('The selected file is not a readable image.'))
      image.src = src
    })
    return { file, ...dimensions }
  } finally {
    URL.revokeObjectURL(src)
  }
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`editor-field${wide ? ' wide' : ''}`}><span>{label}</span>{children}</label>
}

function ImageButton({ label, onImage, onComplete }: {
  label: string
  onImage: (image: Awaited<ReturnType<typeof readImage>>) => void
  onComplete: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return <>
    <button type="button" className="secondary-button image-import" onClick={() => ref.current?.click()}>{label}</button>
    <input ref={ref} className="sr-only" type="file" accept="image/*" onChange={(event) => {
      const file = event.target.files?.[0]
      if (file) void readImage(file).then((image) => {
        onImage(image)
        onComplete()
      })
      event.target.value = ''
    }} />
  </>
}

function ComponentCalls({ config, component, workspace, commit, onAssignOwner, onSelectComponent }: {
  config: VisiFlowConfig
  component: AppComponent
  workspace: ProjectWorkspace
  commit: (mutate: (draft: VisiFlowConfig) => void) => void
  onAssignOwner: (connectionId: string, componentId: string) => void
  onSelectComponent: (componentId: string) => void
}) {
  const related = config.connections.filter((connection) =>
    (connection.source.kind === 'component' && connection.source.id === component.id) ||
    (connection.target.kind === 'component' && connection.target.id === component.id),
  )
  const peerOptions = [
    ...config.tasks.map((task) => ({ value: `task:${task.id}`, label: `${task.name} · Task` })),
    ...config.systems.map((system) => ({ value: `system:${system.id}`, label: system.name })),
    ...config.components.filter((item) => item.id !== component.id).map((item) => ({ value: `component:${item.id}`, label: item.name })),
  ]
  const ownerFor = (connection: Connection) => workspace.connectionOwners.get(connection.id) ??
    (connection.source.kind === 'component' ? connection.source.id : connection.target.kind === 'component' ? connection.target.id : undefined)

  const addCall = () => {
    const peer = peerOptions[0]
    if (!peer) return
    const id = uniqueId(`${component.id}-call`, config.connections.map((connection) => connection.id))
    commit((draft) => draft.connections.push({
      id,
      name: 'New component call',
      source: { kind: 'component', id: component.id },
      target: endpointFromValue(peer.value),
      protocol: peer.value.startsWith('task:') ? 'Internal' : 'HTTPS',
      description: '',
      ...(peer.value.startsWith('task:') ? {} : { cadence: { kind: 'user-event' as const, label: 'On user action' } }),
    }))
    onAssignOwner(id, component.id)
  }

  return <section className="component-calls wide">
    <header><div><strong>Calls and endpoints</strong><span>{related.length} related request path{related.length === 1 ? '' : 's'}</span></div><button type="button" className="secondary-button" onClick={addCall} disabled={!peerOptions.length}>Add call</button></header>
    {!related.length && <p>No calls are declared for this component.</p>}
    {related.map((connection) => {
      const owner = ownerFor(connection)
      const owned = owner === component.id
      const outgoing = connection.source.kind === 'component' && connection.source.id === component.id
      const peer = outgoing ? connection.target : connection.source
      const update = (mutate: (item: Connection) => void) => commit((draft) => mutate(draft.connections.find((item) => item.id === connection.id)!))
      return <details className={`call-editor${owned ? '' : ' derived'}`} key={connection.id} open={owned}>
        <summary><span><strong>{connection.name}</strong><small>{outgoing ? 'Outgoing' : 'Incoming'} · {connection.protocol} {connection.method ?? ''} {connection.endpoint ?? ''}</small></span><i>{owned ? 'Owned here' : `Owned by ${owner ?? 'project'}`}</i></summary>
        {owned ? <div className="call-field-grid">
          <Field label="Name" wide><input value={connection.name} onChange={(event) => update((item) => { item.name = event.target.value })} /></Field>
          <Field label="Call ID" wide><input value={connection.id} onChange={(event) => update((item) => { item.id = event.target.value })} /></Field>
          <Field label="Direction"><select value={outgoing ? 'outgoing' : 'incoming'} onChange={(event) => update((item) => {
            const componentRef = { kind: 'component' as const, id: component.id }
            const other = outgoing ? item.target : item.source
            item.source = event.target.value === 'outgoing' ? componentRef : other
            item.target = event.target.value === 'outgoing' ? other : componentRef
          })}><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></select></Field>
          <Field label="Peer"><select value={`${peer.kind}:${peer.id}`} onChange={(event) => update((item) => {
            if (outgoing) item.target = endpointFromValue(event.target.value)
            else item.source = endpointFromValue(event.target.value)
            normalizeConnectionCadence(item)
            if (item.source.kind !== 'system' && item.target.kind !== 'system') item.protocol = 'Internal'
          })}>{peerOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Protocol"><input value={connection.protocol} onChange={(event) => update((item) => { item.protocol = event.target.value })} /></Field>
          <Field label="Method"><input value={connection.method ?? ''} onChange={(event) => update((item) => { item.method = event.target.value || undefined })} /></Field>
          <Field label="Endpoint" wide><input value={connection.endpoint ?? ''} onChange={(event) => update((item) => { item.endpoint = event.target.value || undefined })} /></Field>
          {connection.cadence && <>
            <Field label="Cadence"><select value={connection.cadence.kind} onChange={(event) => update((item) => { if (item.cadence) item.cadence.kind = event.target.value as CadenceKind })}>{cadenceKinds.map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Cadence label"><input value={connection.cadence.label} onChange={(event) => update((item) => { if (item.cadence) item.cadence.label = event.target.value })} /></Field>
            <Field label="Interval ms"><input type="number" min="1" value={connection.cadence.intervalMs ?? ''} onChange={(event) => update((item) => { if (item.cadence) item.cadence.intervalMs = event.target.value ? Number(event.target.value) : undefined })} /></Field>
            <Field label="Cron"><input value={connection.cadence.cron ?? ''} onChange={(event) => update((item) => { if (item.cadence) item.cadence.cron = event.target.value || undefined })} /></Field>
          </>}
          <Field label="Description" wide><textarea value={connection.description} onChange={(event) => update((item) => { item.description = event.target.value })} /></Field>
          <button type="button" className="danger-button wide" onClick={() => commit((draft) => { draft.connections = draft.connections.filter((item) => item.id !== connection.id) })}>Remove call</button>
        </div> : <div className="derived-call"><p>This call is stored with another component to keep one source of truth.</p>{owner && <button type="button" className="secondary-button" onClick={() => onSelectComponent(owner)}>Open owning component</button>}</div>}
      </details>
    })}
  </section>
}

function modeFor(component: AppComponent): 'region' | 'image' | 'rendered' {
  if (component.visual.kind === 'hotspot' && !component.visual.src) return 'region'
  if (component.visual.kind === 'image') return 'image'
  return 'rendered'
}

export interface DiskConfigEditorProps {
  config: VisiFlowConfig
  workspace: ProjectWorkspace
  selection: EditorSelection
  screenId: string
  scenarioId: string
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  statusMessage: string
  statusKind: 'valid' | 'invalid' | 'saving' | 'error'
  toolbarExtras?: React.ReactNode
  onCommit: (mutate: (draft: VisiFlowConfig) => void) => void
  onWorkspaceChange: (mutate: (draft: ProjectWorkspace) => void) => void
  onSelection: (selection: EditorSelection) => void
  onScreen: (screenId: string) => void
  onScenario: (scenarioId: string) => void
  onUndo: () => void
  onRedo: () => void
  onPersistBoundary: () => void
}

export function DiskConfigEditor({
  config,
  workspace,
  selection,
  screenId,
  scenarioId,
  dirty,
  canUndo,
  canRedo,
  statusMessage,
  statusKind,
  toolbarExtras,
  onCommit,
  onWorkspaceChange,
  onSelection,
  onScreen,
  onScenario,
  onUndo,
  onRedo,
  onPersistBoundary,
}: DiskConfigEditorProps) {
  const [drawMode, setDrawMode] = useState(false)
  const validation = useMemo(() => parseConfig(config), [config])
  const screen = config.screens.find((item) => item.id === screenId) ?? config.screens[0]
  const scenario = config.scenarios.find((item) => item.id === scenarioId) ?? config.scenarios[0]
  const commit = onCommit
  const mutateWorkspace = onWorkspaceChange

  const stageEditorAsset = (file: File, kind: 'screen' | 'component', id: string, state?: 'active' | 'inactive') => {
    const path = assetPathFor(file, kind, id, state)
    const source = URL.createObjectURL(file)
    registerProjectAssetSource(path, source)
    mutateWorkspace((draft) => stageAsset(draft, path, file))
    return path
  }
  const undo = () => { onUndo(); onPersistBoundary() }
  const redo = () => { onRedo(); onPersistBoundary() }

  const selectScreen = (id: string) => {
    onScreen(id)
    onSelection({ kind: 'screen', id })
  }

  const addEntity = (kind: Exclude<EntityKind, 'app'>) => {
    if (kind === 'component') {
      setDrawMode(true)
      return
    }
    if (kind === 'connection' && !config.components.length && !config.tasks.length && !config.systems.length) {
      return
    }
    let createdId = ''
    commit((draft) => {
      if (kind === 'screen') {
        createdId = uniqueId('new-screen', draft.screens.map((item) => item.id))
        const rootOrders = draft.screens.filter((item) => !item.parentId).map((item, index) => item.order ?? index)
        draft.screens.push({ id: createdId, name: 'New screen', order: Math.max(-1, ...rootOrders) + 1, width: screen.width, height: screen.height, background: '#151925' })
      } else if (kind === 'task') {
        createdId = uniqueId('new-task', draft.tasks.map((item) => item.id))
        draft.tasks.push({
          id: createdId,
          name: 'New task',
          type: 'Background task',
          description: '',
          scope: { kind: 'screen', screenId },
          trigger: { kind: 'scheduled', label: 'On schedule' },
          defaultState: 'active',
        })
      } else if (kind === 'system') {
        createdId = uniqueId('new-system', draft.systems.map((item) => item.id))
        draft.systems.push({ id: createdId, name: 'New system', type: 'Service', description: '', color: '#7c8cff' })
      } else if (kind === 'connection') {
        const source: EndpointRef = draft.components[0]
          ? { kind: 'component', id: draft.components[0].id }
          : draft.tasks[0] ? { kind: 'task', id: draft.tasks[0].id } : { kind: 'system', id: draft.systems[0].id }
        const target: EndpointRef = draft.systems[0]
          ? { kind: 'system', id: draft.systems[0].id }
          : draft.tasks[0] ? { kind: 'task', id: draft.tasks[0].id } : source
        createdId = uniqueId('new-connection', draft.connections.map((item) => item.id))
        const touchesTask = source.kind === 'task' || target.kind === 'task'
        draft.connections.push({
          id: createdId,
          name: 'New request',
          source,
          target,
          protocol: source.kind !== 'system' && target.kind !== 'system' ? 'Internal' : 'HTTPS',
          description: '',
          ...(touchesTask ? {} : { cadence: { kind: 'user-event' as const, label: 'On user action' } }),
        })
      } else {
        createdId = uniqueId('new-scenario', draft.scenarios.map((item) => item.id))
        draft.scenarios.push({ id: createdId, name: 'New scenario', screenId, componentStates: {}, taskStates: {} })
      }
    })
    if (kind === 'connection' && config.components[0]) mutateWorkspace((draft) => assignConnectionOwner(draft, createdId, config.components[0].id))
    if (kind === 'screen') onScreen(createdId)
    onSelection({ kind, id: createdId })
  }

  const createComponent = (bounds: Bounds) => {
    let id = ''
    commit((draft) => {
      id = uniqueId('new-component', draft.components.map((item) => item.id))
      draft.components.push({
        id,
        screenId: screen.id,
        name: 'New component',
        type: 'Region',
        description: '',
        defaultState: 'active',
        visual: { kind: 'hotspot', ...bounds },
      })
    })
    onSelection({ kind: 'component', id })
    setDrawMode(false)
  }

  const duplicateComponent = () => {
    if (selection.kind !== 'component' || !selection.id) return
    const source = config.components.find((item) => item.id === selection.id)
    if (!source) return
    let id = ''
    commit((draft) => {
      id = uniqueId(`${source.id}-copy`, draft.components.map((item) => item.id))
      const copy = structuredClone(source)
      copy.id = id
      copy.name = `${source.name} copy`
      copy.visual.x = Math.min(screen.width - copy.visual.width, copy.visual.x + 12)
      copy.visual.y += 12
      delete copy.visual.layout
      draft.components.push(copy)
    })
    onSelection({ kind: 'component', id })
  }

  const rename = (kind: EntityKind, oldId: string, nextId: string) => commit((draft) => {
    if (kind === 'screen') {
      const item = draft.screens.find((value) => value.id === oldId)
      if (item) item.id = nextId
      draft.screens.forEach((value) => { if (value.parentId === oldId) value.parentId = nextId })
      if (draft.app.initialScreenId === oldId) draft.app.initialScreenId = nextId
      draft.components.forEach((value) => { if (value.screenId === oldId) value.screenId = nextId })
      draft.tasks.forEach((value) => {
        if (value.scope.kind === 'screen' && value.scope.screenId === oldId) value.scope.screenId = nextId
      })
      draft.scenarios.forEach((value) => { if (value.screenId === oldId) value.screenId = nextId })
      onScreen(nextId)
    } else if (kind === 'component') {
      const item = draft.components.find((value) => value.id === oldId)
      if (item) item.id = nextId
      draft.connections.forEach((value) => {
        if (value.source.kind === 'component' && value.source.id === oldId) value.source.id = nextId
        if (value.target.kind === 'component' && value.target.id === oldId) value.target.id = nextId
      })
      draft.scenarios.forEach((value) => {
        if (oldId in value.componentStates) {
          value.componentStates[nextId] = value.componentStates[oldId]
          delete value.componentStates[oldId]
        }
      })
    } else if (kind === 'task') {
      const item = draft.tasks.find((value) => value.id === oldId)
      if (item) item.id = nextId
      draft.connections.forEach((value) => {
        if (value.source.kind === 'task' && value.source.id === oldId) value.source.id = nextId
        if (value.target.kind === 'task' && value.target.id === oldId) value.target.id = nextId
      })
      draft.scenarios.forEach((value) => {
        if (oldId in value.taskStates) {
          value.taskStates[nextId] = value.taskStates[oldId]
          delete value.taskStates[oldId]
        }
      })
    } else if (kind === 'system') {
      const item = draft.systems.find((value) => value.id === oldId)
      if (item) item.id = nextId
      draft.connections.forEach((value) => {
        if (value.source.kind === 'system' && value.source.id === oldId) value.source.id = nextId
        if (value.target.kind === 'system' && value.target.id === oldId) value.target.id = nextId
      })
    } else if (kind === 'scenario') {
      const item = draft.scenarios.find((value) => value.id === oldId)
      if (item) item.id = nextId
      if (draft.initialScenarioId === oldId) draft.initialScenarioId = nextId
      onScenario(nextId)
    } else if (kind === 'connection') {
      const item = draft.connections.find((value) => value.id === oldId)
      if (item) item.id = nextId
    }
    onSelection({ kind, id: nextId })
  })

  const deleteSelection = () => {
    if (selection.kind === 'app' || !selection.id) return
    const id = selection.id
    const componentIds = selection.kind === 'screen'
      ? config.components.filter((item) => item.screenId === id).map((item) => item.id)
      : selection.kind === 'component' ? [id] : []
    const taskIds = selection.kind === 'screen'
      ? config.tasks.filter((item) => item.scope.kind === 'screen' && item.scope.screenId === id).map((item) => item.id)
      : selection.kind === 'task' ? [id] : []
    const affectedConnections = config.connections.filter((item) =>
      (item.source.kind === selection.kind && item.source.id === id) ||
      (item.target.kind === selection.kind && item.target.id === id) ||
      (item.source.kind === 'component' && componentIds.includes(item.source.id)) ||
      (item.target.kind === 'component' && componentIds.includes(item.target.id)) ||
      (item.source.kind === 'task' && taskIds.includes(item.source.id)) ||
      (item.target.kind === 'task' && taskIds.includes(item.target.id)),
    )
    const details = [
      componentIds.length ? `${componentIds.length} component(s)` : '',
      taskIds.length ? `${taskIds.length} task(s)` : '',
      affectedConnections.length ? `${affectedConnections.length} connection(s)` : '',
      componentIds.length || taskIds.length ? 'related scenario states' : '',
    ].filter(Boolean).join(', ')
    if (!window.confirm(`Delete this ${selection.kind}${details ? ` and ${details}` : ''}? This can be undone.`)) return
    if (selection.kind === 'screen' && config.screens.length === 1) {
      return
    }
    if (selection.kind === 'scenario' && config.scenarios.length === 1) {
      return
    }
    commit((draft) => {
      if (selection.kind === 'screen') {
        const inheritedGroup = effectiveScreenGroup(draft.screens, id)
        draft.screens.forEach((item) => {
          if (item.parentId === id) {
            delete item.parentId
            if (inheritedGroup) item.group = inheritedGroup
            else delete item.group
          }
        })
        draft.screens = draft.screens.filter((item) => item.id !== id)
        draft.components = draft.components.filter((item) => !componentIds.includes(item.id))
        draft.tasks = draft.tasks.filter((item) => !taskIds.includes(item.id))
        draft.connections = draft.connections.filter((item) => !affectedConnections.some((connection) => connection.id === item.id))
        draft.scenarios.forEach((item) => {
          if (item.screenId === id) item.screenId = draft.screens[0].id
          componentIds.forEach((componentId) => delete item.componentStates[componentId])
          taskIds.forEach((taskId) => delete item.taskStates[taskId])
        })
        if (draft.app.initialScreenId === id) draft.app.initialScreenId = draft.screens[0].id
      } else if (selection.kind === 'component') {
        draft.components = draft.components.filter((item) => item.id !== id)
        draft.connections = draft.connections.filter((item) => !affectedConnections.some((connection) => connection.id === item.id))
        draft.scenarios.forEach((item) => delete item.componentStates[id])
      } else if (selection.kind === 'task') {
        draft.tasks = draft.tasks.filter((item) => item.id !== id)
        draft.connections = draft.connections.filter((item) => !affectedConnections.some((connection) => connection.id === item.id))
        draft.scenarios.forEach((item) => delete item.taskStates[id])
      } else if (selection.kind === 'system') {
        draft.systems = draft.systems.filter((item) => item.id !== id)
        draft.connections = draft.connections.filter((item) => !affectedConnections.some((connection) => connection.id === item.id))
      } else if (selection.kind === 'connection') draft.connections = draft.connections.filter((item) => item.id !== id)
      else {
        draft.scenarios = draft.scenarios.filter((item) => item.id !== id)
        if (draft.initialScenarioId === id) draft.initialScenarioId = draft.scenarios[0].id
      }
    })
    const fallback = selection.kind === 'screen' ? config.screens.find((item) => item.id !== id)?.id : screenId
    if (selection.kind === 'screen' && fallback) onScreen(fallback)
    onSelection(selection.kind === 'screen' && fallback ? { kind: 'screen', id: fallback } : { kind: 'app' })
  }

  const entityGroups: { kind: Exclude<EntityKind, 'app' | 'screen'>; label: string; items: { id: string; name: string }[] }[] = [
    { kind: 'component', label: 'Components', items: config.components.filter((item) => item.screenId === screen.id) },
    { kind: 'task', label: 'Tasks', items: config.tasks },
    { kind: 'system', label: 'Systems', items: config.systems },
    { kind: 'connection', label: 'Connections', items: config.connections },
    { kind: 'scenario', label: 'Scenarios', items: config.scenarios },
  ]

  return (
    <div className="disk-editor" onBlurCapture={(event) => {
      if ((event.target as HTMLElement).matches('input:not([type="file"]), textarea, select')) onPersistBoundary()
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        setDrawMode(false)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); onPersistBoundary() }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    }}>
      <header className="disk-editor-toolbar">
        <div className="disk-editor-brand"><div className="brand-mark"><i /><i /><i /></div><div><strong>VisiFlow Project Editor</strong><span>{workspace.manifestPath}{dirty ? ' • modified' : ''}</span></div></div>
        <div className="disk-editor-actions">
          <div className="disk-editor-app-identity"><span className="app-avatar">{config.app.name.slice(0, 1)}</span><strong>{config.app.name}</strong></div>
          {toolbarExtras}
          <button type="button" className="icon-button editor-undo" onClick={undo} disabled={!canUndo} aria-label="Undo">↶</button>
          <button type="button" className="icon-button editor-redo" onClick={redo} disabled={!canRedo} aria-label="Redo">↷</button>
          <button type="button" className="primary-button editor-save" onClick={onPersistBoundary} disabled={!validation.ok || !dirty}>Save</button>
        </div>
      </header>

      <div className="disk-editor-status" role="status">
        <span className={validation.ok && statusKind !== 'error' ? 'valid' : 'invalid'}>{validation.ok && statusKind !== 'error' ? '✓' : '!'}</span>
        {validation.ok ? statusMessage : validation.errors[0]}
        <span className="disk-editor-shortcut">Ctrl/⌘ + S · Ctrl/⌘ + Z</span>
      </div>

      <main className="visual-editor-workspace" onClickCapture={onPersistBoundary}>
        <aside className="entity-browser">
          <button className={`entity-app${selection.kind === 'app' ? ' selected' : ''}`} onClick={() => onSelection({ kind: 'app' })}><span className="app-avatar">{config.app.name.slice(0, 1)}</span><span><strong>{config.app.name}</strong><small>App settings</small></span></button>
          <section className="editor-screen-tree">
            <header><span>Screens</span><button type="button" onClick={() => addEntity('screen')} aria-label="Add screen">+</button></header>
            <ScreenTree screens={config.screens} activeId={screenId} onSelect={selectScreen} />
          </section>
          {entityGroups.map((group) => <section key={group.kind}>
            <header><span>{group.label}</span><button type="button" onClick={() => addEntity(group.kind)} aria-label={`Add ${group.kind}`}>+</button></header>
            <div>{group.items.map((item) => <button
              key={item.id}
              className={selection.kind === group.kind && selection.id === item.id ? 'selected' : ''}
              onClick={() => {
                if (group.kind === 'component') onScreen(config.components.find((component) => component.id === item.id)?.screenId ?? screenId)
                onSelection({ kind: group.kind, id: item.id })
              }}
            ><span>{item.name}</span><small>{item.id}</small></button>)}</div>
          </section>)}
        </aside>

        <section className="authoring-stage">
          <header className="authoring-toolbar">
            <div><strong>{screen.name}</strong><span>{screen.width} × {screen.height}{screen.contentHeight && screen.contentHeight > screen.height ? ` · ${screen.contentHeight}px content` : ''}</span></div>
            <div>
              <label><span>Scenario</span><select value={scenario.id} onChange={(event) => onScenario(event.target.value)}>{config.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button type="button" className={drawMode ? 'primary-button active' : 'secondary-button'} onClick={() => setDrawMode((value) => !value)}>＋ Draw component</button>
            </div>
          </header>
          <EditorCanvas
            config={config}
            screen={screen}
            scenario={scenario}
            selectedComponentId={selection.kind === 'component' ? selection.id : undefined}
            drawMode={drawMode}
            onCancelDraw={() => setDrawMode(false)}
            onSelect={(id) => onSelection({ kind: 'component', id })}
            onCreate={(bounds) => { createComponent(bounds); onPersistBoundary() }}
            onBounds={(id, bounds) => {
              commit((draft) => {
                const item = draft.components.find((value) => value.id === id)
                if (item) {
                  Object.assign(item.visual, bounds)
                  delete item.visual.layout
                }
              })
              onPersistBoundary()
            }}
          />
        </section>

        <aside className="property-inspector">
          <Inspector
            config={config}
            selection={selection}
            screen={screen}
            commit={commit}
            rename={rename}
            onDelete={deleteSelection}
            onDuplicate={duplicateComponent}
            onScreen={selectScreen}
            workspace={workspace}
            onAssignOwner={(connectionId, componentId) => mutateWorkspace((draft) => assignConnectionOwner(draft, connectionId, componentId))}
            onStageAsset={stageEditorAsset}
            onPersistBoundary={onPersistBoundary}
            onSelectComponent={(id) => {
              const component = config.components.find((item) => item.id === id)
              if (component) onScreen(component.screenId)
              onSelection({ kind: 'component', id })
            }}
          />
        </aside>
      </main>
    </div>
  )
}

function Inspector({ config, selection, screen, commit, rename, onDelete, onDuplicate, onScreen, workspace, onAssignOwner, onStageAsset, onPersistBoundary, onSelectComponent }: {
  config: VisiFlowConfig
  selection: Selection
  screen: AppScreen
  commit: (mutate: (draft: VisiFlowConfig) => void) => void
  rename: (kind: EntityKind, oldId: string, nextId: string) => void
  onDelete: () => void
  onDuplicate: () => void
  onScreen: (id: string) => void
  workspace: ProjectWorkspace
  onAssignOwner: (connectionId: string, componentId: string) => void
  onStageAsset: (file: File, kind: 'screen' | 'component', id: string, state?: 'active' | 'inactive') => string
  onPersistBoundary: () => void
  onSelectComponent: (id: string) => void
}) {
  const number = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
  const header = (eyebrow: string, title: string) => <header className="inspector-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{selection.kind !== 'app' && <div className="inspector-header-actions">{selection.kind === 'component' && <button type="button" className="secondary-button" onClick={onDuplicate}>Duplicate</button>}<button type="button" className="danger-button" onClick={onDelete}>Delete</button></div>}</header>

  if (selection.kind === 'app') return <div className="inspector-form">
    {header('Application', config.app.name)}
    <Field label="Name" wide><input value={config.app.name} onChange={(event) => commit((draft) => { draft.app.name = event.target.value })} /></Field>
    <Field label="ID"><input value={config.app.id} onChange={(event) => commit((draft) => { draft.app.id = event.target.value })} /></Field>
    <Field label="Platform"><input value={config.app.platform} onChange={(event) => commit((draft) => { draft.app.platform = event.target.value })} /></Field>
    <Field label="Device"><select value={config.app.device} onChange={(event) => commit((draft) => { draft.app.device = event.target.value as VisiFlowConfig['app']['device'] })}>{['ios', 'android', 'web', 'desktop', 'custom'].map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Initial screen"><select value={config.app.initialScreenId} onChange={(event) => commit((draft) => { draft.app.initialScreenId = event.target.value })}>{config.screens.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Initial scenario"><select value={config.initialScenarioId ?? config.scenarios[0].id} onChange={(event) => commit((draft) => { draft.initialScenarioId = event.target.value })}>{config.scenarios.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Accent"><input type="color" value={config.app.accent ?? '#7c8cff'} onChange={(event) => commit((draft) => { draft.app.accent = event.target.value })} /></Field>
    <Field label="Phone background"><input type="color" value={config.app.phoneBackgroundColor ?? '#171b27'} onChange={(event) => commit((draft) => { draft.app.phoneBackgroundColor = event.target.value })} /></Field>
    <Field label="Project documentation (Markdown)" wide><textarea value={config.app.description} onChange={(event) => commit((draft) => { draft.app.description = event.target.value })} /></Field>
  </div>

  if (selection.kind === 'screen') {
    const item = config.screens.find((value) => value.id === selection.id) ?? screen
    const descendants = new Set(screenDescendants(config.screens, item.id))
    const parentOptions = config.screens.filter((value) => value.id !== item.id && !descendants.has(value.id))
    const inheritedGroup = effectiveScreenGroup(config.screens, item.id)
    const groupSuggestions = [...new Set(config.screens.flatMap((value) => !value.parentId && value.group ? [value.group] : []))].sort()
    return <div className="inspector-form">
      {header('Screen', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('screen', item.id, event.target.value)} /></Field>
      <Field label="Parent screen" wide><select value={item.parentId ?? ''} onChange={(event) => {
        const parentId = event.target.value || undefined
        commit((draft) => {
          const target = draft.screens.find((value) => value.id === item.id)!
          if (parentId) {
            target.parentId = parentId
            delete target.group
          } else {
            delete target.parentId
            if (inheritedGroup) target.group = inheritedGroup
          }
        })
      }}><option value="">Root screen</option>{parentOptions.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
      {!item.parentId ? <Field label="Group" wide><><input list={`screen-groups-${item.id}`} value={item.group ?? ''} placeholder="Ungrouped" onChange={(event) => commit((draft) => {
        const target = draft.screens.find((value) => value.id === item.id)!
        if (event.target.value.trim()) target.group = event.target.value
        else delete target.group
      })} /><datalist id={`screen-groups-${item.id}`}>{groupSuggestions.map((group) => <option key={group} value={group} />)}</datalist></></Field>
        : <div className="editor-note wide">Group inherited from the root screen: <strong>{inheritedGroup ?? 'Ungrouped'}</strong></div>}
      <Field label="Sibling order"><input type="number" step="1" value={item.order ?? ''} placeholder="Manifest order" onChange={(event) => commit((draft) => {
        const target = draft.screens.find((value) => value.id === item.id)!
        if (event.target.value === '') delete target.order
        else target.order = Math.trunc(number(event.target.value))
      })} /></Field>
      <Field label="Viewport width"><input type="number" min="1" value={item.width} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.width = number(event.target.value, 1) })} /></Field>
      <Field label="Viewport height"><input type="number" min="1" value={item.height} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.height = number(event.target.value, 1) })} /></Field>
      <Field label="Content height"><input type="number" min={item.height} value={item.contentHeight ?? item.height} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.contentHeight = number(event.target.value, item.height) })} /></Field>
      <Field label="Background"><input value={item.background ?? ''} placeholder="#151925 or CSS gradient" onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.background = event.target.value })} /></Field>
      <Field label="Image sizing"><input value={item.backgroundSize ?? ''} placeholder="100% auto" onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.backgroundSize = event.target.value || undefined })} /></Field>
      <Field label="Image position"><input value={item.backgroundPosition ?? ''} placeholder="top center" onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.backgroundPosition = event.target.value || undefined })} /></Field>
      <Field label="System UI"><select value={String(item.showSystemUi !== false)} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.showSystemUi = event.target.value === 'true' })}><option value="true">Show</option><option value="false">Hide</option></select></Field>
      <div className="inspector-action-row wide">
        <ImageButton label={item.backgroundImage ? 'Replace screenshot' : 'Import screenshot'} onComplete={onPersistBoundary} onImage={(image) => commit((draft) => {
          const target = draft.screens.find((value) => value.id === item.id)!
          target.backgroundImage = onStageAsset(image.file, 'screen', item.id)
          target.backgroundSize = '100% auto'
          target.backgroundPosition = 'top center'
          target.contentHeight = Math.max(target.height, scaledContentHeight(target.width, image.width, image.height))
        })} />
        {item.backgroundImage && <button type="button" className="secondary-button" onClick={() => commit((draft) => { delete draft.screens.find((value) => value.id === item.id)!.backgroundImage })}>Remove</button>}
      </div>
    </div>
  }

  if (selection.kind === 'component') {
    const item = config.components.find((value) => value.id === selection.id)
    if (!item) return null
    const visualMode = modeFor(item)
    const update = (mutate: (component: AppComponent) => void) => commit((draft) => mutate(draft.components.find((value) => value.id === item.id)!))
    return <div className="inspector-form">
      {header('Component', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => update((value) => { value.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('component', item.id, event.target.value)} /></Field>
      <Field label="Screen"><select value={item.screenId} onChange={(event) => { update((value) => { value.screenId = event.target.value }); onScreen(event.target.value) }}>{config.screens.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
      <Field label="Mode"><select value={visualMode} onChange={(event) => update((value) => {
        const next = event.target.value
        value.visual.kind = next === 'region' ? 'hotspot' : next === 'image' ? 'image' : 'button'
        if (next === 'region') delete value.visual.src
      })}><option value="region">Screenshot region</option><option value="image">Embedded image</option><option value="rendered">Rendered component</option></select></Field>
      <Field label="Type"><input value={item.type} onChange={(event) => update((value) => { value.type = event.target.value })} /></Field>
      <Field label="Default state"><select value={item.defaultState ?? 'active'} onChange={(event) => update((value) => { value.defaultState = event.target.value as ComponentState })}><option>active</option><option>inactive</option></select></Field>
      <Field label="X"><input type="number" min="0" value={item.visual.x} onChange={(event) => update((value) => { value.visual.x = number(event.target.value); delete value.visual.layout })} /></Field>
      <Field label="Y"><input type="number" min="0" value={item.visual.y} onChange={(event) => update((value) => { value.visual.y = number(event.target.value); delete value.visual.layout })} /></Field>
      <Field label="Width"><input type="number" min="1" value={item.visual.width} onChange={(event) => update((value) => { value.visual.width = number(event.target.value, 1); delete value.visual.layout })} /></Field>
      <Field label="Height"><input type="number" min="1" value={item.visual.height} onChange={(event) => update((value) => { value.visual.height = number(event.target.value, 1); delete value.visual.layout })} /></Field>
      <Field label="Tags" wide><input value={(item.tags ?? []).join(', ')} onChange={(event) => update((value) => { value.tags = event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></Field>
      <Field label="Documentation (Markdown)" wide><textarea value={item.description} onChange={(event) => update((value) => { value.description = event.target.value })} /></Field>
      {visualMode === 'image' && <div className="inspector-action-row wide"><ImageButton label={item.visual.src ? 'Replace component image' : 'Import component image'} onComplete={onPersistBoundary} onImage={(image) => update((value) => { value.visual.src = onStageAsset(image.file, 'component', item.id); value.visual.imageFit = 'cover' })} /></div>}
      {visualMode === 'image' && <>
        <Field label="Image fit"><select value={item.visual.imageFit ?? 'cover'} onChange={(event) => update((value) => { value.visual.imageFit = event.target.value as 'cover' | 'contain' | 'fill' })}><option>cover</option><option>contain</option><option>fill</option></select></Field>
        <Field label="Image position"><input value={item.visual.imagePosition ?? 'center'} onChange={(event) => update((value) => { value.visual.imagePosition = event.target.value })} /></Field>
        <Field label="Image opacity"><input type="number" min="0" max="1" step=".05" value={item.visual.imageOpacity ?? 1} onChange={(event) => update((value) => { value.visual.imageOpacity = number(event.target.value, 1) })} /></Field>
      </>}
      {visualMode === 'rendered' && <>
        <Field label="Rendered kind"><select value={item.visual.kind} onChange={(event) => update((value) => { value.visual.kind = event.target.value as VisualKind })}>{['container', 'text', 'button', 'input', 'badge'].map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Text"><input value={item.visual.text ?? ''} onChange={(event) => update((value) => { value.visual.text = event.target.value })} /></Field>
        <Field label="Background"><input value={item.visual.background ?? ''} onChange={(event) => update((value) => { value.visual.background = event.target.value })} /></Field>
        <Field label="Text color"><input value={item.visual.color ?? ''} onChange={(event) => update((value) => { value.visual.color = event.target.value })} /></Field>
        <Field label="Border color"><input value={item.visual.borderColor ?? ''} onChange={(event) => update((value) => { value.visual.borderColor = event.target.value })} /></Field>
        <Field label="Radius"><input type="number" min="0" value={item.visual.borderRadius ?? 0} onChange={(event) => update((value) => { value.visual.borderRadius = number(event.target.value) })} /></Field>
        <Field label="Opacity"><input type="number" min="0" max="1" step=".05" value={item.visual.opacity ?? 1} onChange={(event) => update((value) => { value.visual.opacity = number(event.target.value, 1) })} /></Field>
      </>}
      <details className="advanced-fields wide">
        <summary>Layout options</summary>
        <div className="advanced-field-grid">
          <Field label="Horizontal"><select value={item.visual.layout?.horizontal ?? 'absolute'} onChange={(event) => update((value) => { value.visual.layout = { ...value.visual.layout, horizontal: event.target.value as NonNullable<AppComponent['visual']['layout']>['horizontal'] } })}>{['absolute', 'start', 'center', 'end'].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Row"><input value={item.visual.layout?.row ?? ''} onChange={(event) => update((value) => { value.visual.layout = { ...value.visual.layout, row: event.target.value || undefined } })} /></Field>
          <Field label="Order"><input type="number" value={item.visual.layout?.order ?? ''} onChange={(event) => update((value) => { value.visual.layout = { ...value.visual.layout, order: event.target.value ? number(event.target.value) : undefined } })} /></Field>
          <Field label="Justify"><select value={item.visual.layout?.justify ?? 'start'} onChange={(event) => update((value) => { value.visual.layout = { ...value.visual.layout, justify: event.target.value as NonNullable<AppComponent['visual']['layout']>['justify'] } })}>{['start', 'center', 'end', 'space-between'].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Gap"><input type="number" min="0" value={item.visual.layout?.gap ?? ''} onChange={(event) => update((value) => { value.visual.layout = { ...value.visual.layout, gap: event.target.value ? number(event.target.value) : undefined } })} /></Field>
        </div>
      </details>
      {visualMode !== 'region' && <div className="state-assets wide">
        <strong>State images</strong>
        <ImageButton label="Active image" onComplete={onPersistBoundary} onImage={(image) => update((value) => { value.visual.states ??= {}; value.visual.states.active = { ...value.visual.states.active, src: onStageAsset(image.file, 'component', item.id, 'active') } })} />
        <ImageButton label="Inactive image" onComplete={onPersistBoundary} onImage={(image) => update((value) => { value.visual.states ??= {}; value.visual.states.inactive = { ...value.visual.states.inactive, src: onStageAsset(image.file, 'component', item.id, 'inactive') } })} />
      </div>}
      <details className="advanced-fields wide">
        <summary>Active and inactive style overrides</summary>
        {(['active', 'inactive'] as const).map((state) => <div className="state-override-grid" key={state}>
          <strong>{state}</strong>
          <Field label="Text"><input value={item.visual.states?.[state]?.text ?? ''} onChange={(event) => update((value) => { value.visual.states ??= {}; value.visual.states[state] = { ...value.visual.states[state], text: event.target.value || undefined } })} /></Field>
          <Field label="Background"><input value={item.visual.states?.[state]?.background ?? ''} onChange={(event) => update((value) => { value.visual.states ??= {}; value.visual.states[state] = { ...value.visual.states[state], background: event.target.value || undefined } })} /></Field>
          <Field label="Color"><input value={item.visual.states?.[state]?.color ?? ''} onChange={(event) => update((value) => { value.visual.states ??= {}; value.visual.states[state] = { ...value.visual.states[state], color: event.target.value || undefined } })} /></Field>
          <Field label="Opacity"><input type="number" min="0" max="1" step=".05" value={item.visual.states?.[state]?.opacity ?? ''} onChange={(event) => update((value) => { value.visual.states ??= {}; value.visual.states[state] = { ...value.visual.states[state], opacity: event.target.value ? number(event.target.value) : undefined } })} /></Field>
        </div>)}
      </details>
      <ComponentCalls config={config} component={item} workspace={workspace} commit={commit} onAssignOwner={onAssignOwner} onSelectComponent={onSelectComponent} />
    </div>
  }

  if (selection.kind === 'task') {
    const item = config.tasks.find((value) => value.id === selection.id)
    if (!item) return null
    const update = (mutate: (task: BackgroundTask) => void) => commit((draft) => mutate(draft.tasks.find((value) => value.id === item.id)!))
    return <div className="inspector-form">
      {header('Background task', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => update((value) => { value.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('task', item.id, event.target.value)} /></Field>
      <Field label="Type"><input value={item.type} onChange={(event) => update((value) => { value.type = event.target.value })} /></Field>
      <Field label="Scope"><select value={item.scope.kind} onChange={(event) => update((value) => {
        value.scope = event.target.value === 'app' ? { kind: 'app' } : { kind: 'screen', screenId: screen.id }
      })}><option value="screen">Current screen</option><option value="app">App-wide</option></select></Field>
      {item.scope.kind === 'screen' && <Field label="Screen"><select value={item.scope.screenId} onChange={(event) => update((value) => { value.scope = { kind: 'screen', screenId: event.target.value } })}>{config.screens.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>}
      <Field label="Default state"><select value={item.defaultState ?? 'active'} onChange={(event) => update((value) => { value.defaultState = event.target.value as ComponentState })}><option>active</option><option>inactive</option></select></Field>
      <Field label="Trigger"><select value={item.trigger.kind} onChange={(event) => update((value) => { value.trigger.kind = event.target.value as CadenceKind })}>{cadenceKinds.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Trigger label" wide><input value={item.trigger.label} onChange={(event) => update((value) => { value.trigger.label = event.target.value })} /></Field>
      <Field label="Interval ms"><input type="number" min="1" value={item.trigger.intervalMs ?? ''} onChange={(event) => update((value) => { value.trigger.intervalMs = event.target.value ? number(event.target.value, 1) : undefined })} /></Field>
      <Field label="Cron"><input value={item.trigger.cron ?? ''} onChange={(event) => update((value) => { value.trigger.cron = event.target.value || undefined })} /></Field>
      <Field label="Description" wide><textarea value={item.description} onChange={(event) => update((value) => { value.description = event.target.value })} /></Field>
    </div>
  }

  if (selection.kind === 'system') {
    const item = config.systems.find((value) => value.id === selection.id)
    if (!item) return null
    const update = (mutate: (system: ExternalSystem) => void) => commit((draft) => mutate(draft.systems.find((value) => value.id === item.id)!))
    return <div className="inspector-form">
      {header('External system', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => update((value) => { value.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('system', item.id, event.target.value)} /></Field>
      <Field label="Type"><input value={item.type} onChange={(event) => update((value) => { value.type = event.target.value })} /></Field>
      <Field label="Placement"><select value={item.placement ?? 'right'} onChange={(event) => update((value) => { value.placement = event.target.value as 'left' | 'right' })}><option>left</option><option>right</option></select></Field>
      <Field label="Color"><input type="color" value={item.color ?? '#7c8cff'} onChange={(event) => update((value) => { value.color = event.target.value })} /></Field>
      <Field label="Icon"><input value={item.icon ?? ''} onChange={(event) => update((value) => { value.icon = event.target.value })} /></Field>
      <Field label="Description" wide><textarea value={item.description} onChange={(event) => update((value) => { value.description = event.target.value })} /></Field>
    </div>
  }

  if (selection.kind === 'connection') {
    const item = config.connections.find((value) => value.id === selection.id)
    if (!item) return null
    const update = (mutate: (connection: Connection) => void) => commit((draft) => mutate(draft.connections.find((value) => value.id === item.id)!))
    const endpointOptions = <>
      <optgroup label="Components">{config.components.map((value) => <option value={`component:${value.id}`} key={`component:${value.id}`}>{value.name}</option>)}</optgroup>
      <optgroup label="Tasks">{config.tasks.map((value) => <option value={`task:${value.id}`} key={`task:${value.id}`}>{value.name}</option>)}</optgroup>
      <optgroup label="Systems">{config.systems.map((value) => <option value={`system:${value.id}`} key={`system:${value.id}`}>{value.name}</option>)}</optgroup>
    </>
    return <div className="inspector-form">
      {header('Connection', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => update((value) => { value.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('connection', item.id, event.target.value)} /></Field>
      <Field label="Source" wide><select value={`${item.source.kind}:${item.source.id}`} onChange={(event) => update((value) => {
        value.source = endpointFromValue(event.target.value)
        normalizeConnectionCadence(value)
        if (value.source.kind !== 'system' && value.target.kind !== 'system') value.protocol = 'Internal'
      })}>{endpointOptions}</select></Field>
      <Field label="Target" wide><select value={`${item.target.kind}:${item.target.id}`} onChange={(event) => update((value) => {
        value.target = endpointFromValue(event.target.value)
        normalizeConnectionCadence(value)
        if (value.source.kind !== 'system' && value.target.kind !== 'system') value.protocol = 'Internal'
      })}>{endpointOptions}</select></Field>
      <Field label="Protocol"><input value={item.protocol} onChange={(event) => update((value) => { value.protocol = event.target.value })} /></Field>
      <Field label="Method"><input value={item.method ?? ''} onChange={(event) => update((value) => { value.method = event.target.value })} /></Field>
      <Field label="Endpoint" wide><input value={item.endpoint ?? ''} onChange={(event) => update((value) => { value.endpoint = event.target.value })} /></Field>
      {item.cadence ? <>
        <Field label="Cadence"><select value={item.cadence.kind} onChange={(event) => update((value) => { if (value.cadence) value.cadence.kind = event.target.value as CadenceKind })}>{cadenceKinds.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Cadence label"><input value={item.cadence.label} onChange={(event) => update((value) => { if (value.cadence) value.cadence.label = event.target.value })} /></Field>
        <Field label="Interval ms"><input type="number" min="1" value={item.cadence.intervalMs ?? ''} onChange={(event) => update((value) => { if (value.cadence) value.cadence.intervalMs = event.target.value ? number(event.target.value, 1) : undefined })} /></Field>
        <Field label="Cron"><input value={item.cadence.cron ?? ''} onChange={(event) => update((value) => { if (value.cadence) value.cadence.cron = event.target.value || undefined })} /></Field>
      </> : <div className="editor-note wide">Cadence is inherited from the connected task trigger.</div>}
      <Field label="Description" wide><textarea value={item.description} onChange={(event) => update((value) => { value.description = event.target.value })} /></Field>
    </div>
  }

  const item = config.scenarios.find((value) => value.id === selection.id)
  if (!item) return null
  const update = (mutate: (scenario: Scenario) => void) => commit((draft) => mutate(draft.scenarios.find((value) => value.id === item.id)!))
  return <div className="inspector-form">
    {header('Scenario', item.name)}
    <Field label="Name" wide><input value={item.name} onChange={(event) => update((value) => { value.name = event.target.value })} /></Field>
    <Field label="ID" wide><input value={item.id} onChange={(event) => rename('scenario', item.id, event.target.value)} /></Field>
    <Field label="Screen" wide><select value={item.screenId ?? ''} onChange={(event) => update((value) => { value.screenId = event.target.value || undefined })}><option value="">Use initial screen</option>{config.screens.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
    <Field label="Description" wide><textarea value={item.description ?? ''} onChange={(event) => update((value) => { value.description = event.target.value })} /></Field>
    <div className="scenario-states wide"><strong>Component states</strong>{config.components.map((component) => <label key={component.id}><span>{component.name}</span><select value={item.componentStates[component.id] ?? component.defaultState ?? 'active'} onChange={(event) => update((value) => { value.componentStates[component.id] = event.target.value as ComponentState })}><option>active</option><option>inactive</option></select></label>)}</div>
    <div className="scenario-states wide"><strong>Task states</strong>{config.tasks.map((task) => <label key={task.id}><span>{task.name}</span><select value={item.taskStates[task.id] ?? task.defaultState ?? 'active'} onChange={(event) => update((value) => { value.taskStates[task.id] = event.target.value as ComponentState })}><option>active</option><option>inactive</option></select></label>)}</div>
  </div>
}
