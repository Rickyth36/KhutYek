import { useCallback, useRef, useState } from 'react'

const LIMIT = 100

/**
 * Undo/redo state container. The refs are the source of truth (so undo/redo never depend on
 * stale closures or state-updater ordering); `version` only exists to trigger re-renders.
 *
 *  - apply(next, key?)  : a discrete change (one undo step). Same `key` within 1s coalesces (typing in a field).
 *  - begin/update/end   : a continuous gesture (drag, resize, rotate) that becomes a single undo step.
 */
export function useHistory<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial)
  const [, setVersion] = useState(0)
  const presentRef = useRef<T>(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const gesture = useRef<{ base: T } | null>(null)
  const last = useRef<{ key: string; t: number } | null>(null)

  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const put = useCallback((v: T) => {
    presentRef.current = v
    setPresent(v)
  }, [])
  const pushPast = (v: T) => {
    past.current.push(v)
    if (past.current.length > LIMIT) past.current.shift()
  }

  const reset = useCallback(
    (v: T) => {
      gesture.current = null
      last.current = null
      past.current = []
      future.current = []
      put(v)
      bump()
    },
    [put, bump],
  )

  const apply = useCallback(
    (next: T | ((p: T) => T), key?: string) => {
      const prev = presentRef.current
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      if (value === prev) return
      const now = Date.now()
      const coalesce = !!key && last.current?.key === key && now - last.current.t < 1000
      if (!coalesce) pushPast(prev)
      last.current = key ? { key, t: now } : null
      future.current = []
      put(value)
      bump()
    },
    [put, bump],
  )

  const begin = useCallback(() => {
    gesture.current = { base: presentRef.current }
    last.current = null
  }, [])
  const update = useCallback(
    (next: T | ((p: T) => T)) => {
      put(typeof next === 'function' ? (next as (p: T) => T)(presentRef.current) : next)
    },
    [put],
  )
  const end = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    if (g && g.base !== presentRef.current) {
      pushPast(g.base)
      future.current = []
      bump()
    }
  }, [bump])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.unshift(presentRef.current)
    last.current = null
    put(prev)
    bump()
  }, [put, bump])
  const redo = useCallback(() => {
    const next = future.current.shift()
    if (next === undefined) return
    pushPast(presentRef.current)
    last.current = null
    put(next)
    bump()
  }, [put, bump])

  return { present, apply, begin, update, end, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}
