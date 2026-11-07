import { useEffect, useState } from 'react'
import { Modal, Spinner } from './ui'
import { InkPicker } from './InkPicker'
import { useApp } from '../context/AppContext'
import type { SavedSignature } from '../types'
import { recolorPng } from '../lib/imageProcessing'

/** Rename a saved signature and optionally recolour its ink. */
export function EditSignatureDialog({ signature, onClose }: { signature: SavedSignature | null; onClose: () => void }) {
  const { updateSignature, notify } = useApp()
  const [name, setName] = useState('')
  const [ink, setInk] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!signature) return
    setName(signature.name)
    setInk(null)
    setPreview(signature.dataUrl)
  }, [signature])

  useEffect(() => {
    if (!signature || !ink) {
      if (signature) setPreview(signature.dataUrl)
      return
    }
    let alive = true
    recolorPng(signature.dataUrl, ink)
      .then((r) => alive && setPreview(r.dataUrl))
      .catch(() => alive && setPreview(signature.dataUrl))
    return () => {
      alive = false
    }
  }, [signature, ink])

  if (!signature) return null

  const save = async () => {
    setSaving(true)
    try {
      const patch: Parameters<typeof updateSignature>[1] = { name }
      if (ink) {
        const r = await recolorPng(signature.dataUrl, ink)
        patch.dataUrl = r.dataUrl
      }
      await updateSignature(signature.id, patch)
      notify('success', 'Signature updated.')
      onClose()
    } catch {
      /* toast already shown */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit signature"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving && <Spinner />}Save changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="checker flex h-32 items-center justify-center rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          {preview && <img src={preview} alt={signature.name} className="max-h-full max-w-full object-contain" />}
        </div>
        <div>
          <label className="label" htmlFor="edit-sig-name">Name</label>
          <input id="edit-sig-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <span className="label">Recolour ink (keeps transparency)</span>
          <InkPicker value={ink} onChange={setInk} allowOriginal />
        </div>
      </div>
    </Modal>
  )
}
