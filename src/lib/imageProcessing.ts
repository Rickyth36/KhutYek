/** Image helpers for turning drawings and scans into clean, transparent, tightly-cropped PNGs. */

export interface PngResult {
  dataUrl: string
  width: number
  height: number
}

export const MAX_SIGNATURE_UPLOAD_BYTES = 15 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

export function validateSignatureImage(file: File): void {
  const okType = ACCEPTED_TYPES.includes(file.type) || /\.(png|jpe?g)$/i.test(file.name)
  if (!okType) throw new Error('Unsupported image type. Please use a PNG, JPG or JPEG file.')
  if (file.size === 0) throw new Error('This image file is empty.')
  if (file.size > MAX_SIGNATURE_UPLOAD_BYTES) throw new Error('This image is larger than 15 MB. Please use a smaller file.')
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be read. It may be corrupted.'))
    img.src = src
  })
}

export async function fileToCanvas(file: File, maxDim = 2400): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas is not supported in this browser.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0)
  return c
}

/** True if a meaningful share of pixels is already transparent. */
export function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let transparent = 0
  const total = data.length / 4
  const step = Math.max(1, Math.floor(total / 40000))
  let sampled = 0
  for (let i = 0; i < total; i += step) {
    sampled++
    if (data[i * 4 + 3] < 200) transparent++
  }
  return transparent / sampled > 0.05
}

/** Estimate the paper brightness (median of the darkest channel). */
export function estimateBackground(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const hist = new Uint32Array(256)
  const total = data.length / 4
  const step = Math.max(1, Math.floor(total / 100000))
  let n = 0
  for (let i = 0; i < total; i += step) {
    const o = i * 4
    if (data[o + 3] < 200) continue
    hist[Math.min(data[o], data[o + 1], data[o + 2])]++
    n++
  }
  if (!n) return 255
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= n / 2) return Math.max(150, v)
  }
  return 255
}

/**
 * Turn a light background transparent while keeping the ink.
 * Alpha ramps from 0 (paper) to 1 (ink) between `hi` and `lo` on the darkest colour channel,
 * and the colour is "un-mixed" from the paper so strokes keep their true colour at the edges.
 *
 * @param cleanup 0–100. Higher removes more faint marks/paper texture.
 */
export function removeBackground(canvas: HTMLCanvasElement, background: number, cleanup: number): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const hi = Math.max(60, background - 2 - cleanup * 0.4)
  const lo = Math.max(0, hi - 75)
  const range = hi - lo
  for (let i = 0; i < d.length; i += 4) {
    const srcA = d[i + 3] / 255
    const m = Math.min(d[i], d[i + 1], d[i + 2])
    let a = m >= hi ? 0 : m <= lo ? 1 : (hi - m) / range
    a *= srcA
    if (a <= 0.003) {
      d[i + 3] = 0
      continue
    }
    if (a < 0.999 && srcA > 0.99) {
      const inv = 1 - a
      for (let c = 0; c < 3; c++) {
        const v = (d[i + c] - inv * background) / a
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
    d[i + 3] = Math.round(a * 255)
  }
  ctx.putImageData(img, 0, 0)
}

/** Replace the colour of every pixel while keeping its alpha. */
export function tintCanvas(canvas: HTMLCanvasElement, hex: string): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  ctx.putImageData(img, 0, 0)
}

/** Crop away transparent margins (keeping a small padding). Returns null if the canvas is blank. */
export function trimCanvas(canvas: HTMLCanvasElement, padRatio = 0.04, alphaThreshold = 10): HTMLCanvasElement | null {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const pad = Math.max(2, Math.round(Math.max(bw, bh) * padRatio))
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const ex = Math.min(w, maxX + 1 + pad)
  const ey = Math.min(h, maxY + 1 + pad)
  const out = document.createElement('canvas')
  out.width = ex - sx
  out.height = ey - sy
  out.getContext('2d')!.drawImage(canvas, sx, sy, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

export function canvasToPng(canvas: HTMLCanvasElement): PngResult {
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

/** Recolor an existing signature PNG (keeps transparency). */
export async function recolorPng(dataUrl: string, hex: string | null): Promise<PngResult> {
  const img = await loadImage(dataUrl)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0)
  if (hex) tintCanvas(c, hex)
  return canvasToPng(c)
}
