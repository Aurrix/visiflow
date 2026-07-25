import type { ProjectDirectoryHandle } from './project-loader'

const DATABASE = 'visiflow-workspace'
const STORE = 'recent-projects'
const LIMIT = 8

export interface RecentProject {
  id: number
  name: string
  openedAt: number
  handle: ProjectDirectoryHandle
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

async function allProjects(database: IDBDatabase): Promise<RecentProject[]> {
  return new Promise((resolve) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as RecentProject[]).sort((a, b) => b.openedAt - a.openedAt))
    request.onerror = () => resolve([])
  })
}

export async function recentProjects(): Promise<RecentProject[]> {
  const database = await openDatabase()
  if (!database) return []
  const projects = await allProjects(database)
  database.close()
  return projects.slice(0, LIMIT)
}

export async function rememberRecentProject(name: string, handle: ProjectDirectoryHandle): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  const projects = await allProjects(database)
  const existing = await Promise.all(projects.map(async (project) => ({ project, same: await project.handle.isSameEntry?.(handle) })))
  const transaction = database.transaction(STORE, 'readwrite')
  const store = transaction.objectStore(STORE)
  for (const { project, same } of existing) if (same || project.name === name) store.delete(project.id)
  store.add({ name, handle, openedAt: Date.now() })
  for (const project of projects.slice(LIMIT - 1)) store.delete(project.id)
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve() })
  database.close()
}

export async function forgetRecentProject(id: number): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  const transaction = database.transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).delete(id)
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve() })
  database.close()
}
