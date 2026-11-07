/**
 * Coordinate system
 * -----------------
 * Editor space ("view space"): PDF points of the *displayed* page, origin top-left, y down.
 *   This is exactly the viewport PDF.js produces at scale = 1, so
 *       css pixels  =  points × zoom
 *   and the editor never stores pixels.
 *
 * PDF user space: the space pdf-lib draws in. Origin at the bottom-left corner of the
 * visible box (CropBox ∩ MediaBox), y up, *before* the page's /Rotate entry is applied.
 *
 * `viewToUser` converts between the two for every combination of page /Rotate (0/90/180/270)
 * and non-zero box origins, so a signature lands at the same visual spot it had in the editor.
 */

export type PageRotation = 0 | 90 | 180 | 270

export interface PageBox {
  /** Origin of the visible box in PDF user space. */
  x: number
  y: number
  /** Size of the visible box in PDF user space (before /Rotate). */
  width: number
  height: number
  rotation: PageRotation
}

export interface Point {
  x: number
  y: number
}

export interface BoxGeometry {
  x: number
  y: number
  width: number
  height: number
  /** Degrees, clockwise on screen. */
  rotation: number
}

export function normalizeRotation(angle: number): PageRotation {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360
  return a as PageRotation
}

/** Size of the page as displayed (swapped for 90°/270° pages), in points. */
export function displayedSize(box: PageBox): { width: number; height: number } {
  return box.rotation === 90 || box.rotation === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height }
}

/** View space (top-left origin, y down, rotation applied) → PDF user space. */
export function viewToUser(box: PageBox, vx: number, vy: number): Point {
  const { width: w, height: h } = box
  let a: number
  let b: number
  switch (box.rotation) {
    case 0:
      a = vx
      b = h - vy
      break
    case 90:
      a = vy
      b = vx
      break
    case 180:
      a = w - vx
      b = vy
      break
    default: // 270
      a = w - vy
      b = h - vx
      break
  }
  return { x: box.x + a, y: box.y + b }
}

export interface DrawParams {
  /** Bottom-left corner of the image in PDF user space (pdf-lib's drawImage x/y). */
  x: number
  y: number
  width: number
  height: number
  /** Counter-clockwise rotation about (x, y), in degrees (pdf-lib `rotate`). */
  angle: number
}

/**
 * Convert an editor placement (view space, centre-rotated, clockwise) into the
 * parameters pdf-lib needs (bottom-left anchored, counter-clockwise).
 */
export function placementToDrawParams(p: BoxGeometry, box: PageBox): DrawParams {
  const th = (p.rotation * Math.PI) / 180
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  const cx = p.x + p.width / 2
  const cy = p.y + p.height / 2
  // Unit vectors of the image's own axes, expressed in view space.
  const xdir = { x: cos, y: sin } // image "right"
  const down = { x: -sin, y: cos } // image "down"
  const blView = {
    x: cx - (p.width / 2) * xdir.x + (p.height / 2) * down.x,
    y: cy - (p.width / 2) * xdir.y + (p.height / 2) * down.y,
  }
  const brView = { x: blView.x + p.width * xdir.x, y: blView.y + p.width * xdir.y }
  const bl = viewToUser(box, blView.x, blView.y)
  const br = viewToUser(box, brView.x, brView.y)
  const angle = (Math.atan2(br.y - bl.y, br.x - bl.x) * 180) / Math.PI
  return { x: bl.x, y: bl.y, width: p.width, height: p.height, angle }
}

/** Corners of a (possibly rotated) box in view space: tl, tr, br, bl. */
export function boxCorners(p: BoxGeometry): [Point, Point, Point, Point] {
  const th = (p.rotation * Math.PI) / 180
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  const cx = p.x + p.width / 2
  const cy = p.y + p.height / 2
  const map = (lx: number, ly: number): Point => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  })
  const hw = p.width / 2
  const hh = p.height / 2
  return [map(-hw, -hh), map(hw, -hh), map(hw, hh), map(-hw, hh)]
}

export const pointsToPx = (points: number, zoom: number) => points * zoom
export const pxToPoints = (px: number, zoom: number) => px / zoom
