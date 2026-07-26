import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { resolveAssetSource } from '../assets'
import { resolveComponentLayout } from '../layout'
import { componentState, componentStyle } from '../model'
import type { AppScreen, Scenario, VisiFlowConfig } from '../types'

const debugResize = (event: string, details: Record<string, unknown>) => {
  if (import.meta.env.DEV) console.debug(`[VisiFlow screen resize] ${event}`, details)
}

export interface Bounds { x: number; y: number; width: number; height: number }

interface Drag {
  componentId: string
  mode: 'move' | 'resize'
  start: { x: number; y: number }
  original: Bounds
  originalBorderRadius: number
}

export function EditorCanvas({ config, screen, scenario, selectedComponentId, drawMode, showBackground = true, onCancelDraw, onSelect, onCreate, onBounds }: {
  config: VisiFlowConfig
  screen: AppScreen
  scenario: Scenario
  selectedComponentId?: string
  drawMode: boolean
  showBackground?: boolean
  onCancelDraw: () => void
  onSelect: (id: string) => void
  onCreate: (bounds: Bounds) => void
  onBounds: (id: string, bounds: Bounds, borderRadius?: number) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const ctrlKeyRef = useRef(false)
  const components = config.components.filter((item) => item.screenId === screen.id)
  const representation = screen.representation ?? config.app.device
  const previewAspect = representation === 'web' ? '16 / 10' : representation === 'desktop' ? '16 / 9' : representation === 'diagram' ? '4 / 3' : `${screen.width} / ${screen.height}`
  const positions = useMemo(() => resolveComponentLayout(components, screen.width), [components, screen.width])
  const contentHeight = useMemo(() => Math.max(screen.contentHeight ?? screen.height, ...components.map((item) => (positions.get(item.id)?.y ?? item.visual.y) + item.visual.height)), [components, positions, screen.contentHeight, screen.height])
  const [drawing, setDrawing] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draftBounds, setDraftBounds] = useState<Record<string, Bounds>>({})
  const [draftRadius, setDraftRadius] = useState<Record<string, number>>({})
  const draftRadiusRef = useRef<Record<string, number>>({})
  const radiusEditedRef = useRef(false)
  const modifierRef = useRef(false)

  useEffect(() => {
    if (!selectedComponentId) return
    const selected = canvasRef.current?.querySelector<HTMLElement>('.editor-component-box.selected')
    if (typeof selected?.scrollIntoView === 'function') selected.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [selectedComponentId])

  useEffect(() => {
    const update = (event: KeyboardEvent) => {
      const pressed = event.ctrlKey || event.metaKey
      ctrlKeyRef.current = pressed
      modifierRef.current = pressed
    }
    const clear = () => { ctrlKeyRef.current = false; modifierRef.current = false }
    window.addEventListener('keydown', update, true)
    window.addEventListener('keyup', update, true)
    window.addEventListener('blur', clear)
    return () => { window.removeEventListener('keydown', update, true); window.removeEventListener('keyup', update, true); window.removeEventListener('blur', clear) }
  }, [])

  const isRadiusMode = (event: ReactPointerEvent) => event.ctrlKey || event.metaKey || modifierRef.current

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

  const boundsForDrag = (activeDrag: Drag, event: ReactPointerEvent): Bounds => {
    if (activeDrag.mode === 'resize' && isRadiusMode(event)) return activeDrag.original
    const current = point(event)
    const dx = current.x - activeDrag.start.x
    const dy = current.y - activeDrag.start.y
    return activeDrag.mode === 'move'
      ? {
          ...activeDrag.original,
          x: Math.round(Math.max(0, Math.min(screen.width - activeDrag.original.width, activeDrag.original.x + dx))),
          y: Math.round(Math.max(0, Math.min(contentHeight - activeDrag.original.height, activeDrag.original.y + dy))),
        }
      : {
          ...activeDrag.original,
          width: Math.round(Math.max(8, Math.min(screen.width - activeDrag.original.x, activeDrag.original.width + dx))),
          height: Math.round(Math.max(8, Math.min(contentHeight - activeDrag.original.y, activeDrag.original.height + dy))),
        }
  }

  const radiusForDrag = (activeDrag: Drag, event: ReactPointerEvent) => {
    if (activeDrag.mode !== 'resize' || !isRadiusMode(event)) return undefined
    const current = point(event)
    return Math.round(Math.max(0, Math.min(Math.min(activeDrag.original.width, activeDrag.original.height) / 2, activeDrag.originalBorderRadius + current.x - activeDrag.start.x)))
  }

  const pointerMove = (event: ReactPointerEvent) => {
    if (drawing) {
      setDrawing({ ...drawing, current: point(event) })
      return
    }
    if (!drag) return
    const next = boundsForDrag(drag, event)
    setDraftBounds({ [drag.componentId]: next })
    const radius = radiusForDrag(drag, event)
    if (radius !== undefined) {
      const nextRadius = { [drag.componentId]: radius }
      draftRadiusRef.current = nextRadius
      radiusEditedRef.current = true
      setDraftRadius(nextRadius)
    } else if (!radiusEditedRef.current) {
      setDraftRadius({})
    }
    if (drag.mode === 'resize') debugResize('move', { componentId: drag.componentId, radiusMode: radius !== undefined, bounds: next, borderRadius: radius })
  }

  const pointerUp = (event: ReactPointerEvent) => {
    if (drawing) {
      const bounds = normalize(drawing.start, point(event))
      setDrawing(null)
      onCreate(bounds)
    }
    if (drag) {
      const next = boundsForDrag(drag, event)
      const radius = radiusForDrag(drag, event) ?? (radiusEditedRef.current ? draftRadiusRef.current[drag.componentId] ?? draftRadius[drag.componentId] : undefined)
      if (JSON.stringify(next) !== JSON.stringify(drag.original) || radius !== undefined && radius !== drag.originalBorderRadius) onBounds(drag.componentId, next, radius)
      if (drag.mode === 'resize') debugResize('commit', { componentId: drag.componentId, radiusMode: radius !== undefined, bounds: next, borderRadius: radius })
      setDrag(null)
      setDraftBounds({})
      setDraftRadius({})
      draftRadiusRef.current = {}
      radiusEditedRef.current = false
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return <div className={`editor-canvas-area${drawMode ? ' drawing-mode' : ''}`}>
    <div className={`editor-device editor-device-${representation}`} style={{ aspectRatio: previewAspect }}>
      {(representation === 'web' || representation === 'desktop') && <div className="editor-browser-chrome"><i /><i /><i /><span>app.visiflow</span></div>}
      {representation !== 'web' && representation !== 'desktop' && representation !== 'diagram' && screen.showSystemUi !== false && <div className="editor-device-speaker" />}
      <div className="editor-device-viewport" style={{ background: config.app.phoneBackgroundColor ?? '#171b27' }}>
        <div
          ref={canvasRef}
          className={`editor-screen-canvas${selectedComponentId ? ' has-selection' : ''}`}
          style={{
            height: `${contentHeight / screen.height * 100}%`,
            background: showBackground ? screen.background ?? config.app.phoneBackgroundColor : config.app.phoneBackgroundColor,
            backgroundImage: showBackground && screen.backgroundImage ? `url(${resolveAssetSource(screen.backgroundImage)})` : undefined,
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
          onPointerCancel={() => { setDrawing(null); setDrag(null); setDraftBounds({}); setDraftRadius({}); draftRadiusRef.current = {}; radiusEditedRef.current = false; onCancelDraw() }}
        >
          {components.map((component) => {
            const visual = component.visual
            const position = positions.get(component.id) ?? { x: visual.x, y: visual.y }
            const bounds = draftBounds[component.id] ?? { x: position.x, y: position.y, width: visual.width, height: visual.height }
            const style = componentStyle(component, scenario)
            const selected = selectedComponentId === component.id
            const region = visual.kind === 'hotspot' && !visual.src && !visual.screenCrop
            const crop = visual.screenCrop
            return <div
              key={component.id}
              className={`editor-component-box${selected ? ' selected' : ''}${region ? ' region' : ''} state-${componentState(component, scenario)}`}
              style={{
                left: `${bounds.x / screen.width * 100}%`,
                top: `${bounds.y / contentHeight * 100}%`,
                width: `${bounds.width / screen.width * 100}%`,
                height: `${bounds.height / contentHeight * 100}%`,
                background: region ? undefined : style.background,
                backgroundImage: crop && screen.backgroundImage ? `url(${resolveAssetSource(screen.backgroundImage)})` : undefined,
                backgroundSize: crop ? `${screen.width / crop.width * 100}% ${contentHeight / crop.height * 100}%` : undefined,
                backgroundPosition: crop ? `${-crop.x / crop.width * 100}% ${-crop.y / crop.height * 100}%` : undefined,
                backgroundRepeat: crop ? 'no-repeat' : undefined,
                color: style.color,
                borderColor: style.borderColor,
              borderRadius: draftRadius[component.id] ?? style.borderRadius,
                opacity: style.opacity,
              } as CSSProperties}
              onPointerDown={(event) => {
                if (drawMode) return
                event.stopPropagation()
                onSelect(component.id)
                event.currentTarget.setPointerCapture?.(event.pointerId)
                setDrag({ componentId: component.id, mode: 'move', start: point(event), original: bounds, originalBorderRadius: style.borderRadius ?? 0 })
              }}
              onPointerMove={(event) => { event.stopPropagation(); pointerMove(event) }}
              onPointerUp={(event) => { event.stopPropagation(); pointerUp(event) }}
            >
              {style.src && !crop && <img src={resolveAssetSource(style.src)} alt="" style={{ objectFit: style.imageFit ?? 'cover', objectPosition: style.imagePosition ?? 'center', opacity: style.imageOpacity ?? 1 }} />}
              {!region && visual.kind !== 'image' && <span>{style.text ?? component.name}</span>}
              {region && <span className="region-name">{component.name}</span>}
              {selected && <button
                type="button"
                className="resize-handle"
                aria-label={`Resize ${component.name}`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  radiusEditedRef.current = false
                  debugResize('start', { componentId: component.id, ctrlKey: event.ctrlKey, metaKey: event.metaKey, bounds, borderRadius: style.borderRadius ?? 0 })
                  setDrag({ componentId: component.id, mode: 'resize', start: point(event), original: bounds, originalBorderRadius: style.borderRadius ?? 0 })
                }}
                onPointerMove={(event) => { event.stopPropagation(); pointerMove(event) }}
                onPointerUp={(event) => { event.stopPropagation(); pointerUp(event) }}
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
    <p>{drawMode ? 'Drag on the screen to define a component region · Esc to cancel' : 'Select, move, or resize components directly on the screen · Hold Ctrl while resizing to adjust corner radius'}</p>
  </div>
}
