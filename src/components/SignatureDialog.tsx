import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageUp, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react'
import { Modal, Spinner } from './ui'
import { InkPicker } from './InkPicker'
import { SignatureCanvas, renderStrokesToCanvas, type Stroke } from './SignatureCanvas'
import { useApp } from '../context/AppContext'
import type { SavedSignature } from '../types'
import {
  canvasToPng,
  estimateBackground,
  fileToCanvas,
  hasTransparency,
  cloneCanvas,
  removeBackground,
  tintCanvas,
  trimCanvas,
  validateSignatureImage,
  type PngResult,
} from '../lib/imageProcessing'
import { errorMessage } from '../lib/utils'

type Tab = 'draw' | 'upload'

function suggestName(count: number) {
  return count === 0 ? 'My signature' : `Signature ${count + 1}`
}

/** Create a signature by drawing it or uploading an image. */
export function SignatureDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (s: SavedSignature) => void }) {
  const { signatures, addSignature, notify } = useApp()
  const [tab, setTab] = useState<Tab>('draw')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Draw state
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redo, setRedo] = useState<Stroke[]>([])
  const [penWidth, setPenWidth] = useState(3)
  const [color, setColor] = useState('#111827')
  const [drawPreview, setDrawPreview] = useState<PngResult | null>(null)

  // Upload state
  const [source, setSource] = useState<HTMLCanvasElement | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [removeBg, setRemoveBg] = useState(true)
  const [cleanup, setCleanup] = useState(40)
  const [ink, setInk] = useState<string | null>(null)
  const [uploadPreview, setUploadPreview] = useState<PngResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [hadAlpha, setHadAlpha] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    setTab('draw')
    setName(suggestName(signatures.length))
    setStrokes([])
    setRedo([])
    setSource(null)
    setSourceName('')
    setUploadPreview(null)
    setUploadError(null)
    setInk(null)
    setCleanup(40)
    setRemoveBg(true)
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Live preview of the drawn signature (cropped, transparent).
  useEffect(() => {
    if (strokes.length === 0) {
      setDrawPreview(null)
      return
    }
    const t = setTimeout(() => {
      const trimmed = trimCanvas(renderStrokesToCanvas(strokes, 4))
      setDrawPreview(trimmed ? canvasToPng(trimmed) : null)
    }, 120)
    return () => clearTimeout(t)
  }, [strokes])

  // Process uploaded image whenever options change.
  useEffect(() => {
    if (!source) {
      setUploadPreview(null)
      return
    }
    const t = setTimeout(() => {
      try {
        const work = cloneCanvas(source)
        if (removeBg) removeBackground(work, estimateBackground(work), cleanup)
        if (ink) tintCanvas(work, ink)
        const trimmed = trimCanvas(work)
        if (!trimmed) {
          setUploadPreview(null)
          setUploadError('No handwriting was found in this image. Try lowering the clean-up level or choose another image.')
          return
        }
        setUploadError(null)
        setUploadPreview(canvasToPng(trimmed))
      } catch (e) {
        setUploadError(errorMessage(e))
      }
    }, 100)
    return () => clearTimeout(t)
  }, [source, removeBg, cleanup, ink])

  const pushStroke = (s: Stroke) => {
    setStrokes((a) => [...a, s])
    setRedo([])
  }
  const undo = () =>
    setStrokes((a) => {
      if (!a.length) return a
      setRedo((r) => [...r, a[a.length - 1]])
      return a.slice(0, -1)
    })
  const redoStroke = () =>
    setRedo((r) => {
      if (!r.length) return r
      setStrokes((a) => [...a, r[r.length - 1]])
      return r.slice(0, -1)
    })
  const clear = () => {
    setStrokes([])
    setRedo([])
  }

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    setLoadingImage(true)
    setUploadError(null)
    try {
      validateSignatureImage(file)
      const canvas = await fileToCanvas(file)
      const alpha = hasTransparency(canvas)
      setHadAlpha(alpha)
      setRemoveBg(!alpha)
      setSource(canvas)
      setSourceName(file.name)
      if (name === suggestName(signatures.length)) setName(file.name.replace(/\.[^.]+$/, '').slice(0, 60) || name)
    } catch (e) {
      setSource(null)
      setUploadPreview(null)
      setUploadError(errorMessage(e))
    } finally {
      setLoadingImage(false)
    }
  }

  const result = tab === 'draw' ? drawPreview : uploadPreview
  const canSave = !!result && name.trim().length > 0 && !saving

  const save = async () => {
    if (!result) return
    setSaving(true)
    try {
      // Re-render the drawn signature fresh so the saved PNG is never a stale preview.
      let final = result
      if (tab === 'draw') {
        const trimmed = trimCanvas(renderStrokesToCanvas(strokes, 4))
        if (!trimmed) throw new Error('Please draw your signature first.')
        final = canvasToPng(trimmed)
      }
      const sig = await addSignature({ name, ...final })
      notify('success', `Saved “${sig.name}”.`)
      onSaved?.(sig)
      onClose()
    } catch (e) {
      // addSignature already shows a toast for storage failures
      if (e instanceof Error && e.message === 'Please draw your signature first.') notify('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === t ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  const previewBox = useMemo(
    () => (
      <div>
        <span className="label">Preview (transparent, cropped)</span>
        <div className="checker flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          {result ? (
            <img src={result.dataUrl} alt="Signature preview" className="max-h-full max-w-full object-contain" data-testid="signature-preview" />
          ) : (
            <span className="text-xs text-slate-400">Nothing to preview yet</span>
          )}
        </div>
      </div>
    ),
    [result],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New signature"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!canSave} data-testid="save-signature">
            {saving && <Spinner />}
            Save signature
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {tabBtn('draw', 'Draw', <PenLine className="h-4 w-4" />)}
          {tabBtn('upload', 'Upload image', <ImageUp className="h-4 w-4" />)}
        </div>

        {tab === 'draw' ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700">
              <SignatureCanvas strokes={strokes} penWidth={penWidth} color={color} onStroke={pushStroke} />
              {strokes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">Sign here with your mouse, trackpad, finger or stylus</div>
              )}
              <div className="pointer-events-none absolute inset-x-6 bottom-12 border-b border-dashed border-slate-300" />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Pen</span>
                <input type="range" min={1} max={12} step={0.5} value={penWidth} onChange={(e) => setPenWidth(Number(e.target.value))} aria-label="Pen thickness" className="w-32 accent-brand-600" />
                <span className="w-8 text-xs tabular-nums text-slate-500">{penWidth}px</span>
              </label>
              <InkPicker value={color} onChange={(v) => v && setColor(v)} />
              <div className="ml-auto flex items-center gap-1">
                <button className="btn-secondary px-2.5" onClick={undo} disabled={!strokes.length} aria-label="Undo stroke">
                  <Undo2 className="h-4 w-4" /> Undo
                </button>
                <button className="btn-secondary px-2.5" onClick={redoStroke} disabled={!redo.length} aria-label="Redo stroke">
                  <Redo2 className="h-4 w-4" /> Redo
                </button>
                <button className="btn-secondary px-2.5" onClick={clear} disabled={!strokes.length} aria-label="Clear canvas">
                  <Trash2 className="h-4 w-4" /> Clear
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="sr-only" data-testid="signature-file" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = '' }} />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void loadFile(e.dataTransfer.files[0]) }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-300 dark:border-slate-700'}`}
            >
              {loadingImage ? <Spinner className="h-5 w-5" /> : <ImageUp className="h-5 w-5 text-slate-400" />}
              <p className="text-sm">{sourceName ? <>Using <b>{sourceName}</b></> : 'Drop a PNG or JPG of your signature'}</p>
              <button className="btn-secondary" onClick={() => fileInput.current?.click()}>
                {sourceName ? 'Choose another image' : 'Browse images'}
              </button>
            </div>
            {uploadError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{uploadError}</p>}
            {source && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      Remove background
                      {hadAlpha && <span className="ml-1 text-xs text-slate-400">(already transparent)</span>}
                    </span>
                    <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                  </label>
                  <label className={`block text-sm ${removeBg ? '' : 'opacity-50'}`}>
                    <span className="label">Clean-up strength: {cleanup}</span>
                    <input type="range" min={0} max={100} value={cleanup} disabled={!removeBg} onChange={(e) => setCleanup(Number(e.target.value))} className="w-full accent-brand-600" />
                  </label>
                  <div>
                    <span className="label">Ink colour</span>
                    <InkPicker value={ink} onChange={setInk} allowOriginal />
                  </div>
                </div>
                <div className="checker flex items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                  <img src={source.toDataURL('image/jpeg', 0.5)} alt="Original upload" className="max-h-36 max-w-full object-contain" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
          <div>
            <label className="label" htmlFor="sig-name">Signature name</label>
            <input id="sig-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full signature, Initials" data-testid="signature-name" />
          </div>
          {previewBox}
        </div>
      </div>
    </Modal>
  )
}
