import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Eye, FileText, FileWarning, Maximize2, PanelRight, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ThemeToggle } from '../components/Layout'
import { SignatureDialog } from '../components/SignatureDialog'
import { Spinner } from '../components/ui'
import { PdfPageView } from './PdfPageView'
import { PlacementOverlay } from './PlacementOverlay'
import { PropertiesPanel } from './PropertiesPanel'
import { PreviewDialog } from './PreviewDialog'
import { ExportDialog } from './ExportDialog'
import { useHistory } from './useHistory'
import { exportSignedPdf } from '../lib/exportPdf'
import { destroyPdf, openPdf, validatePdfFile, type PDFDocumentProxy } from '../lib/pdf'
import { clamp, downloadBlob, errorMessage, formatBytes, uid } from '../lib/utils'
import type { Placement, SavedSignature } from '../types'

const SIG_MIME = 'application/x-KhutYek-signature'
const GAP = 16
const PAD_TOP = 24
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]

type Phase = 'loading' | 'ready' | 'missing' | 'error' | 'notfound'
interface Size {
  w: number
  h: number
}

function FullScreenMessage({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">{icon}</div>
      <p className="text-lg font-semibold">{title}</p>
      <div className="max-w-md text-sm text-slate-500 dark:text-slate-400">{children}</div>
    </div>
  )
}

