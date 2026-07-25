import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve('dist')
const files = (await readdir(dist, { recursive: true })).map((file) => file.replaceAll('\\', '/'))
const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'icons/visiflow.svg',
  'demo/project.visiflow.md',
  'demo/screens/login/login-card.visiflow.md',
  'demo/screens/offers/coupons-card.visiflow.md',
  'demo/assets/components/login-card.png',
  'demo/assets/components/coupons.png',
  'schemas/visiflow-frontmatter.schema.json',
  'schemas/visiflow-runtime.schema.json',
]

for (const file of requiredFiles) {
  if (!files.includes(file)) throw new Error(`Required production artifact is missing: ${file}`)
}

const htmlFiles = files.filter((file) => file.toLowerCase().endsWith('.html'))
if (htmlFiles.length !== 1 || htmlFiles[0] !== 'index.html') {
  throw new Error(`Expected one unified HTML shell; found: ${htmlFiles.join(', ') || 'none'}`)
}

for (const file of ['index.html']) {
  const html = await readFile(resolve(dist, file), 'utf8')
  if (html.includes('id="visiflow-config"')) throw new Error(`${file} still embeds project configuration`)
  if (/<script\b[^>]*\bsrc=/i.test(html)) throw new Error(`${file} contains an external script`)
  if (/<link\b[^>]*rel=["']stylesheet["']/i.test(html)) throw new Error(`${file} contains an external stylesheet`)
  if (/\b(?:src|href)=["']\/?assets\//i.test(html)) throw new Error(`${file} references a generated application asset`)
}

const viewer = await readFile(resolve(dist, 'index.html'), 'utf8')
if (!viewer.includes('demo/project.visiflow.md')) throw new Error('Viewer default project metadata is missing')
if (!viewer.includes('VisiFlow Project Editor')) throw new Error('Unified editor marker is missing')
if (!viewer.includes('open-folder')) throw new Error('Unified folder action is missing')
if (!viewer.includes('manifest.webmanifest')) throw new Error('PWA manifest link is missing')
if (viewer.includes('Open JSON')) throw new Error('Legacy JSON editor behavior is still bundled')

const sizes = [
  `index.html: ${Buffer.byteLength(viewer).toLocaleString()} bytes`,
]
console.log(`Unified HTML shell and external project artifacts verified (${sizes.join(', ')}).`)
