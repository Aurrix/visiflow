import type { Connection, EndpointRef, VisiFlowConfig } from './types'

const safe = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
const slug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'visiflow'
const refEquals = (a: EndpointRef, b: EndpointRef) => a.kind === b.kind && a.id === b.id

function endpointName(config: VisiFlowConfig, ref: EndpointRef) {
  if (ref.kind === 'component') return config.components.find((item) => item.id === ref.id)?.name ?? ref.id
  if (ref.kind === 'task') return config.tasks.find((item) => item.id === ref.id)?.name ?? ref.id
  return config.systems.find((item) => item.id === ref.id)?.name ?? ref.id
}

function callSummary(config: VisiFlowConfig, connection: Connection, item: EndpointRef) {
  const other = refEquals(connection.source, item) ? connection.target : connection.source
  const request = [connection.protocol, connection.method, connection.endpoint].filter(Boolean).join(' ')
  return `${request} → ${endpointName(config, other)}${connection.description ? ` — ${safe(connection.description)}` : ''}`
}

function row(config: VisiFlowConfig, item: EndpointRef, name: string, type: string, flagged: boolean) {
  const calls = config.connections.filter((connection) => refEquals(connection.source, item) || refEquals(connection.target, item))
  const systems = [...new Set(calls.flatMap((connection) => [connection.source, connection.target]).filter((ref) => ref.kind === 'system').map((ref) => endpointName(config, ref)))]
  return `| ${safe(name)} | ${safe(type)} | ${flagged ? '⚠' : ''} | ${systems.map(safe).join('<br>') || '—'} | ${calls.map((connection) => safe(callSummary(config, connection, item))).join('<br>') || '—'} |`
}

export function buildMarkdownTable(config: VisiFlowConfig) {
  const lines = [`# ${safe(config.app.name)} — integration inventory`, '', `Platform: ${safe(config.app.platform)}`, '']
  for (const screen of config.screens) {
    lines.push(`## ${safe(screen.name)}`, '', '| Item | Type | Flag | External systems | Requests / connections |', '| --- | --- | :--: | --- | --- |')
    const components = config.components.filter((component) => component.screenId === screen.id)
    const tasks = config.tasks.filter((task) => task.scope.kind === 'screen' && task.scope.screenId === screen.id)
    lines.push(...components.map((component) => row(config, { kind: 'component', id: component.id }, component.name, component.type, component.flagged === true)))
    lines.push(...tasks.map((task) => row(config, { kind: 'task', id: task.id }, task.name, `Screen background task · ${task.type}`, task.flagged === true)))
    if (components.length + tasks.length === 0) lines.push('| — | No documented components or screen background tasks |  |  |  |')
    lines.push('')
  }
  const globalTasks = config.tasks.filter((task) => task.scope.kind === 'app')
  if (globalTasks.length) {
    lines.push('## Global tasks', '', '| Item | Type | Flag | External systems | Requests / connections |', '| --- | --- | :--: | --- | --- |')
    lines.push(...globalTasks.map((task) => row(config, { kind: 'task', id: task.id }, task.name, `${task.type}${task.trigger ? ` · ${task.trigger.label}` : ''}`, task.flagged === true)), '')
  }
  return `${lines.join('\n')}\n`
}

export function downloadMarkdownTable(config: VisiFlowConfig) {
  const blob = new Blob([buildMarkdownTable(config)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${slug(config.app.name)}-integration-inventory.md`
  anchor.click()
  URL.revokeObjectURL(url)
}
