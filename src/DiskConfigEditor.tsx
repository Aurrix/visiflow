import { useMemo, useRef, useState } from 'react'
import { parseConfig } from './config'
import { EditorCanvas, type Bounds } from './components/EditorCanvas'
import { scaledContentHeight } from './editor-utils'
import type {
  AppComponent,
  AppScreen,
  ComponentState,
  Connection,
  ExternalSystem,
  Scenario,
  VisiFlowConfig,
  VisualKind,
} from './types'

type WritableFileHandle = {
  name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<WritableFileHandle[]>
  showSaveFilePicker?: (options?: unknown) => Promise<WritableFileHandle>
}

type EntityKind = 'app' | 'screen' | 'component' | 'system' | 'connection' | 'scenario'
type Selection = { kind: EntityKind; id?: string }
type History = { past: VisiFlowConfig[]; present: VisiFlowConfig; future: VisiFlowConfig[] }

const pickerOptions = {
  types: [{ description: 'VisiFlow JSON configuration', accept: { 'application/json': ['.json'] } }],
}

const clone = (config: VisiFlowConfig) => structuredClone(config)
const uniqueId = (prefix: string, used: string[]) => {
  let candidate = prefix
  let index = 2
  while (used.includes(candidate)) candidate = `${prefix}-${index++}`
  return candidate
}

function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

async function readImage(file: File): Promise<{ src: string; width: number; height: number }> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('The selected file is not a readable image.'))
    image.src = src
  })
  return { src, ...dimensions }
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`editor-field${wide ? ' wide' : ''}`}><span>{label}</span>{children}</label>
}

