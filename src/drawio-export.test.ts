import { describe, expect, it } from 'vitest'
import { buildDrawio } from './drawio-export'
import { testConfig } from './test-fixture'

describe('buildDrawio', () => {
  it('creates an editable page per screen with readable connection labels', () => {
    const config = structuredClone(testConfig)
    config.components[0].flagged = true
    const output = buildDrawio(config)

    expect(output).toContain('<diagram')
    expect(output).toContain('name="Overview"')
    expect(output).toContain('External systems')
    expect(output).toContain('Screens / Home')
    expect(output).toContain('⚠ Pay button')
    expect(output).toContain('HTTPS POST /payments')
    expect(output).toContain('Creates payment')
    expect(output).toContain('connection-overview-pay')
  })
})
