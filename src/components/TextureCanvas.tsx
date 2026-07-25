import { useEffect, useRef, useState } from 'react'
import { resolveAssetSource } from '../assets'
import type { AppComponent, TextureLayer } from '../types'

interface Point { x: number; y: number }
interface Bounds extends Point { width: number; height: number }
interface Preview { componentId: string; layerId: string; bounds: Bounds; borderRadius?: number }

const debugResize = (event: string, details: Record<string, unknown>) => {
  if (import.meta.env.DEV) console.debug(`[VisiFlow texture resize] ${event}`, details)
}

export function TextureCanvas({ layers, components, selectedComponentId, onBind, onSelectComponent, onSelectLayer, onMoveLayer, onResize, onPaste }: {
  layers: TextureLayer[]
  components: AppComponent[]
  selectedComponentId?: string
  onBind: (componentId: string, layerId: string, bounds: Bounds) => void
  onSelectComponent: (id: string) => void
  onSelectLayer: (id: string) => void
  onMoveLayer: (id: string, point: Point) => void
  onResize: (componentId: string, layerId: string, bounds: Bounds, borderRadius?: number) => void
  onPaste: (file: File) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState<{ layer: TextureLayer; start: Point; current: Point } | null>(null)
  const [moving, setMoving] = useState<{ layer: TextureLayer; start: Point } | null>(null)
  const [draggingPlaced, setDraggingPlaced] = useState<{ component: AppComponent; layer: TextureLayer } | null>(null)
  const [resizingPlaced, setResizingPlaced] = useState<{ component: AppComponent; layer: TextureLayer; start: Point; original: Bounds } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const modifierRef = useRef(false)
  const radiusEditedRef = useRef(false)
  const boardWidth = Math.max(960, ...layers.map((layer) => layer.x + layer.width + 80))
  const boardHeight = Math.max(680, ...layers.map((layer) => layer.y + layer.height + 80))
  const point = (event: { clientX: number; clientY: number }) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const bounds = (start: Point, end: Point): Bounds => ({ x: Math.round(Math.min(start.x, end.x)), y: Math.round(Math.min(start.y, end.y)), width: Math.max(4, Math.round(Math.abs(end.x - start.x))), height: Math.max(4, Math.round(Math.abs(end.y - start.y))) })
  const layerAt = (target: Point) => layers.slice().sort((a, b) => b.order - a.order).find((layer) => target.x >= layer.x && target.y >= layer.y && target.x <= layer.x + layer.width && target.y <= layer.y + layer.height)
  const clampCrop = (component: AppComponent, layer: TextureLayer, target: Point): Bounds => {
    const existingCrop = component.visual.textureCrop
    const width = Math.min(existingCrop?.width ?? component.visual.width, layer.width)
    const height = Math.min(existingCrop?.height ?? component.visual.height, layer.height)
    return {
      x: Math.max(0, Math.min(layer.width - width, Math.round(target.x - layer.x - width / 2))),
      y: Math.max(0, Math.min(layer.height - height, Math.round(target.y - layer.y - height / 2))),
      width,
      height,
    }
  }
  const resizedCrop = (active: NonNullable<typeof resizingPlaced>, end: Point): Bounds => ({
    ...active.original,
    width: Math.max(8, Math.min(active.layer.width - active.original.x, Math.round(active.original.width + end.x - active.start.x))),
    height: Math.max(8, Math.min(active.layer.height - active.original.y, Math.round(active.original.height + end.y - active.start.y))),
  })
  const isRadiusMode = (event: { ctrlKey?: boolean; metaKey?: boolean }) => Boolean(event.ctrlKey || event.metaKey || modifierRef.current)
  const radiusForResize = (active: NonNullable<typeof resizingPlaced>, end: Point) => Math.round(Math.max(0, Math.min(Math.min(active.original.width, active.original.height) / 2, (active.component.visual.borderRadius ?? 0) + end.x - active.start.x)))
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'))
      if (!file) return
      event.preventDefault()
      onPaste(file)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [onPaste])
  useEffect(() => {
    const update = (event: KeyboardEvent) => { modifierRef.current = event.ctrlKey || event.metaKey }
    const clear = () => { modifierRef.current = false }
    window.addEventListener('keydown', update, true)
    window.addEventListener('keyup', update, true)
    window.addEventListener('blur', clear)
    return () => { window.removeEventListener('keydown', update, true); window.removeEventListener('keyup', update, true); window.removeEventListener('blur', clear) }
  }, [])
  const bound = components.filter((item) => item.visual.textureCrop)
  return <div className="texture-canvas-wrap">
    <p className="texture-empty">Paste an image from the clipboard to add a texture. Drag a component from the left menu onto an image, then reposition it directly on the texture.</p>
    <div className="texture-canvas" ref={boardRef} tabIndex={0} style={{ width: boardWidth, height: boardHeight }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault()
      const component = components.find((item) => item.id === event.dataTransfer.getData('application/x-visiflow-component'))
      const layer = component && layerAt(point(event))
      if (component && layer) onBind(component.id, layer.id, clampCrop(component, layer, point(event)))
    }} onPointerMove={(event) => {
      const current = point(event)
      if (drawing) setDrawing({ ...drawing, current })
      if (resizingPlaced) {
        const radiusMode = isRadiusMode(event)
        const next = radiusMode
          ? { componentId: resizingPlaced.component.id, layerId: resizingPlaced.layer.id, bounds: resizingPlaced.original, borderRadius: radiusForResize(resizingPlaced, current) }
          : { componentId: resizingPlaced.component.id, layerId: resizingPlaced.layer.id, bounds: resizedCrop(resizingPlaced, current) }
        if (radiusMode) radiusEditedRef.current = true
        debugResize('move', { componentId: resizingPlaced.component.id, radiusMode, bounds: next.bounds, borderRadius: next.borderRadius })
        setPreview(next)
      }
      if (draggingPlaced) {
        const layer = layerAt(current)
        if (layer) setPreview({ componentId: draggingPlaced.component.id, layerId: layer.id, bounds: clampCrop(draggingPlaced.component, layer, current) })
      }
    }} onPointerUp={(event) => {
      const end = point(event)
      if (resizingPlaced) {
        const next = preview?.componentId === resizingPlaced.component.id ? preview.bounds : resizedCrop(resizingPlaced, end)
        const borderRadius = radiusEditedRef.current ? preview?.borderRadius ?? radiusForResize(resizingPlaced, end) : undefined
        debugResize('commit', { componentId: resizingPlaced.component.id, radiusMode: radiusEditedRef.current, bounds: next, borderRadius })
        onResize(resizingPlaced.component.id, resizingPlaced.layer.id, next, borderRadius)
        setResizingPlaced(null)
        setPreview(null)
        radiusEditedRef.current = false
        return
      }
      if (draggingPlaced) {
        const layer = layerAt(end)
        if (layer) onBind(draggingPlaced.component.id, layer.id, preview?.componentId === draggingPlaced.component.id ? preview.bounds : clampCrop(draggingPlaced.component, layer, end))
        setDraggingPlaced(null)
        setPreview(null)
        return
      }
      if (drawing) {
        const next = bounds(drawing.start, end)
        if (selectedComponentId) onBind(selectedComponentId, drawing.layer.id, { ...next, x: next.x - drawing.layer.x, y: next.y - drawing.layer.y })
        setDrawing(null)
        return
      }
      if (moving) {
        onMoveLayer(moving.layer.id, { x: Math.round(moving.layer.x + end.x - moving.start.x), y: Math.round(moving.layer.y + end.y - moving.start.y) })
        setMoving(null)
      }
    }}>
      {layers.slice().sort((a, b) => a.order - b.order).map((layer) => <div className="texture-layer" key={layer.id} style={{ left: layer.x, top: layer.y, width: layer.width, height: layer.height, zIndex: layer.order }} onPointerDown={(event) => {
        event.stopPropagation(); onSelectLayer(layer.id)
        if (!selectedComponentId) { event.currentTarget.setPointerCapture?.(event.pointerId); setMoving({ layer, start: point(event) }); return }
        event.currentTarget.setPointerCapture?.(event.pointerId); setDrawing({ layer, start: point(event), current: point(event) })
      }}>
        <img src={resolveAssetSource(layer.src)} alt={layer.name} draggable={false} /><span>{layer.name}</span>
        {bound.filter((component) => component.visual.textureCrop?.textureId === layer.id).map((component) => {
          const crop = preview?.componentId === component.id && preview.layerId === layer.id ? preview.bounds : component.visual.textureCrop!
          return <button type="button" className={`texture-component${selectedComponentId === component.id ? ' selected' : ''}`} key={component.id} onPointerDown={(event) => {
            event.stopPropagation(); onSelectComponent(component.id); event.currentTarget.setPointerCapture?.(event.pointerId); setDraggingPlaced({ component, layer })
      }} style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height, borderRadius: preview?.componentId === component.id ? preview.borderRadius ?? component.visual.borderRadius : component.visual.borderRadius }}>{component.name}{selectedComponentId === component.id && <i className="texture-resize-handle" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); radiusEditedRef.current = false; debugResize('start', { componentId: component.id, ctrlKey: event.ctrlKey, metaKey: event.metaKey, bounds: crop, borderRadius: component.visual.borderRadius ?? 0 }); setResizingPlaced({ component, layer, start: point(event), original: { x: crop.x, y: crop.y, width: crop.width, height: crop.height } }) }} />}</button>
        })}
      </div>)}
      {drawing && <div className="texture-crop drawing" style={{ left: bounds(drawing.start, drawing.current).x, top: bounds(drawing.start, drawing.current).y, width: bounds(drawing.start, drawing.current).width, height: bounds(drawing.start, drawing.current).height }} />}
    </div>
  </div>
}
