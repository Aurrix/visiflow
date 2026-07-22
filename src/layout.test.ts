import { describe, expect, it } from 'vitest'
import { resolveComponentLayout } from './layout'
import type { AppComponent } from './types'

function component(id: string, width: number, layout?: AppComponent['visual']['layout']): AppComponent {
  return {
    id,
    screenId: 'screen',
    name: id,
    type: 'Action',
    description: '',
    visual: { kind: 'button', x: 0, y: 100, width, height: 40, layout },
  }
}

describe('resolveComponentLayout', () => {
  it('centers a component horizontally', () => {
    const positions = resolveComponentLayout([component('login', 300, { horizontal: 'center' })], 390)
    expect(positions.get('login')).toEqual({ x: 45, y: 100 })
  })

  it('orders and centers components in a shared row', () => {
    const positions = resolveComponentLayout([
      component('second', 100, { row: 'actions', order: 2 }),
      component('first', 100, { row: 'actions', order: 1, justify: 'center', gap: 10 }),
    ], 300)
    expect(positions.get('first')).toEqual({ x: 45, y: 100 })
    expect(positions.get('second')).toEqual({ x: 155, y: 100 })
  })
})
