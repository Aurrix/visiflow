import { useMemo, useState } from 'react'
import './App.css'
import { AppMap } from './components/AppMap'
import { Catalog } from './components/Catalog'
import { DetailPanel } from './components/DetailPanel'
import { SystemsCatalog } from './components/SystemsCatalog'
import { parseConfig, type ConfigResult } from './config'
import { cadenceLabels, type Selection } from './model'
import type { VisiFlowConfig } from './types'

function ConfigError({ errors }: { errors: string[] }) {
  return <main className="config-error"><div className="error-mark">!</div><p className="eyebrow">Configuration error</p><h1>VisiFlow could not start</h1><p>Correct the embedded JSON configuration and reload this file.</p><ul>{errors.map((error) => <li key={error}><code>{error}</code></li>)}</ul></main>
}

export default function App({ result }: { result: ConfigResult }) {
  const [activeResult, setActiveResult] = useState(result)
  const [revision, setRevision] = useState(0)

  if (!activeResult.ok) return <ConfigError errors={activeResult.errors} />
  return <VisiFlow key={revision} config={activeResult.data} onConfig={(config) => {
    setActiveResult({ ok: true, data: config })
    setRevision((current) => current + 1)
  }} />
}

function ConfigEditor({ config, onApply, onClose }: { config: VisiFlowConfig; onApply: (config: VisiFlowConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => JSON.stringify(config, null, 2))
  const [errors, setErrors] = useState<string[]>([])

  const apply = () => {
    let input: unknown
    try {
      input = JSON.parse(draft)
    } catch (error) {
      setErrors([`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`])
      return
    }
    const result = parseConfig(input)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    onApply(result.data)
  }

  return (
    <div className="config-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="config-modal" role="dialog" aria-modal="true" aria-labelledby="config-modal-title">
        <header>
          <div><p className="eyebrow">Live preview</p><h2 id="config-modal-title">JSON configuration</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close configuration editor">×</button>
        </header>
        <p className="config-modal-copy">Paste or edit a complete VisiFlow configuration. Applying it replaces the current preview until the page is reloaded.</p>
        <textarea
          autoFocus
          aria-label="JSON configuration"
          spellCheck={false}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); if (errors.length) setErrors([]) }}
          onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') apply() }}
        />
        {errors.length > 0 && <div className="config-editor-errors" role="alert"><strong>Configuration could not be applied</strong><ul>{errors.map((error) => <li key={error}><code>{error}</code></li>)}</ul></div>}
        <footer><span>Ctrl/⌘ + Enter to apply</span><div><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" onClick={apply}>Apply configuration</button></div></footer>
      </section>
    </div>
  )
}

function GearIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Zm8.1 5.1-1.56.9c-.15.5-.35.98-.6 1.43l.47 1.74-1 1-1.75-.47c-.45.25-.92.45-1.42.59l-.9 1.56h-1.4l-.9-1.56c-.5-.14-.98-.34-1.43-.59l-1.74.47-1-1 .47-1.74c-.25-.45-.45-.93-.6-1.43l-1.55-.9v-1.4l1.56-.9c.14-.5.34-.98.59-1.43l-.47-1.74 1-1 1.74.47c.45-.25.93-.45 1.43-.59l.9-1.56h1.4l.9 1.56c.5.14.97.34 1.42.59l1.75-.47 1 1-.47 1.74c.25.45.45.93.6 1.43l1.55.9v1.4Z" /></svg>
}

