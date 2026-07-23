import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Selection } from '../model'
import { componentState, componentStyle, sameRef, selectionKey } from '../model'
import type { AppComponent, Connection, Scenario, VisiFlowConfig } from '../types'
import { resolveAssetSource } from '../assets'
import { resolveComponentLayout, type ComponentPosition } from '../layout'

interface AppMapProps {
  config: VisiFlowConfig
  screenId: string
  scenario: Scenario
  selection: Selection
  protocol: string
  cadence: string
  onSelect: (selection: Selection) => void
}

interface LineGeometry { id: string; path: string; x: number; y: number }

function VisualComponent({ component, position, scenario, screenWidth, contentHeight, selected, register, onSelect }: {
  component: AppComponent
  position: ComponentPosition
  scenario: Scenario
  screenWidth: number
  contentHeight: number
  selected: boolean
  register: (key: string, node: HTMLElement | null) => void
  onSelect: () => void
}) {
  const state = componentState(component, scenario)
  const visual = component.visual
  const style = componentStyle(component, scenario)
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
  } as CSSProperties

  const content = style.text ?? component.name
  return (
    <button
      ref={(node) => register(`component:${component.id}`, node)}
      className={`visual-node visual-${visual.kind} state-${state}${selected ? ' selected' : ''}`}
      style={css}
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      aria-label={`${component.name}, ${state}`}
      aria-pressed={selected}
    >
      {style.src && <img
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

export function AppMap({ config, screenId, scenario, selection, protocol, cadence, onSelect }: AppMapProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const deviceAreaRef = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const [geometry, setGeometry] = useState<LineGeometry[]>([])
  const [fittedWidth, setFittedWidth] = useState(292)
  const [zoom, setZoom] = useState(1)
  const screen = config.screens.find((item) => item.id === screenId) ?? config.screens[0]
  const components = useMemo(() => config.components.filter((item) => item.screenId === screen.id), [config.components, screen.id])
  const componentPositions = useMemo(() => resolveComponentLayout(components, screen.width), [components, screen.width])
  const contentHeight = useMemo(() => Math.max(
    screen.contentHeight ?? screen.height,
    ...components.map((component) => (componentPositions.get(component.id)?.y ?? component.visual.y) + component.visual.height),
  ), [componentPositions, components, screen.contentHeight, screen.height])
  const componentIds = useMemo(() => new Set(components.map((item) => item.id)), [components])
  const visibleConnections = useMemo(() => config.connections.filter((connection) => {
    const componentsInConnection = [connection.source, connection.target].filter((ref) => ref.kind === 'component')
    const onScreen = componentsInConnection.every((ref) => componentIds.has(ref.id))
    const protocolMatch = protocol === 'all' || connection.protocol === protocol
    const cadenceMatch = cadence === 'all' || connection.cadence.kind === cadence
    return onScreen && protocolMatch && cadenceMatch
  }), [cadence, componentIds, config.connections, protocol])
  const visibleSystemIds = useMemo(() => new Set(visibleConnections.flatMap((connection) =>
    [connection.source, connection.target].filter((ref) => ref.kind === 'system').map((ref) => ref.id),
  )), [visibleConnections])
  const visibleSystems = useMemo(() => config.systems.filter((system) => visibleSystemIds.has(system.id)), [config.systems, visibleSystemIds])
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
      const nextWidth = Math.max(120, Math.min(330, availableWidth, availableHeight * ratio))
      setFittedWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current)
    }
    const stageRect = stage.getBoundingClientRect()
    const anchor = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect()
      let x = rect.left + rect.width / 2
      let y = rect.top + rect.height / 2
      const viewport = node.closest('.app-screen')?.getBoundingClientRect()
      if (viewport) {
        x = Math.min(viewport.right - 3, Math.max(viewport.left + 3, x))
        y = Math.min(viewport.bottom - 3, Math.max(viewport.top + 3, y))
      }
      return { x: x - stageRect.left, y: y - stageRect.top }
    }
    const lines = visibleConnections.flatMap((connection) => {
      const fromNode = nodes.current.get(selectionKey(connection.source))
      const toNode = nodes.current.get(selectionKey(connection.target))
      if (!fromNode || !toNode) return []
      const from = anchor(fromNode)
      const to = anchor(toNode)
      const x1 = from.x
      const y1 = from.y
      const x2 = to.x
      const y2 = to.y
      const bend = Math.max(48, Math.abs(x2 - x1) * .42)
      const direction = x2 >= x1 ? 1 : -1
      return [{ id: connection.id, path: `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 }]
    })
    setGeometry(lines)
  }, [screen.height, screen.width, visibleConnections])

  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (stageRef.current) observer.observe(stageRef.current)
    if (deviceAreaRef.current) observer.observe(deviceAreaRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure, screenId, zoom])

  const connectionMap = new Map(visibleConnections.map((item) => [item.id, item]))
  const isFocused = (connection: Connection) => selection && (
    sameRef(selection, connection.source) || sameRef(selection, connection.target)
  )

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

  return (
    <section className="map-workspace" aria-label="Application map">
      <div className="map-toolbar">
        <div><span className="live-dot" />Architecture map <span className="muted">· {visibleConnections.length} visible paths</span></div>
        <div className="zoom-controls" aria-label="Zoom controls">
          <button onClick={() => setZoom((value) => Math.max(.7, value - .1))} aria-label="Zoom out">−</button>
          <button onClick={() => setZoom(1)} aria-label="Reset zoom to fit" title="100% fits the device viewport">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((value) => Math.min(1.3, value + .1))} aria-label="Zoom in">+</button>
        </div>
      </div>
      <div className="flow-stage" ref={stageRef} onClick={() => onSelect(null)}>
        <svg className="flow-lines" aria-hidden="true">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {geometry.map((line) => {
            const connection = connectionMap.get(line.id)!
            const focused = Boolean(isFocused(connection))
            return <g key={line.id} className={`${focused ? 'focused' : ''}${selection && !focused ? ' dimmed' : ''}`}>
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
            <div className={`app-screen${contentHeight > screen.height ? ' scrollable' : ''}`} onScroll={measure}>
              {screen.showSystemUi !== false && <div className="status-bar"><span>9:41</span><span>● ◒ ▰</span></div>}
              <div className="screen-canvas" style={{
                height: `${(contentHeight / screen.height) * 100}%`,
                background: screen.background,
                backgroundImage: screen.backgroundImage ? `url(${resolveAssetSource(screen.backgroundImage)})` : undefined,
                backgroundSize: screen.backgroundSize ?? (contentHeight > screen.height ? '100% auto' : 'cover'),
                backgroundPosition: screen.backgroundPosition ?? 'top center',
              }}>
              {components.map((component) => <VisualComponent
                key={component.id}
                component={component}
                position={componentPositions.get(component.id) ?? { x: component.visual.x, y: component.visual.y }}
                scenario={scenario}
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
      </div>
      <div className="map-legend"><span><i className="legend-active" /> Active</span><span><i className="legend-inactive" /> Inactive</span><span><i className="legend-flow" /> Request path</span></div>
    </section>
  )
}
