import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiskConfigEditor } from './DiskConfigEditor'
import { scaledContentHeight } from './editor-utils'
import { assembleProject } from './project-format'
import { testConfig } from './test-fixture'

function editorProject() {
  const connection = testConfig.connections[0]
  const assembled = assembleProject('project.visiflow.md', {
    visiflow: 2,
    kind: 'project',
    app: {
      id: testConfig.app.id,
      name: testConfig.app.name,
      platform: testConfig.app.platform,
      device: testConfig.app.device,
      initialScreenId: testConfig.app.initialScreenId,
    },
    screens: testConfig.screens,
    tasks: testConfig.tasks,
    systems: testConfig.systems,
    scenarios: testConfig.scenarios,
    initialScenarioId: testConfig.initialScenarioId,
    componentFiles: ['screens/home/button.visiflow.md'],
    connections: [],
  }, testConfig.app.description, [{
    path: 'screens/home/button.visiflow.md',
    body: testConfig.components[0].description,
    meta: {
      visiflow: 2,
      kind: 'component',
      id: testConfig.components[0].id,
      screenId: testConfig.components[0].screenId,
      name: testConfig.components[0].name,
      type: testConfig.components[0].type,
      visual: testConfig.components[0].visual,
      calls: [{
        id: connection.id,
        name: connection.name,
        direction: 'outgoing',
        peer: connection.target,
        protocol: connection.protocol,
        method: connection.method,
        endpoint: connection.endpoint,
        description: connection.description,
        cadence: connection.cadence,
      }],
    },
  }], 'directory')
  if (!assembled.ok) throw new Error(assembled.errors.join('\n'))
  return assembled.data
}

