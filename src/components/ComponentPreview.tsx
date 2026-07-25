import type { CSSProperties } from 'react'
import { resolveAssetSource } from '../assets'
import { componentStyle } from '../model'
import type { AppComponent, AppScreen, Scenario } from '../types'

export function ComponentPreview({ component, screen, scenario }: { component: AppComponent; screen?: AppScreen; scenario: Scenario }) {
  const style = componentStyle(component, scenario)
  const visual = component.visual
  const scale = Math.min(190 / visual.width, 126 / visual.height)
  const width = Math.max(28, visual.width * scale)
  const height = Math.max(20, visual.height * scale)
  const regionCrop = visual.kind === 'hotspot' && !style.src && screen?.backgroundImage
  const textureCrop = visual.screenCrop && screen?.backgroundImage
  const screenContentHeight = screen ? Math.max(screen.contentHeight ?? screen.height, visual.y + visual.height) : 0
  const previewStyle = {
    width,
    height,
    background: style.background,
    color: style.color,
    borderColor: style.borderColor,
    borderRadius: style.borderRadius === undefined ? undefined : Math.min(18, style.borderRadius * scale),
    opacity: style.opacity,
  } as CSSProperties

  return (
    <div className="component-preview" aria-label={`${component.name} visual preview`} role="img">
      <div className={`component-preview-surface preview-${visual.kind}`} style={previewStyle}>
        {(regionCrop || textureCrop) && <img
          className="component-preview-image component-preview-crop"
          src={resolveAssetSource(screen.backgroundImage!)}
          alt=""
          style={{
            width: screen.width * scale,
            height: screenContentHeight * scale,
            maxWidth: 'none',
            left: -(visual.screenCrop?.x ?? visual.x) * scale,
            top: -(visual.screenCrop?.y ?? visual.y) * scale,
          }}
        />}
        {style.src && !textureCrop && <img
          className="component-preview-image"
          src={resolveAssetSource(style.src)}
          alt=""
          style={{ objectFit: style.imageFit ?? 'cover', objectPosition: style.imagePosition ?? 'center', opacity: style.imageOpacity ?? 1 }}
        />}
        {visual.kind !== 'image' && <span className="component-preview-label">
          {visual.kind === 'input' && <i>⌕</i>}
          {style.text ?? component.name}
        </span>}
        {visual.kind === 'hotspot' && !style.src && !regionCrop && <span className="hotspot-label">Hotspot region</span>}
      </div>
    </div>
  )
}
