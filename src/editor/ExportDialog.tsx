import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Modal, Spinner } from '../components/ui'
import { sanitizePdfFileName, stripPdfExt } from '../lib/utils'

export function ExportDialog({ open, defaultName, count, busy, onClose, onConfirm }: { open: boolean; defaultName: string; count: number; busy: boolean; onClose: () => void; onConfirm: (fileName: string) => void }) {
  const [name, setName] = useState('')
  useEffect(() => {
    if (open) setName(`${stripPdfExt(defaultName)}-signed`)
  }, [open, defaultName])
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Download signed PDF"
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={() => onConfirm(sanitizePdfFileName(name))} disabled={busy || !name.trim()} data-testid="confirm-download">
            {busy ? <Spinner /> : <Download className="h-4 w-4" />} Download
          </button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !busy) onConfirm(sanitizePdfFileName(name)) }}>
        <div>
          <label className="label" htmlFor="export-name">File name</label>
          <div className="flex items-center gap-2">
            <input id="export-name" data-testid="export-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
            <span className="text-sm text-slate-400">.pdf</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {count} signature{count === 1 ? '' : 's'} will be embedded. The original text, fonts and images are kept as they are – pages are not converted to pictures.
        </p>
      </form>
    </Modal>
  )
}
