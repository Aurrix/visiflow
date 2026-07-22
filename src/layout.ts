import type { AppComponent } from './types'

export interface ComponentPosition { x: number; y: number }

export function resolveComponentLayout(components: AppComponent[], screenWidth: number): Map<string, ComponentPosition> {
  const positions = new Map<string, ComponentPosition>()
  const rows = new Map<string, AppComponent[]>()

  components.forEach((component) => {
    const layout = component.visual.layout
    if (layout?.row) {
      const members = rows.get(layout.row) ?? []
      members.push(component)
      rows.set(layout.row, members)
      return
    }

    const horizontal = layout?.horizontal ?? 'absolute'
    let x = component.visual.x
    if (horizontal === 'center') x = (screenWidth - component.visual.width) / 2
    if (horizontal === 'end') x = screenWidth - component.visual.x - component.visual.width
    positions.set(component.id, { x: Math.max(0, x), y: component.visual.y })
  })

  rows.forEach((members) => {
    const sorted = [...members].sort((a, b) => (a.visual.layout?.order ?? 0) - (b.visual.layout?.order ?? 0))
    const firstLayout = sorted[0].visual.layout!
    const justify = firstLayout.justify ?? 'start'
    const requestedGap = firstLayout.gap ?? 12
    const itemWidth = sorted.reduce((sum, component) => sum + component.visual.width, 0)
    const fixedGaps = requestedGap * Math.max(0, sorted.length - 1)
    const freeSpace = Math.max(0, screenWidth - itemWidth - fixedGaps)
    let gap = requestedGap
    let x = 0
    if (justify === 'center') x = freeSpace / 2
    if (justify === 'end') x = freeSpace
    if (justify === 'space-between' && sorted.length > 1) gap = Math.max(requestedGap, (screenWidth - itemWidth) / (sorted.length - 1))
    const y = Math.min(...sorted.map((component) => component.visual.y))

    sorted.forEach((component) => {
      positions.set(component.id, { x, y })
      x += component.visual.width + gap
    })
  })

  return positions
}
