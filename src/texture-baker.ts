import { resolveAssetSource } from './assets'
import type { TextureLayer, VisiFlowConfig } from './types'

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('could not be loaded'))
    image.src = resolveAssetSource(source)
  })
}

export async function bakeTextureCrops(config: VisiFlowConfig) {
  const layers = new Map(config.textureLayers.map((layer) => [layer.id, layer]))
  const images = new Map<string, HTMLImageElement>()
  for (const component of config.components) {
    const crop = component.visual.textureCrop
    if (!crop) continue
    const layer = layers.get(crop.textureId)
    if (!layer) throw new Error(`Texture layer "${crop.textureId}" no longer exists`)
    let image = images.get(layer.id)
    if (!image) {
      image = await loadImage(layer.src)
      images.set(layer.id, image)
    }
    component.visual.src = cropToDataUrl(image, layer, crop)
    component.visual.kind = 'image'
    component.visual.imageFit = 'fill'
  }
}

function cropToDataUrl(image: HTMLImageElement, layer: TextureLayer, crop: { x: number; y: number; width: number; height: number }) {
  const scaleX = image.naturalWidth / layer.width
  const scaleY = image.naturalHeight / layer.height
  const sourceX = Math.max(0, Math.round(crop.x * scaleX))
  const sourceY = Math.max(0, Math.round(crop.y * scaleY))
  const sourceWidth = Math.max(1, Math.min(image.naturalWidth - sourceX, Math.round(crop.width * scaleX)))
  const sourceHeight = Math.max(1, Math.min(image.naturalHeight - sourceY, Math.round(crop.height * scaleY)))
  const canvas = document.createElement('canvas')
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('browser image canvas is unavailable')
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
  return canvas.toDataURL('image/png')
}
