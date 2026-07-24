import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve('dist')
const files = await readdir(dist, { recursive: true })
const regularFiles = files.filter((file) => !file.endsWith('/') && !file.endsWith('\\'))

const expectedFiles = ['config-editor.html', 'index.html']
const normalizedFiles = regularFiles.map((file) => file.replaceAll('\\', '/')).sort()
if (JSON.stringify(normalizedFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`Expected ${expectedFiles.join(' and ')} only; found: ${regularFiles.join(', ')}`)
}

for (const file of expectedFiles) {
  const html = await readFile(resolve(dist, file), 'utf8')
  if (file === 'index.html' && !html.includes('id="visiflow-config"')) throw new Error('Viewer embedded configuration block is missing')
  if (file === 'config-editor.html' && !html.includes('VisiFlow Config Editor')) throw new Error('Config editor marker is missing')
  if (/<script\b[^>]*\bsrc=/i.test(html)) throw new Error(`${file} contains an external script`)
  if (/<link\b[^>]*rel=["']stylesheet["']/i.test(html)) throw new Error(`${file} contains an external stylesheet`)
  if (/\b(?:src|href)=["']\/?assets\//i.test(html)) throw new Error(`${file} references a generated asset`)
}

const sizes = await Promise.all(expectedFiles.map(async (file) => {
  const html = await readFile(resolve(dist, file), 'utf8')
  return `${file}: ${Buffer.byteLength(html).toLocaleString()} bytes`
}))
console.log(`Single-file artifacts verified (${sizes.join(', ')}).`)