function ImageButton({ label, onImage }: { label: string; onImage: (image: Awaited<ReturnType<typeof readImage>>) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return <>
    <button type="button" className="secondary-button image-import" onClick={() => ref.current?.click()}>{label}</button>
    <input ref={ref} className="sr-only" type="file" accept="image/*" onChange={(event) => {
      const file = event.target.files?.[0]
      if (file) void readImage(file).then(onImage)
      event.target.value = ''
    }} />
  </>
}

function modeFor(component: AppComponent): 'region' | 'image' | 'rendered' {
  if (component.visual.kind === 'hotspot' && !component.visual.src) return 'region'
  if (component.visual.kind === 'image') return 'image'
  return 'rendered'
}

export function DiskConfigEditor({ initialText }: { initialText: string }) {
  const initial = parseConfig(JSON.parse(initialText))
  if (!initial.ok) throw new Error(`Invalid bundled editor configuration: ${initial.errors.join(', ')}`)

  const [history, setHistory] = useState<History>({ past: [], present: initial.data, future: [] })
  const config = history.present
  const [selection, setSelection] = useState<Selection>({ kind: 'screen', id: config.app.initialScreenId })
  const [screenId, setScreenId] = useState(config.app.initialScreenId)
  const [scenarioId, setScenarioId] = useState(config.initialScenarioId ?? config.scenarios[0].id)
  const [drawMode, setDrawMode] = useState(false)
  const [fileHandle, setFileHandle] = useState<WritableFileHandle | null>(null)
  const [fileName, setFileName] = useState('visiflow-config.json')
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(config))
  const [message, setMessage] = useState('Example configuration loaded')
  const uploadRef = useRef<HTMLInputElement>(null)

  const validation = useMemo(() => parseConfig(config), [config])
  const dirty = JSON.stringify(config) !== savedSnapshot
  const screen = config.screens.find((item) => item.id === screenId) ?? config.screens[0]
  const scenario = config.scenarios.find((item) => item.id === scenarioId) ?? config.scenarios[0]

  const commit = (mutate: (draft: VisiFlowConfig) => void) => {
    setHistory((current) => {
      const next = clone(current.present)
      mutate(next)
      return { past: [...current.past.slice(-79), current.present], present: next, future: [] }
    })
  }

  const replaceConfig = (next: VisiFlowConfig, nextName: string, handle: WritableFileHandle | null) => {
    setHistory({ past: [], present: next, future: [] })
    setFileName(nextName)
    setFileHandle(handle)
    setSavedSnapshot(JSON.stringify(next))
    const nextScreen = next.screens.find((item) => item.id === next.app.initialScreenId) ?? next.screens[0]
    setScreenId(nextScreen.id)
    setScenarioId(next.initialScenarioId ?? next.scenarios[0].id)
    setSelection({ kind: 'screen', id: nextScreen.id })
    setMessage(`Opened ${nextName}`)
  }

  const openText = (text: string, name: string, handle: WritableFileHandle | null) => {
    try {
      const result = parseConfig(JSON.parse(text))
      if (!result.ok) {
        setMessage(`Could not open ${name}: ${result.errors[0]}`)
        return
      }
      replaceConfig(result.data, name, handle)
    } catch (error) {
      setMessage(`Could not open ${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const openFile = async () => {
    const picker = window as PickerWindow
    if (!picker.showOpenFilePicker) {
      uploadRef.current?.click()
      return
    }
    try {
      const [handle] = await picker.showOpenFilePicker(pickerOptions)
      if (handle) openText(await (await handle.getFile()).text(), handle.name, handle)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage(`Could not open file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const saveToHandle = async (handle: WritableFileHandle) => {
    if (!validation.ok) {
      setMessage(`Fix configuration issue before saving: ${validation.errors[0]}`)
      return
    }
    const text = JSON.stringify(config, null, 2)
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    setFileHandle(handle)
    setFileName(handle.name)
    setSavedSnapshot(JSON.stringify(config))
    setMessage(`Saved ${handle.name}`)
  }

  const saveAs = async () => {
    if (!validation.ok) {
      setMessage(`Fix configuration issue before saving: ${validation.errors[0]}`)
      return
    }
    const picker = window as PickerWindow
    if (!picker.showSaveFilePicker) {
      downloadText(JSON.stringify(config, null, 2), fileName)
      setMessage(`Downloaded ${fileName}; direct disk saving is unavailable in this browser`)
      return
    }
    try {
      await saveToHandle(await picker.showSaveFilePicker({ ...pickerOptions, suggestedName: fileName }))
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage(`Could not save file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const save = async () => {
    if (!fileHandle) return saveAs()
    try {
      await saveToHandle(fileHandle)
    } catch (error) {
      setMessage(`Could not save file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const reconcileNavigation = (next: VisiFlowConfig) => {
    if (!next.screens.some((item) => item.id === screenId)) setScreenId(next.screens[0].id)
    if (!next.scenarios.some((item) => item.id === scenarioId)) setScenarioId(next.scenarios[0].id)
    if (!selection.id) return
    const exists = selection.kind === 'screen' ? next.screens.some((item) => item.id === selection.id)
      : selection.kind === 'component' ? next.components.some((item) => item.id === selection.id)
        : selection.kind === 'system' ? next.systems.some((item) => item.id === selection.id)
          : selection.kind === 'connection' ? next.connections.some((item) => item.id === selection.id)
            : selection.kind === 'scenario' ? next.scenarios.some((item) => item.id === selection.id)
              : true
    if (!exists) setSelection({ kind: 'app' })
  }
  const undo = () => {
    const previous = history.past.at(-1)
    if (!previous) return
    setHistory({ past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] })
    reconcileNavigation(previous)
  }
  const redo = () => {
    const next = history.future[0]
    if (!next) return
    setHistory({ past: [...history.past, history.present], present: next, future: history.future.slice(1) })
    reconcileNavigation(next)
  }

  const selectScreen = (id: string) => {
    setScreenId(id)
    setSelection({ kind: 'screen', id })
  }

  const addEntity = (kind: Exclude<EntityKind, 'app'>) => {
    if (kind === 'component') {
      setDrawMode(true)
      setMessage('Drag on the device canvas to create a component region')
      return
    }
    if (kind === 'connection' && !config.components.length && !config.systems.length) {
      setMessage('Create a component or system before adding a connection')
      return
    }
    let createdId = ''
    commit((draft) => {
      if (kind === 'screen') {
        createdId = uniqueId('new-screen', draft.screens.map((item) => item.id))
        draft.screens.push({ id: createdId, name: 'New screen', width: screen.width, height: screen.height, background: '#151925' })
      } else if (kind === 'system') {
        createdId = uniqueId('new-system', draft.systems.map((item) => item.id))
        draft.systems.push({ id: createdId, name: 'New system', type: 'Service', description: '', color: '#7c8cff' })
      } else if (kind === 'connection') {
        const source = draft.components[0] ? { kind: 'component' as const, id: draft.components[0].id } : { kind: 'system' as const, id: draft.systems[0].id }
        const target = draft.systems[0] ? { kind: 'system' as const, id: draft.systems[0].id } : source
        createdId = uniqueId('new-connection', draft.connections.map((item) => item.id))
        draft.connections.push({ id: createdId, name: 'New request', source, target, protocol: 'HTTPS', description: '', cadence: { kind: 'user-event', label: 'On user action' } })
      } else {
        createdId = uniqueId('new-scenario', draft.scenarios.map((item) => item.id))
        draft.scenarios.push({ id: createdId, name: 'New scenario', screenId, componentStates: {} })
      }
    })
    if (kind === 'screen') setScreenId(createdId)
    setSelection({ kind, id: createdId })
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
    setSelection({ kind: 'component', id })
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
    setSelection({ kind: 'component', id })
  }

  const rename = (kind: EntityKind, oldId: string, nextId: string) => commit((draft) => {
    if (kind === 'screen') {
      const item = draft.screens.find((value) => value.id === oldId)
      if (item) item.id = nextId
      if (draft.app.initialScreenId === oldId) draft.app.initialScreenId = nextId
      draft.components.forEach((value) => { if (value.screenId === oldId) value.screenId = nextId })
      draft.scenarios.forEach((value) => { if (value.screenId === oldId) value.screenId = nextId })
      setScreenId(nextId)
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
      setScenarioId(nextId)
    } else if (kind === 'connection') {
      const item = draft.connections.find((value) => value.id === oldId)
      if (item) item.id = nextId
    }
    setSelection({ kind, id: nextId })
  })

  const deleteSelection = () => {
    if (selection.kind === 'app' || !selection.id) return
    const id = selection.id
    const componentIds = selection.kind === 'screen'
      ? config.components.filter((item) => item.screenId === id).map((item) => item.id)
      : selection.kind === 'component' ? [id] : []
    const affectedConnections = config.connections.filter((item) =>
      (item.source.kind === selection.kind && item.source.id === id) ||
      (item.target.kind === selection.kind && item.target.id === id) ||
      (item.source.kind === 'component' && componentIds.includes(item.source.id)) ||
      (item.target.kind === 'component' && componentIds.includes(item.target.id)),
    )
    const details = [
      componentIds.length ? `${componentIds.length} component(s)` : '',
      affectedConnections.length ? `${affectedConnections.length} connection(s)` : '',
      componentIds.length ? 'related scenario states' : '',
    ].filter(Boolean).join(', ')
    if (!window.confirm(`Delete this ${selection.kind}${details ? ` and ${details}` : ''}? This can be undone.`)) return
    if (selection.kind === 'screen' && config.screens.length === 1) {
      setMessage('A configuration must contain at least one screen')
      return
    }
    if (selection.kind === 'scenario' && config.scenarios.length === 1) {
      setMessage('A configuration must contain at least one scenario')
      return
    }
    commit((draft) => {
      if (selection.kind === 'screen') {
        draft.screens = draft.screens.filter((item) => item.id !== id)
        draft.components = draft.components.filter((item) => !componentIds.includes(item.id))
        draft.connections = draft.connections.filter((item) => !affectedConnections.some((connection) => connection.id === item.id))
        draft.scenarios.forEach((item) => {
          if (item.screenId === id) item.screenId = draft.screens[0].id
          componentIds.forEach((componentId) => delete item.componentStates[componentId])
        })
        if (draft.app.initialScreenId === id) draft.app.initialScreenId = draft.screens[0].id
      } else if (selection.kind === 'component') {
        draft.components = draft.components.filter((item) => item.id !== id)
        draft.connections = draft.connections.filter((item) => !affectedConnections.some((connection) => connection.id === item.id))
        draft.scenarios.forEach((item) => delete item.componentStates[id])
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
    if (selection.kind === 'screen' && fallback) setScreenId(fallback)
    setSelection(selection.kind === 'screen' && fallback ? { kind: 'screen', id: fallback } : { kind: 'app' })
  }

  const entityGroups: { kind: Exclude<EntityKind, 'app'>; label: string; items: { id: string; name: string }[] }[] = [
    { kind: 'screen', label: 'Screens', items: config.screens },
    { kind: 'component', label: 'Components', items: config.components.filter((item) => item.screenId === screen.id) },
    { kind: 'system', label: 'Systems', items: config.systems },
    { kind: 'connection', label: 'Connections', items: config.connections },
    { kind: 'scenario', label: 'Scenarios', items: config.scenarios },
  ]

  return (
    <div className="disk-editor" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        setDrawMode(false)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    }}>
      <header className="disk-editor-toolbar">
        <div className="disk-editor-brand"><div className="brand-mark"><i /><i /><i /></div><div><strong>VisiFlow Config Editor</strong><span>{fileName}{dirty ? ' • modified' : ''}</span></div></div>
        <div className="disk-editor-actions">
          <button type="button" className="icon-button" onClick={undo} disabled={!history.past.length} aria-label="Undo">↶</button>
          <button type="button" className="icon-button" onClick={redo} disabled={!history.future.length} aria-label="Redo">↷</button>
          <button type="button" className="secondary-button" onClick={() => replaceConfig(initial.data, 'visiflow-config.json', null)}>New</button>
          <button type="button" className="secondary-button" onClick={openFile}>Open JSON</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={!validation.ok}>Save</button>
          <button type="button" className="secondary-button" onClick={() => void saveAs()} disabled={!validation.ok}>Save as</button>
          <input ref={uploadRef} className="sr-only" type="file" accept=".json,application/json" aria-label="Choose JSON configuration" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void file.text().then((text) => openText(text, file.name, null))
            event.target.value = ''
          }} />
        </div>
      </header>

      <div className="disk-editor-status" role="status">
        <span className={validation.ok ? 'valid' : 'invalid'}>{validation.ok ? '✓' : '!'}</span>
        {validation.ok ? message : validation.errors[0]}
        <span className="disk-editor-shortcut">Ctrl/⌘ + S · Ctrl/⌘ + Z</span>
      </div>

      <main className="visual-editor-workspace">
        <aside className="entity-browser">
          <button className={`entity-app${selection.kind === 'app' ? ' selected' : ''}`} onClick={() => setSelection({ kind: 'app' })}><span className="app-avatar">{config.app.name.slice(0, 1)}</span><span><strong>{config.app.name}</strong><small>App settings</small></span></button>
          {entityGroups.map((group) => <section key={group.kind}>
            <header><span>{group.label}</span><button type="button" onClick={() => addEntity(group.kind)} aria-label={`Add ${group.kind}`}>+</button></header>
            <div>{group.items.map((item) => <button
              key={item.id}
              className={selection.kind === group.kind && selection.id === item.id ? 'selected' : ''}
              onClick={() => {
                if (group.kind === 'screen') selectScreen(item.id)
                else {
                  if (group.kind === 'component') setScreenId(config.components.find((component) => component.id === item.id)?.screenId ?? screenId)
                  setSelection({ kind: group.kind, id: item.id })
                }
              }}
            ><span>{item.name}</span><small>{item.id}</small></button>)}</div>
          </section>)}
        </aside>

        <section className="authoring-stage">
          <header className="authoring-toolbar">
            <div><strong>{screen.name}</strong><span>{screen.width} × {screen.height}{screen.contentHeight && screen.contentHeight > screen.height ? ` · ${screen.contentHeight}px content` : ''}</span></div>
            <div>
              <label><span>Scenario</span><select value={scenario.id} onChange={(event) => setScenarioId(event.target.value)}>{config.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
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
            onSelect={(id) => setSelection({ kind: 'component', id })}
            onCreate={createComponent}
            onBounds={(id, bounds) => commit((draft) => {
              const item = draft.components.find((value) => value.id === id)
              if (item) {
                Object.assign(item.visual, bounds)
                delete item.visual.layout
              }
            })}
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
          />
        </aside>
      </main>
    </div>
  )
}

function Inspector({ config, selection, screen, commit, rename, onDelete, onDuplicate, onScreen }: {
  config: VisiFlowConfig
  selection: Selection
  screen: AppScreen
  commit: (mutate: (draft: VisiFlowConfig) => void) => void
  rename: (kind: EntityKind, oldId: string, nextId: string) => void
  onDelete: () => void
  onDuplicate: () => void
  onScreen: (id: string) => void
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
    <Field label="Description" wide><textarea value={config.app.description} onChange={(event) => commit((draft) => { draft.app.description = event.target.value })} /></Field>
  </div>

  if (selection.kind === 'screen') {
    const item = config.screens.find((value) => value.id === selection.id) ?? screen
    return <div className="inspector-form">
      {header('Screen', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('screen', item.id, event.target.value)} /></Field>
      <Field label="Viewport width"><input type="number" min="1" value={item.width} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.width = number(event.target.value, 1) })} /></Field>
      <Field label="Viewport height"><input type="number" min="1" value={item.height} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.height = number(event.target.value, 1) })} /></Field>
      <Field label="Content height"><input type="number" min={item.height} value={item.contentHeight ?? item.height} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.contentHeight = number(event.target.value, item.height) })} /></Field>
      <Field label="Background"><input value={item.background ?? ''} placeholder="#151925 or CSS gradient" onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.background = event.target.value })} /></Field>
      <Field label="Image sizing"><input value={item.backgroundSize ?? ''} placeholder="100% auto" onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.backgroundSize = event.target.value || undefined })} /></Field>
      <Field label="Image position"><input value={item.backgroundPosition ?? ''} placeholder="top center" onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.backgroundPosition = event.target.value || undefined })} /></Field>
      <Field label="System UI"><select value={String(item.showSystemUi !== false)} onChange={(event) => commit((draft) => { draft.screens.find((value) => value.id === item.id)!.showSystemUi = event.target.value === 'true' })}><option value="true">Show</option><option value="false">Hide</option></select></Field>
      <div className="inspector-action-row wide">
        <ImageButton label={item.backgroundImage ? 'Replace screenshot' : 'Import screenshot'} onImage={(image) => commit((draft) => {
          const target = draft.screens.find((value) => value.id === item.id)!
          target.backgroundImage = image.src
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
      <Field label="Description" wide><textarea value={item.description} onChange={(event) => update((value) => { value.description = event.target.value })} /></Field>
      {visualMode === 'image' && <div className="inspector-action-row wide"><ImageButton label={item.visual.src ? 'Replace component image' : 'Import component image'} onImage={(image) => update((value) => { value.visual.src = image.src; value.visual.imageFit = 'cover' })} /></div>}
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
        <ImageButton label="Active image" onImage={(image) => update((value) => { value.visual.states ??= {}; value.visual.states.active = { ...value.visual.states.active, src: image.src } })} />
        <ImageButton label="Inactive image" onImage={(image) => update((value) => { value.visual.states ??= {}; value.visual.states.inactive = { ...value.visual.states.inactive, src: image.src } })} />
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
      <optgroup label="Systems">{config.systems.map((value) => <option value={`system:${value.id}`} key={`system:${value.id}`}>{value.name}</option>)}</optgroup>
    </>
    const endpoint = (value: string) => { const [kind, id] = value.split(':'); return { kind: kind as 'component' | 'system', id } }
    return <div className="inspector-form">
      {header('Connection', item.name)}
      <Field label="Name" wide><input value={item.name} onChange={(event) => update((value) => { value.name = event.target.value })} /></Field>
      <Field label="ID" wide><input value={item.id} onChange={(event) => rename('connection', item.id, event.target.value)} /></Field>
      <Field label="Source" wide><select value={`${item.source.kind}:${item.source.id}`} onChange={(event) => update((value) => { value.source = endpoint(event.target.value) })}>{endpointOptions}</select></Field>
      <Field label="Target" wide><select value={`${item.target.kind}:${item.target.id}`} onChange={(event) => update((value) => { value.target = endpoint(event.target.value) })}>{endpointOptions}</select></Field>
      <Field label="Protocol"><input value={item.protocol} onChange={(event) => update((value) => { value.protocol = event.target.value })} /></Field>
      <Field label="Method"><input value={item.method ?? ''} onChange={(event) => update((value) => { value.method = event.target.value })} /></Field>
      <Field label="Endpoint" wide><input value={item.endpoint ?? ''} onChange={(event) => update((value) => { value.endpoint = event.target.value })} /></Field>
      <Field label="Cadence"><select value={item.cadence.kind} onChange={(event) => update((value) => { value.cadence.kind = event.target.value as Connection['cadence']['kind'] })}>{['user-event', 'lifecycle', 'scheduled', 'recurring', 'polling', 'push', 'continuous', 'custom'].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Cadence label"><input value={item.cadence.label} onChange={(event) => update((value) => { value.cadence.label = event.target.value })} /></Field>
      <Field label="Interval ms"><input type="number" min="1" value={item.cadence.intervalMs ?? ''} onChange={(event) => update((value) => { value.cadence.intervalMs = event.target.value ? number(event.target.value, 1) : undefined })} /></Field>
      <Field label="Cron"><input value={item.cadence.cron ?? ''} onChange={(event) => update((value) => { value.cadence.cron = event.target.value || undefined })} /></Field>
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
  </div>
}
