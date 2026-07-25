import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectDirectoryHandle, ProjectFileHandle, WritableHandle } from './project-loader'
import { WorkspaceRoot } from './WorkspaceRoot'

class MemoryFile implements ProjectFileHandle {
  readonly kind = 'file'
  failWrites = 0
  constructor(public name: string, public content: string) {}
  async getFile() { return new File([this.content], this.name, { type: 'text/markdown' }) }
  async createWritable(): Promise<WritableHandle> {
    return {
      write: async (data) => {
        if (this.failWrites > 0) {
          this.failWrites -= 1
          throw new Error('Simulated write failure')
        }
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
      const created = new MemoryDirectory(part)
      current.children.set(part, created)
      return created
    }, this)
    directory.children.set(name, new MemoryFile(name, content))
    return this
  }
  read(path: string) {
    const parts = path.split('/')
    const name = parts.pop()!
    const directory = parts.reduce<MemoryDirectory | undefined>((current, part) => {
      const entry = current?.children.get(part)
      return entry instanceof MemoryDirectory ? entry : undefined
    }, this)
    const file = directory?.children.get(name)
    return file instanceof MemoryFile ? file.content : undefined
  }
  handle(path: string) {
    const parts = path.split('/')
    const name = parts.pop()!
    const directory = parts.reduce<MemoryDirectory | undefined>((current, part) => {
      const entry = current?.children.get(part)
      return entry instanceof MemoryDirectory ? entry : undefined
    }, this)
    const file = directory?.children.get(name)
    return file instanceof MemoryFile ? file : undefined
  }
}

const manifest = `---
visiflow: 2
kind: project
app: { id: test, name: Test App, platform: Web, device: web, initialScreenId: home }
screens:
  - { id: home, name: Home, width: 390, height: 844 }
tasks: []
systems: []
scenarios:
  - { id: normal, name: Normal, screenId: home, componentStates: {}, taskStates: {} }
initialScenarioId: normal
componentFiles:
  - screens/home/action.visiflow.md
connections: []
---

Test project`

const component = `---
visiflow: 2
kind: component
id: action
screenId: home
name: Action
type: Button
visual: { kind: button, x: 20, y: 80, width: 100, height: 40, text: Go }
calls: []
---

Action documentation`

function projectFolder() {
  return new MemoryDirectory('workspace')
    .file('project.visiflow.md', manifest)
    .file('screens/home/action.visiflow.md', component)
}

async function openFolder(root = projectFolder()) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })))
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => root))
  render(<WorkspaceRoot />)
  expect(await screen.findByRole('heading', { name: 'Open a VisiFlow project' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByText('Application request atlas')
  return root
}

describe('unified workspace', () => {
  it('offers folder and URL loading when hosted auto-loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })))
    render(<WorkspaceRoot />)
    expect(await screen.findByRole('heading', { name: 'Open a VisiFlow project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByLabelText('Project manifest URL')).toHaveValue('demo/project.visiflow.md')
    expect(screen.getByRole('button', { name: 'Open project URL' })).toBeInTheDocument()
  })

  it('hands a selected viewer component directly to the editor', async () => {
    await openFolder()
    fireEvent.click(screen.getByRole('button', { name: 'Action, active' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Action')
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0)
  })

  it('does not show an error when folder selection is cancelled', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => { throw new DOMException('Cancelled', 'AbortError') }))
    render(<WorkspaceRoot />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('enters edit mode with Shift + Tab outside text-entry controls', async () => {
    await openFolder()
    const enteredEdit = fireEvent.keyDown(screen.getByRole('button', { name: 'Action, active' }), { key: 'Tab', code: 'Tab', shiftKey: true })
    expect(enteredEdit).toBe(false)
    expect(document.querySelector('.disk-editor')).toBeInTheDocument()
    const returnedToView = fireEvent.keyDown(document.querySelector('.disk-editor')!, { key: 'Tab', code: 'Tab', shiftKey: true })
    expect(returnedToView).toBe(false)
    expect(document.querySelector('.disk-editor')).not.toBeInTheDocument()
  })

  it('saves valid field changes on blur and exposes the shared draft in View', async () => {
    const root = await openFolder()
    fireEvent.click(screen.getByRole('button', { name: 'Action, active' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Renamed action' } })
    expect(root.read('screens/home/action.visiflow.md')).toContain('name: Action')
    fireEvent.blur(name)
    await waitFor(() => expect(root.read('screens/home/action.visiflow.md')).toContain('name: Renamed action'))
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByRole('button', { name: 'Renamed action, active' })).toBeInTheDocument()
  })

  it('keeps invalid drafts in Edit and does not write them', async () => {
    const root = await openFolder()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /Test AppApp settings/i }))
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.blur(name)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(document.querySelector('.disk-editor')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('app.name')
    expect(root.read('project.visiflow.md')).toContain('name: Test App')
  })

  it('retains failed changes for Retry and persists undo revisions', async () => {
    const root = await openFolder()
    fireEvent.click(screen.getByRole('button', { name: 'Action, active' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    root.handle('screens/home/action.visiflow.md')!.failWrites = 1
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Retry action' } })
    fireEvent.blur(name)
    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(root.read('screens/home/action.visiflow.md')).toContain('name: Retry action'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(root.read('screens/home/action.visiflow.md')).toContain('name: Action'))
  })

  it('keeps URL projects read-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('action.visiflow.md')) return new Response(component)
      return new Response(manifest)
    }))
    render(<WorkspaceRoot />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open demo' }))
    const edit = await screen.findByRole('button', { name: 'Edit' })
    expect(edit).toBeDisabled()
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument()
  })
})
