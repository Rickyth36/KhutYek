import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PDFDocumentProxy = pdfjs.PDFDocumentProxy
export type PDFPageProxy = pdfjs.PDFPageProxy
export type RenderTask = pdfjs.RenderTask

export const MAX_PDF_BYTES = 300 * 1024 * 1024

export function describePdfError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name
  switch (name) {
    case 'PasswordException':
      return 'This PDF is password-protected. KhutYek cannot open protected files – remove the password and try again.'
    case 'InvalidPDFException':
      return 'This file is damaged or is not a valid PDF.'
    case 'MissingPDFException':
      return 'The PDF could not be found.'
    case 'UnexpectedResponseException':
      return 'The PDF could not be read.'
    default:
      return err instanceof Error && err.message
        ? `The PDF could not be opened: ${err.message}`
        : 'The PDF could not be opened.'
  }
}

/** Cheap structural check before handing the bytes to PDF.js. */
export async function validatePdfFile(file: Blob & { name?: string }): Promise<void> {
  const name = file.name ?? ''
  const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(name)
  if (!looksLikePdf) throw new Error('Only PDF files are supported. Please choose a file ending in .pdf.')
  if (file.size === 0) throw new Error('This file is empty.')
  if (file.size > MAX_PDF_BYTES) throw new Error('This PDF is larger than 300 MB, which is too big to process in the browser.')
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const text = new TextDecoder('latin1').decode(head)
  if (!text.includes('%PDF-')) throw new Error('This file does not look like a PDF (missing PDF header).')
}

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await blob.arrayBuffer()) // PDF.js takes ownership of this copy
  try {
    return await pdfjs.getDocument({ data }).promise
  } catch (err) {
    throw new Error(describePdfError(err))
  }
}

export function isRenderCancelled(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'RenderingCancelledException'
}

/** Release a document's worker resources (pdf.js exposes destroy() on the loading task). */
export function destroyPdf(pdf: PDFDocumentProxy | null | undefined): void {
  if (!pdf) return
  void pdf.loadingTask.destroy().catch(() => undefined)
}
