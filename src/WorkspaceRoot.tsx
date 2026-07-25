import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { VisiFlow } from './App'
import { parseConfig } from './config'
import { DiskConfigEditor, type EditorSelection } from './DiskConfigEditor'
import {
  defaultProjectUrl,
  loadProjectFromHttp,
  pickProjectDirectory,
  type ProjectLoadResult,
} from './project-loader'
import { saveProjectWorkspace } from './project-workspace'
import type { EndpointRef, LoadedProject, ProjectWorkspace, VisiFlowConfig } from './types'

type ProjectMode = 'view' | 'edit'
type History = { past: VisiFlowConfig[]; present: VisiFlowConfig; future: VisiFlowConfig[] }
type SaveStatus = { kind: 'idle' | 'saving' | 'saved' | 'error'; message: string }

interface ProjectSession {
  history: History
  workspace: ProjectWorkspace
  revision: number
}

function cloneWorkspace(workspace: ProjectWorkspace): ProjectWorkspace {
  return {
    ...workspace,
    manifest: structuredClone(workspace.manifest),
    components: new Map(workspace.components),
    connectionOwners: new Map(workspace.connectionOwners),
    pendingAssets: new Map(workspace.pendingAssets),
    obsoletePaths: new Set(workspace.obsoletePaths),
  }
}

function ProjectLaunch({ loading, errors, projectUrl, onProjectUrl, onOpen, onOpenUrl }: {
  loading: boolean
  errors: string[]
  projectUrl: string
  onProjectUrl: (value: string) => void
  onOpen: () => void
  onOpenUrl: () => void
}) {
  return <main className="project-launch">
    <div className="brand-mark"><i /><i /><i /></div>
    <p className="eyebrow">Application request atlas</p>
    <h1>{loading ? 'Loading VisiFlow project…' : 'Open a VisiFlow project'}</h1>
    <p>Select a folder to view and edit its <code>project.visiflow.md</code> project, or open a hosted project read-only.</p>
    {!loading && <div className="project-launch-actions">
      <button type="button" className="primary-button" onClick={onOpen}>Open</button>
      <span>or</span>
      <label><span className="sr-only">Project manifest URL</span><input aria-label="Project manifest URL" value={projectUrl} onChange={(event) => onProjectUrl(event.target.value)} /></label>
      <button type="button" className="secondary-button" onClick={onOpenUrl} disabled={!projectUrl.trim()}>Open Project URL</button>
    </div>}
    {errors.length > 0 && <div className="launch-errors" role="alert"><strong>Project could not be loaded</strong><ul>{errors.map((error) => <li key={error}><code>{error}</code></li>)}</ul></div>}
  </main>
}

function entityExists(config: VisiFlowConfig, selection: EditorSelection) {
  if (!selection.id) return selection.kind === 'app'
  if (selection.kind === 'screen') return config.screens.some((item) => item.id === selection.id)
  if (selection.kind === 'component') return config.components.some((item) => item.id === selection.id)
  if (selection.kind === 'task') return config.tasks.some((item) => item.id === selection.id)
  if (selection.kind === 'system') return config.systems.some((item) => item.id === selection.id)
  if (selection.kind === 'connection') return config.connections.some((item) => item.id === selection.id)
  if (selection.kind === 'scenario') return config.scenarios.some((item) => item.id === selection.id)
  return true
}

function viewerSelection(selection: EditorSelection | null): EndpointRef | null {
  if (!selection?.id) return null
  if (selection.kind === 'component' || selection.kind === 'task' || selection.kind === 'system') {
    return { kind: selection.kind, id: selection.id }
  }
  return null
}

