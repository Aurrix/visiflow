import type { CSSProperties } from 'react'
import type { Selection } from '../model'
import { connectionsFor, sameRef } from '../model'
import type { VisiFlowConfig } from '../types'

interface SystemsCatalogProps {
  config: VisiFlowConfig
  selection: Selection
  search: string
  protocol: string
  cadence: string
  onSearch: (value: string) => void
  onSelect: (selection: Selection) => void
}

export function SystemsCatalog({ config, selection, search, protocol, cadence, onSearch, onSelect }: SystemsCatalogProps) {
  const filtered = config.systems.filter((system) => {
    const connections = connectionsFor(config, { kind: 'system', id: system.id })
    const haystack = `${system.name} ${system.type} ${system.description}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase())) &&
      (protocol === 'all' || connections.some((connection) => connection.protocol === protocol)) &&
      (cadence === 'all' || connections.some((connection) => connection.cadence.kind === cadence))
  })

  return (
    <section className="catalog-view" aria-label="External systems catalog">
      <div className="catalog-heading"><div><p className="eyebrow">Integration inventory</p><h2>External systems</h2></div><p>{filtered.length} of {config.systems.length} systems</p></div>
      <div className="catalog-filters"><label className="search-field"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search external systems…" aria-label="Search external systems" /></label></div>
      {filtered.length === 0 ? (
        <div className="catalog-empty"><span>◇</span><h3>No external systems found</h3><p>Adjust the search or filters to widen the result set.</p></div>
      ) : (
        <div className="system-grid">
          {filtered.map((system) => {
            const ref = { kind: 'system' as const, id: system.id }
            const connections = connectionsFor(config, ref)
            const outgoing = connections.filter((connection) => connection.source.kind === 'system' && connection.source.id === system.id)
            const protocols = [...new Set(connections.map((connection) => connection.protocol))]
            return <article className={`system-card${sameRef(selection, ref) ? ' selected' : ''}`} key={system.id} style={{ '--system-color': system.color ?? '#7c8cff' } as CSSProperties} onClick={() => onSelect(ref)}>
              <div className="system-card-top"><span className="system-catalog-icon">{system.icon ?? '◇'}</span><span className="system-type">{system.type}</span></div>
              <h3>{system.name}</h3><p className="card-description">{system.description}</p>
              <div className="card-stats"><span><strong>{outgoing.length}</strong> outgoing</span><span><strong>{connections.length - outgoing.length}</strong> incoming</span></div>
              <div className="protocol-row">{protocols.length ? protocols.map((item) => <span key={item}>{item}</span>) : <span>No protocols</span>}</div>
            </article>
          })}
        </div>
      )}
    </section>
  )
}
