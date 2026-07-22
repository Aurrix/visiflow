import type { Selection } from '../model'
import { connectionsFor, endpointName } from '../model'
import type { VisiFlowConfig } from '../types'

interface DetailPanelProps {
  config: VisiFlowConfig
  selection: Selection
  onClose: () => void
}

export function DetailPanel({ config, selection, onClose }: DetailPanelProps) {
  if (!selection) {
    return (
      <aside className="detail-panel detail-empty" aria-label="Selection details">
        <div className="empty-orbit" aria-hidden="true"><span /></div>
        <h2>Select a node</h2>
        <p>Choose a component or external system to inspect its purpose and request paths.</p>
      </aside>
    )
  }

  const item = selection.kind === 'component'
    ? config.components.find((candidate) => candidate.id === selection.id)
    : config.systems.find((candidate) => candidate.id === selection.id)
  if (!item) return null
  const connections = connectionsFor(config, selection)

  return (
    <aside className="detail-panel" aria-label={`${item.name} details`}>
      <button className="icon-button panel-close" onClick={onClose} aria-label="Close details">×</button>
      <p className="eyebrow">{selection.kind === 'component' ? item.type : `External · ${item.type}`}</p>
      <h2>{item.name}</h2>
      <p className="detail-description">{item.description}</p>
      <div className="detail-stat-row">
        <span><strong>{connections.length}</strong> paths</span>
        <span><strong>{new Set(connections.map((connection) => connection.protocol)).size}</strong> protocols</span>
      </div>
      <div className="request-list">
        <div className="section-heading"><h3>Request paths</h3><span>{connections.length}</span></div>
        {connections.length === 0 && <p className="empty-copy">No requests are declared for this node.</p>}
        {connections.map((connection) => {
          const outgoing = connection.source.kind === selection.kind && connection.source.id === selection.id
          const counterpart = outgoing ? connection.target : connection.source
          return (
            <article className="request-card" key={connection.id}>
              <div className="request-topline">
                <span className={`direction ${outgoing ? 'out' : 'in'}`}>{outgoing ? '↗ OUT' : '↙ IN'}</span>
                <span className="protocol">{connection.method ? `${connection.protocol} · ${connection.method}` : connection.protocol}</span>
              </div>
              <h4>{connection.name}</h4>
              <p className="counterpart">{outgoing ? 'To' : 'From'} {endpointName(config, counterpart)}</p>
              {connection.endpoint && <code>{connection.endpoint}</code>}
              <p>{connection.description}</p>
              <span className="cadence">◷ {connection.cadence.label}</span>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
