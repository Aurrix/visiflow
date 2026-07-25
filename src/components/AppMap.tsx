import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Selection } from '../model'
import { componentState, componentStyle, connectionMatchesCadence, sameRef, selectionKey, taskIsVisible, taskState } from '../model'
import type { AppComponent, AppScreen, BackgroundTask, Connection, Scenario, VisiFlowConfig } from '../types'
import { resolveAssetSource } from '../assets'
import { resolveComponentLayout, type ComponentPosition } from '../layout'

interface AppMapProps {
  config: VisiFlowConfig
  screenId: string
  scenario: Scenario
  selection: Selection
  protocols: string[]
  cadence: string
  taskVisibility: 'all' | 'hide-global' | 'hide-background'
  flaggedOnly: boolean
  search: string
  onSearch: (value: string) => void
  onSelect: (selection: Selection) => void
}

interface LineGeometry { id: string; path: string; x: number; y: number }

function VisualComponent({ component, position, scenario, screen, screenWidth, contentHeight, selected, register, onSelect }: {
  component: AppComponent
  position: ComponentPosition
  scenario: Scenario
  screen: AppScreen
  screenWidth: number
  contentHeight: number
  selected: boolean
  register: (key: string, node: HTMLElement | null) => void
  onSelect: () => void
}) {
  const state = componentState(component, scenario)
  const visual = component.visual
  const style = componentStyle(component, scenario)
  const crop = component.visual.screenCrop
  const css = {
    left: `${(position.x / screenWidth) * 100}%`,
    top: `${(position.y / contentHeight) * 100}%`,
    width: `${(visual.width / screenWidth) * 100}%`,
    height: `${(visual.height / contentHeight) * 100}%`,
    background: style.background,
    color: style.color,
    borderColor: style.borderColor,
    borderRadius: style.borderRadius,
    opacity: style.opacity,
    backgroundImage: crop && screen.backgroundImage ? `url(${resolveAssetSource(screen.backgroundImage)})` : undefined,
    backgroundSize: crop ? `${screen.width / crop.width * 100}% ${contentHeight / crop.height * 100}%` : undefined,
    backgroundPosition: crop ? `${-crop.x / crop.width * 100}% ${-crop.y / crop.height * 100}%` : undefined,
    backgroundRepeat: crop ? 'no-repeat' : undefined,
  } as CSSProperties

  const content = style.text ?? component.name
  return (
    <button
      ref={(node) => register(`component:${component.id}`, node)}
      className={`visual-node visual-${visual.kind} state-${state}${component.flagged ? ' flagged' : ''}${selected ? ' selected' : ''}`}
      style={css}
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      aria-label={`${component.name}, ${state}`}
      aria-pressed={selected}
    >
      {style.src && !crop && <img
        className="visual-art"
        src={resolveAssetSource(style.src)}
        alt=""
        style={{ objectFit: style.imageFit ?? 'cover', objectPosition: style.imagePosition ?? 'center', opacity: style.imageOpacity ?? 1 }}
      />}
      {visual.kind !== 'image' && <span className="visual-label">{visual.kind === 'input' && <span className="input-search">⌕</span>}{content}</span>}
      <i className="state-dot" aria-hidden="true" />
    </button>
  )
}