export function WorkspaceRoot() {
  const [session, setSession] = useState<ProjectSession | null>(null)
  const [mode, setMode] = useState<ProjectMode>('view')
  const [loading, setLoading] = useState(window.location.protocol !== 'file:')
  const [loadResult, setLoadResult] = useState<ProjectLoadResult | null>(null)
  const [projectUrl, setProjectUrl] = useState(defaultProjectUrl())
  const [screenId, setScreenId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [savedRevision, setSavedRevision] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle', message: '' })
  const [saveSignal, setSaveSignal] = useState(0)

  const sessionRef = useRef(session)
  const generationRef = useRef(0)
  const savedRevisionRef = useRef(0)
  const requestedSaveRef = useRef(0)
  const processedSaveRef = useRef(0)
  const saveRunningRef = useRef(false)

  const config = session?.history.present ?? null
  const validation = useMemo(() => config ? parseConfig(config) : null, [config])
  const dirty = Boolean(session && session.revision !== savedRevision)
  const writable = session?.workspace.mode === 'directory'
  const activeScreenId = config?.screens.some((item) => item.id === screenId) ? screenId : config?.screens[0].id ?? ''
  const activeScenarioId = config?.scenarios.some((item) => item.id === scenarioId) ? scenarioId : config?.scenarios[0].id ?? ''
  const activeSelection = config && selection && entityExists(config, selection) ? selection : null

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const initializeProject = useCallback((project: LoadedProject) => {
    generationRef.current += 1
    requestedSaveRef.current = 0
    processedSaveRef.current = 0
    const initialScenario = project.config.scenarios.find((item) => item.id === project.config.initialScenarioId)
      ?? project.config.scenarios[0]
    setSession({
      history: { past: [], present: project.config, future: [] },
      workspace: project.workspace,
      revision: 0,
    })
    savedRevisionRef.current = 0
    setSavedRevision(0)
    setScreenId(initialScenario.screenId ?? project.config.app.initialScreenId)
    setScenarioId(initialScenario.id)
    setSelection(null)
    setMode('view')
    setSaveStatus({
      kind: 'idle',
      message: project.workspace.mode === 'directory'
        ? `Opened ${project.workspace.name}`
        : 'Read-only project · open a folder to edit',
    })
  }, [])

  useEffect(() => {
    if (window.location.protocol === 'file:') return
    let active = true
    void loadProjectFromHttp(defaultProjectUrl()).then((next) => {
      if (!active) return
      setLoadResult(next)
      if (next.ok) initializeProject(next.data)
      setLoading(false)
    })
    return () => { active = false }
  }, [initializeProject])

  const mayDiscardChanges = useCallback(() => {
    if (!session || !writable) return true
    const atRisk = dirty || saveRunningRef.current || saveStatus.kind === 'error' || validation?.ok === false
    return !atRisk || window.confirm('Open another project and discard changes that have not been written successfully?')
  }, [dirty, saveStatus.kind, session, validation, writable])

  const openFolder = useCallback(async () => {
    if (!mayDiscardChanges()) return
    setLoading(true)
    const next = await pickProjectDirectory()
    setLoadResult(next)
    if (next.ok) initializeProject(next.data)
    setLoading(false)
  }, [initializeProject, mayDiscardChanges])

  const openUrl = useCallback(async () => {
    if (!mayDiscardChanges()) return
    setLoading(true)
    const next = await loadProjectFromHttp(projectUrl)
    setLoadResult(next)
    if (next.ok) initializeProject(next.data)
    setLoading(false)
  }, [initializeProject, mayDiscardChanges, projectUrl])

  const commitConfig = useCallback((mutate: (draft: VisiFlowConfig) => void) => {
    setSession((current) => {
      if (!current) return current
      const next = structuredClone(current.history.present)
      mutate(next)
      return {
        ...current,
        revision: current.revision + 1,
        history: {
          past: [...current.history.past.slice(-79), current.history.present],
          present: next,
          future: [],
        },
      }
    })
    setSaveStatus({ kind: 'idle', message: 'Modified · saves when editing finishes' })
  }, [])

  const mutateWorkspace = useCallback((mutate: (draft: ProjectWorkspace) => void) => {
    setSession((current) => {
      if (!current) return current
      const workspace = cloneWorkspace(current.workspace)
      mutate(workspace)
      return { ...current, workspace, revision: current.revision + 1 }
    })
    setSaveStatus({ kind: 'idle', message: 'Modified · saves when editing finishes' })
  }, [])

  const undo = useCallback(() => {
    setSession((current) => {
      if (!current) return current
      const previous = current.history.past.at(-1)
      if (!previous) return current
      return {
        ...current,
        revision: current.revision + 1,
        history: {
          past: current.history.past.slice(0, -1),
          present: previous,
          future: [current.history.present, ...current.history.future],
        },
      }
    })
    setSaveStatus({ kind: 'idle', message: 'Undo applied · saving…' })
  }, [])

  const redo = useCallback(() => {
    setSession((current) => {
      if (!current) return current
      const next = current.history.future[0]
      if (!next) return current
      return {
        ...current,
        revision: current.revision + 1,
        history: {
          past: [...current.history.past.slice(-79), current.history.present],
          present: next,
          future: current.history.future.slice(1),
        },
      }
    })
    setSaveStatus({ kind: 'idle', message: 'Redo applied · saving…' })
  }, [])

  const drainSaves = useEffectEvent(async () => {
    if (saveRunningRef.current) return
    saveRunningRef.current = true
    let failed = false
    try {
      while (processedSaveRef.current < requestedSaveRef.current) {
        const request = requestedSaveRef.current
        const snapshot = sessionRef.current
        if (!snapshot || snapshot.workspace.mode !== 'directory') {
          processedSaveRef.current = request
          break
        }
        if (snapshot.revision === savedRevisionRef.current) {
          processedSaveRef.current = request
          continue
        }
        const parsed = parseConfig(snapshot.history.present)
        if (!parsed.ok) {
          processedSaveRef.current = request
          setSaveStatus({ kind: 'idle', message: `Fix configuration issue before saving: ${parsed.errors[0]}` })
          break
        }
        const generation = generationRef.current
        setSaveStatus({ kind: 'saving', message: `Saving ${snapshot.workspace.name}…` })
        const result = await saveProjectWorkspace(snapshot.workspace, snapshot.history.present)
        processedSaveRef.current = request
        if (generation !== generationRef.current) continue
        if (!result.ok) {
          failed = true
          setSaveStatus({ kind: 'error', message: result.errors[0] })
          break
        }
        savedRevisionRef.current = snapshot.revision
        setSavedRevision(snapshot.revision)
        setSession((current) => {
          if (!current || current.revision !== snapshot.revision) return current
          return { ...current, workspace: result.workspace }
        })
        setSaveStatus({
          kind: 'saved',
          message: sessionRef.current?.revision === snapshot.revision
            ? `Saved ${snapshot.workspace.name}`
            : 'Saved previous changes · newer edits remain modified',
        })
      }
    } finally {
      saveRunningRef.current = false
      if (!failed && processedSaveRef.current < requestedSaveRef.current) {
        queueMicrotask(() => { void drainSaves() })
      }
    }
  })

  const requestPersist = useCallback(() => {
    if (sessionRef.current?.workspace.mode !== 'directory') return
    requestedSaveRef.current += 1
    setSaveSignal((value) => value + 1)
  }, [])

  const enterEdit = useCallback(() => {
    if (!config || !writable) return
    if (activeSelection?.kind === 'component' && activeSelection.id) {
      const component = config.components.find((item) => item.id === activeSelection.id)
      if (component) setScreenId(component.screenId)
    } else if (activeSelection?.kind === 'task' && activeSelection.id) {
      const task = config.tasks.find((item) => item.id === activeSelection.id)
      if (task?.scope.kind === 'screen') setScreenId(task.scope.screenId)
    }
    setSelection(activeSelection ?? { kind: 'screen', id: activeScreenId })
    setMode('edit')
  }, [activeScreenId, activeSelection, config, writable])

  useEffect(() => {
    if (saveSignal) void drainSaves()
  }, [saveSignal])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!writable || (!dirty && saveStatus.kind !== 'saving' && saveStatus.kind !== 'error' && validation?.ok !== false)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saveStatus.kind, validation, writable])

  useEffect(() => {
    const enterEditWithTab = (event: KeyboardEvent) => {
      const target = event.target
      const isTyping = target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')
      if ((event.key !== 'Tab' && event.code !== 'Tab') || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || isTyping || !writable) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (mode === 'edit') {
        if (!validation?.ok) {
          setSaveStatus({ kind: 'idle', message: `Fix configuration issue before viewing: ${validation?.errors[0] ?? 'Invalid project'}` })
          return
        }
        requestPersist()
        setSelection((current) => viewerSelection(current))
        setMode('view')
        return
      }
      enterEdit()
    }
    window.addEventListener('keydown', enterEditWithTab, true)
    return () => window.removeEventListener('keydown', enterEditWithTab, true)
  }, [enterEdit, mode, requestPersist, validation, writable])

  if (!session || !config) return <ProjectLaunch
    loading={loading}
    errors={loadResult && !loadResult.ok ? loadResult.errors : []}
    projectUrl={projectUrl}
    onProjectUrl={setProjectUrl}
    onOpen={() => void openFolder()}
    onOpenUrl={() => void openUrl()}
  />

  const enterView = () => {
    if (!validation?.ok) {
      setSaveStatus({ kind: 'idle', message: `Fix configuration issue before viewing: ${validation?.errors[0] ?? 'Invalid project'}` })
      return
    }
    requestPersist()
    setSelection((current) => viewerSelection(current))
    setMode('view')
  }

  const controls = <div className="workspace-controls" aria-label="Project controls">
    <button type="button" className="secondary-button open-folder" onClick={() => void openFolder()}>Open</button>
    <div className="mode-controls">
    <div className="mode-switch" aria-label="Workspace mode">
      <button type="button" className={mode === 'view' ? 'active' : ''} aria-pressed={mode === 'view'} onClick={enterView} aria-label="View" title="View project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg></button>
      <button
        type="button"
        className={mode === 'edit' ? 'active' : ''}
        aria-pressed={mode === 'edit'}
        onClick={enterEdit}
        disabled={!writable}
        title={writable ? 'Edit this project (Shift + Tab)' : 'URL projects are read-only. Open a folder to edit.'}
      aria-label="Edit"
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" /><path d="m14.5 6 3.5 3.5" /></svg></button>
    </div>
      {mode === 'edit' && writable && <><span className={`save-indicator ${saveStatus.kind}`} title={saveStatus.message} aria-label={saveStatus.message}>
      {validation && !validation.ok ? 'Invalid' : saveStatus.kind === 'saving' ? 'Saving…' : saveStatus.kind === 'error' ? 'Save failed' : dirty ? 'Modified' : writable ? 'Saved' : 'Read-only'}
      </span></>}
    </div>
    {saveStatus.kind === 'error' && <button type="button" className="secondary-button retry-save" onClick={requestPersist}>Retry</button>}
  </div>

  if (mode === 'edit') {
    const editorSelection = activeSelection ?? { kind: 'screen' as const, id: activeScreenId }
    return <DiskConfigEditor
      config={config}
      workspace={session.workspace}
      selection={editorSelection}
      screenId={activeScreenId}
      scenarioId={activeScenarioId}
      dirty={dirty}
      canUndo={session.history.past.length > 0}
      canRedo={session.history.future.length > 0}
      statusMessage={validation && !validation.ok ? validation.errors[0] : saveStatus.message}
      statusKind={!validation?.ok ? 'invalid' : saveStatus.kind === 'error' ? 'error' : saveStatus.kind === 'saving' ? 'saving' : 'valid'}
      toolbarExtras={controls}
      onCommit={commitConfig}
      onWorkspaceChange={mutateWorkspace}
      onSelection={setSelection}
      onScreen={setScreenId}
      onScenario={setScenarioId}
      onUndo={undo}
      onRedo={redo}
      onPersistBoundary={requestPersist}
    />
  }

  return <VisiFlow
    config={config}
    navigation={{
      screenId: activeScreenId,
      scenarioId: activeScenarioId,
      selection: viewerSelection(activeSelection),
      onScreen: setScreenId,
      onScenario: setScenarioId,
      onSelection: setSelection,
    }}
    workspaceControls={controls}
  />
}
