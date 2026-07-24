import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { resolveAssetSource } from '../assets'
import { resolveComponentLayout } from '../layout'
import { componentState, componentStyle } from '../model'
import type { AppScreen, Scenario, VisiFlowConfig } from '../types'

export interface Bounds { x: number; y: number; width: number; height: number }

interface Drag {
  componentId: string
  mode: 'move' | 'resize'
  start: { x: number; y: number }
  original: Bounds
}

export function EditorCanvas({ config, screen, scenario, selectedComponentId, drawMode, onCancelDraw, onSelect, onCreate, onBounds }: {
  config: VisiFlowConfig
  screen: AppScreen
  scenario: Scenario
  selectedComponentId?: string
  drawMode: boolean
  onCancelDraw: () => void
  onSelect: (id: string) => void
  onCreate: (bounds: Bounds) => void
  onBounds: (id: string, bounds: Bounds) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const components = config.components.filter((item) => item.screenId === screen.id)
  const positions = useMemo(() => resolveComponentLayout(components, screen.width), [components, screen.width])
  const contentHeight = useMemo(() => Math.max(screen.contentHeight ?? screen.height, ...components.map((item) => (positions.get(item.id)?.y ?? item.visual.y) + item.visual.height)), [components, positions, screen.contentHeight, screen.height])
  const [drawing, setDrawing] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draftBounds, setDraftBounds] = useState<Record<string, Bounds>>({})

  const point = (event: ReactPointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(screen.width, (event.clientX - rect.left) / rect.width * screen.width)),
      y: Math.max(0, Math.min(contentHeight, (event.clientY - rect.top) / rect.height * contentHeight)),
    }
  }
  const normalize = (start: { x: number; y: number }, end: { x: number; y: number }): Bounds => ({
    x: Math.round(Math.min(start.x, end.x)),
    y: Math.round(Math.min(start.y, end.y)),
    width: Math.max(8, Math.round(Math.abs(end.x - start.x))),
    height: Math.max(8, Math.round(Math.abs(end.y - start.y))),
  })

  const pointerMove = (event: ReactPointerEvent) => {
    if (drawing) {
      setDrawing({ ...drawing, current: point(event) })
      return
    }
    if (!drag) return
    const current = point(event)
    const dx = current.x - drag.start.x
    const dy = current.y - drag.start.y
    const next = drag.mode === 'move'
      ? {
          ...drag.original,
          x: Math.round(Math.max(0, Math.min(screen.width - drag.original.width, drag.original.x + dx))),
          y: Math.round(Math.max(0, Math.min(contentHeight - drag.original.height, drag.original.y + dy))),
        }
      : {
          ...drag.original,
          width: Math.round(Math.max(8, Math.min(screen.width - drag.original.x, drag.original.width + dx))),
          height: Math.round(Math.max(8, Math.min(contentHeight - drag.original.y, drag.original.height + dy))),
        }
    setDraftBounds({ [drag.componentId]: next })
  }

  const pointerUp = (event: ReactPointerEvent) => {
    if (drawing) {
      const bounds = normalize(drawing.start, point(event))
      setDrawing(null)
      onCreate(bounds)
    }
    if (drag) {
      const next = draftBounds[drag.componentId]
      if (next) onBounds(drag.componentId, next)
      setDrag(null)
      setDraftBounds({})
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return <div className={`editor-canvas-area${drawMode ? ' drawing-mode' : ''}`}>
    <div className="editor-device" style={{ aspectRatio: `${screen.width} / ${screen.height}` }}>
      {screen.showSystemUi !== false && <div className="editor-device-speaker" />}
      <div className="editor-device-viewport">
        <div
          ref={canvasRef}
          className="editor-screen-canvas"
          style={{
            height: `${contentHeight / screen.height * 100}%`,
            background: screen.background,
            backgroundImage: screen.backgroundImage ? `url(${resolveAssetSource(screen.backgroundImage)})` : undefined,
            backgroundSize: screen.backgroundSize ?? '100% auto',
            backgroundPosition: screen.backgroundPosition ?? 'top center',
          }}
          onPointerDown={(event) => {
            if (!drawMode || event.target !== event.currentTarget) return
            event.currentTarget.setPointerCapture?.(event.pointerId)
            const start = point(event)
            setDrawing({ start, current: start })
          }}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => { setDrawing(null); setDrag(null); setDraftBounds({}); onCancelDraw() }}
        >
          {components.map((component) => {
            const visual = component.visual
            const position = positions.get(component.id) ?? { x: visual.x, y: visual.y }
            const bounds = draftBounds[component.id] ?? { x: position.x, y: position.y, width: visual.width, height: visual.height }
            const style = componentStyle(component, scenario)
            const selected = selectedComponentId === component.id
            const region = visual.kind === 'hotspot' && !visual.src
            return <div
              key={component.id}
              className={`editor-component-box${selected ? ' selected' : ''}${region ? ' region' : ''} state-${componentState(component, scenario)}`}
              style={{
                left: `${bounds.x / screen.width * 100}%`,
                top: `${bounds.y / contentHeight * 100}%`,
                width: `${bounds.width / screen.width * 100}%`,
                height: `${bounds.height / contentHeight * 100}%`,
                background: region ? undefined : style.background,
                color: style.color,
                borderColor: style.borderColor,
                borderRadius: style.borderRadius,
                opacity: style.opacity,
              } as CSSProperties}
              onPointerDown={(event) => {
                if (drawMode) return
                event.stopPropagation()
                onSelect(component.id)
                event.currentTarget.setPointerCapture?.(event.pointerId)
                setDrag({ componentId: component.id, mode: 'move', start: point(event), original: bounds })
              }}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
            >
              {style.src && <img src={resolveAssetSource(style.src)} alt="" style={{ objectFit: style.imageFit ?? 'cover', objectPosition: style.imagePosition ?? 'center', opacity: style.imageOpacity ?? 1 }} />}
              {!region && visual.kind !== 'image' && <span>{style.text ?? component.name}</span>}
              {region && <span className="region-name">{component.name}</span>}
              {selected && <button
                type="button"
                className="resize-handle"
                aria-label={`Resize ${component.name}`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  setDrag({ componentId: component.id, mode: 'resize', start: point(event), original: bounds })
                }}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
              />}
            </div>
          })}
          {drawing && <div className="drawing-rectangle" style={{
            left: `${normalize(drawing.start, drawing.current).x / screen.width * 100}%`,
            top: `${normalize(drawing.start, drawing.current).y / contentHeight * 100}%`,
            width: `${normalize(drawing.start, drawing.current).width / screen.width * 100}%`,
            height: `${normalize(drawing.start, drawing.current).height / contentHeight * 100}%`,
          }} />}
        </div>
      </div>
    </div>
    <p>{drawMode ? 'Drag on the screen to define a component region · Esc to cancel' : 'Select, move, or resize components directly on the screen'}</p>
  </div>
}