export function AppMap({ config, screenId, scenario, selection, protocols, cadence, taskVisibility, flaggedOnly, search, onSearch, onSelect }: AppMapProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const deviceAreaRef = useRef<HTMLDivElement>(null)
  const runtimeRailRef = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const [geometry, setGeometry] = useState<LineGeometry[]>([])
  const [stageExtent, setStageExtent] = useState({ width: 0, height: 0 })
  const [fittedWidth, setFittedWidth] = useState(292)
  const [zoom, setZoom] = useState(1)
  const screen = config.screens.find((item) => item.id === screenId) ?? config.screens[0]
  const components = useMemo(() => config.components.filter((item) => item.screenId === screen.id), [config.components, screen.id])
  const normalizedSearch = search.trim().toLowerCase()
  const matchesSearch = useCallback((...values: Array<string | undefined>) =>
    !normalizedSearch || values.join(' ').toLowerCase().includes(normalizedSearch),
  [normalizedSearch])
  const visibleComponents = useMemo(() => components.filter((component) =>
    (!flaggedOnly || component.flagged) && matchesSearch(component.name, component.type, component.description, ...(component.tags ?? [])),
  ), [components, flaggedOnly, matchesSearch])
  const componentPositions = useMemo(() => resolveComponentLayout(components, screen.width), [components, screen.width])
  const contentHeight = useMemo(() => Math.max(
    screen.contentHeight ?? screen.height,
    ...components.map((component) => (componentPositions.get(component.id)?.y ?? component.visual.y) + component.visual.height),
  ), [componentPositions, components, screen.contentHeight, screen.height])
  const screenComponentIds = useMemo(() => new Set(components.map((item) => item.id)), [components])
  const componentIds = useMemo(() => new Set(visibleComponents.map((item) => item.id)), [visibleComponents])
  const applicableTasks = useMemo(() => config.tasks.filter((task) => taskIsVisible(task, screen.id)), [config.tasks, screen.id])
  const filteredTasks = useMemo(() => applicableTasks.filter((task) => {
    const cadenceMatch = cadence === 'all' || task.trigger.kind === cadence
    const protocolMatch = protocols.length === 0 || config.connections.some((connection) =>
      protocols.includes(connection.protocol) &&
      ((connection.source.kind === 'task' && connection.source.id === task.id) ||
        (connection.target.kind === 'task' && connection.target.id === task.id)))
    const scopeMatch = taskVisibility === 'all' || taskVisibility === 'hide-global' && task.scope.kind !== 'app' || taskVisibility === 'hide-background' && false
    return cadenceMatch && protocolMatch && scopeMatch && (!flaggedOnly || task.flagged)
  }), [applicableTasks, cadence, config.connections, flaggedOnly, protocols, taskVisibility])
  const filteredTaskIds = useMemo(() => new Set(filteredTasks.map((task) => task.id)), [filteredTasks])
  const visibleTasks = useMemo(() => filteredTasks.filter((task) =>
    matchesSearch(task.name, task.type, task.description, task.trigger.label, task.trigger.kind),
  ), [filteredTasks, matchesSearch])
  const taskIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks])
  const filteredConnections = useMemo(() => config.connections.filter((connection) => {
    const componentsInConnection = [connection.source, connection.target].filter((ref) => ref.kind === 'component')
    const tasksInConnection = [connection.source, connection.target].filter((ref) => ref.kind === 'task')
    const onScreen = componentsInConnection.every((ref) => screenComponentIds.has(ref.id))
    const tasksVisible = tasksInConnection.every((ref) => filteredTaskIds.has(ref.id))
    const protocolMatch = protocols.length === 0 || protocols.includes(connection.protocol)
    const cadenceMatch = connectionMatchesCadence(config, connection, cadence)
    return onScreen && tasksVisible && protocolMatch && cadenceMatch
  }), [cadence, config, filteredTaskIds, protocols, screenComponentIds])
  const eligibleSystemIds = useMemo(() => new Set(filteredConnections.flatMap((connection) =>
    [connection.source, connection.target].filter((ref) => ref.kind === 'system').map((ref) => ref.id),
  )), [filteredConnections])
  const visibleSystems = useMemo(() => config.systems.filter((system) =>
    eligibleSystemIds.has(system.id) && matchesSearch(system.name, system.type, system.description),
  ), [config.systems, eligibleSystemIds, matchesSearch])
  const visibleSystemIds = useMemo(() => new Set(visibleSystems.map((system) => system.id)), [visibleSystems])
  const visibleConnections = useMemo(() => filteredConnections.filter((connection) =>
    [connection.source, connection.target].every((ref) =>
      ref.kind === 'component' ? componentIds.has(ref.id) :
        ref.kind === 'task' ? taskIds.has(ref.id) :
          visibleSystemIds.has(ref.id)),
  ), [componentIds, filteredConnections, taskIds, visibleSystemIds])
  const flaggedEndpointKeys = useMemo(() => new Set([
    ...config.components.filter((component) => component.flagged).map((component) => `component:${component.id}`),
    ...config.tasks.filter((task) => task.flagged).map((task) => `task:${task.id}`),
  ]), [config.components, config.tasks])
  const leftSystems = visibleSystems.filter((item, index) => (item.placement ?? (index % 2 ? 'right' : 'left')) === 'left')
  const rightSystems = visibleSystems.filter((item, index) => (item.placement ?? (index % 2 ? 'right' : 'left')) === 'right')

  const register = useCallback((key: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(key, node)
    else nodes.current.delete(key)
  }, [])

  const measure = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const deviceArea = deviceAreaRef.current
    if (deviceArea) {
      const ratio = screen.width / screen.height
      const availableWidth = Math.max(120, deviceArea.clientWidth - 4)
      const availableHeight = Math.max(220, deviceArea.clientHeight - 28)
      const nextWidth = Math.max(120, Math.min(350, availableWidth, availableHeight * ratio))
      setFittedWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current)
    }
    const stageRect = stage.getBoundingClientRect()
    const nextExtent = { width: stage.scrollWidth, height: stage.scrollHeight }
    setStageExtent((current) => current.width === nextExtent.width && current.height === nextExtent.height ? current : nextExtent)
    const anchor = (node: HTMLElement) => {
      const dot = node.querySelector<HTMLElement>('.state-dot')
      const rect = (dot ?? node).getBoundingClientRect()
      let x = rect.left + rect.width / 2
      let y = rect.top + rect.height / 2
      const viewport = node.closest('.app-screen')?.getBoundingClientRect()
      if (viewport) {
        x = Math.min(viewport.right - 3, Math.max(viewport.left + 3, x))
        y = Math.min(viewport.bottom - 3, Math.max(viewport.top + 3, y))
      }
      const runtimeViewport = node.closest('.runtime-tasks-scroll')?.getBoundingClientRect()
      if (runtimeViewport && (rect.right < runtimeViewport.left || rect.left > runtimeViewport.right)) return null
      return { x: x - stageRect.left + stage.scrollLeft, y: y - stageRect.top + stage.scrollTop }
    }
    const lines = visibleConnections.flatMap((connection) => {
      const fromNode = nodes.current.get(selectionKey(connection.source))
      const toNode = nodes.current.get(selectionKey(connection.target))
      if (!fromNode || !toNode) return []
      const from = anchor(fromNode)
      const to = anchor(toNode)
      if (!from || !to) return []
      const x1 = from.x
      const y1 = from.y
      const x2 = to.x
      const y2 = to.y
      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1)
      const path = horizontal
        ? (() => {
            const bend = Math.max(48, Math.abs(x2 - x1) * .42)
            const direction = x2 >= x1 ? 1 : -1
            return `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`
          })()
        : (() => {
            const bend = Math.max(42, Math.abs(y2 - y1) * .38)
            const direction = y2 >= y1 ? 1 : -1
            return `M ${x1} ${y1} C ${x1} ${y1 + bend * direction}, ${x2} ${y2 - bend * direction}, ${x2} ${y2}`
          })()
      return [{ id: connection.id, path, x: (x1 + x2) / 2, y: (y1 + y2) / 2 }]
    })
    setGeometry(lines)
  }, [screen.height, screen.width, visibleConnections])

  useLayoutEffect(() => {
    measure()
    const settleMeasurement = window.setTimeout(measure, 240)
    const observer = new ResizeObserver(measure)
    if (stageRef.current) observer.observe(stageRef.current)
    if (deviceAreaRef.current) observer.observe(deviceAreaRef.current)
    if (runtimeRailRef.current) observer.observe(runtimeRailRef.current)
    window.addEventListener('resize', measure)
    return () => { window.clearTimeout(settleMeasurement); observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [fittedWidth, measure, screenId, zoom])

  const connectionMap = new Map(visibleConnections.map((item) => [item.id, item]))
  const isFocused = (connection: Connection) => selection && (
    sameRef(selection, connection.source) || sameRef(selection, connection.target)
  )
  const isFlaggedConnection = (connection: Connection) =>
    flaggedEndpointKeys.has(selectionKey(connection.source)) || flaggedEndpointKeys.has(selectionKey(connection.target))

  const systemCard = (systemId: string) => {
    const system = config.systems.find((item) => item.id === systemId)!
    const selected = sameRef(selection, { kind: 'system', id: system.id })
    return (
      <button
        key={system.id}
        ref={(node) => register(`system:${system.id}`, node)}
        className={`system-node${selected ? ' selected' : ''}`}
        style={{ '--system-color': system.color ?? '#7c8cff' } as CSSProperties}
        onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'system', id: system.id }) }}
        aria-pressed={selected}
      >
        <span className="system-icon">{system.icon ?? '◇'}</span>
        <span><small>{system.type}</small><strong>{system.name}</strong></span>
      </button>
    )
  }

  const taskCard = (task: BackgroundTask) => {
    const state = taskState(task, scenario)
    const selected = sameRef(selection, { kind: 'task', id: task.id })
    const appWide = task.scope.kind === 'app'
    return <button
      key={task.id}
      ref={(node) => register(`task:${task.id}`, node)}
        className={`runtime-task state-${state}${appWide ? ' app-wide' : ''}${task.flagged ? ' flagged' : ''}${selected ? ' selected' : ''}`}
      onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'task', id: task.id }) }}
      aria-label={`${task.name}, ${appWide ? 'app-wide' : 'current screen'}, ${state}`}
      aria-pressed={selected}
    >
      <span className="runtime-task-glyph" aria-hidden="true">↻</span>
      <span className="runtime-task-copy"><small>{task.type}</small><strong>{task.name}</strong><em>{task.trigger.label}</em></span>
      {appWide && <span className="task-scope-badge">APP-WIDE</span>}
      <i className="state-dot" aria-hidden="true" />
    </button>
  }

  const screenTasks = visibleTasks.filter((task) => task.scope.kind === 'screen')
  const globalTasks = visibleTasks.filter((task) => task.scope.kind === 'app')

  return (
    <section className="map-workspace" aria-label="Application map">
      <div className="map-toolbar">
        <div><span className="live-dot" />Architecture map <span className="muted">· {visibleConnections.length} visible paths</span></div>
        <div className="map-toolbar-actions">
          <label className="map-search">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter canvas items…" aria-label="Filter canvas items" />
            {search && <button type="button" onClick={() => onSearch('')} aria-label="Clear canvas search">×</button>}
          </label>
          <div className="zoom-controls" aria-label="Zoom controls">
            <button onClick={() => setZoom((value) => Math.max(.7, value - .1))} aria-label="Zoom out">−</button>
            <button onClick={() => setZoom(1)} aria-label="Reset zoom to fit" title="100% fits the device viewport">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom((value) => Math.min(1.3, value + .1))} aria-label="Zoom in">+</button>
          </div>
        </div>
      </div>
      <div className={`flow-stage${applicableTasks.length ? ' has-runtime' : ''}`} ref={stageRef} onScroll={measure} onClick={() => onSelect(null)}>
        <svg className="flow-lines" aria-hidden="true" style={{ width: stageExtent.width, height: stageExtent.height }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {geometry.map((line) => {
            const connection = connectionMap.get(line.id)
            if (!connection) return null
            const focused = Boolean(isFocused(connection))
            const flagged = isFlaggedConnection(connection)
            const internal = connection.protocol.toLowerCase() === 'internal'
            return <g key={line.id} className={`${focused ? 'focused' : ''}${flagged ? ' flagged' : ''}${internal ? ' internal' : ''}`}>
              <path className="flow-halo" d={line.path} />
              <path className="flow-path" d={line.path} markerEnd="url(#arrow)" />
              {focused && <text x={line.x} y={line.y - 8} textAnchor="middle">{connection.protocol}</text>}
            </g>
          })}
        </svg>
        <div className="systems-column left" onScroll={measure}>{leftSystems.map((system) => systemCard(system.id))}</div>
        <div className="device-wrap" ref={deviceAreaRef}>
          <div className={`device-frame device-${config.app.device}`} style={{ aspectRatio: `${screen.width} / ${screen.height}`, width: fittedWidth * zoom }}>
            {screen.showSystemUi !== false && <div className="device-speaker" />}
            <div className={`app-screen${contentHeight > screen.height ? ' scrollable' : ''}`} style={{ background: config.app.phoneBackgroundColor ?? '#171b27' }} onScroll={measure}>
              {screen.showSystemUi !== false && <div className="status-bar"><span>9:41</span><span>● ◒ ▰</span></div>}
              <div className="screen-canvas" style={{
                height: `${(contentHeight / screen.height) * 100}%`,
                background: screen.background ?? config.app.phoneBackgroundColor,
                backgroundImage: screen.backgroundImage ? `url(${resolveAssetSource(screen.backgroundImage)})` : undefined,
                backgroundSize: screen.backgroundSize ?? (contentHeight > screen.height ? '100% auto' : 'cover'),
                backgroundPosition: screen.backgroundPosition ?? 'top center',
              }}>
              {visibleComponents.map((component) => <VisualComponent
                key={component.id}
                component={component}
                position={componentPositions.get(component.id) ?? { x: component.visual.x, y: component.visual.y }}
                scenario={scenario}
                screen={screen}
                screenWidth={screen.width}
                contentHeight={contentHeight}
                selected={sameRef(selection, { kind: 'component', id: component.id })}
                register={register}
                onSelect={() => onSelect({ kind: 'component', id: component.id })}
              />)}
              </div>
            </div>
            {screen.showSystemUi !== false && <div className="home-indicator" />}
          </div>
          <p className="screen-caption" style={{ width: fittedWidth * zoom }}><strong>{screen.name}</strong><span>{screen.width} × {screen.height}{contentHeight > screen.height ? ` · ${contentHeight}px scroll` : ''}</span></p>
        </div>
        <div className="systems-column right" onScroll={measure}>{rightSystems.map((system) => systemCard(system.id))}</div>
        {applicableTasks.length > 0 && <section className="runtime-rail" aria-label="App runtime tasks" ref={runtimeRailRef}>
          <header><span><i /> App runtime</span><small>{visibleTasks.length} of {applicableTasks.length} tasks</small></header>
          <div className="runtime-tasks-scroll" onScroll={measure}>
            {visibleTasks.length === 0 && <p className="runtime-empty">No runtime tasks match the active filters.</p>}
            {screenTasks.length > 0 && <div className="runtime-task-group">
              <span className="runtime-group-label">Current screen</span>
              <div>{screenTasks.map(taskCard)}</div>
            </div>}
            {globalTasks.length > 0 && <div className="runtime-task-group global">
              <span className="runtime-group-label">App-wide</span>
              <div>{globalTasks.map(taskCard)}</div>
            </div>}
          </div>
        </section>}
      </div>
      <div className="map-legend"><span><i className="legend-active" /> Active</span><span><i className="legend-inactive" /> Inactive</span><span><i className="legend-flow" /> Request path</span><span><i className="legend-internal" /> Internal flow</span></div>
    </section>
  )
}
