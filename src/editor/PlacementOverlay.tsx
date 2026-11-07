import { useRef } from 'react'
import { RotateCw } from 'lucide-react'
import type { Placement, SavedSignature } from '../types'
import { clamp } from '../lib/utils'

export const MIN_WIDTH = 16

interface Props {
  placement: Placement
  signature: SavedSignature | undefined
  zoom: number
  pageWidth: number
  pageHeight: number
  selected: boolean
  onSelect: () => void
  onBegin: () => void
  onChange: (p: Placement) => void
  onEnd: () => void
}

type Corner = { sx: -1 | 1; sy: -1 | 1; cls: string; cursor: string }
const CORNERS: Corner[] = [
  { sx: -1, sy: -1, cls: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { sx: 1, sy: -1, cls: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { sx: 1, sy: 1, cls: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
  { sx: -1, sy: 1, cls: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
]

const rad = (d: number) => (d * Math.PI) / 180
const rot = (x: number, y: number, deg: number) => {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: x * c - y * s, y: x * s + y * c }
}

export function normalizeAngle(a: number): number {
  let v = ((a % 360) + 360) % 360
  if (v > 180) v -= 360
  return Math.round(v * 10) / 10
}

/** Interactive signature box: drag to move, corners to resize (aspect locked), top handle to rotate. */
export function PlacementOverlay({ placement: p, signature, zoom, pageWidth, pageHeight, selected, onSelect, onBegin, onChange, onEnd }: Props) {
  const elRef = useRef<HTMLDivElement>(null)

  const track = (e: React.PointerEvent, move: (ev: PointerEvent) => void) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    onBegin()
    const onMove = (ev: PointerEvent) => move(ev)
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      onEnd()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const startMove = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const sx = e.clientX
    const sy = e.clientY
    const start = p
    track(e, (ev) => {
      const cx = clamp(start.x + start.width / 2 + (ev.clientX - sx) / zoom, 0, pageWidth)
      const cy = clamp(start.y + start.height / 2 + (ev.clientY - sy) / zoom, 0, pageHeight)
      onChange({ ...start, x: cx - start.width / 2, y: cy - start.height / 2 })
    })
  }

  const startResize = (e: React.PointerEvent, c: Corner) => {
    if (e.button !== 0) return
    const start = p
    const r = start.width / start.height
    const cx0 = start.x + start.width / 2
    const cy0 = start.y + start.height / 2
    // Opposite (fixed) corner in page points.
    const o = rot((-c.sx * start.width) / 2, (-c.sy * start.height) / 2, start.rotation)
    const ox = cx0 + o.x
    const oy = cy0 + o.y
    const pageNode = elRef.current!.parentElement!
    track(e, (ev) => {
      const pageEl = pageNode.getBoundingClientRect() // re-read so scrolling mid-drag stays correct
      // Pointer in page points → vector from fixed corner → into the box's own axes.
      const px = (ev.clientX - pageEl.left) / zoom
      const py = (ev.clientY - pageEl.top) / zoom
      const local = rot(px - ox, py - oy, -start.rotation)
      const dot = local.x * c.sx * r + local.y * c.sy
      let h = dot / (r * r + 1)
      let w = h * r
      if (w < MIN_WIDTH) {
        w = MIN_WIDTH
        h = w / r
      }
      const maxW = Math.max(pageWidth, pageHeight) * 1.5
      if (w > maxW) {
        w = maxW
        h = w / r
      }
      const d = rot((c.sx * w) / 2, (c.sy * h) / 2, start.rotation)
      onChange({ ...start, width: w, height: h, x: ox + d.x - w / 2, y: oy + d.y - h / 2 })
    })
  }

  const startRotate = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const start = p
    const box = elRef.current!.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    track(e, (ev) => {
      let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90
      if (ev.shiftKey) a = Math.round(a / 15) * 15
      else {
        // Gentle snapping to the cardinal angles.
        for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(normalizeAngle(a - s)) < 3) a = s
      }
      onChange({ ...start, rotation: normalizeAngle(a) })
    })
  }

  return (
    <div
      ref={elRef}
      data-testid="placement"
      data-placement-id={p.id}
      role="button"
      aria-label={`${signature?.name ?? 'Missing signature'}${selected ? ' (selected)' : ''}`}
      tabIndex={0}
      onPointerDown={startMove}
      onFocus={onSelect}
      className={`absolute cursor-move touch-none select-none ${selected ? 'z-20' : 'z-10'}`}
      style={{
        left: p.x * zoom,
        top: p.y * zoom,
        width: p.width * zoom,
        height: p.height * zoom,
        transform: `rotate(${p.rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      {signature ? (
        <img src={signature.dataUrl} alt="" draggable={false} className="pointer-events-none h-full w-full select-none" style={{ opacity: p.opacity }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center border border-dashed border-red-400 bg-red-50/60 text-[10px] text-red-500">Missing</div>
      )}
      <div className={`pointer-events-none absolute inset-0 ${selected ? 'border-2 border-brand-500' : 'border border-transparent'}`} />
      {selected && (
        <>
          {CORNERS.map((c) => (
            <span
              key={`${c.sx}${c.sy}`}
              data-testid="resize-handle"
              onPointerDown={(e) => startResize(e, c)}
              className={`absolute h-3 w-3 rounded-full border-2 border-brand-500 bg-white shadow ${c.cls}`}
              style={{ cursor: c.cursor }}
            />
          ))}
          <span className="pointer-events-none absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-brand-500" />
          <span
            data-testid="rotate-handle"
            onPointerDown={startRotate}
            className="absolute -top-10 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-brand-500 bg-white text-brand-600 shadow"
            title="Rotate (hold Shift to snap to 15°)"
          >
            <RotateCw className="h-3 w-3" />
          </span>
        </>
      )}
    </div>
  )
}
