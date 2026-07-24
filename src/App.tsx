import { useMemo, useState } from 'react'
import './App.css'
import { AppMap } from './components/AppMap'
import { Catalog } from './components/Catalog'
import { DetailPanel } from './components/DetailPanel'
import { ScreenTree } from './components/ScreenTree'
import { SystemsCatalog } from './components/SystemsCatalog'
import type { ConfigResult } from './config'
import { cadenceLabels, type Selection } from './model'
import type { VisiFlowConfig } from './types'

export function ConfigError({ errors }: { errors: string[] }) {
  return <main className="config-error"><div className="error-mark">!</div><p className="eyebrow">Project error</p><h1>VisiFlow could not start</h1><p>Correct the project Markdown files and reopen the folder.</p><ul>{errors.map((error) => <li key={error}><code>{error}</code></li>)}</ul></main>
}

export default function App({ result, onOpenProject }: { result: ConfigResult; onOpenProject?: () => void }) {
  if (!result.ok) return <ConfigError errors={result.errors} />
  return <VisiFlow config={result.data} onOpenProject={onOpenProject} />
}

export interface ViewerNavigation {
  screenId: string
  scenarioId: string
  selection: Selection
  onScreen: (screenId: string) => void
  onScenario: (scenarioId: string) => void
  onSelection: (selection: Selection) => void
}

