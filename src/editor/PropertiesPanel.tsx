import { useEffect, useState } from 'react'
import { AlignCenterHorizontal, AlignCenterVertical, Copy, Link2, Link2Off, MousePointerClick, Trash2 } from 'lucide-react'
import type { Placement, SavedSignature } from '../types'
import { clamp, round } from '../lib/utils'
import { MIN_WIDTH, normalizeAngle } from './PlacementOverlay'

/** Number field that lets you type freely and commits valid numbers as you go. */
function NumField({ id, label, value, onCommit, min, max, step = 1, suffix }: { id: string; label: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [value])
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          data-testid={id}
          type="number"
          className="input tabular-nums"
          value={draft ?? String(round(value, 1))}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setDraft(e.target.value)
            const n = parseFloat(e.target.value)
            if (Number.isFinite(n)) onCommit(min !== undefined && max !== undefined ? clamp(n, min, max) : n)
          }}
          onBlur={() => setDraft(null)}
        />
        {suffix && <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  )
}

export function PropertiesPanel({
  placement: p,
  signature,
  signatures,
  pageCount,
  pageWidth,
  pageHeight,
  placements,
  signatureMap,
  onChange,
  onDelete,
  onDuplicate,
  onReplace,
  onSelect,
}: {
  placement: Placement | undefined
  signature: SavedSignature | undefined
  signatures: SavedSignature[]
  pageCount: number
  pageWidth: number
  pageHeight: number
  placements: Placement[]
  signatureMap: Map<string, SavedSignature>
  onChange: (patch: Partial<Placement>, key?: string) => void
  onDelete: () => void
  onDuplicate: () => void
  onReplace: (signatureId: string) => void
  onSelect: (id: string) => void
}) {
  const [lock, setLock] = useState(true)

  if (!p) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
          <MousePointerClick className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-medium">No signature selected</p>
          <p className="text-xs text-slate-500">Click a signature on the page to edit its size, rotation, opacity and position.</p>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Placed signatures ({placements.length})</h3>
          {placements.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing placed yet. Click a saved signature on the left, or drag it onto a page.</p>
          ) : (
            <ul className="space-y-1">
              {placements.map((x) => (
                <li key={x.id}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onSelect(x.id)}>
                    <span className="checker flex h-7 w-12 shrink-0 items-center justify-center rounded border border-slate-200 dark:border-slate-700">
                      {signatureMap.get(x.signatureId) && <img src={signatureMap.get(x.signatureId)!.dataUrl} alt="" className="max-h-6 max-w-full object-contain" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{signatureMap.get(x.signatureId)?.name ?? 'Missing'}</span>
                    <span className="text-xs text-slate-400">p.{x.page + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  const ratio = p.width / p.height
  const setWidth = (w: number) => {
    const width = Math.max(MIN_WIDTH, w)
    if (lock) {
      const height = width / ratio
      // keep the centre fixed
      onChange({ width, height, x: p.x + (p.width - width) / 2, y: p.y + (p.height - height) / 2 }, 'size')
    } else onChange({ width, x: p.x + (p.width - width) / 2 }, 'size')
  }
  const setHeight = (h: number) => {
    const height = Math.max(MIN_WIDTH / 2, h)
    if (lock) {
      const width = height * ratio
      onChange({ width, height, x: p.x + (p.width - width) / 2, y: p.y + (p.height - height) / 2 }, 'size')
    } else onChange({ height, y: p.y + (p.height - height) / 2 }, 'size')
  }

  return (
    <div className="space-y-5 p-4" data-testid="properties">
      <div className="flex items-center gap-3">
        <div className="checker flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 p-1 dark:border-slate-700">
          {signature ? <img src={signature.dataUrl} alt="" className="max-h-full max-w-full object-contain" style={{ opacity: p.opacity }} /> : <span className="text-xs text-red-500">Missing</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{signature?.name ?? 'Missing signature'}</p>
          <p className="text-xs text-slate-500">Page {p.page + 1} of {pageCount}</p>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Size (pt)</h3>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <NumField id="prop-width" label="Width" value={p.width} min={MIN_WIDTH} max={4000} onCommit={setWidth} />
          <button className="btn-icon mb-1" onClick={() => setLock(!lock)} aria-pressed={lock} aria-label={lock ? 'Unlock aspect ratio' : 'Lock aspect ratio'} title={lock ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}>
            {lock ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
          </button>
          <NumField id="prop-height" label="Height" value={p.height} min={MIN_WIDTH / 2} max={4000} onCommit={setHeight} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Appearance</h3>
        <div>
          <div className="flex items-center justify-between">
            <label className="label !mb-0" htmlFor="prop-rotation">Rotation</label>
            <button className="text-xs text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-300" disabled={p.rotation === 0} onClick={() => onChange({ rotation: 0 })}>Reset</button>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_5rem] items-center gap-3">
            <input type="range" min={-180} max={180} step={1} value={p.rotation} onChange={(e) => onChange({ rotation: normalizeAngle(Number(e.target.value)) }, 'rot')} aria-label="Rotation slider" className="accent-brand-600" />
            <input id="prop-rotation" data-testid="prop-rotation" type="number" className="input tabular-nums" value={round(p.rotation, 1)} min={-180} max={180} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange({ rotation: normalizeAngle(n) }, 'rot') }} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="prop-opacity">Opacity: {Math.round(p.opacity * 100)}%</label>
          <input id="prop-opacity" data-testid="prop-opacity" type="range" min={5} max={100} step={1} value={Math.round(p.opacity * 100)} onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 }, 'opacity')} className="w-full accent-brand-600" />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Position (pt from top-left)</h3>
        <div className="grid grid-cols-2 gap-2">
          <NumField id="prop-x" label="X" value={p.x} onCommit={(x) => onChange({ x }, 'pos')} />
          <NumField id="prop-y" label="Y" value={p.y} onCommit={(y) => onChange({ y }, 'pos')} />
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn-secondary flex-1 px-2" onClick={() => onChange({ x: (pageWidth - p.width) / 2 })} title="Centre horizontally"><AlignCenterVertical className="h-4 w-4" /> Centre H</button>
          <button className="btn-secondary flex-1 px-2" onClick={() => onChange({ y: (pageHeight - p.height) / 2 })} title="Centre vertically"><AlignCenterHorizontal className="h-4 w-4" /> Centre V</button>
        </div>
        {pageCount > 1 && (
          <div className="mt-3">
            <NumField id="prop-page" label="Move to page" value={p.page + 1} min={1} max={pageCount} step={1} onCommit={(n) => onChange({ page: Math.round(n) - 1 })} />
          </div>
        )}
      </section>

      {signatures.length > 1 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Replace with</h3>
          <div className="grid grid-cols-3 gap-2">
            {signatures.map((s) => (
              <button
                key={s.id}
                data-testid="replace-signature"
                onClick={() => onReplace(s.id)}
                title={s.name}
                aria-label={`Replace with ${s.name}`}
                className={`checker flex h-12 items-center justify-center rounded-lg border p-1 ${s.id === p.signatureId ? 'border-brand-500 ring-1 ring-brand-300' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'}`}
              >
                <img src={s.dataUrl} alt={s.name} className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button className="btn-secondary flex-1" onClick={onDuplicate} data-testid="duplicate"><Copy className="h-4 w-4" /> Duplicate</button>
        <button className="btn-secondary flex-1 !text-red-600" onClick={onDelete} data-testid="delete-placement"><Trash2 className="h-4 w-4" /> Delete</button>
      </div>
    </div>
  )
}
