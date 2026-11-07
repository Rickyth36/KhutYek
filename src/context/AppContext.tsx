import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppSettings, DocumentRecord, Placement, SavedSignature, StoredFiles } from '../types'
import { dbClearAll, dbDelete, dbGet, dbGetAll, dbPut, isPersistent, storageError } from '../lib/db'
import { fileCache } from '../lib/fileCache'
import { errorMessage, uid } from '../lib/utils'

export type Theme = 'light' | 'dark' | 'system'
export interface Toast {
  id: string
  kind: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  ready: boolean
  persistent: boolean
  storageWarning: string | null
  signatures: SavedSignature[]
  documents: DocumentRecord[]
  settings: AppSettings
  theme: Theme
  toasts: Toast[]
  setTheme(t: Theme): void
  setKeepCopies(v: boolean): void
  notify(kind: Toast['kind'], message: string): void
  dismissToast(id: string): void
  addSignature(input: { name: string; dataUrl: string; width: number; height: number }): Promise<SavedSignature>
  updateSignature(id: string, patch: Partial<Pick<SavedSignature, 'name' | 'dataUrl' | 'width' | 'height'>>): Promise<void>
  deleteSignature(id: string): Promise<void>
  /** Create a document record. The blob is kept in memory for this tab and, if enabled, in IndexedDB. */
  addDocument(file: File, pageCount: number): Promise<DocumentRecord>
  updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void>
  deleteDocument(id: string): Promise<void>
  getOriginal(id: string): Promise<Blob | undefined>
  /** Re-attach an original PDF to an existing record (when it was not kept or has expired). */
  attachOriginal(id: string, file: File, pageCount: number): Promise<void>
  getSigned(id: string): Promise<{ blob: Blob; name: string } | undefined>
  saveSigned(id: string, blob: Blob, name: string): Promise<void>
  clearAll(): Promise<void>
}

const Ctx = createContext<AppState | null>(null)

