import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve('dist')
const files = await readdir(dist, { recursive: true })
const regularFiles = files.filter((file) => !file.endsWith('/') && !file.endsWith('\\'))

if (regularFiles.length !== 1 || regularFiles[0].replaceAll('\\', '/') !== 'index.html') {
  throw new Error(`Expected dist/index.html only; found: ${regularFiles.join(', ')}`)
}

const html = await readFile(resolve(dist, 'index.html'), 'utf8')
if (!html.includes('id="visiflow-config"')) throw new Error('Embedded configuration block is missing')
if (/<script\b[^>]*\bsrc=/i.test(html)) throw new Error('Production HTML contains an external script')
if (/<link\b[^>]*rel=["']stylesheet["']/i.test(html)) throw new Error('Production HTML contains an external stylesheet')
if (/\b(?:src|href)=["']\/?assets\//i.test(html)) throw new Error('Production HTML references a generated asset')

console.log(`Single-file artifact verified (${Buffer.byteLength(html).toLocaleString()} bytes).`)
