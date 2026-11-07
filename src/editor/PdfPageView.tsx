import { forwardRef, useEffect, useRef, useState, type DragEventHandler, type ReactNode } from 'react'
import type { PDFDocumentProxy, RenderTask } from '../lib/pdf'
import { isRenderCancelled } from '../lib/pdf'

const MAX_CANVAS_PIXELS = 16_000_000

/**
 * One PDF page. `width`/`height` are the displayed page size in PDF points; the element is
 * `width × zoom` CSS pixels wide, so CSS px = points × zoom everywhere in the editor.
 * The page bitmap is only rendered while near the viewport and is double-buffered so
 * zooming never flashes blank.
 */
export const PdfPageView = forwardRef<
  HTMLDivElement,
  {
    pdf: PDFDocumentProxy
    index: number
    width: number
    height: number
    zoom: number
    children?: ReactNode
    onPointerDownBackground?: () => void
    onDragOver?: DragEventHandler<HTMLDivElement>
    onDrop?: DragEventHandler<HTMLDivElement>
    label?: string
  }
>(function PdfPageView({ pdf, index, width, height, zoom, children, onPointerDownBackground, onDragOver, onDrop, label }, ref) {
  const wrapper = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)

  const setRefs = (el: HTMLDivElement | null) => {
    wrapper.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const display = canvasRef.current
    if (!visible) {
      // Free memory for pages far from the viewport.
      if (display && display.width > 1) {
        display.width = 1
        display.height = 1
        setRendered(false)
      }
      return
    }
    if (!display) return
    let cancelled = false
    let task: RenderTask | null = null
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(index + 1)
        if (cancelled) return
        const dpr = Math.min(window.devicePixelRatio || 1, 3)
        let scale = zoom * dpr
        const base = page.getViewport({ scale: 1 })
        const px = base.width * scale * base.height * scale
        if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px)
        const viewport = page.getViewport({ scale })
        const off = document.createElement('canvas')
        off.width = Math.max(1, Math.floor(viewport.width))
        off.height = Math.max(1, Math.floor(viewport.height))
        task = page.render({ canvas: off, viewport, background: '#ffffff' } as Parameters<typeof page.render>[0])
        await task.promise
        if (cancelled) return
        display.width = off.width
        display.height = off.height
        display.getContext('2d')!.drawImage(off, 0, 0)
        setRendered(true)
        setError(null)
        page.cleanup()
      } catch (e) {
        if (!isRenderCancelled(e) && !cancelled) setError('This page could not be rendered.')
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
      task?.cancel()
    }
  }, [visible, pdf, index, zoom])

  return (
    <div
      ref={setRefs}
      data-page-index={index}
      data-testid="pdf-page"
      aria-label={label ?? `Page ${index + 1}`}
      className="relative bg-white shadow-card ring-1 ring-slate-200 dark:ring-slate-700"
      style={{ width: width * zoom, height: height * zoom }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || e.target === canvasRef.current) onPointerDownBackground?.()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" width={1} height={1} />
      {!rendered && !error && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-300">Page {index + 1}</div>}
      {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">{error}</div>}
      {children}
    </div>
  )
})