export default function Editor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ready, documents, signatures, getOriginal, attachOriginal, updateDocument, saveSigned, notify } = useApp()
  const doc = documents.find((d) => d.id === id)
  const docRef = useRef(doc)
  docRef.current = doc
  const docExists = !!doc

  const [phase, setPhase] = useState<Phase>('loading')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<Size[]>([])
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1024)
  const [creating, setCreating] = useState(false)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'export' | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')

  const history = useHistory<Placement[]>([])
  const placements = history.present
  const sigMap = useMemo(() => new Map(signatures.map((s) => [s.id, s] as const)), [signatures])

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageEls = useRef<(HTMLDivElement | null)[]>([])
  const pendingScroll = useRef<number | null>(null)

  /* ------------------------------ loading ------------------------------ */
  useEffect(() => {
    if (!ready) return
    if (!docRef.current) {
      setPhase('notfound')
      return
    }
    let alive = true
    let loaded: PDFDocumentProxy | null = null
    setPhase('loading')
    ;(async () => {
      try {
        const blob = await getOriginal(id)
        if (!blob) {
          if (alive) setPhase('missing')
          return
        }
        loaded = await openPdf(blob)
        const s: Size[] = []
        for (let i = 1; i <= loaded.numPages; i++) {
          const v = (await loaded.getPage(i)).getViewport({ scale: 1 })
          s.push({ w: v.width, h: v.height })
          if (i % 25 === 0) await new Promise((r) => setTimeout(r, 0)) // keep the UI responsive on huge files
          if (!alive) return
        }
        if (!alive) return
        const saved = docRef.current?.placements ?? []
        const valid = saved.filter((p) => p.page < s.length)
        history.reset(valid)
        savedJson.current = JSON.stringify(valid)
        setSizes(s)
        setPdf(loaded)
        const avail = (scrollRef.current?.clientWidth ?? window.innerWidth - 500) - 64
        setZoom(clamp(avail / s[0].w, 0.4, 1.25))
        setCurrentPage(0)
        setSelectedId(null)
        setPhase('ready')
      } catch (e) {
        if (alive) {
          setLoadError(errorMessage(e))
          setPhase('error')
        }
      }
    })()
    return () => {
      alive = false
      destroyPdf(loaded)
      setPdf(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id, docExists, reloadKey])

  /* ------------------------------ autosave ------------------------------ */
  const savedJson = useRef('[]')
  const latest = useRef<Placement[]>([])
  latest.current = placements
  const flush = useCallback(() => {
    const json = JSON.stringify(latest.current)
    if (json === savedJson.current) return
    savedJson.current = json
    void updateDocument(id, { placements: latest.current, status: latest.current.length ? 'in-progress' : 'uploaded' }).then(() => setSaveState('saved'))
  }, [id, updateDocument])
  useEffect(() => {
    if (phase !== 'ready') return
    if (JSON.stringify(placements) === savedJson.current) return
    setSaveState('saving')
    const t = setTimeout(flush, 500)
    return () => clearTimeout(t)
  }, [placements, phase, flush])
  useEffect(
    () => () => {
      if (phaseRef.current === 'ready') flush()
    },
    [flush],
  )
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  /* ------------------------------ layout / zoom ------------------------------ */
  const tops = useMemo(() => {
    const t: number[] = []
    let y = PAD_TOP
    for (const s of sizes) {
      t.push(y)
      y += s.h * zoom + GAP
    }
    return t
  }, [sizes, zoom])

  // After an explicit page jump the target page stays "current" until the person scrolls by hand,
  // otherwise short pages (several visible at once) or the end of the document would flip the indicator.
  const navLock = useRef(false)
  const navTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const goToPage = useCallback(
    (i: number) => {
      const n = clamp(i, 0, sizes.length - 1)
      setCurrentPage(n)
      navLock.current = true
      clearTimeout(navTimer.current)
      navTimer.current = setTimeout(() => (navLock.current = false), 1200)
      scrollRef.current?.scrollTo({ top: Math.max(0, tops[n] - 12), behavior: 'smooth' })
    },
    [sizes.length, tops],
  )

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !tops.length || navLock.current) return
    const probe = el.scrollTop + el.clientHeight * 0.4
    let lo = 0
    let hi = tops.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (tops[mid] <= probe) lo = mid
      else hi = mid - 1
    }
    setCurrentPage(lo)
  }, [tops])

  const changeZoom = useCallback((next: number) => {
    const el = scrollRef.current
    if (el) pendingScroll.current = el.scrollTop / Math.max(1, el.scrollHeight)
    setZoom(clamp(next, 0.25, 4))
  }, [])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pendingScroll.current !== null) {
      el.scrollTop = pendingScroll.current * el.scrollHeight
      pendingScroll.current = null
    }
  }, [zoom])
  const zoomIn = () => changeZoom(ZOOMS.find((z) => z > zoom + 0.01) ?? 4)
  const zoomOut = () => changeZoom([...ZOOMS].reverse().find((z) => z < zoom - 0.01) ?? 0.25)
  const fitWidth = () => {
    const el = scrollRef.current
    const s = sizes[currentPage] ?? sizes[0]
    if (el && s) changeZoom((el.clientWidth - 64) / s.w)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el || phase !== 'ready') return
    const release = () => (navLock.current = false)
    el.addEventListener('scrollend', release)
    // Scrollbar drags and keyboard scrolling are manual scrolls too.
    el.addEventListener('pointerdown', release)
    el.addEventListener('keydown', release)
    return () => {
      el.removeEventListener('scrollend', release)
      el.removeEventListener('pointerdown', release)
      el.removeEventListener('keydown', release)
    }
  }, [phase])

  // Ctrl/⌘ + wheel zooms the document instead of the browser page.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || phase !== 'ready') return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      changeZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [phase, zoom, changeZoom])

  /* ------------------------------ placements ------------------------------ */
  const selected = placements.find((p) => p.id === selectedId)

  const addPlacement = useCallback(
    (sig: SavedSignature, pageIdx: number, cx: number, cy: number) => {
      const size = sizes[pageIdx]
      if (!size) return
      const width = Math.min(200, size.w * 0.3)
      const height = (width * sig.height) / sig.width
      const p: Placement = {
        id: uid(),
        signatureId: sig.id,
        page: pageIdx,
        x: clamp(cx - width / 2, 0, Math.max(0, size.w - width)),
        y: clamp(cy - height / 2, 0, Math.max(0, size.h - height)),
        width,
        height,
        rotation: 0,
        opacity: 1,
      }
      history.apply((arr) => [...arr, p])
      setSelectedId(p.id)
    },
    [sizes, history],
  )

  /** Click-to-add: centre of the part of the current page that is visible. */
  const addToCurrentPage = (sig: SavedSignature) => {
    const el = pageEls.current[currentPage]
    const sc = scrollRef.current
    if (!el || !sc) return
    const r = el.getBoundingClientRect()
    const c = sc.getBoundingClientRect()
    const top = Math.max(r.top, c.top)
    const bottom = Math.min(r.bottom, c.bottom)
    const left = Math.max(r.left, c.left)
    const right = Math.min(r.right, c.right)
    const cx = ((left + right) / 2 - r.left) / zoom
    const cy = ((top + bottom) / 2 - r.top) / zoom
    addPlacement(sig, currentPage, cx, cy)
  }

  const onDropOnPage = (e: React.DragEvent<HTMLDivElement>, pageIdx: number) => {
    const sigId = e.dataTransfer.getData(SIG_MIME)
    const sig = sigId ? sigMap.get(sigId) : undefined
    if (!sig) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    addPlacement(sig, pageIdx, (e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom)
  }

  const patchSelected = useCallback(
    (patch: Partial<Placement>, key?: string) => {
      if (!selectedId) return
      history.apply(
        (arr) =>
          arr.map((p) => {
            if (p.id !== selectedId) return p
            const next = { ...p, ...patch }
            if (patch.page !== undefined) {
              const s = sizes[clamp(patch.page, 0, sizes.length - 1)]
              next.page = clamp(patch.page, 0, sizes.length - 1)
              next.x = clamp(next.x, 0, Math.max(0, s.w - next.width))
              next.y = clamp(next.y, 0, Math.max(0, s.h - next.height))
            }
            return next
          }),
        key,
      )
      if (patch.page !== undefined) goToPage(clamp(patch.page, 0, sizes.length - 1))
    },
    [selectedId, history, sizes, goToPage],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    history.apply((arr) => arr.filter((p) => p.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, history])

  const duplicateSelected = useCallback(() => {
    const p = placements.find((x) => x.id === selectedId)
    if (!p) return
    const copy: Placement = { ...p, id: uid(), x: p.x + 14, y: p.y + 14 }
    history.apply((arr) => [...arr, copy])
    setSelectedId(copy.id)
  }, [placements, selectedId, history])

  const replaceSelected = (signatureId: string) => {
    const sig = sigMap.get(signatureId)
    if (!sig || !selected) return
    const height = (selected.width * sig.height) / sig.width
    patchSelected({ signatureId, height, y: selected.y + (selected.height - height) / 2 })
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== 'ready') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        history.redo()
      } else if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        duplicateSelected()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteSelected()
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      } else if (selectedId && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const p = placements.find((x) => x.id === selectedId)
        if (p) patchSelected({ x: p.x + dx, y: p.y + dy }, 'nudge')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, history, selectedId, placements, duplicateSelected, deleteSelected, patchSelected])

  /* ------------------------------ export ------------------------------ */
  const build = async () => {
    const blob = await getOriginal(id)
    if (!blob) throw new Error('The original PDF is no longer available. Re-attach it and try again.')
    const res = await exportSignedPdf(await blob.arrayBuffer(), placements, sigMap)
    if (res.skipped) notify('info', `${res.skipped} placed signature${res.skipped === 1 ? ' was' : 's were'} skipped because the saved signature no longer exists.`)
    return new Blob([res.bytes as BlobPart], { type: 'application/pdf' })
  }

  const doPreview = async () => {
    setBusy('preview')
    try {
      setPreviewBlob(await build())
    } catch (e) {
      notify('error', errorMessage(e, 'Could not build the preview.'))
    } finally {
      setBusy(null)
    }
  }

  const doExport = async (fileName: string) => {
    setBusy('export')
    try {
      const blob = await build()
      downloadBlob(blob, fileName)
      flush()
      await updateDocument(id, { status: 'signed', signedAt: Date.now(), placements })
      await saveSigned(id, blob, fileName)
      notify('success', `Downloaded ${fileName}`)
      setExportOpen(false)
      setPreviewBlob(null)
    } catch (e) {
      notify('error', errorMessage(e, 'Could not create the signed PDF.'))
    } finally {
      setBusy(null)
    }
  }

  /* ------------------------------ screens ------------------------------ */
  if (!ready || phase === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400" data-testid="editor-loading">
        <Spinner className="h-6 w-6" />
        <p className="text-sm">Opening document…</p>
      </div>
    )
  }
  if (phase === 'notfound') {
    return (
      <FullScreenMessage icon={<FileWarning className="h-6 w-6" />} title="Document not found">
        It may have been deleted. <Link to="/" className="text-brand-600 underline">Back to dashboard</Link>
      </FullScreenMessage>
    )
  }
  if (phase === 'error') {
    return (
      <FullScreenMessage icon={<FileWarning className="h-6 w-6" />} title="This document could not be opened">
        <p role="alert">{loadError}</p>
        <Link to="/" className="btn-secondary mt-4 inline-flex">Back to dashboard</Link>
      </FullScreenMessage>
    )
  }
  if (phase === 'missing' && doc) {
    return (
      <FullScreenMessage icon={<FileWarning className="h-6 w-6" />} title="The original PDF isn’t stored on this device">
        <p>
          “{doc.name}” ({formatBytes(doc.size)}, {doc.pageCount} pages) was not kept in browser storage, or the page was refreshed. Choose the same file again to keep editing – your placed signatures are saved.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/" className="btn-secondary">Back</Link>
          <label className="btn-primary cursor-pointer">
            Choose PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              data-testid="reattach-input"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  await validatePdfFile(f)
                  const p = await openPdf(f)
                  const n = p.numPages
                  destroyPdf(p)
                  if (n !== doc.pageCount) notify('info', `This file has ${n} pages but the original had ${doc.pageCount}. Signature positions may not line up.`)
                  await attachOriginal(id, f, n)
                  setReloadKey((k) => k + 1)
                } catch (err) {
                  notify('error', errorMessage(err))
                }
              }}
            />
          </label>
        </div>
      </FullScreenMessage>
    )
  }
  if (!pdf || !doc) return null

  const total = sizes.length
  const canExport = placements.length > 0
  const selSize = selected ? sizes[selected.page] : sizes[currentPage]

  return (
    <div className="flex h-full flex-col bg-slate-100 dark:bg-slate-950">
      {/* Top toolbar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <button className="btn-icon" onClick={() => navigate('/')} aria-label="Back to dashboard" title="Back to dashboard"><ArrowLeft className="h-4 w-4" /></button>
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" data-testid="doc-name" title={doc.name}>{doc.name}</p>
            <p className="truncate text-[11px] text-slate-400">{total} {total === 1 ? 'page' : 'pages'} · {formatBytes(doc.size)} · {saveState === 'saving' ? 'Saving…' : 'All changes saved'}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" data-testid="undo"><Undo2 className="h-4 w-4" /></button>
          <button className="btn-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" data-testid="redo"><Redo2 className="h-4 w-4" /></button>
          <span className="mx-1 hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
          <button className="btn-secondary" onClick={doPreview} disabled={!canExport || busy !== null} title={canExport ? 'Preview the signed document' : 'Add a signature first'} data-testid="preview">
            {busy === 'preview' ? <Spinner /> : <Eye className="h-4 w-4" />}<span className="hidden sm:inline">Preview</span>
          </button>
          <button className="btn-primary" onClick={() => setExportOpen(true)} disabled={!canExport || busy !== null} title={canExport ? 'Download signed PDF' : 'Add a signature first'} data-testid="download">
            <Download className="h-4 w-4" /><span className="hidden sm:inline">Download Signed PDF</span><span className="sm:hidden">Download</span>
          </button>
          <button className="btn-icon lg:hidden" onClick={() => setRightOpen((v) => !v)} aria-label="Toggle properties panel" aria-pressed={rightOpen}><PanelRight className="h-4 w-4" /></button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: signature gallery */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-60" aria-label="Signatures">
          <div className="px-3 pb-2 pt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your signatures</h2>
            <p className="mt-1 text-xs text-slate-500">Click to add, or drag onto a page.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3" data-testid="editor-gallery">
            {signatures.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700">No signatures yet. Create one to start signing.</p>}
            {signatures.map((s) => (
              <button
                key={s.id}
                data-testid="gallery-signature"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(SIG_MIME, s.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => addToCurrentPage(s)}
                title={`Add “${s.name}” to page ${currentPage + 1}`}
                className="group block w-full overflow-hidden rounded-xl border border-slate-200 text-left transition-shadow hover:border-brand-300 hover:shadow-card dark:border-slate-700"
              >
                <span className="checker flex h-16 items-center justify-center p-2"><img src={s.dataUrl} alt={s.name} draggable={false} className="max-h-full max-w-full object-contain" /></span>
                <span className="block truncate border-t border-slate-100 px-2.5 py-1.5 text-xs font-medium dark:border-slate-800">{s.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <button className="btn-secondary w-full" onClick={() => setCreating(true)} data-testid="editor-new-signature"><Plus className="h-4 w-4" /> New signature</button>
          </div>
        </aside>

        {/* Centre: document */}
        <main className="relative min-w-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} onWheel={() => (navLock.current = false)} onTouchStart={() => (navLock.current = false)} className="pdf-scroll h-full overflow-auto" data-testid="pdf-scroll">
            <div className="flex min-w-max flex-col items-center px-8" style={{ paddingTop: PAD_TOP, paddingBottom: 96, gap: GAP }}>
              {sizes.map((s, i) => (
                <PdfPageView
                  key={i}
                  ref={(el) => {
                    pageEls.current[i] = el
                  }}
                  pdf={pdf}
                  index={i}
                  width={s.w}
                  height={s.h}
                  zoom={zoom}
                  onPointerDownBackground={() => setSelectedId(null)}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(SIG_MIME)) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'copy'
                    }
                  }}
                  onDrop={(e) => onDropOnPage(e, i)}
                >
                  {placements
                    .filter((p) => p.page === i)
                    .map((p) => (
                      <PlacementOverlay
                        key={p.id}
                        placement={p}
                        signature={sigMap.get(p.signatureId)}
                        zoom={zoom}
                        pageWidth={s.w}
                        pageHeight={s.h}
                        selected={p.id === selectedId}
                        onSelect={() => setSelectedId(p.id)}
                        onBegin={history.begin}
                        onChange={(next) => history.update((arr) => arr.map((x) => (x.id === next.id ? next : x)))}
                        onEnd={history.end}
                      />
                    ))}
                </PdfPageView>
              ))}
            </div>
          </div>

          {/* Floating page + zoom controls */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-pop backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <button className="btn-icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 0} aria-label="Previous page" data-testid="prev-page"><ChevronLeft className="h-4 w-4" /></button>
              <div className="flex items-center gap-1 px-1 text-sm tabular-nums">
                <input
                  aria-label="Current page"
                  data-testid="page-input"
                  className="h-7 w-11 rounded-md border border-slate-200 bg-transparent text-center dark:border-slate-700"
                  value={currentPage + 1}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (Number.isFinite(n)) goToPage(n - 1)
                  }}
                />
                <span className="text-slate-400" data-testid="page-total">/ {total}</span>
              </div>
              <button className="btn-icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= total - 1} aria-label="Next page" data-testid="next-page"><ChevronRight className="h-4 w-4" /></button>
              <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
              <button className="btn-icon" onClick={zoomOut} disabled={zoom <= 0.25} aria-label="Zoom out" data-testid="zoom-out"><ZoomOut className="h-4 w-4" /></button>
              <span className="w-12 text-center text-sm tabular-nums" data-testid="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="btn-icon" onClick={zoomIn} disabled={zoom >= 4} aria-label="Zoom in" data-testid="zoom-in"><ZoomIn className="h-4 w-4" /></button>
              <button className="btn-icon" onClick={fitWidth} aria-label="Fit width" title="Fit width"><Maximize2 className="h-4 w-4" /></button>
            </div>
          </div>
        </main>

        {/* Right: properties */}
        {rightOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-72" aria-label="Properties">
            <PropertiesPanel
              placement={selected}
              signature={selected ? sigMap.get(selected.signatureId) : undefined}
              signatures={signatures}
              pageCount={total}
              pageWidth={selSize?.w ?? 0}
              pageHeight={selSize?.h ?? 0}
              placements={placements}
              signatureMap={sigMap}
              onChange={patchSelected}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onReplace={replaceSelected}
              onSelect={(pid) => {
                setSelectedId(pid)
                const p = placements.find((x) => x.id === pid)
                if (p) goToPage(p.page)
              }}
            />
          </aside>
        )}
      </div>

      <SignatureDialog open={creating} onClose={() => setCreating(false)} />
      <PreviewDialog blob={previewBlob} onClose={() => setPreviewBlob(null)} onDownload={() => setExportOpen(true)} />
      <ExportDialog open={exportOpen} defaultName={doc.name} count={placements.length} busy={busy === 'export'} onClose={() => setExportOpen(false)} onConfirm={doExport} />
    </div>
  )
}
