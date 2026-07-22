import { parseImportedFile } from './packFiles'
import type { LevelPack, PackLevel } from './types'

type PermissionMode = { mode: 'read' | 'readwrite' }
type LevelFileHandle = {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}
type DirectoryEntryHandle = LevelFileHandle | { kind: 'directory'; name: string }

export type LevelDirectoryHandle = {
  kind: 'directory'
  name: string
  values: () => AsyncIterableIterator<DirectoryEntryHandle>
  getFileHandle: (name: string, options: { create: true }) => Promise<LevelFileHandle>
  queryPermission: (options: PermissionMode) => Promise<PermissionState>
  requestPermission: (options: PermissionMode) => Promise<PermissionState>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<LevelDirectoryHandle>
  }
}

const DATABASE = 'sokoforge-files'
const STORE = 'handles'
const DIRECTORY_KEY = 'level-directory'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function supportsLevelDirectory(): boolean {
  return typeof window.showDirectoryPicker === 'function' && 'indexedDB' in window
}

export async function loadRememberedDirectory(): Promise<LevelDirectoryHandle | null> {
  if (!supportsLevelDirectory()) return null
  const database = await openDatabase()
  return new Promise<LevelDirectoryHandle | null>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).get(DIRECTORY_KEY)
    request.onsuccess = () => resolve((request.result as LevelDirectoryHandle | undefined) ?? null)
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}

export async function rememberDirectory(handle: LevelDirectoryHandle) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, DIRECTORY_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  database.close()
}

export async function requestDirectory(handle: LevelDirectoryHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (await handle.queryPermission({ mode }) === 'granted') return true
  return await handle.requestPermission({ mode }) === 'granted'
}

export async function scanDirectory(handle: LevelDirectoryHandle): Promise<PackLevel[]> {
  const levels: PackLevel[] = []
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file' || !/\.(json|xsb)$/i.test(entry.name)) continue
    try {
      const file = await entry.getFile()
      levels.push(...parseImportedFile(file.name, await file.text()))
    } catch {
      // Ignore unrelated or malformed files while scanning a mixed directory.
    }
  }
  return levels
}

export async function writePack(handle: LevelDirectoryHandle, name: string, pack: LevelPack) {
  const file = await handle.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(JSON.stringify(pack, null, 2))
  await writable.close()
}
