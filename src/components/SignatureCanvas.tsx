import { useCallback, useEffect, useRef } from 'react'

export interface Stroke {
  points: { x: number; y: number }[]
  width: number
  color: string
}

/** Logical drawing surface. Strokes are stored in these units, so they are resolution-independent. */
export const PAD_W = 720
export const PAD_H = 260
const BACKING = 2

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.save()
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    const pts = s.points
    if (pts.length === 0) continue
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.width
    if (pts.length < 3) {
      // A tap (or a very short flick) becomes a dot / short line.
      ctx.beginPath()
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.moveTo(pts[0].x, pts[0].y)
        ctx.lineTo(pts[1].x, pts[1].y)
        ctx.stroke()
      }
      continue
    }
    // Smooth through midpoints with quadratic curves.
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
  ctx.restore()
}

/** Render strokes to a transparent canvas at high resolution. */
export function renderStrokesToCanvas(strokes: Stroke[], scale = 4): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = PAD_W * scale
  c.height = PAD_H * scale
  drawStrokes(c.getContext('2d', { willReadFrequently: true })!, strokes, scale)
  return c
}

export function SignatureCanvas({ strokes, penWidth, color, onStroke }: { strokes: Stroke[]; penWidth: number; color: string; onStroke: (s: Stroke) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = useRef<Stroke | null>(null)
  const activePointer = useRef<number | null>(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawStrokes(ctx, current.current ? [...strokes, current.current] : strokes, BACKING)
  }, [strokes])

  useEffect(redraw, [redraw])

  const toPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) * PAD_W) / rect.width, y: ((e.clientY - rect.top) * PAD_H) / rect.height }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (activePointer.current !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    activePointer.current = e.pointerId
    current.current = { points: [toPoint(e)], width: penWidth, color }
    redraw()
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId || !current.current) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    const list = events.length ? events : [e.nativeEvent]
    for (const ev of list) {
      const p = toPoint(ev)
      const prev = current.current.points[current.current.points.length - 1]
      if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.6) current.current.points.push(p)
    }
    redraw()
  }
  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return
    activePointer.current = null
    const s = current.current
    current.current = null
    if (s && s.points.length) onStroke(s)
    else redraw()
  }

  return (
    <canvas
      ref={canvasRef}
      width={PAD_W * BACKING}
      height={PAD_H * BACKING}
      data-testid="signature-canvas"
      className="block w-full cursor-crosshair touch-none select-none rounded-xl"
      style={{ aspectRatio: `${PAD_W} / ${PAD_H}` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-label="Signature drawing area"
    />
  )
}
