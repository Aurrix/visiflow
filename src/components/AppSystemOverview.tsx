import type { CSSProperties } from 'react'
import type { Selection } from '../model'
import { connectionCadences, connectionMatchesCadence, sameRef } from '../model'
import type { Connection, VisiFlowConfig } from '../types'

type RequestGroup = 'normal' | 'scheduled' | 'polling' | 'push'

const labels: Record<RequestGroup, { title: string; detail: string }> = {
  normal: { title: 'Normal requests', detail: 'User, lifecycle, and realtime flows' },
  scheduled: { title: 'Scheduled requests', detail: 'Scheduled and recurring runtime work' },
  polling: { title: 'Polling requests', detail: 'Repeated polling runtime work' },
  push: { title: 'Push notifications', detail: 'Asynchronous inbound messages' },
}

export function AppSystemOverview({ config, selection, protocols, cadence, onSelect }: {
  config: VisiFlowConfig
  selection: Selection
  protocols: string[]
  cadence: string
  onSelect: (selection: Selection) => void
}) {
  const groupFor = (connection: Connection): RequestGroup => {
    const kinds = connectionCadences(config, connection).map((item) => item.kind)
    if (kinds.includes('push')) return 'push'
    if (kinds.includes('polling')) return 'polling'
    if (kinds.includes('scheduled') || kinds.includes('recurring')) return 'scheduled'
    return 'normal'
  }
  const connections = config.connections.filter((connection) => (protocols.length === 0 || protocols.includes(connection.protocol)) && connectionMatchesCadence(config, connection, cadence))
  const groupedConnections = Object.fromEntries((['normal', 'scheduled', 'polling', 'push'] as const).map((group) => [group, connections.filter((connection) => groupFor(connection) === group)])) as Record<RequestGroup, Connection[]>
  const systemIds = (items: Connection[]) => [...new Set(items.flatMap((connection) => [connection.source, connection.target]).filter((ref) => ref.kind === 'system').map((ref) => ref.id))]
  const systemCard = (id: string) => {
    const system = config.systems.find((item) => item.id === id)
    if (!system) return null
    return <button key={id} className={`app-system-node${sameRef(selection, { kind: 'system', id }) ? ' selected' : ''}`} style={{ '--system-color': system.color ?? '#7c8cff' } as CSSProperties} onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'system', id }) }}><b>{system.icon ?? '◇'}</b><span><small>{system.type}</small><strong>{system.name}</strong></span></button>
  }
  return <section className="app-system-overview" aria-label="App and systems overview" onClick={() => onSelect(null)}>
    <header className="overview-intro"><div><span className="live-dot" />App and systems</div><small>Runtime requests grouped by when they run</small></header>
    <div className="app-system-drawio">
      <svg className="drawio-connectors" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="system-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>{groupedConnections.push.length > 0 && <path className="push-line" d="M 310 138 L 310 246" markerEnd="url(#system-arrow)" />}{groupedConnections.polling.length > 0 && <path className="polling-line" d="M 430 300 L 430 110 L 760 110" markerEnd="url(#system-arrow)" />}{groupedConnections.normal.length > 0 && <path className="normal-line" d="M 430 300 L 760 300" markerEnd="url(#system-arrow)" />}{groupedConnections.scheduled.length > 0 && <path className="scheduled-line" d="M 430 300 L 430 490 L 760 490" markerEnd="url(#system-arrow)" />}</svg>
      <aside className="app-graph-node"><span>{config.app.name.slice(0, 1)}</span><strong>{config.app.name}</strong><small>{config.components.length} components · {config.tasks.length} tasks</small></aside>
      {groupedConnections.push.length > 0 && <section className="drawio-push"><header><span>{labels.push.title}</span><small>{labels.push.detail}</small></header><div className="app-system-nodes">{systemIds(groupedConnections.push).slice(0, 3).map(systemCard)}</div><em>{groupedConnections.push.length} async</em></section>}
      <div className="drawio-lanes">{(['normal', 'scheduled', 'polling'] as const).map((group) => {
        const items = groupedConnections[group]
        if (items.length === 0) return null
        const systems = systemIds(items)
        return <section className={`drawio-lane ${group}`} key={group}><header><span>{labels[group].title}</span><small>{labels[group].detail}</small><em>{items.length}</em></header><div className="drawio-lane-body"><div className="app-system-requests">{items.slice(0, 3).map((connection) => <span key={connection.id}>{connectionCadences(config, connection).map((item) => item.label).join(' · ') || connection.name}</span>)}</div><span className="drawio-direction">→</span><div className="app-system-nodes">{systems.slice(0, 4).map(systemCard)}{systems.length > 4 && <span className="app-system-more">+{systems.length - 4}</span>}</div></div></section>
      })}</div>
    </div>
  </section>
}
