import { useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { usePdfUpload } from '../hooks/usePdfUpload'
import { useApp } from '../context/AppContext'
import { Spinner } from './ui'

/** Drag-and-drop + browse upload area for PDFs. */
export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const { upload, busy } = usePdfUpload()
  const { notify } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (files.length > 1) notify('info', 'Only one document can be signed at a time – opening the first file.')
    void upload(files[0])
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        handle(e.dataTransfer.files)
      }}
      className={`rounded-2xl border-2 border-dashed text-center transition-colors ${
        over ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
      } ${compact ? 'p-5' : 'p-8'}`}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        data-testid="pdf-input"
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        {busy ? <Spinner className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
      </div>
      <p className="mt-3 text-sm font-medium">{busy ? 'Opening document…' : 'Drop a PDF here to sign it'}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Processed entirely in your browser – the file never leaves this device.</p>
      <button className="btn-primary mt-4" onClick={() => input.current?.click()} disabled={busy}>
        Browse files
      </button>
    </div>
  )
}