export function VisiFlow({ config, onOpenProject, navigation, workspaceControls }: {
  config: VisiFlowConfig
  onOpenProject?: () => void
  navigation?: ViewerNavigation
  workspaceControls?: React.ReactNode
}) {
  const initialScenario = config.scenarios.find((item) => item.id === config.initialScenarioId) ?? config.scenarios[0]
  const [view, setView] = useState<'map' | 'catalog' | 'systems'>('map')
  const [localScenarioId, setLocalScenarioId] = useState(initialScenario.id)
  const [localScreenId, setLocalScreenId] = useState(initialScenario.screenId ?? config.app.initialScreenId)
  const [localSelection, setLocalSelection] = useState<Selection>(null)
  const [search, setSearch] = useState('')
  const [systemsSearch, setSystemsSearch] = useState('')
  const [catalogScreen, setCatalogScreen] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([])
  const [cadence, setCadence] = useState('all')
  const [mapSearch, setMapSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const scenarioId = navigation?.scenarioId ?? localScenarioId
  const screenId = navigation?.screenId ?? localScreenId
  const selection = navigation ? navigation.selection : localSelection
  const setScenarioId = (value: string) => {
    setLocalScenarioId(value)
    navigation?.onScenario(value)
  }
  const setScreenId = (value: string) => {
    setLocalScreenId(value)
    navigation?.onScreen(value)
  }
  const setSelection = (value: Selection) => {
    setLocalSelection(value)
    navigation?.onSelection(value)
  }
  const scenario = config.scenarios.find((item) => item.id === scenarioId) ?? initialScenario
  const protocols = useMemo(() => [...new Set(config.connections.map((item) => item.protocol))].sort(), [config])
  const cadences = useMemo(() => [...new Set([
    ...config.connections.flatMap((item) => item.cadence ? [item.cadence.kind] : []),
    ...config.tasks.map((item) => item.trigger.kind),
  ])].sort(), [config])
  const hasActiveFilters = selectedProtocols.length > 0 || cadence !== 'all'

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
  const toggleProtocol = (value: string) => setSelectedProtocols((current) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  const selectSidebarScreen = (value: string) => {
    if (view === 'map') {
      setScreenId(value)
      setSelection(null)
    } else {
      setCatalogScreen(value)
    }
  }

  return (
    <div className="app-shell" style={{ '--accent': config.app.accent ?? '#7c8cff' } as React.CSSProperties}>
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark"><i /><i /><i /></div><div><strong>VisiFlow</strong><span>Application request atlas</span></div></div>
        <nav className="view-tabs" aria-label="Views">
          <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')} aria-current={view === 'map' ? 'page' : undefined}><span>⌘</span> App map</button>
          <button className={view === 'catalog' ? 'active' : ''} onClick={() => setView('catalog')} aria-current={view === 'catalog' ? 'page' : undefined}><span>◦</span> Components</button>
          <button className={view === 'systems' ? 'active' : ''} onClick={() => setView('systems')} aria-current={view === 'systems' ? 'page' : undefined}><span>◇</span> Systems</button>
          {onOpenProject && <button className="settings-trigger project-switch" type="button" onClick={onOpenProject} aria-label="Open another project" title="Open another project">⌑</button>}
          {workspaceControls}
        </nav>
        <div className="app-identity"><span className="app-avatar">{config.app.name.slice(0, 1)}</span><span><strong>{config.app.name}</strong><small>{config.app.platform}</small></span></div>
      </header>

      <main className={`main-layout view-${view}`}>
        {view === 'map' && <aside className={`filter-sidebar ${filtersOpen ? 'expanded' : 'collapsed'}`} aria-label="View filters">
          <button className="filter-sidebar-toggle" type="button" aria-expanded={filtersOpen} aria-label={filtersOpen ? 'Collapse view filters' : 'Expand view filters'} onClick={() => setFiltersOpen((open) => !open)}>
            <span aria-hidden="true">☷</span>
            {filtersOpen && <><strong>View controls</strong><small>{view === 'map' ? 'Canvas' : 'Inventory'}</small></>}
            {!filtersOpen && hasActiveFilters && <i className="filter-active-dot" aria-label="Filters active" />}
          </button>
          {filtersOpen && <>
            <section className="sidebar-section protocol-section">
              <header><span>Protocols</span><small>{selectedProtocols.length || 'All'}</small></header>
              <div className="protocol-toggles">
                <button type="button" className={selectedProtocols.length === 0 ? 'active' : ''} aria-pressed={selectedProtocols.length === 0} onClick={() => setSelectedProtocols([])}>All</button>
                {protocols.map((item) => <button type="button" className={selectedProtocols.includes(item) ? 'active' : ''} aria-pressed={selectedProtocols.includes(item)} onClick={() => toggleProtocol(item)} key={item}>{item}</button>)}
              </div>
            </section>
            <section className="sidebar-section scenario-section">
              <label><span>Scenario</span><select value={scenarioId} onChange={(event) => changeScenario(event.target.value)}>{config.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </section>
            <section className="sidebar-section screens-section">
              <header><span>Screens</span><small>{config.screens.length}</small></header>
              <ScreenTree screens={config.screens} activeId={screenId} onSelect={selectSidebarScreen} />
            </section>
            <section className="sidebar-section cadence-section">
              <label><span>Cadence</span><select value={cadence} onChange={(event) => setCadence(event.target.value)}><option value="all">All cadence</option>{cadences.map((item) => <option value={item} key={item}>{cadenceLabels[item]}</option>)}</select></label>
            </section>
            {hasActiveFilters && <button className="clear-filters" type="button" onClick={() => {
              setSelectedProtocols([])
              setCadence('all')
              setCatalogScreen('all')
            }}>Clear filters</button>}
          </>}
        </aside>}

        {view === 'map' ? <AppMap config={config} screenId={screenId} scenario={scenario} selection={selection} protocols={selectedProtocols} cadence={cadence} search={mapSearch} onSearch={setMapSearch} onSelect={setSelection} /> :
          view === 'catalog' ? <Catalog config={config} scenario={scenario} selection={selection} search={search} screen={catalogScreen} protocols={selectedProtocols} availableProtocols={protocols} cadence={cadence} cadences={cadences} state={stateFilter} onSearch={setSearch} onScreen={setCatalogScreen} onScenario={changeScenario} onToggleProtocol={toggleProtocol} onClearProtocols={() => setSelectedProtocols([])} onCadence={setCadence} onState={setStateFilter} onSelect={setSelection} onShowInApp={showInApp} /> :
            <SystemsCatalog config={config} selection={selection} search={systemsSearch} protocols={selectedProtocols} availableProtocols={protocols} cadence={cadence} cadences={cadences} onSearch={setSystemsSearch} onToggleProtocol={toggleProtocol} onClearProtocols={() => setSelectedProtocols([])} onCadence={setCadence} onSelect={setSelection} />}
        <DetailPanel config={config} scenario={scenario} selection={selection} onClose={() => setSelection(null)} />
      </main>
    </div>
  )
}
