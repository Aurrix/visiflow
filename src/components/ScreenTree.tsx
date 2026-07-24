import { useMemo, useState } from 'react'
import { buildScreenTree, screenAncestors, type ScreenTreeNode } from '../screen-tree'
import type { AppScreen } from '../types'

interface ScreenTreeProps {
  screens: AppScreen[]
  activeId: string
  includeAll?: boolean
  onSelect: (screenId: string) => void
}

export function ScreenTree({ screens, activeId, includeAll, onSelect }: ScreenTreeProps) {
  const groups = useMemo(() => buildScreenTree(screens), [screens])
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [manuallyExpandedNodes, setManuallyExpandedNodes] = useState<Set<string>>(new Set())
  const expandedNodes = useMemo(() =>
    new Set([...manuallyExpandedNodes, ...screenAncestors(screens, activeId)]),
  [activeId, manuallyExpandedNodes, screens])

  const toggleGroup = (key: string) => setCollapsedGroups((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const toggleNode = (id: string) => setManuallyExpandedNodes((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const renderNode = (node: ScreenTreeNode, depth = 0): React.ReactNode => {
    const expanded = expandedNodes.has(node.screen.id)
    return <div className="screen-tree-node" key={node.screen.id}>
      <div className={`screen-tree-row${activeId === node.screen.id ? ' active' : ''}`} style={{ '--tree-depth': depth } as React.CSSProperties}>
        {node.children.length > 0
          ? <button type="button" className="tree-chevron" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.screen.name}`} aria-expanded={expanded} onClick={() => toggleNode(node.screen.id)}>›</button>
          : <span className="tree-chevron-spacer" />}
        <button type="button" className="screen-tree-select" onClick={() => onSelect(node.screen.id)}>
          <span className="screen-tree-icon" aria-hidden="true">▣</span>
          <span><strong>{node.screen.name}</strong><small>{node.screen.id}</small></span>
        </button>
      </div>
      {expanded && node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  }

  return <nav className="screen-tree" aria-label="Screens">
    {includeAll && <button type="button" className={`screen-tree-all${activeId === 'all' ? ' active' : ''}`} onClick={() => onSelect('all')}>
      <span aria-hidden="true">▦</span><strong>All screens</strong><small>{screens.length}</small>
    </button>}
    {groups.map((group) => {
      const key = group.name ?? '__ungrouped'
      const collapsed = collapsedGroups.has(key)
      return <section className="screen-tree-group" key={key}>
        <button type="button" className="screen-tree-group-toggle" aria-expanded={!collapsed} onClick={() => toggleGroup(key)}>
          <span className="tree-chevron">›</span><strong>{group.name ?? 'Ungrouped'}</strong><small>{group.roots.length}</small>
        </button>
        {!collapsed && <div>{group.roots.map((root) => renderNode(root))}</div>}
      </section>
    })}
  </nav>
}
