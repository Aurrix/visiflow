import type { CSSProperties } from 'react'
import type { Selection } from '../model'
import { connectionCadences, connectionMatchesCadence, sameRef } from '../model'
import type { Connection, VisiFlowConfig } from '../types'

export function ScreenSystemOverview({ config, selection, protocols, cadence, onScreen, onSelect }: {
  config: VisiFlowConfig
  selection: Selection
  protocols: string[]
  cadence: string
  onScreen: (screenId: string) => void
  onSelect: (selection: Selection) => void
}) {
  const componentToScreen = new Map(config.components.map((component) => [component.id, component.screenId]))
  const systems = new Map(config.systems.map((system) => [system.id, system]))
  const componentFlagged = new Set(config.components.filter((component) => component.flagged).map((component) => component.id))
  const taskFlagged = new Set(config.tasks.filter((task) => task.flagged).map((task) => task.id))
  const connectionsForScreen = (screenId: string) => config.connections.filter((connection) => {
    const componentRefs = [connection.source, connection.target].filter((ref) => ref.kind === 'component')
    const systemRefs = [connection.source, connection.target].filter((ref) => ref.kind === 'system')
    return componentRefs.some((ref) => componentToScreen.get(ref.id) === screenId) && systemRefs.length > 0 &&
      (protocols.length === 0 || protocols.includes(connection.protocol)) && connectionMatchesCadence(config, connection, cadence)
  })
  const systemFor = (connection: Connection) => [connection.source, connection.target].find((ref) => ref.kind === 'system')
  const isFlagged = (connection: Connection) =>
    (connection.source.kind === 'component' && componentFlagged.has(connection.source.id)) ||
    (connection.target.kind === 'component' && componentFlagged.has(connection.target.id)) ||
    (connection.source.kind === 'task' && taskFlagged.has(connection.source.id)) ||
    (connection.target.kind === 'task' && taskFlagged.has(connection.target.id))

  return <section className="screen-system-overview" aria-label="Screen and system overview" onClick={() => onSelect(null)}>
    <header className="overview-intro"><div><span className="live-dot" />System overview</div><small>Screen structure and its external touchpoints</small></header>
    <div className="overview-flow">
      {config.screens.map((screen) => {
        const connections = connectionsForScreen(screen.id)
        return <article key={screen.id} className={`overview-row${screen.id === config.app.initialScreenId ? ' initial' : ''}`}>
          <button className={`overview-screen${screen.id === config.app.initialScreenId ? ' selected' : ''}`} onClick={(event) => { event.stopPropagation(); onScreen(screen.id); onSelect(null) }}>
            <span className="overview-screen-glyph" aria-hidden="true">&#9636;</span>
            <span><small>{screen.group ?? 'Screen'}</small><strong>{screen.name}</strong><em>{screen.width} × {screen.height}</em></span>
            {screen.id === config.app.initialScreenId && <i>START</i>}
          </button>
          <div className="overview-connectors">
            {connections.length ? connections.map((connection) => {
              const systemRef = systemFor(connection)
              const system = systemRef && systems.get(systemRef.id)
              if (!system || !systemRef) return null
              const outgoing = connection.target.kind === 'system'
              return <div className="overview-connection" key={connection.id}>
                <span className="overview-line" aria-hidden="true" />
                <span className="overview-protocol">{isFlagged(connection) && <i className="connection-warning" title="Flagged request">&#9888;</i>}{connection.method ? `${connection.method} · ` : ''}{connection.protocol}<small>{connectionCadences(config, connection).map((item) => item.label).join(' · ') || 'Task-managed flow'}</small></span>
                <span className="overview-arrow" aria-label={outgoing ? 'Request to system' : 'Response from system'}>{outgoing ? '→' : '←'}</span>
                <button className={`overview-system${sameRef(selection, systemRef) ? ' selected' : ''}`} style={{ '--system-color': system.color ?? '#7c8cff' } as CSSProperties} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'system', id: system.id }) }}>
                  <b>{system.icon ?? '◇'}</b><span><small>{system.type}</small><strong>{system.name}</strong></span>
                </button>
              </div>
            }) : <p className="overview-no-connection"><span />No external systems</p>}
          </div>
        </article>
      })}
    </div>
  </section>
}
