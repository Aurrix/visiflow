import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseConfig } from './config'
import { testConfig } from './test-fixture'

describe('parseConfig', () => {
  it('keeps the documented project template valid', () => {
    const example = JSON.parse(readFileSync(resolve('docs/visiflow-config.example.json'), 'utf8'))
    expect(parseConfig(example)).toEqual(expect.objectContaining({ ok: true }))
  })

  it('keeps the embedded runnable example valid', () => {
    const html = readFileSync(resolve('index.html'), 'utf8')
    const json = html.match(/<script id="visiflow-config" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
    expect(json).toBeTruthy()
    expect(parseConfig(JSON.parse(json!)).ok).toBe(true)
  })

  it('accepts a complete, cross-referenced configuration', () => {
    expect(parseConfig(testConfig).ok).toBe(true)
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
