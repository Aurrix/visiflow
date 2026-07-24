import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { runtimeConfigSchema } from '../src/config'
import { frontmatterSchema } from '../src/project-format'

const outputDirectory = resolve('schemas')
await mkdir(outputDirectory, { recursive: true })

const artifacts = [
  {
    name: 'visiflow-runtime.schema.json',
    id: 'https://visiflow.dev/schemas/visiflow-runtime.schema.json',
    title: 'VisiFlow assembled runtime configuration',
    schema: runtimeConfigSchema,
  },
  {
    name: 'visiflow-frontmatter.schema.json',
    id: 'https://visiflow.dev/schemas/visiflow-frontmatter.schema.json',
    title: 'VisiFlow Markdown front matter',
    schema: frontmatterSchema,
  },
]

for (const artifact of artifacts) {
  const generated = z.toJSONSchema(artifact.schema, { target: 'draft-2020-12' })
  const output = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: artifact.id,
    title: artifact.title,
    ...generated,
  }
  await writeFile(resolve(outputDirectory, artifact.name), `${JSON.stringify(output, null, 2)}\n`, 'utf8')
}

console.log(`Generated ${artifacts.length} VisiFlow JSON Schemas.`)