const SETTINGS_KEY = 'KhutYek:settings'
const THEME_KEY = 'KhutYek:theme'
const defaultSettings: AppSettings = { keepCopies: true }

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [signatures, setSignatures] = useState<SavedSignature[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [persistent, setPersistent] = useState(true)
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = readLS(SETTINGS_KEY)
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings
    } catch {
      return defaultSettings
    }
  })
  const [theme, setThemeState] = useState<Theme>(() => (readLS(THEME_KEY) as Theme) || 'system')
  // Latest documents for use inside async callbacks without stale closures.
  const docsRef = useRef<DocumentRecord[]>([])
  docsRef.current = documents
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = uid()
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000)
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  // Initial load
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [sigs, docs] = await Promise.all([dbGetAll<SavedSignature>('signatures'), dbGetAll<DocumentRecord>('documents')])
        if (!alive) return
        setSignatures(sigs.sort((a, b) => b.createdAt - a.createdAt))
        setDocuments(docs.sort((a, b) => b.updatedAt - a.updatedAt))
      } catch (e) {
        if (alive) setStorageWarning(`Could not read your saved data: ${errorMessage(e)}`)
      } finally {
        if (alive) {
          setPersistent(isPersistent())
          if (!isPersistent()) setStorageWarning(storageError() ?? 'Local storage is unavailable.')
          setReady(true)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Theme
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    writeLS(THEME_KEY, t)
  }, [])

  const setKeepCopies = useCallback((v: boolean) => {
    const next = { ...settingsRef.current, keepCopies: v }
    setSettings(next)
    writeLS(SETTINGS_KEY, JSON.stringify(next))
  }, [])

  /** Persist and surface errors instead of letting them vanish. */
  const guard = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn()
      } catch (e) {
        const quota = e instanceof DOMException && e.name === 'QuotaExceededError'
        const msg = quota ? 'Browser storage is full. Delete some documents or signatures and try again.' : errorMessage(e)
        notify('error', `${label}: ${msg}`)
        throw e
      }
    },
    [notify],
  )

  const addSignature: AppState['addSignature'] = useCallback(
    async (input) => {
      const now = Date.now()
      const sig: SavedSignature = { id: uid(), createdAt: now, updatedAt: now, ...input, name: input.name.trim() || 'Untitled signature' }
      await guard('Could not save signature', () => dbPut('signatures', sig))
      setSignatures((s) => [sig, ...s])
      return sig
    },
    [guard],
  )

  const updateSignature: AppState['updateSignature'] = useCallback(
    async (id, patch) => {
      let next: SavedSignature | undefined
      setSignatures((all) =>
        all.map((s) => {
          if (s.id !== id) return s
          next = { ...s, ...patch, name: (patch.name ?? s.name).trim() || s.name, updatedAt: Date.now() }
          return next
        }),
      )
      // setState updaters run synchronously enough for this; fall back to a DB read if not.
      const current = next ?? (await dbGet<SavedSignature>('signatures', id))
      if (!current) return
      await guard('Could not update signature', () => dbPut('signatures', { ...current, ...patch, updatedAt: Date.now() }))
    },
    [guard],
  )

  const deleteSignature: AppState['deleteSignature'] = useCallback(
    async (id) => {
      await guard('Could not delete signature', () => dbDelete('signatures', id))
      setSignatures((s) => s.filter((x) => x.id !== id))
    },
    [guard],
  )

  const addDocument: AppState['addDocument'] = useCallback(
    async (file, pageCount) => {
      const now = Date.now()
      const id = uid()
      fileCache.set(id, file)
      let hasOriginal = false
      if (settingsRef.current.keepCopies) {
        try {
          const rec: StoredFiles = { id, original: file }
          await dbPut('files', rec)
          hasOriginal = true
        } catch {
          notify('info', 'The PDF is too large to keep in browser storage. It can be reopened until you refresh the page.')
        }
      }
      const doc: DocumentRecord = {
        id,
        name: file.name,
        size: file.size,
        pageCount,
        status: 'uploaded',
        createdAt: now,
        updatedAt: now,
        hasOriginal,
        hasSigned: false,
        placements: [],
      }
      await guard('Could not save document record', () => dbPut('documents', doc))
      setDocuments((d) => [doc, ...d])
      return doc
    },
    [guard, notify],
  )

  const updateDocument: AppState['updateDocument'] = useCallback(
    async (id, patch) => {
      const existing = docsRef.current.find((d) => d.id === id) ?? (await dbGet<DocumentRecord>('documents', id))
      if (!existing) return
      const next: DocumentRecord = { ...existing, ...patch, updatedAt: Date.now() }
      docsRef.current = docsRef.current.map((d) => (d.id === id ? next : d))
      setDocuments((all) => all.map((d) => (d.id === id ? next : d)).sort((a, b) => b.updatedAt - a.updatedAt))
      await guard('Could not update document', () => dbPut('documents', next))
    },
    [guard],
  )

  const deleteDocument: AppState['deleteDocument'] = useCallback(
    async (id) => {
      await guard('Could not delete document', async () => {
        await dbDelete('documents', id)
        await dbDelete('files', id)
      })
      fileCache.delete(id)
      setDocuments((d) => d.filter((x) => x.id !== id))
    },
    [guard],
  )

  const getOriginal: AppState['getOriginal'] = useCallback(async (id) => {
    const cached = fileCache.get(id)
    if (cached) return cached
    try {
      const rec = await dbGet<StoredFiles>('files', id)
      if (rec?.original) {
        fileCache.set(id, rec.original)
        return rec.original
      }
    } catch {
      /* ignore */
    }
    return undefined
  }, [])

  const attachOriginal: AppState['attachOriginal'] = useCallback(
    async (id, file, pageCount) => {
      fileCache.set(id, file)
      let kept = false
      if (settingsRef.current.keepCopies) {
        try {
          const prev = await dbGet<StoredFiles>('files', id)
          await dbPut('files', { ...prev, id, original: file })
          kept = true
        } catch {
          notify('info', 'The PDF is too large to keep in browser storage. It can be reopened until you refresh the page.')
        }
      }
      await updateDocument(id, { hasOriginal: kept, pageCount })
    },
    [notify, updateDocument],
  )

  const getSigned: AppState['getSigned'] = useCallback(async (id) => {
    try {
      const rec = await dbGet<StoredFiles>('files', id)
      if (rec?.signed) return { blob: rec.signed, name: rec.signedName ?? 'signed-document.pdf' }
    } catch {
      /* ignore */
    }
    return undefined
  }, [])

  const saveSigned: AppState['saveSigned'] = useCallback(
    async (id, blob, name) => {
      if (!settingsRef.current.keepCopies) return
      try {
        const prev = await dbGet<StoredFiles>('files', id)
        await dbPut('files', { ...prev, id, signed: blob, signedName: name })
        await updateDocument(id, { hasSigned: true })
      } catch {
        notify('info', 'The signed PDF was downloaded but is too large to keep in browser storage.')
      }
    },
    [notify, updateDocument],
  )

  const clearAll: AppState['clearAll'] = useCallback(async () => {
    await guard('Could not delete data', async () => {
      await dbClearAll()
    })
    fileCache.clear()
    try {
      localStorage.removeItem(SETTINGS_KEY)
    } catch {
      /* ignore */
    }
    setSignatures([])
    setDocuments([])
    setSettings(defaultSettings)
  }, [guard])

  const value = useMemo<AppState>(
    () => ({
      ready,
      persistent,
      storageWarning,
      signatures,
      documents,
      settings,
      theme,
      toasts,
      setTheme,
      setKeepCopies,
      notify,
      dismissToast,
      addSignature,
      updateSignature,
      deleteSignature,
      addDocument,
      updateDocument,
      deleteDocument,
      getOriginal,
      attachOriginal,
      getSigned,
      saveSigned,
      clearAll,
    }),
    [ready, persistent, storageWarning, signatures, documents, settings, theme, toasts, setTheme, setKeepCopies, notify, dismissToast, addSignature, updateSignature, deleteSignature, addDocument, updateDocument, deleteDocument, getOriginal, attachOriginal, getSigned, saveSigned, clearAll],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside <AppProvider>')
  return v
}

export type { Placement }
