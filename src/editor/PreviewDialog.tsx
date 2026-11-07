import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Modal, Spinner } from '../components/ui'
import { PdfPageView } from './PdfPageView'
import { destroyPdf, openPdf, type PDFDocumentProxy } from '../lib/pdf'
import { errorMessage } from '../lib/utils'

/** Renders the *exported* PDF bytes, so the preview shows exactly what the downloaded file contains. */
export function PreviewDialog({ blob, onClose, onDownload }: { blob: Blob | null; onClose: () => void; onDownload: () => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) return
    let alive = true
    let doc: PDFDocumentProxy | null = null
    setPdf(null)
    setError(null)
    ;(async () => {
      try {
        doc = await openPdf(blob)
        const s: { w: number; h: number }[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const v = (await doc.getPage(i)).getViewport({ scale: 1 })
          s.push({ w: v.width, h: v.height })
        }
        if (!alive) return
        setSizes(s)
        setPdf(doc)
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
      destroyPdf(doc)
    }
  }, [blob])

  const fit = (w: number) => Math.min(1.2, Math.max(0.3, Math.min(window.innerWidth - 120, 820) / w))

  return (
    <Modal
      open={!!blob}
      onClose={onClose}
      size="xl"
      title="Preview of the signed document"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Back to editor</button>
          <button className="btn-primary" onClick={onDownload}><Download className="h-4 w-4" /> Download signed PDF</button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : !pdf ? (
        <div className="flex h-60 items-center justify-center text-slate-400"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-slate-100 p-4 dark:bg-slate-950" data-testid="preview-pages">
          {sizes.map((s, i) => (
            <PdfPageView key={i} pdf={pdf} index={i} width={s.w} height={s.h} zoom={fit(sizes[0].w)} label={`Preview page ${i + 1}`} />
          ))}
        </div>
      )}
    </Modal>
  )
}
