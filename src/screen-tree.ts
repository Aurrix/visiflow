import type { AppScreen } from './types'

export interface ScreenTreeNode {
  screen: AppScreen
  children: ScreenTreeNode[]
}

export interface ScreenTreeGroup {
  name: string | null
  roots: ScreenTreeNode[]
}

function screenComparator(index: Map<string, number>) {
  return (left: AppScreen, right: AppScreen) =>
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
    (index.get(left.id) ?? 0) - (index.get(right.id) ?? 0)
}

export function buildScreenTree(screens: AppScreen[]): ScreenTreeGroup[] {
  const index = new Map(screens.map((screen, position) => [screen.id, position]))
  const byParent = new Map<string, AppScreen[]>()
  screens.forEach((screen) => {
    const parent = screen.parentId ?? ''
    byParent.set(parent, [...(byParent.get(parent) ?? []), screen])
  })
  const compare = screenComparator(index)
  const buildNode = (screen: AppScreen): ScreenTreeNode => ({
    screen,
    children: (byParent.get(screen.id) ?? []).sort(compare).map(buildNode),
  })
  const grouped = new Map<string | null, ScreenTreeNode[]>()
  ;(byParent.get('') ?? []).sort(compare).forEach((screen) => {
    const group = screen.group ?? null
    grouped.set(group, [...(grouped.get(group) ?? []), buildNode(screen)])
  })
  return [...grouped.entries()]
    .sort(([left], [right]) => left === null ? 1 : right === null ? -1 : left.localeCompare(right))
    .map(([name, roots]) => ({ name, roots }))
}

export function screenAncestors(screens: AppScreen[], screenId: string): string[] {
  const byId = new Map(screens.map((screen) => [screen.id, screen]))
  const ancestors: string[] = []
  const visited = new Set<string>()
  let current = byId.get(screenId)
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId)
    ancestors.unshift(current.parentId)
    current = byId.get(current.parentId)
  }
  return ancestors
}

export function screenDescendants(screens: AppScreen[], screenId: string): string[] {
  const descendants: string[] = []
  const visit = (parentId: string) => screens.filter((screen) => screen.parentId === parentId).forEach((screen) => {
    descendants.push(screen.id)
    visit(screen.id)
  })
  visit(screenId)
  return descendants
}

export function effectiveScreenGroup(screens: AppScreen[], screenId: string): string | undefined {
  const byId = new Map(screens.map((screen) => [screen.id, screen]))
  const visited = new Set<string>()
  let current = byId.get(screenId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (!current.parentId) return current.group
    current = byId.get(current.parentId)
  }
  return undefined
}
