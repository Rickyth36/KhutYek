import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { destroyPdf, openPdf, validatePdfFile } from '../lib/pdf'
import { errorMessage } from '../lib/utils'

/** Validate a PDF, register it in the document history and open it in the editor. */
export function usePdfUpload() {
  const { addDocument, notify } = useApp()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const upload = useCallback(
    async (file: File) => {
      setBusy(true)
      try {
        await validatePdfFile(file)
        const pdf = await openPdf(file) // throws a friendly message for corrupted / protected files
        const pageCount = pdf.numPages
        destroyPdf(pdf)
        const doc = await addDocument(file, pageCount)
        navigate(`/editor/${doc.id}`)
      } catch (e) {
        notify('error', `${file.name}: ${errorMessage(e, 'Could not open this file.')}`)
      } finally {
        setBusy(false)
      }
    },
    [addDocument, navigate, notify],
  )

  return { upload, busy }
}
