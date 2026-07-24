import { describe, expect, it, vi } from 'vitest'
import { defaultProjectUrl, loadProjectFromDirectory, loadProjectFromHttp, type ProjectDirectoryHandle, type ProjectFileHandle, type WritableHandle } from './project-loader'
import { saveProjectWorkspace } from './project-workspace'

class MemoryFile implements ProjectFileHandle {
  readonly kind = 'file'
  constructor(public name: string, public content: string) {}
  async getFile() { return new File([this.content], this.name, { type: this.name.endsWith('.md') ? 'text/markdown' : 'application/octet-stream' }) }
  async createWritable(): Promise<WritableHandle> {
    return {
      write: async (data) => {
        this.content = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : new TextDecoder().decode(data)
      },
      close: async () => undefined,
    }
  }
}

class MemoryDirectory implements ProjectDirectoryHandle {
  readonly kind = 'directory'
  children = new Map<string, MemoryDirectory | MemoryFile>()
  constructor(public name: string) {}
  async *entries(): AsyncIterableIterator<[string, ProjectDirectoryHandle | ProjectFileHandle]> {
    for (const entry of this.children) yield entry
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.children.get(name)
    if (existing instanceof MemoryDirectory) return existing
    if (!options?.create) throw new DOMException('Missing directory', 'NotFoundError')
    const created = new MemoryDirectory(name)
    this.children.set(name, created)
    return created
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.children.get(name)
    if (existing instanceof MemoryFile) return existing
    if (!options?.create) throw new DOMException('Missing file', 'NotFoundError')
    const created = new MemoryFile(name, '')
    this.children.set(name, created)
    return created
  }
  async removeEntry(name: string) {
    if (!this.children.delete(name)) throw new DOMException('Missing entry', 'NotFoundError')
  }
  file(path: string, content: string) {
    const parts = path.split('/')
    const name = parts.pop()!
    const directory = parts.reduce<MemoryDirectory>((current, part) => {
      const existing = current.children.get(part)
      if (existing instanceof MemoryDirectory) return existing
      else {
        const created = new MemoryDirectory(part)
        current.children.set(part, created)
        return created
      }
    }, this)
    directory.children.set(name, new MemoryFile(name, content))
    return this
  }
  read(path: string): string | undefined {
    const parts = path.split('/')
    const name = parts.pop()!
    const directory = parts.reduce<MemoryDirectory | undefined>((current, part) => {
      const next = current?.children.get(part)
      return next instanceof MemoryDirectory ? next : undefined
    }, this)
    if (!directory) return undefined
    const file = directory.children.get(name)
    return file instanceof MemoryFile ? file.content : undefined
  }
}

const manifest = `---
visiflow: 2
kind: project
app:
  id: test
  name: Test
  platform: Web
  device: web
  initialScreenId: home
screens:
  - { id: home, name: Home, width: 390, height: 844 }
tasks: []
systems:
  - { id: api, name: API, type: Service, description: Test API }
scenarios:
  - { id: normal, name: Normal, componentStates: {}, taskStates: {} }
initialScenarioId: normal
componentFiles:
  - screens/home/action.visiflow.md
connections: []
---

# Test project`

const component = `---
visiflow: 2
kind: component
id: action
screenId: home
name: Action
type: Button
visual: { kind: hotspot, x: 20, y: 80, width: 100, height: 40 }
calls:
  - id: call-api
    name: Call API
    direction: outgoing
    peer: { kind: system, id: api }
    protocol: HTTPS
    method: POST
    endpoint: /action
    description: Sends the action.
    cadence: { kind: user-event, label: On tap }
---

**Action documentation**`

