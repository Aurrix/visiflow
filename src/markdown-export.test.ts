import { describe, expect, it } from 'vitest'
import { buildMarkdownTable } from './markdown-export'
import { testConfig } from './test-fixture'

describe('buildMarkdownTable', () => {
  it('documents screens, components, systems, and request paths', () => {
    const output = buildMarkdownTable(testConfig)

    expect(output).toContain('## Home')
    expect(output).toContain('| Pay button | Action |')
    expect(output).toContain('Payment API')
    expect(output).toContain('HTTPS POST /payments')
  })
})