function EditorHarness({ project = editorProject() }: { project?: ReturnType<typeof editorProject> }) {
  const [history, setHistory] = useState({ past: [] as typeof project.config[], present: project.config, future: [] as typeof project.config[] })
  const [workspace, setWorkspace] = useState(project.workspace)
  const [selection, setSelection] = useState<Parameters<typeof DiskConfigEditor>[0]['selection']>({ kind: 'screen', id: project.config.app.initialScreenId })
  const [screenId, setScreenId] = useState(project.config.app.initialScreenId)
  const [scenarioId, setScenarioId] = useState(project.config.initialScenarioId ?? project.config.scenarios[0].id)
  const initial = JSON.stringify(project.config)
  const commit: Parameters<typeof DiskConfigEditor>[0]['onCommit'] = (mutate) => {
    setHistory((current) => {
      const next = structuredClone(current.present)
      mutate(next)
      return { past: [...current.past, current.present], present: next, future: [] }
    })
  }
  return <DiskConfigEditor
    config={history.present}
    workspace={workspace}
    selection={selection}
    screenId={screenId}
    scenarioId={scenarioId}
    dirty={JSON.stringify(history.present) !== initial}
    canUndo={history.past.length > 0}
    canRedo={history.future.length > 0}
    statusMessage="Test session"
    statusKind="valid"
    onCommit={commit}
    onWorkspaceChange={(mutate) => setWorkspace((current) => {
      const next = {
        ...current,
        manifest: structuredClone(current.manifest),
        components: new Map(current.components),
        connectionOwners: new Map(current.connectionOwners),
        pendingAssets: new Map(current.pendingAssets),
        obsoletePaths: new Set(current.obsoletePaths),
      }
      mutate(next)
      return next
    })}
    onSelection={setSelection}
    onScreen={setScreenId}
    onScenario={setScenarioId}
    onUndo={() => setHistory((current) => {
      const previous = current.past.at(-1)
      return previous
        ? { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
        : current
    })}
    onRedo={() => setHistory((current) => {
      const next = current.future[0]
      return next
        ? { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
        : current
    })}
    onPersistBoundary={() => undefined}
  />
}

const renderEditor = (project = editorProject()) => render(<EditorHarness project={project} />)

describe('visual config editor', () => {
  it('maps high-density screenshots into logical screen coordinates', () => {
    expect(scaledContentHeight(390, 1170, 3000)).toBe(1000)
  })

  it('edits app metadata through forms and supports undo', () => {
    renderEditor()

    expect(screen.queryByRole('textbox', { name: 'JSON configuration' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Test AppApp settings/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited App' } })
    expect(screen.getByRole('button', { name: /Edited AppApp settings/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: /Test AppApp settings/i })).toBeInTheDocument()
  })

  it('draws a new screenshot region on the device canvas', () => {
    const { container } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Add component' }))

    const canvas = container.querySelector('.editor-screen-canvas') as HTMLDivElement
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, toJSON: () => ({}) }),
    })
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 150, clientY: 220 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 280, clientY: 320 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 280, clientY: 320 })

    expect(screen.getAllByText('New component').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Mode')).toHaveValue('region')
    expect(screen.getByLabelText('X')).toHaveValue(150)
    expect(screen.getByLabelText('Width')).toHaveValue(130)
  })

  it('undos a component resize through the global Ctrl/Command + Z shortcut', () => {
    const { container } = renderEditor()
    const canvas = container.querySelector('.editor-screen-canvas') as HTMLDivElement
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, toJSON: () => ({}) }),
    })
    fireEvent.click(screen.getByRole('button', { name: /Pay buttonbutton/i }))
    const resizeHandle = screen.getByRole('button', { name: 'Resize Pay button' })
    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerUp(resizeHandle, { pointerId: 1, clientX: 180, clientY: 160 })

    expect(screen.getByLabelText('Width')).toHaveValue(160)
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(false)
    expect(screen.getByLabelText('Width')).toHaveValue(100)
  })

  it('uses Ctrl-resize to update the shared radius instead of leaving a state override active', () => {
    const project = editorProject()
    const component = project.config.components[0]
    component.visual.states = { active: { borderRadius: 6 }, inactive: { borderRadius: 18 } }
    project.config.scenarios[0].componentStates[component.id] = 'active'
    const { container } = renderEditor(project)
    const canvas = container.querySelector('.editor-screen-canvas') as HTMLDivElement
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, toJSON: () => ({}) }),
    })

    fireEvent.click(screen.getByRole('button', { name: /Pay buttonbutton/i }))
    const resizeHandle = screen.getByRole('button', { name: 'Resize Pay button' })
    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(resizeHandle, { pointerId: 1, clientX: 180, clientY: 120, ctrlKey: true })
    fireEvent.pointerUp(resizeHandle, { pointerId: 1, clientX: 180, clientY: 120, ctrlKey: true })

    expect(screen.getByLabelText('Radius')).toHaveValue(20)
    expect((container.querySelector('.editor-component-box.selected') as HTMLDivElement).style.borderRadius).toBe('20px')
  })

  it('uses Ctrl-resize for radius mode on a texture overlay', () => {
    const project = editorProject()
    const component = project.config.components[0]
    project.config.textureLayers = [{ id: 'ride-texture', name: 'Ride texture', src: 'data:image/png;base64,', x: 0, y: 0, width: 390, height: 844, order: 0 }]
    component.visual.textureCrop = { textureId: 'ride-texture', x: 20, y: 30, width: 160, height: 80 }
    const { container } = renderEditor(project)
    fireEvent.click(screen.getByRole('button', { name: 'Textures' }))
    fireEvent.click(screen.getByRole('button', { name: /Pay buttonbutton/i }))
    const board = container.querySelector('.texture-canvas') as HTMLDivElement
    Object.defineProperty(board, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 960, bottom: 900, width: 960, height: 900, toJSON: () => ({}) }),
    })
    const handle = container.querySelector('.texture-resize-handle') as HTMLElement
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 180, clientY: 120, ctrlKey: true })
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 180, clientY: 120, ctrlKey: true })

    expect(screen.getByLabelText('Radius')).toHaveValue(40)
    expect(screen.getByLabelText('Width')).toHaveValue(100)

    const textureComponent = container.querySelector('.texture-component') as HTMLElement
    fireEvent.pointerDown(textureComponent, { pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(board, { pointerId: 2, clientX: 240, clientY: 180 })
    fireEvent.pointerUp(board, { pointerId: 2, clientX: 240, clientY: 180 })

    expect((container.querySelector('.texture-component') as HTMLElement).style.width).toBe('160px')
    expect(screen.getByLabelText('Width')).toHaveValue(100)

    fireEvent.pointerDown(handle, { pointerId: 3, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(board, { pointerId: 3, clientX: 330, clientY: 200 })
    fireEvent.pointerUp(board, { pointerId: 3, clientX: 330, clientY: 200 })

    expect(screen.getByLabelText('Width')).toHaveValue(100)
  })

  it('confirms and cascades deletion of referenced systems', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Payment APIapi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('button', { name: 'Payment APIapi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create paymentpay' })).not.toBeInTheDocument()
  })

  it('creates and edits first-class background tasks', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    expect(screen.getByRole('heading', { name: 'New task' })).toBeInTheDocument()
    expect(screen.getByLabelText('Scope')).toHaveValue('screen')
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'app' } })
    fireEvent.change(screen.getByLabelText('Trigger'), { target: { value: 'polling' } })
    fireEvent.change(screen.getByLabelText('Trigger label'), { target: { value: 'Every minute' } })

    expect(screen.getByLabelText('Scope')).toHaveValue('app')
    expect(screen.getByLabelText('Trigger')).toHaveValue('polling')
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Normalnormal' }))
    expect(screen.getByText('Task states')).toBeInTheDocument()
    expect(screen.getAllByText('New task').length).toBeGreaterThan(0)
  })

  it('authors screen groups, parents, and sibling order without offering descendants as parents', () => {
    const project = editorProject()
    project.config.screens[0].group = 'Checkout'
    project.config.screens.push({ id: 'receipt', name: 'Receipt', parentId: 'home', order: 2, width: 390, height: 844 })
    renderEditor(project)

    fireEvent.click(screen.getByRole('button', { name: /Homehome/i }))
    expect(screen.getByLabelText('Group')).toHaveValue('Checkout')
    expect(screen.getByLabelText('Sibling order')).toBeInTheDocument()
    expect(screen.getByLabelText('Parent screen').querySelector('option[value="receipt"]')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Home' }))
    fireEvent.click(screen.getByRole('button', { name: /Receiptreceipt/i }))
    expect(screen.getByLabelText('Parent screen')).toHaveValue('home')
    expect(screen.getByText(/Group inherited from the root screen/)).toHaveTextContent('Checkout')
    fireEvent.change(screen.getByLabelText('Parent screen'), { target: { value: '' } })
    expect(screen.getByLabelText('Group')).toHaveValue('Checkout')
  })

  it('promotes child screens and preserves their effective group when a parent is deleted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const project = editorProject()
    project.config.screens[0].group = 'Checkout'
    project.config.screens.push({ id: 'receipt', name: 'Receipt', parentId: 'home', order: 2, width: 390, height: 844 })
    renderEditor(project)

    fireEvent.click(screen.getByRole('button', { name: /Homehome/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('heading', { name: 'Receipt' })).toBeInTheDocument()
    expect(screen.getByLabelText('Parent screen')).toHaveValue('')
    expect(screen.getByLabelText('Group')).toHaveValue('Checkout')
  })

  it('disables saving when a form change makes the configuration invalid', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Test AppApp settings/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('app.name')
  })

  it('edits owned calls directly from the component inspector', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Pay buttonbutton' }))
    expect(screen.getByText('Calls and endpoints')).toBeInTheDocument()
    expect(screen.getByLabelText('Endpoint')).toHaveValue('/payments')
    expect(screen.getByLabelText('Protocol')).toHaveValue('HTTPS')
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'PUT' } })
    expect(screen.getByLabelText('Method')).toHaveValue('PUT')
  })

  it('shows calls owned by another component as derived and links to the owner', () => {
    const project = editorProject()
    project.config.components.push({
      id: 'receipt',
      screenId: 'home',
      name: 'Receipt',
      type: 'Summary',
      description: 'Shows the result.',
      visual: { kind: 'hotspot', x: 140, y: 80, width: 100, height: 40 },
    })
    project.config.connections[0].target = { kind: 'component', id: 'receipt' }
    renderEditor(project)
    fireEvent.click(screen.getByRole('button', { name: 'Receiptreceipt' }))
    expect(screen.getByText(/Owned by button/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open owning component' }))
    expect(screen.getByRole('heading', { name: 'Pay button' })).toBeInTheDocument()
  })
})
