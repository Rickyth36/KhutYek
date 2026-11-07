export interface SavedSignature {
  id: string
  name: string
  /** Transparent PNG as a data URL. */
  dataUrl: string
  /** Natural pixel size of the PNG. */
  width: number
  height: number
  createdAt: number
  updatedAt: number
}

export type DocStatus = 'uploaded' | 'in-progress' | 'signed'

/**
 * A signature placed on a page.
 *
 * Units and origin: PDF points (1/72 in) measured in the *displayed* page space
 * (page rotation already applied), origin at the top-left corner, y pointing down.
 * (x, y) is the top-left of the unrotated box; the box is rotated clockwise by
 * `rotation` degrees around its centre. Because everything is stored in points,
 * placements are independent of zoom, window size and screen resolution.
 */
export interface Placement {
  id: string
  signatureId: string
  /** Zero-based page index. */
  page: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** 0.05 – 1 */
  opacity: number
}

export interface DocumentRecord {
  id: string
  name: string
  size: number
  pageCount: number
  status: DocStatus
  createdAt: number
  updatedAt: number
  signedAt?: number
  /** Whether the original PDF bytes are kept in IndexedDB (for reopening). */
  hasOriginal: boolean
  /** Whether the last signed PDF is kept in IndexedDB (for re-downloading). */
  hasSigned: boolean
  placements: Placement[]
}

export interface StoredFiles {
  id: string
  original?: Blob
  signed?: Blob
  signedName?: string
}

export interface AppSettings {
  /** Keep copies of PDFs (original + signed) in IndexedDB so they can be reopened. */
  keepCopies: boolean
}
