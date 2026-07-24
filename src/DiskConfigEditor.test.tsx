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

  it('confirms and cascades deletion of referenced systems', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Payment APIapi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('button', { name: 'Payment APIapi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create paymentpay' })).not.toBeInTheDocument()
  })

  it('creates and edits first-class background tasks', () => {
    renderEditor()
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
