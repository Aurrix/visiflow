import type { Selection } from '../model'
import { connectionCadences, connectionsFor, endpointName, taskState } from '../model'
import type { Scenario, VisiFlowConfig } from '../types'
import { MarkdownText } from './MarkdownText'

interface DetailPanelProps {
  config: VisiFlowConfig
  scenario: Scenario
  selection: Selection
  onClose: () => void
}

export function DetailPanel({ config, scenario, selection, onClose }: DetailPanelProps) {
  if (!selection) {
    return (
      <aside className="detail-panel detail-empty" aria-label="Selection details">
        <section className="app-context-summary" aria-label="Application context">
          <span className="app-avatar">{config.app.name.slice(0, 1)}</span>
          <p className="eyebrow">{config.app.device} application · {config.app.platform}</p>
          <h2>{config.app.name}</h2>
          <MarkdownText className="detail-description">{config.app.description}</MarkdownText>
        </section>
        <section className="empty-selection-prompt">
          <div className="empty-orbit" aria-hidden="true"><span /></div>
          <h3>Select a node</h3>
          <p>Choose a component, background task, or external system to inspect its purpose and request paths.</p>
        </section>
      </aside>
    )
  }

  const selectedTask = selection.kind === 'task'
    ? config.tasks.find((candidate) => candidate.id === selection.id)
    : undefined
  const item = selection.kind === 'component'
    ? config.components.find((candidate) => candidate.id === selection.id)
    : selection.kind === 'task'
      ? selectedTask
      : config.systems.find((candidate) => candidate.id === selection.id)
  if (!item) return null
  const connections = connectionsFor(config, selection)

  return (
    <aside className="detail-panel" aria-label={`${item.name} details`}>
      <button className="icon-button panel-close" onClick={onClose} aria-label="Close details">×</button>
      <p className="eyebrow">{selection.kind === 'component'
        ? item.type
        : selection.kind === 'task' && selectedTask ? `${selectedTask.scope.kind === 'app' ? 'App-wide' : 'Screen'} · ${selectedTask.type}` : `External · ${item.type}`}</p>
      <h2>{item.name}</h2>
      <MarkdownText className="detail-description">{item.description}</MarkdownText>
      {selectedTask && <div className="task-trigger-detail">
        <span>Trigger</span>
        <strong>{selectedTask.trigger.label}</strong>
        <small>{selectedTask.trigger.kind} · {taskState(selectedTask, scenario)}</small>
      </div>}
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
              <span className="cadence">◷ {connectionCadences(config, connection).map((cadence) => cadence.label).join(' · ') || 'Task-managed flow'}</span>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
