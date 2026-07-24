import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { parseVisiFlowMarkdown } from './project-format'
import { testConfig } from './test-fixture'

const ajv = new Ajv2020({ allErrors: true, strict: false })
const frontmatterSchema = JSON.parse(readFileSync(resolve('schemas/visiflow-frontmatter.schema.json'), 'utf8'))
const runtimeSchema = JSON.parse(readFileSync(resolve('schemas/visiflow-runtime.schema.json'), 'utf8'))

describe('published JSON Schemas', () => {
  it('accepts representative project front matter and rejects an unknown kind', () => {
    const source = readFileSync(resolve('public/demo/project.visiflow.md'), 'utf8')
    const parsed = parseVisiFlowMarkdown(source, 'project.visiflow.md')
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
    const validate = ajv.compile(frontmatterSchema)
    expect(validate(parsed.data.meta)).toBe(true)
    expect(validate({ ...parsed.data.meta, kind: 'unknown' })).toBe(false)
  })

  it('accepts the assembled runtime model and rejects incomplete app metadata', () => {
    const validate = ajv.compile(runtimeSchema)
    expect(validate(testConfig)).toBe(true)
    const invalid = structuredClone(testConfig) as unknown as { app: { name?: string } }
    delete invalid.app.name
    expect(validate(invalid)).toBe(false)
  })
})
