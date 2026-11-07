import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, FileCheck2, FileClock, FileUp, Info, Loader2, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { DocStatus } from '../types'

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  dismissable?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, onClose, dismissable])
  if (!open) return null
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={dismissable ? onClose : undefined} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`card relative flex max-h-[92vh] w-full ${width} flex-col shadow-pop outline-none`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          {dismissable && (
            <button className="btn-icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </Modal>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

const statusMap: Record<DocStatus, { label: string; cls: string; icon: ReactNode }> = {
  uploaded: {
    label: 'Uploaded',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    icon: <FileUp className="h-3 w-3" />,
  },
  'in-progress': {
    label: 'In progress',
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    icon: <FileClock className="h-3 w-3" />,
  },
  signed: {
    label: 'Signed',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    icon: <FileCheck2 className="h-3 w-3" />,
  },
}

export function StatusBadge({ status }: { status: DocStatus }) {
  const s = statusMap[status]
  return (
    <span className={`badge ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  )
}

export function Toaster() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-pop dark:border-slate-700 dark:bg-slate-800"
        >
          {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
          {t.kind === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
          {t.kind === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />}
          <p className="min-w-0 flex-1 break-words">{t.message}</p>
          <button className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}
