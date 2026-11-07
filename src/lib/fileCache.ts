/**
 * In-memory cache of PDF blobs for the current tab. It lets an uploaded document be
 * opened in the editor even when it is too large (or copies are disabled) to be kept
 * in IndexedDB. Nothing here survives a page refresh.
 */
const cache = new Map<string, Blob>()

export const fileCache = {
  get: (id: string) => cache.get(id),
  set: (id: string, blob: Blob) => void cache.set(id, blob),
  delete: (id: string) => void cache.delete(id),
  clear: () => cache.clear(),
}
