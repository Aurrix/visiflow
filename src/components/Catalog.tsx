import type { Selection } from '../model'
import { cadenceLabels, componentState, connectionMatchesCadence, connectionsFor, endpointName, sameRef } from '../model'
import type { CadenceKind, Scenario, VisiFlowConfig } from '../types'
import { ComponentPreview } from './ComponentPreview'
import { plainMarkdownExcerpt } from '../markdown-utils'

interface CatalogProps {
  config: VisiFlowConfig
  scenario: Scenario
  selection: Selection
  search: string
  screen: string
  protocols: string[]
  availableProtocols: string[]
  cadence: string
  cadences: CadenceKind[]
  state: string
  onSearch: (value: string) => void
  onScreen: (value: string) => void
  onScenario: (value: string) => void
  onToggleProtocol: (value: string) => void
  onClearProtocols: () => void
  onCadence: (value: string) => void
  onState: (value: string) => void
  onSelect: (selection: Selection) => void
  onShowInApp: (componentId: string) => void
}

export function Catalog(props: CatalogProps) {
  const { config, scenario } = props
  const filtered = config.components.filter((component) => {
    const connections = connectionsFor(config, { kind: 'component', id: component.id })
    const haystack = `${component.name} ${component.type} ${component.description} ${(component.tags ?? []).join(' ')}`.toLowerCase()
    return (!props.search || haystack.includes(props.search.toLowerCase())) &&
      (props.screen === 'all' || component.screenId === props.screen) &&
      (props.state === 'all' || componentState(component, scenario) === props.state) &&
      (props.protocols.length === 0 || connections.some((connection) => props.protocols.includes(connection.protocol))) &&
      (props.cadence === 'all' || connections.some((connection) => connectionMatchesCadence(config, connection, props.cadence)))
  })

  return (
    <section className="catalog-view" aria-label="Component catalog">
      <div className="catalog-heading">
        <div><p className="eyebrow">Application inventory</p><h2>Component catalog</h2></div>
        <p>{filtered.length} of {config.components.length} components</p>
      </div>
      <div className="catalog-filters">
        <label className="search-field"><span>⌕</span><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search components…" aria-label="Search components" /></label>
        <label><span className="sr-only">Scenario</span><select aria-label="Scenario" value={scenario.id} onChange={(event) => props.onScenario(event.target.value)}>{config.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="sr-only">Screen</span><select aria-label="Screen" value={props.screen} onChange={(event) => props.onScreen(event.target.value)}><option value="all">All screens</option>{config.screens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="sr-only">State</span><select value={props.state} onChange={(event) => props.onState(event.target.value)}><option value="all">Any state</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label><span className="sr-only">Cadence</span><select aria-label="Cadence" value={props.cadence} onChange={(event) => props.onCadence(event.target.value)}><option value="all">All cadence</option>{props.cadences.map((item) => <option value={item} key={item}>{cadenceLabels[item]}</option>)}</select></label>
        <div className="inventory-protocols" role="group" aria-label="Protocol filters">
          <button type="button" className={props.protocols.length === 0 ? 'active' : ''} aria-pressed={props.protocols.length === 0} onClick={props.onClearProtocols}>All</button>
          {props.availableProtocols.map((item) => <button type="button" className={props.protocols.includes(item) ? 'active' : ''} aria-pressed={props.protocols.includes(item)} onClick={() => props.onToggleProtocol(item)} key={item}>{item}</button>)}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="catalog-empty"><span>⌕</span><h3>No components found</h3><p>Adjust the search or filters to widen the result set.</p></div>
      ) : (
        <div className="component-grid">
          {filtered.map((component) => {
            const ref = { kind: 'component' as const, id: component.id }
            const connections = connectionsFor(config, ref)
            const outgoing = connections.filter((connection) => connection.source.kind === 'component' && connection.source.id === component.id)
            const currentState = componentState(component, scenario)
            const selected = sameRef(props.selection, ref)
            const screen = config.screens.find((item) => item.id === component.screenId)
            const protocols = [...new Set(connections.map((connection) => connection.protocol))]
            return (
              <article className={`component-card${selected ? ' selected' : ''}`} key={component.id} onClick={() => props.onSelect(ref)}>
                <div className="component-card-top">
                  <div className="component-glyph">{component.type.slice(0, 1).toUpperCase()}</div>
                  <span className={`state-pill ${currentState}`}><i />{currentState}</span>
                </div>
                <ComponentPreview component={component} screen={config.screens.find((item) => item.id === component.screenId)} scenario={scenario} />
                <p className="card-kicker">{screen?.name} · {component.type}</p>
                <h3>{component.name}</h3>
                <p className="card-description">{plainMarkdownExcerpt(component.description)}</p>
                <div className="tag-row">{(component.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div>
                <div className="card-stats">
                  <span><strong>{outgoing.length}</strong> outgoing</span>
                  <span><strong>{connections.length - outgoing.length}</strong> incoming</span>
                </div>
                <div className="protocol-row">{protocols.length ? protocols.map((item) => <span key={item}>{item}</span>) : <span>No protocols</span>}</div>
                {connections[0] && <p className="destination">↗ {endpointName(config, connections[0].target)}</p>}
                <button className="show-app" onClick={(event) => { event.stopPropagation(); props.onShowInApp(component.id) }}>Show in app <span>→</span></button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
