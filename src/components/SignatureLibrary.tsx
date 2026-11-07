import { useState } from 'react'
import { Eye, PenLine, Pencil, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog, EmptyState, Modal } from './ui'
import { EditSignatureDialog } from './EditSignatureDialog'
import { SignatureDialog } from './SignatureDialog'
import { useApp } from '../context/AppContext'
import type { SavedSignature } from '../types'
import { formatDate } from '../lib/utils'

/** Gallery of saved signatures with select / preview / edit / delete. */
export function SignatureLibrary({ limit }: { limit?: number }) {
  const { signatures, deleteSignature, notify } = useApp()
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<SavedSignature | null>(null)
  const [editing, setEditing] = useState<SavedSignature | null>(null)
  const [deleting, setDeleting] = useState<SavedSignature | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const shown = limit ? signatures.slice(0, limit) : signatures

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteSignature(deleting.id)
      if (selected === deleting.id) setSelected(null)
      notify('success', `Deleted “${deleting.name}”.`)
      setDeleting(null)
    } catch {
      /* toast shown */
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {signatures.length === 0 ? (
        <EmptyState
          icon={<PenLine className="h-5 w-5" />}
          title="No signatures yet"
          action={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Create your first signature
            </button>
          }
        >
          Draw or upload your handwritten signature once and reuse it on every document.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="signature-grid">
          {shown.map((s) => (
            <div
              key={s.id}
              data-testid="signature-card"
              className={`group overflow-hidden rounded-xl border bg-white transition-shadow dark:bg-slate-900 ${
                selected === s.id ? 'border-brand-500 ring-2 ring-brand-200 dark:ring-brand-500/30' : 'border-slate-200 hover:shadow-card dark:border-slate-800'
              }`}
            >
              <button
                className="checker flex h-28 w-full items-center justify-center p-3"
                onClick={() => setSelected(selected === s.id ? null : s.id)}
                aria-pressed={selected === s.id}
                aria-label={`Select ${s.name}`}
              >
                <img src={s.dataUrl} alt={s.name} className="max-h-full max-w-full object-contain" draggable={false} />
              </button>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={s.name}>{s.name}</p>
                  <p className="truncate text-xs text-slate-400">{formatDate(s.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button className="btn-icon" onClick={() => setPreview(s)} aria-label={`Preview ${s.name}`} title="Preview"><Eye className="h-4 w-4" /></button>
                  <button className="btn-icon" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`} title="Rename / recolour"><Pencil className="h-4 w-4" /></button>
                  <button className="btn-icon hover:!text-red-600" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`} title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {!limit && (
            <button
              onClick={() => setCreating(true)}
              className="flex min-h-[10.5rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-slate-700"
            >
              <Plus className="h-5 w-5" /> New signature
            </button>
          )}
        </div>
      )}

      <SignatureDialog open={creating} onClose={() => setCreating(false)} onSaved={(s) => setSelected(s.id)} />
      <EditSignatureDialog signature={editing} onClose={() => setEditing(null)} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ''} size="md">
        {preview && (
          <div className="space-y-2">
            <div className="checker flex min-h-[14rem] items-center justify-center rounded-xl border border-slate-200 p-6 dark:border-slate-700">
              <img src={preview.dataUrl} alt={preview.name} className="max-h-64 max-w-full object-contain" />
            </div>
            <p className="text-xs text-slate-500">{preview.width} × {preview.height}px transparent PNG · saved {formatDate(preview.createdAt)}</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Delete signature?"
        message={<>“{deleting?.name}” will be removed from this device. Documents you already signed are not affected.</>}
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
