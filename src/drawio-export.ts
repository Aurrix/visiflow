import type { Connection, EndpointRef, VisiFlowConfig } from './types'

type LayoutNode = { id: string; label: string; style: string; x: number; y: number; width: number; height: number; parent?: string; absoluteY?: number }

const xml = (value: string) => value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]!))
const refKey = (ref: EndpointRef) => `${ref.kind}:${ref.id}`
const fileName = (name: string) => `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'visiflow'}-architecture.drawio`

function vertex(node: LayoutNode) {
  return `<mxCell id="${xml(node.id)}" value="${xml(node.label).replace(/\n/g, '&#xa;')}" style="${node.style}" vertex="1" parent="${xml(node.parent ?? '1')}"><mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry" /></mxCell>`
}

function edge(connection: Connection, source: string, target: string, index: number) {
  const summary = [connection.protocol, connection.method, connection.endpoint].filter(Boolean).join(' ')
  const label = `${summary}\n${connection.description}`
  const sourceX = connection.source.kind === 'system' ? 0 : 1
  const targetX = connection.target.kind === 'system' ? 0 : 1
  const sourceY = .2 + (index % 4) * .2
  const targetY = .8 - (index % 4) * .2
  return `<mxCell id="connection-${xml(connection.id)}" value="${xml(label).replace(/\n/g, '&#xa;')}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=24;html=1;endArrow=block;strokeColor=#64748b;strokeWidth=1.5;fontSize=11;fontColor=#1e293b;labelBackgroundColor=#ffffff;spacing=7;exitX=${sourceX};exitY=${sourceY};entryX=${targetX};entryY=${targetY};" edge="1" parent="1" source="${xml(source)}" target="${xml(target)}"><mxGeometry relative="1" as="geometry" /></mxCell>`
}

