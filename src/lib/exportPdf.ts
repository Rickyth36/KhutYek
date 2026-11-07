import { PDFDocument, degrees, EncryptedPDFError, type PDFImage } from 'pdf-lib'
import type { Placement } from '../types'
import { normalizeRotation, placementToDrawParams, type PageBox } from './coords'
import { dataUrlToBytes } from './utils'

export interface ExportResult {
  bytes: Uint8Array
  applied: number
  skipped: number
}

/** Visible box of a page (CropBox ∩ MediaBox) plus its /Rotate – mirrors what PDF.js displays. */
function readPageBox(page: ReturnType<PDFDocument['getPage']>): PageBox {
  const media = page.getMediaBox()
  const crop = page.getCropBox()
  const x0 = Math.max(media.x, crop.x)
  const y0 = Math.max(media.y, crop.y)
  const x1 = Math.min(media.x + media.width, crop.x + crop.width)
  const y1 = Math.min(media.y + media.height, crop.y + crop.height)
  const useCrop = x1 > x0 && y1 > y0
  return {
    x: useCrop ? x0 : media.x,
    y: useCrop ? y0 : media.y,
    width: useCrop ? x1 - x0 : media.width,
    height: useCrop ? y1 - y0 : media.height,
    rotation: normalizeRotation(page.getRotation().angle),
  }
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/**
 * Embed signature images into the original PDF with pdf-lib.
 * The original page content is left untouched (vector text, fonts and images are kept);
 * signatures are appended as extra content on the target pages.
 */
export async function exportSignedPdf(
  original: ArrayBuffer | Uint8Array,
  placements: Placement[],
  signatures: ReadonlyMap<string, { dataUrl: string }>,
): Promise<ExportResult> {
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(original, { updateMetadata: false })
  } catch (err) {
    if (err instanceof EncryptedPDFError) {
      throw new Error(
        'This PDF is encrypted or permission-protected, so signatures cannot be embedded in it. Remove the protection (for example by printing it to a new PDF) and try again.',
      )
    }
    throw new Error('The original PDF could not be processed. It may be damaged or use an unsupported feature.')
  }

  const pages = pdf.getPages()
  const embedded = new Map<string, PDFImage>()
  let applied = 0
  let skipped = 0

  for (const p of placements) {
    const sig = signatures.get(p.signatureId)
    const page = pages[p.page]
    if (!sig || !page) {
      skipped++
      continue
    }
    let img = embedded.get(p.signatureId)
    if (!img) {
      const bytes = dataUrlToBytes(sig.dataUrl)
      img = isJpeg(bytes) ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
      embedded.set(p.signatureId, img)
    }
    const box = readPageBox(page)
    const d = placementToDrawParams(p, box)
    page.drawImage(img, {
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      rotate: degrees(d.angle),
      opacity: Math.min(1, Math.max(0, p.opacity)),
    })
    applied++
  }

  const bytes = await pdf.save({ useObjectStreams: true })
  return { bytes, applied, skipped }
}
