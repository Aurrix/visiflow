import type { CSSProperties } from 'react'
import { resolveAssetSource } from '../assets'
import { componentStyle } from '../model'
import type { AppComponent, Scenario } from '../types'

export function ComponentPreview({ component, scenario }: { component: AppComponent; scenario: Scenario }) {
  const style = componentStyle(component, scenario)
  const visual = component.visual
  const scale = Math.min(190 / visual.width, 126 / visual.height)
  const width = Math.max(28, visual.width * scale)
  const height = Math.max(20, visual.height * scale)
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
        {style.src && <img
          className="component-preview-image"
          src={resolveAssetSource(style.src)}
          alt=""
          style={{ objectFit: style.imageFit ?? 'cover', objectPosition: style.imagePosition ?? 'center', opacity: style.imageOpacity ?? 1 }}
        />}
        {visual.kind !== 'image' && <span className="component-preview-label">
          {visual.kind === 'input' && <i>⌕</i>}
          {style.text ?? component.name}
        </span>}
        {visual.kind === 'hotspot' && !style.src && <span className="hotspot-label">Hotspot region</span>}
      </div>
    </div>
  )
}
