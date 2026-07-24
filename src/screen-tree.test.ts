import { describe, expect, it } from 'vitest'
import { buildScreenTree, effectiveScreenGroup, screenAncestors, screenDescendants } from './screen-tree'
import type { AppScreen } from './types'

const screen = (id: string, fields: Partial<AppScreen> = {}): AppScreen => ({
  id,
  name: id,
  width: 390,
  height: 844,
  ...fields,
})

describe('screen hierarchy', () => {
  it('groups roots alphabetically, places ungrouped roots last, and orders siblings', () => {
    const groups = buildScreenTree([
      screen('ungrouped'),
      screen('account', { group: 'Account', order: 2 }),
      screen('checkout', { group: 'Checkout' }),
      screen('profile', { group: 'Account', order: 1 }),
      screen('details-late', { parentId: 'profile', order: 2 }),
      screen('details-first', { parentId: 'profile', order: 1 }),
    ])

    expect(groups.map((group) => group.name)).toEqual(['Account', 'Checkout', null])
    expect(groups[0].roots.map((node) => node.screen.id)).toEqual(['profile', 'account'])
    expect(groups[0].roots[0].children.map((node) => node.screen.id)).toEqual(['details-first', 'details-late'])
  })

  it('resolves ancestors, descendants, and inherited root groups', () => {
    const screens = [
      screen('root', { group: 'Account' }),
      screen('child', { parentId: 'root' }),
      screen('grandchild', { parentId: 'child' }),
    ]
    expect(screenAncestors(screens, 'grandchild')).toEqual(['root', 'child'])
    expect(screenDescendants(screens, 'root')).toEqual(['child', 'grandchild'])
    expect(effectiveScreenGroup(screens, 'grandchild')).toBe('Account')
  })
})