function page(config: VisiFlowConfig, screenId: string) {
  const screen = config.screens.find((item) => item.id === screenId)!
  const components = config.components.filter((item) => item.screenId === screen.id)
  const screenTasks = config.tasks.filter((item) => item.scope.kind === 'screen' && item.scope.screenId === screen.id)
  const globalTasks = config.tasks.filter((item) => item.scope.kind === 'app')
  const endpointIds = new Set([
    ...components.map((item) => `component:${item.id}`),
    ...screenTasks.map((item) => `task:${item.id}`),
    ...globalTasks.map((item) => `task:${item.id}`),
  ])
  const connections = config.connections.filter((connection) => [connection.source, connection.target].every((ref) => ref.kind === 'system' || endpointIds.has(refKey(ref))))
  const systemIds = new Set(connections.flatMap((connection) => [connection.source, connection.target]).filter((ref) => ref.kind === 'system').map((ref) => ref.id))
  const nodes = new Map<string, LayoutNode>()
  const cells: string[] = []
  const globalHeight = Math.max(96, globalTasks.length * 82 + 50)
  const screenTop = globalHeight + 45
  const componentRowsHeight = Math.max(1, components.length) * 72
  const componentSectionY = 38
  const componentSectionHeight = componentRowsHeight + 42
  const componentTop = screenTop + componentSectionY + 38
  const dividerY = screenTop + componentSectionY + componentSectionHeight + 14
  const backgroundSectionY = dividerY - screenTop + 12
  const taskRowsHeight = Math.max(1, screenTasks.length) * 72
  const backgroundSectionHeight = taskRowsHeight + 42
  const taskTop = screenTop + backgroundSectionY + 38
  const screenHeight = backgroundSectionY + backgroundSectionHeight + 24

  const laneX = 420
  const systemsX = 1120
  cells.push(vertex({ id: 'global-tasks', label: 'Global tasks', style: 'swimlane;fontStyle=1;fontSize=14;horizontal=1;startSize=30;rounded=1;fillColor=#111827;strokeColor=#374151;fontColor=#ffffff;', x: laneX, y: 20, width: 410, height: globalHeight }))
  globalTasks.forEach((task, index) => {
    const node = { id: refKey({ kind: 'task', id: task.id }), label: `${task.name}\n${task.trigger ? `${task.trigger.kind} / ${task.trigger.label}` : 'Background task'}`, style: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#1d2939;strokeColor=#5dc9e8;fontColor=#ffffff;', x: 22, y: 46 + index * 82, width: 366, height: 58, parent: 'global-tasks', absoluteY: 66 + index * 82 }
    nodes.set(node.id, node); cells.push(vertex(node))
  })
  cells.push(vertex({ id: 'screen-container', label: `Screens / ${screen.name}`, style: 'swimlane;fontStyle=1;fontSize=16;horizontal=1;startSize=34;rounded=1;fillColor=#f7f8ff;strokeColor=#7c8cff;fontColor=#22263a;', x: laneX, y: screenTop, width: 410, height: screenHeight }))
  cells.push(vertex({ id: 'component-section', label: 'Components', style: 'swimlane;fontStyle=1;fontSize=11;horizontal=1;startSize=24;rounded=1;fillColor=#eef1ff;strokeColor=#aab4e8;fontColor=#343d70;', x: 22, y: componentSectionY, width: 366, height: componentSectionHeight, parent: 'screen-container', absoluteY: screenTop + componentSectionY }))
  components.forEach((component, index) => {
    const node = { id: refKey({ kind: 'component', id: component.id }), label: `${component.flagged ? '⚠ ' : ''}${component.name}\n${component.type}`, style: `rounded=1;whiteSpace=wrap;html=1;fillColor=${component.flagged ? '#fff7df' : '#ffffff'};strokeColor=${component.flagged ? '#f6bd4a' : '#7c8cff'};strokeWidth=${component.flagged ? 2 : 1};fontColor=#22263a;`, x: 22, y: 38 + index * 72, width: 322, height: 54, parent: 'component-section', absoluteY: componentTop + index * 72 }
    nodes.set(node.id, node); cells.push(vertex(node))
  })
  cells.push(vertex({ id: 'section-divider', label: '', style: 'line;strokeWidth=1;strokeColor=#aab4e8;', x: 44, y: dividerY - screenTop, width: 322, height: 1, parent: 'screen-container' }))
  cells.push(vertex({ id: 'background-section', label: 'Screen background tasks', style: 'swimlane;fontStyle=1;fontSize=11;horizontal=1;startSize=24;rounded=1;fillColor=#eef1ff;strokeColor=#aab4e8;fontColor=#343d70;', x: 22, y: backgroundSectionY, width: 366, height: backgroundSectionHeight, parent: 'screen-container', absoluteY: screenTop + backgroundSectionY }))
  screenTasks.forEach((task, index) => {
    const node = { id: refKey({ kind: 'task', id: task.id }), label: `${task.name}\n${task.trigger ? `${task.trigger.kind} / ${task.trigger.label}` : 'Screen background task'}`, style: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#1d2939;strokeColor=#7c8cff;fontColor=#ffffff;', x: 22, y: 38 + index * 72, width: 322, height: 54, parent: 'background-section', absoluteY: taskTop + index * 72 }
    nodes.set(node.id, node); cells.push(vertex(node))
  })

  const systemTop = 40
  const systems = config.systems.filter((system) => systemIds.has(system.id))
  const systemHeight = Math.max(screenTop + screenHeight - systemTop, systems.length * 78 + 50, 180)
  cells.push(vertex({ id: 'systems', label: 'External systems', style: 'swimlane;fontStyle=1;fontSize=14;horizontal=1;startSize=30;rounded=1;fillColor=#f8fafc;strokeColor=#94a3b8;fontColor=#1e293b;', x: systemsX, y: systemTop, width: 300, height: systemHeight }))
  const placements = systems.map((system, index) => {
    const relatedY = connections.flatMap((connection) => {
      if (connection.source.kind === 'system' && connection.source.id === system.id) {
        const node = nodes.get(refKey(connection.target))
        return [node?.absoluteY ?? node?.y]
      }
      if (connection.target.kind === 'system' && connection.target.id === system.id) {
        const node = nodes.get(refKey(connection.source))
        return [node?.absoluteY ?? node?.y]
      }
      return []
    }).filter((value): value is number => value !== undefined)
    const averageY = relatedY.length ? relatedY.reduce((sum, value) => sum + value, 0) / relatedY.length : 80 + index * 82
    return { system, desiredY: averageY - 3 }
  }).sort((a, b) => a.desiredY - b.desiredY)
  let nextSystemY = systemTop + 48
  placements.forEach(({ system, desiredY }) => {
    const absoluteY = Math.max(nextSystemY, Math.min(systemTop + systemHeight - 76, desiredY))
    nextSystemY = absoluteY + 78
    const node = { id: refKey({ kind: 'system', id: system.id }), label: `${system.name}\n${system.type}`, style: `rounded=1;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=${system.color ?? '#64748b'};fontColor=#1e293b;`, x: 30, y: absoluteY - systemTop, width: 240, height: 58, parent: 'systems', absoluteY }
    nodes.set(node.id, node); cells.push(vertex(node))
  })
  connections.forEach((connection, index) => {
    const source = refKey(connection.source)
    const target = refKey(connection.target)
    if (nodes.has(source) && nodes.has(target)) cells.push(edge(connection, source, target, index))
  })
  return `<diagram id="screen-${xml(screen.id)}" name="${xml(screen.name)}"><mxGraphModel dx="1700" dy="920" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1000" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" />${cells.join('')}</root></mxGraphModel></diagram>`
}

function overviewPage(config: VisiFlowConfig) {
  const cells: string[] = []
  const nodes = new Map<string, string>()
  const positions = new Map<string, number>()
  const globalTasks = config.tasks.filter((task) => task.scope.kind === 'app')
  const globalHeight = Math.max(96, globalTasks.length * 82 + 50)
  cells.push(vertex({ id: 'overview-global', label: 'Global tasks', style: 'swimlane;fontStyle=1;fontSize=14;horizontal=1;startSize=30;rounded=1;fillColor=#111827;strokeColor=#374151;fontColor=#ffffff;', x: 420, y: 20, width: 410, height: globalHeight }))
  globalTasks.forEach((task, index) => {
    const id = `overview-task-${task.id}`
    nodes.set(refKey({ kind: 'task', id: task.id }), id)
    positions.set(refKey({ kind: 'task', id: task.id }), 66 + index * 82)
    cells.push(vertex({ id, label: `${task.name}\n${task.trigger ? `${task.trigger.kind} / ${task.trigger.label}` : 'Background task'}`, style: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#1d2939;strokeColor=#5dc9e8;fontColor=#ffffff;', x: 22, y: 46 + index * 82, width: 366, height: 58, parent: 'overview-global' }))
  })
  const screensTop = globalHeight + 45
  const screenHeights = config.screens.map((screen) => Math.max(140, config.components.filter((component) => component.screenId === screen.id).length * 68 + config.tasks.filter((task) => task.scope.kind === 'screen' && task.scope.screenId === screen.id).length * 62 + 78))
  const screensHeight = screenHeights.reduce((sum, height) => sum + height + 20, 30)
  cells.push(vertex({ id: 'overview-screens', label: 'Screens', style: 'swimlane;fontStyle=1;fontSize=16;horizontal=1;startSize=34;rounded=1;fillColor=#f7f8ff;strokeColor=#7c8cff;fontColor=#22263a;', x: 420, y: screensTop, width: 410, height: screensHeight }))
  let y = 46
  config.screens.forEach((screen, index) => {
    const height = screenHeights[index]
    const pageId = `overview-screen-${screen.id}`
    cells.push(vertex({ id: pageId, label: screen.name, style: 'swimlane;fontStyle=1;fontSize=11;horizontal=1;startSize=24;rounded=1;fillColor=#eef1ff;strokeColor=#aab4e8;fontColor=#343d70;', x: 22, y, width: 366, height, parent: 'overview-screens' }))
    let itemY = 38
    config.components.filter((component) => component.screenId === screen.id).forEach((component) => {
      const id = `overview-component-${component.id}`
      nodes.set(refKey({ kind: 'component', id: component.id }), id)
      positions.set(refKey({ kind: 'component', id: component.id }), screensTop + y + itemY)
      cells.push(vertex({ id, label: `${component.flagged ? '⚠ ' : ''}${component.name}\n${component.type}`, style: `rounded=1;whiteSpace=wrap;html=1;fillColor=${component.flagged ? '#fff7df' : '#ffffff'};strokeColor=${component.flagged ? '#f6bd4a' : '#7c8cff'};fontColor=#22263a;`, x: 20, y: itemY, width: 326, height: 50, parent: pageId }))
      itemY += 62
    })
    const tasks = config.tasks.filter((task) => task.scope.kind === 'screen' && task.scope.screenId === screen.id)
    if (tasks.length) {
      cells.push(vertex({ id: `overview-divider-${screen.id}`, label: '', style: 'line;strokeWidth=1;strokeColor=#aab4e8;', x: 20, y: itemY + 2, width: 326, height: 1, parent: pageId }))
      itemY += 18
      tasks.forEach((task) => {
        const id = `overview-task-${task.id}`
        nodes.set(refKey({ kind: 'task', id: task.id }), id)
        positions.set(refKey({ kind: 'task', id: task.id }), screensTop + y + itemY)
        cells.push(vertex({ id, label: `${task.name}\nScreen background task`, style: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#1d2939;strokeColor=#7c8cff;fontColor=#ffffff;', x: 20, y: itemY, width: 326, height: 48, parent: pageId }))
        itemY += 58
      })
    }
    y += height + 20
  })
  const systemsTop = 40
  const systemsHeight = Math.max(screensTop + screensHeight - systemsTop, config.systems.length * 78 + 50, 180)
  cells.push(vertex({ id: 'overview-systems', label: 'External systems', style: 'swimlane;fontStyle=1;fontSize=14;horizontal=1;startSize=30;rounded=1;fillColor=#f8fafc;strokeColor=#94a3b8;fontColor=#1e293b;', x: 1120, y: systemsTop, width: 300, height: systemsHeight }))
  const systemPlacements = config.systems.map((system, index) => {
    const relatedY = config.connections.flatMap((connection) => {
      if (connection.source.kind === 'system' && connection.source.id === system.id) return [positions.get(refKey(connection.target))]
      if (connection.target.kind === 'system' && connection.target.id === system.id) return [positions.get(refKey(connection.source))]
      return []
    }).filter((value): value is number => value !== undefined)
    return { system, desiredY: relatedY.length ? relatedY.reduce((sum, value) => sum + value, 0) / relatedY.length - 3 : 80 + index * 82 }
  }).sort((a, b) => a.desiredY - b.desiredY)
  let nextSystemY = systemsTop + 48
  systemPlacements.forEach(({ system, desiredY }) => {
    const absoluteY = Math.max(nextSystemY, Math.min(systemsTop + systemsHeight - 76, desiredY))
    nextSystemY = absoluteY + 78
    const id = `overview-system-${system.id}`
    nodes.set(refKey({ kind: 'system', id: system.id }), id)
    positions.set(refKey({ kind: 'system', id: system.id }), absoluteY)
    cells.push(vertex({ id, label: `${system.name}\n${system.type}`, style: `rounded=1;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=${system.color ?? '#64748b'};fontColor=#1e293b;`, x: 30, y: absoluteY - systemsTop, width: 240, height: 58, parent: 'overview-systems' }))
  })
  config.connections.forEach((connection, index) => {
    const source = nodes.get(refKey(connection.source))
    const target = nodes.get(refKey(connection.target))
    if (source && target) cells.push(edge({ ...connection, id: `overview-${connection.id}` }, source, target, index))
  })
  return `<diagram id="overview" name="Overview"><mxGraphModel dx="1700" dy="1100" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="${Math.max(1000, screensTop + screensHeight + 80)}" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" />${cells.join('')}</root></mxGraphModel></diagram>`
}

export function buildDrawio(config: VisiFlowConfig) {
  return `<mxfile host="app.diagrams.net" agent="VisiFlow" version="26.0.14" type="device">${overviewPage(config)}${config.screens.map((screen) => page(config, screen.id)).join('')}</mxfile>`
}

export function downloadDrawio(config: VisiFlowConfig) {
  const blob = new Blob([buildDrawio(config)], { type: 'application/vnd.jgraph.mxfile' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName(config.app.name)
  anchor.click()
  URL.revokeObjectURL(url)
}