function VisiFlow({ config, onConfig }: { config: VisiFlowConfig; onConfig: (config: VisiFlowConfig) => void }) {
  const initialScenario = config.scenarios.find((item) => item.id === config.initialScenarioId) ?? config.scenarios[0]
  const [view, setView] = useState<'map' | 'catalog' | 'systems'>('map')
  const [scenarioId, setScenarioId] = useState(initialScenario.id)
  const [screenId, setScreenId] = useState(initialScenario.screenId ?? config.app.initialScreenId)
  const [selection, setSelection] = useState<Selection>(null)
  const [search, setSearch] = useState('')
  const [systemsSearch, setSystemsSearch] = useState('')
  const [catalogScreen, setCatalogScreen] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [protocol, setProtocol] = useState('all')
  const [cadence, setCadence] = useState('all')
  const [editingConfig, setEditingConfig] = useState(false)
  const scenario = config.scenarios.find((item) => item.id === scenarioId) ?? initialScenario
  const protocols = useMemo(() => [...new Set(config.connections.map((item) => item.protocol))].sort(), [config])
  const cadences = useMemo(() => [...new Set(config.connections.map((item) => item.cadence.kind))].sort(), [config])

  const changeScenario = (nextId: string) => {
    setScenarioId(nextId)
    const next = config.scenarios.find((item) => item.id === nextId)
    if (next?.screenId) setScreenId(next.screenId)
  }

  const showInApp = (componentId: string) => {
    const component = config.components.find((item) => item.id === componentId)
    if (!component) return
    setScreenId(component.screenId)
    setSelection({ kind: 'component', id: componentId })
    setView('map')
  }

  return (
    <div className="app-shell" style={{ '--accent': config.app.accent ?? '#7c8cff' } as React.CSSProperties}>
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark"><i /><i /><i /></div><div><strong>VisiFlow</strong><span>Application request atlas</span></div></div>
        <nav className="view-tabs" aria-label="Views">
          <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')} aria-current={view === 'map' ? 'page' : undefined}><span>⌘</span> App map</button>
          <button className={view === 'catalog' ? 'active' : ''} onClick={() => setView('catalog')} aria-current={view === 'catalog' ? 'page' : undefined}><span>▦</span> Components</button>
          <button className={view === 'systems' ? 'active' : ''} onClick={() => setView('systems')} aria-current={view === 'systems' ? 'page' : undefined}><span>◇</span> Systems</button>
          <button className="settings-trigger" type="button" onClick={() => setEditingConfig(true)} aria-label="Edit JSON configuration" title="Edit JSON configuration"><GearIcon /></button>
        </nav>
        <div className="app-identity"><span className="app-avatar">{config.app.name.slice(0, 1)}</span><span><strong>{config.app.name}</strong><small>{config.app.platform}</small></span></div>
      </header>

      <div className="context-bar">
        <div className="context-title"><p className="eyebrow">{config.app.device} application</p><h1>{config.app.name}</h1><p>{config.app.description}</p></div>
        <div className="context-controls">
          <label><span>Scenario</span><select value={scenarioId} onChange={(event) => changeScenario(event.target.value)}>{config.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {view === 'map' && <label><span>Screen</span><select value={screenId} onChange={(event) => { setScreenId(event.target.value); setSelection(null) }}>{config.screens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label><span>Protocol</span><select value={protocol} onChange={(event) => setProtocol(event.target.value)}><option value="all">All protocols</option>{protocols.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label><span>Cadence</span><select value={cadence} onChange={(event) => setCadence(event.target.value)}><option value="all">All cadence</option>{cadences.map((item) => <option value={item} key={item}>{cadenceLabels[item]}</option>)}</select></label>
        </div>
      </div>

      <main className={`main-layout view-${view}`}>
        {view === 'map' ? <AppMap config={config} screenId={screenId} scenario={scenario} selection={selection} protocol={protocol} cadence={cadence} onSelect={setSelection} /> :
          view === 'catalog' ? <Catalog config={config} scenario={scenario} selection={selection} search={search} screen={catalogScreen} protocol={protocol} cadence={cadence} state={stateFilter} onSearch={setSearch} onScreen={setCatalogScreen} onProtocol={setProtocol} onCadence={setCadence} onState={setStateFilter} onSelect={setSelection} onShowInApp={showInApp} /> :
            <SystemsCatalog config={config} selection={selection} search={systemsSearch} protocol={protocol} cadence={cadence} onSearch={setSystemsSearch} onSelect={setSelection} />}
        <DetailPanel config={config} selection={selection} onClose={() => setSelection(null)} />
      </main>
      {editingConfig && <ConfigEditor config={config} onApply={onConfig} onClose={() => setEditingConfig(false)} />}
    </div>
  )
}