describe('Markdown project folders', () => {
  it('uses hosted project metadata as the default URL', () => {
    const meta = document.createElement('meta')
    meta.name = 'visiflow-project'
    meta.content = 'demo/project.visiflow.md'
    document.head.append(meta)
    expect(defaultProjectUrl()).toBe('demo/project.visiflow.md')
    meta.remove()
  })

  it('recursively discovers and assembles component-owned calls', async () => {
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', component)
    const result = await loadProjectFromDirectory(root)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.config.components[0].description).toBe('**Action documentation**')
    expect(result.data.config.connections[0]).toEqual(expect.objectContaining({
      id: 'call-api',
      source: { kind: 'component', id: 'action' },
      target: { kind: 'system', id: 'api' },
      endpoint: '/action',
    }))
  })

  it('rejects folders containing multiple project manifests', async () => {
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', manifest)
      .file('nested/other.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', component)
    const result = await loadProjectFromDirectory(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('exactly one')
  })

  it('requires the project manifest at the selected folder root', async () => {
    const root = new MemoryDirectory('project')
      .file('nested/project.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', component)
    const result = await loadProjectFromDirectory(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('folder root')
  })

  it('reports missing relative assets with the owning project path', async () => {
    const withAsset = component.replace('visual: { kind: hotspot,', 'visual: { kind: hotspot, src: assets/missing.png,')
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', withAsset)
    const result = await loadProjectFromDirectory(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('Missing asset "assets/missing.png"')
  })

  it('rejects asset paths that escape the selected project folder', async () => {
    const withEscapingAsset = component.replace('visual: { kind: hotspot,', 'visual: { kind: hotspot, src: ../../outside.png,')
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', withEscapingAsset)
    const result = await loadProjectFromDirectory(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('cannot contain ".."')
  })

  it('loads hosted component paths explicitly from the manifest', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/project.visiflow.md')) return new Response(manifest)
      if (url.endsWith('/screens/home/action.visiflow.md')) return new Response(component)
      return new Response('missing', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadProjectFromHttp('/demo/project.visiflow.md')
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    if (result.ok) expect(result.data.workspace.mode).toBe('http')
  })

  it('writes component documents before the synchronized manifest', async () => {
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', component)
    const loaded = await loadProjectFromDirectory(root)
    if (!loaded.ok) throw new Error(loaded.errors.join('\n'))
    const config = structuredClone(loaded.data.config)
    config.components[0].name = 'Edited action'
    config.components[0].description = 'Updated **Markdown** body.'
    config.connections[0].method = 'PUT'
    const saved = await saveProjectWorkspace(loaded.data.workspace, config)
    expect(saved.ok).toBe(true)
    expect(root.read('screens/home/action.visiflow.md')).toContain('name: Edited action')
    expect(root.read('screens/home/action.visiflow.md')).toContain('method: PUT')
    expect(root.read('screens/home/action.visiflow.md')).toContain('Updated **Markdown** body.')
    expect(root.read('project.visiflow.md')).toContain('screens/home/action.visiflow.md')
  })

  it('round-trips task definitions, task states, and task-owned timing in the manifest', async () => {
    const withTask = manifest
      .replace('tasks: []', `tasks:
  - id: sync
    name: Background sync
    type: Worker
    description: Synchronizes data.
    scope: { kind: app }
    trigger: { kind: polling, label: Every minute, intervalMs: 60000 }`)
      .replace('componentStates: {}, taskStates: {}', 'componentStates: {}, taskStates: { sync: inactive }')
      .replace('connections: []', `connections:
  - id: run-sync
    name: Run sync
    source: { kind: task, id: sync }
    target: { kind: system, id: api }
    protocol: HTTPS
    method: GET
    endpoint: /sync
    description: Synchronizes data.`)
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', withTask)
      .file('screens/home/action.visiflow.md', component)
    const loaded = await loadProjectFromDirectory(root)
    if (!loaded.ok) throw new Error(loaded.errors.join('\n'))

    expect(loaded.data.config.tasks[0].trigger.label).toBe('Every minute')
    expect(loaded.data.config.scenarios[0].taskStates.sync).toBe('inactive')
    expect(loaded.data.config.connections.find((item) => item.id === 'run-sync')?.cadence).toBeUndefined()

    const config = structuredClone(loaded.data.config)
    config.tasks[0].trigger.label = 'Every five minutes'
    const saved = await saveProjectWorkspace(loaded.data.workspace, config)
    expect(saved.ok).toBe(true)
    expect(root.read('project.visiflow.md')).toContain('Every five minutes')
    expect(root.read('project.visiflow.md')).toContain('taskStates')
  })

  it('reports partial write failures instead of marking the workspace saved', async () => {
    const root = new MemoryDirectory('project')
      .file('project.visiflow.md', manifest)
      .file('screens/home/action.visiflow.md', component)
    const loaded = await loadProjectFromDirectory(root)
    if (!loaded.ok) throw new Error(loaded.errors.join('\n'))
    const manifestHandle = root.children.get('project.visiflow.md') as MemoryFile
    manifestHandle.createWritable = async () => { throw new Error('disk full') }
    const config = structuredClone(loaded.data.config)
    config.components[0].name = 'Partially written'
    const saved = await saveProjectWorkspace(loaded.data.workspace, config)
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.errors[0]).toContain('disk full')
  })
})
