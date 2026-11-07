/**
 * Minimal promise-based IndexedDB wrapper.
 *
 * If IndexedDB is unavailable or blocked (e.g. some private-browsing modes) every
 * operation transparently falls back to an in-memory map for the current tab, and
 * `isPersistent()` reports false so the UI can warn the person.
 */

export type StoreName = 'signatures' | 'documents' | 'files'

const DB_NAME = 'KhutYek'
const DB_VERSION = 1
const STORES: StoreName[] = ['signatures', 'documents', 'files']

let dbPromise: Promise<IDBDatabase | null> | null = null
let persistent = true
let lastError: string | null = null
const memory: Record<StoreName, Map<string, unknown>> = {
  signatures: new Map(),
  documents: new Map(),
  files: new Map(),
}

export function isPersistent(): boolean {
  return persistent
}
export function storageError(): string | null {
  return lastError
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      persistent = false
      lastError = 'IndexedDB is not available in this browser.'
      resolve(null)
      return
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      persistent = false
      lastError = e instanceof Error ? e.message : 'Could not open local storage.'
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      persistent = false
      lastError = req.error?.message ?? 'Could not open local storage.'
      resolve(null)
    }
    req.onblocked = () => {
      persistent = false
      lastError = 'Local storage is blocked by another KhutYek tab. Close other tabs and reload.'
      resolve(null)
    }
  })
  return dbPromise
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Storage request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Storage transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted (is the disk full?)'))
  })
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  if (!db) return [...memory[store].values()] as T[]
  const tx = db.transaction(store, 'readonly')
  return wrap<T[]>(tx.objectStore(store).getAll())
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return memory[store].get(key) as T | undefined
  const tx = db.transaction(store, 'readonly')
  return wrap<T | undefined>(tx.objectStore(store).get(key))
}

export async function dbPut<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory[store].set(value.id, value)
    return
  }
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value)
  await txDone(tx)
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory[store].delete(key)
    return
  }
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await txDone(tx)
}

export async function dbClearAll(): Promise<void> {
  for (const s of STORES) memory[s].clear()
  const db = await openDb()
  if (!db) return
  const tx = db.transaction(STORES, 'readwrite')
  for (const s of STORES) tx.objectStore(s).clear()
  await txDone(tx)
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
    }
  } catch {
    /* ignore */
  }
  return null
}
