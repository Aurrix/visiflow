import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseConfig } from './config'
import { assembleProject, parseVisiFlowMarkdown, serializeVisiFlowMarkdown } from './project-format'
import { testConfig } from './test-fixture'

const inlinePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8xOAAAAAElFTkSuQmCC'

describe('parseConfig', () => {
  it('keeps the external Markdown demo project valid', () => {
    const manifestPath = 'public/demo/project.visiflow.md'
    const manifest = parseVisiFlowMarkdown(readFileSync(resolve(manifestPath), 'utf8'), manifestPath)
    expect(manifest.ok).toBe(true)
    if (!manifest.ok || manifest.data.meta.kind !== 'project') return
    const documents = manifest.data.meta.componentFiles.map((path) => {
      const parsed = parseVisiFlowMarkdown(readFileSync(resolve('public/demo', path), 'utf8'), path)
      if (!parsed.ok || parsed.data.meta.kind !== 'component') throw new Error('Invalid demo component')
      return { path, meta: parsed.data.meta, body: parsed.data.body }
    })
    const assembled = assembleProject(manifestPath, manifest.data.meta, manifest.data.body, documents, 'http')
    expect(assembled.ok).toBe(true)
    if (assembled.ok) {
      expect(assembled.data.config.tasks).toHaveLength(10)
      expect(new Set(assembled.data.config.connections.map((connection) => connection.protocol))).toEqual(new Set([
        'HTTPS', 'GraphQL', 'gRPC', 'Kafka', 'WebSocket', 'HTTP/2',
      ]))
      const rideCard = assembled.data.config.components.find((component) => component.id === 'ride-card')
      expect(rideCard?.visual).toEqual(expect.objectContaining({
        kind: 'image',
        textureCrop: expect.objectContaining({ textureId: 'uber-overview' }),
      }))
    }
  })

  it('keeps configuration out of the compiled HTML source shell', () => {
    const html = readFileSync(resolve('index.html'), 'utf8')
    expect(html).not.toContain('id="visiflow-config"')
    expect(html).toContain('demo/project.visiflow.md')
  })

  it('round-trips YAML front matter and preserves Markdown documentation', () => {
    const source = readFileSync(resolve('public/demo/screens/login/login-card.visiflow.md'), 'utf8')
    const parsed = parseVisiFlowMarkdown(source, 'login-card.visiflow.md')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const serialized = serializeVisiFlowMarkdown(parsed.data.meta, parsed.data.body)
    const reparsed = parseVisiFlowMarkdown(serialized, 'login-card.visiflow.md')
    expect(reparsed).toEqual(parsed)
  })

  it('accepts a complete, cross-referenced configuration', () => {
    expect(parseConfig(testConfig).ok).toBe(true)
  })

  it('accepts grouped nested screens and rejects invalid hierarchy graphs', () => {
    const valid = structuredClone(testConfig)
    valid.screens[0].group = 'Checkout'
    valid.screens[0].order = 1
    valid.screens.push({
      id: 'receipt',
      name: 'Receipt',
      parentId: 'home',
      order: 2,
      width: 390,
      height: 844,
    })
    expect(parseConfig(valid).ok).toBe(true)

    const untimedScreenTask = structuredClone(valid)
    delete untimedScreenTask.tasks.find((task) => task.id === 'sync')?.trigger
    expect(parseConfig(untimedScreenTask).ok).toBe(true)

    const missing = structuredClone(valid)
    missing.screens[1].parentId = 'missing'
    const missingResult = parseConfig(missing)
    expect(missingResult.ok).toBe(false)
    if (!missingResult.ok) expect(missingResult.errors.join('\n')).toContain('Unknown parent screen')

    const cyclic = structuredClone(valid)
    cyclic.screens[0].parentId = 'receipt'
    const cyclicResult = parseConfig(cyclic)
    expect(cyclicResult.ok).toBe(false)
    if (!cyclicResult.ok) expect(cyclicResult.errors.join('\n')).toContain('cycle')

    const conflictingGroup = structuredClone(valid)
    conflictingGroup.screens[1].group = 'Account'
    const groupResult = parseConfig(conflictingGroup)
    expect(groupResult.ok).toBe(false)
    if (!groupResult.ok) expect(groupResult.errors.join('\n')).toContain('inherit its root group')
  })

  it('rejects v1 runtime and Markdown content with migration guidance', () => {
    const runtime = { ...structuredClone(testConfig), schemaVersion: 1 }
    const runtimeResult = parseConfig(runtime)
    expect(runtimeResult.ok).toBe(false)
    if (!runtimeResult.ok) expect(runtimeResult.errors.join('\n')).toContain('migrated to v2')

    const markdown = parseVisiFlowMarkdown('---\nvisiflow: 1\nkind: project\n---\n', 'old.visiflow.md')
    expect(markdown.ok).toBe(false)
    if (!markdown.ok) expect(markdown.errors.join('\n')).toContain('migrated to v2')
  })

  it('validates first-class tasks, scope, state, and cadence ownership', () => {
    const valid = structuredClone(testConfig)
    valid.tasks.push({
      id: 'sync',
      name: 'Sync',
      type: 'Worker',
      description: 'Synchronizes data.',
      scope: { kind: 'screen', screenId: 'home' },
      trigger: { kind: 'polling', label: 'Every minute', intervalMs: 60000 },
    })
    valid.scenarios[0].taskStates.sync = 'inactive'
    valid.connections[0].source = { kind: 'task', id: 'sync' }
    delete valid.connections[0].cadence
    expect(parseConfig(valid).ok).toBe(true)

    const duplicateCadence = structuredClone(valid)
    duplicateCadence.connections[0].cadence = { kind: 'polling', label: 'Duplicate timing' }
    const cadenceResult = parseConfig(duplicateCadence)
    expect(cadenceResult.ok).toBe(false)
    if (!cadenceResult.ok) expect(cadenceResult.errors.join('\n')).toContain('inherit cadence')

    const componentToScreenTask = structuredClone(valid)
    componentToScreenTask.connections[0].source = { kind: 'component', id: 'button' }
    componentToScreenTask.connections[0].target = { kind: 'task', id: 'sync' }
    const componentToScreenTaskResult = parseConfig(componentToScreenTask)
    expect(componentToScreenTaskResult.ok).toBe(false)
    if (!componentToScreenTaskResult.ok) expect(componentToScreenTaskResult.errors.join('\n')).toContain('cannot connect directly')

    const invalidScope = structuredClone(valid)
    invalidScope.tasks[0].scope = { kind: 'screen', screenId: 'missing' }
    const scopeResult = parseConfig(invalidScope)
    expect(scopeResult.ok).toBe(false)
    if (!scopeResult.ok) expect(scopeResult.errors.join('\n')).toContain('tasks.0.scope.screenId')
  })

  it('requires cadence on direct connections', () => {
    const invalid = structuredClone(testConfig)
    delete invalid.connections[0].cadence
    const result = parseConfig(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('Direct connections require cadence')
  })

  it('preserves base64 images embedded inline in JSON', () => {
    const input = structuredClone(testConfig)
    input.screens[0].backgroundImage = inlinePng
    input.components[0].visual.src = inlinePng
    const result = parseConfig(JSON.parse(JSON.stringify(input)))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.screens[0].backgroundImage).toBe(inlinePng)
      expect(result.data.components[0].visual.src).toBe(inlinePng)
    }
  })

  it('accepts propagated paths and lets downstream hops inherit their path trigger', () => {
    const valid = structuredClone(testConfig)
    valid.systems.push({ id: 'bff', name: 'BFF', type: 'Gateway', description: 'Transforms requests.' })
    valid.connections[0].target = { kind: 'system', id: 'bff' }
    valid.connections.push({ id: 'forward', name: 'Forward payment', source: { kind: 'system', id: 'bff' }, target: { kind: 'system', id: 'api' }, protocol: 'HTTPS', description: 'Forwards to payment.' })
    valid.requestPaths.push({ id: 'payment-path', name: 'Payment propagation', description: 'Passes through the BFF.', trigger: { kind: 'user-event', label: 'On payment' }, steps: [
      { connectionId: 'pay', phase: 1, behavior: 'forward' },
      { connectionId: 'forward', phase: 2, behavior: 'transform', label: 'Normalize payment' },
    ] })
    expect(parseConfig(valid).ok).toBe(true)

    const invalid = structuredClone(valid)
    invalid.requestPaths[0].steps[1].connectionId = 'missing'
    const result = parseConfig(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('Unknown connection')
  })

  it('validates project texture layers and component crop bindings', () => {
    const input = structuredClone(testConfig)
    input.textureLayers = [{ id: 'reference', name: 'Reference', src: inlinePng, x: 0, y: 0, width: 100, height: 100, order: 0 }]
    input.components[0].visual.textureCrop = { textureId: 'reference', x: 10, y: 10, width: 40, height: 30 }
    expect(parseConfig(input).ok).toBe(true)
    input.components[0].visual.textureCrop.textureId = 'missing'
    expect(parseConfig(input).ok).toBe(false)
  })

  it('reports unknown connection endpoints with a property path', () => {
    const invalid = structuredClone(testConfig)
    invalid.connections[0].target.id = 'missing'
    const result = parseConfig(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('connections.0.target.id')
  })

  it('rejects components whose bounds exceed their screen', () => {
    const invalid = structuredClone(testConfig)
    invalid.components[0].visual.x = 380
    const result = parseConfig(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('Visual bounds exceed the screen')
  })

  it('allows content to grow below the viewport when contentHeight is omitted', () => {
    const scrollable = structuredClone(testConfig)
    scrollable.components[0].visual.y = 900
    expect(parseConfig(scrollable).ok).toBe(true)
  })

  it('validates explicit scrollable content bounds', () => {
    const invalid = structuredClone(testConfig)
    invalid.screens[0].contentHeight = 900
    invalid.components[0].visual.y = 880
    const result = parseConfig(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('Visual bounds exceed the screen')
  })

  it('rejects row layouts that cannot fit the screen width', () => {
    const invalid = structuredClone(testConfig)
    invalid.components.push({
      ...structuredClone(invalid.components[0]),
      id: 'second-button',
      visual: { ...structuredClone(invalid.components[0].visual), width: 300, layout: { row: 'actions', order: 2, gap: 12 } },
    })
    invalid.components[0].visual.width = 300
    invalid.components[0].visual.layout = { row: 'actions', order: 1, gap: 12 }
    const result = parseConfig(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('Row "actions" is wider than the screen')
  })
})
