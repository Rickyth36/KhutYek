import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileText, FolderOpen, Trash2 } from 'lucide-react'
import { ConfirmDialog, EmptyState, StatusBadge } from './ui'
import { useApp } from '../context/AppContext'
import { fileCache } from '../lib/fileCache'
import { downloadBlob, formatBytes, formatDate, timeAgo } from '../lib/utils'
import type { DocumentRecord } from '../types'

export function DocumentList({ limit, filter }: { limit?: number; filter?: (d: DocumentRecord) => boolean }) {
  const { documents, deleteDocument, getSigned, notify } = useApp()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null)
  const [busy, setBusy] = useState(false)

  const list = (filter ? documents.filter(filter) : documents).slice(0, limit)

  const download = async (d: DocumentRecord) => {
    const signed = await getSigned(d.id)
    if (!signed) {
      notify('error', 'The signed copy is not stored on this device. Open the document and download it again.')
      return
    }
    downloadBlob(signed.blob, signed.name)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteDocument(deleting.id)
      notify('success', 'Document record deleted.')
      setDeleting(null)
    } catch {
      /* toast shown */
    } finally {
      setBusy(false)
    }
  }

  if (list.length === 0) {
    return (
      <EmptyState icon={<FileText className="h-5 w-5" />} title="No documents yet">
        Upload a PDF to start signing. Your document history will appear here.
      </EmptyState>
    )
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="document-list">
        {list.map((d) => {
          const available = d.hasOriginal || !!fileCache.get(d.id)
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid="document-row">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-sm font-medium" title={d.name}>{d.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {d.pageCount} {d.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(d.size)} · {d.placements.length} {d.placements.length === 1 ? 'signature' : 'signatures'}
                </p>
              </div>
              <StatusBadge status={d.status} />
              <p className="w-28 text-xs text-slate-500 dark:text-slate-400" title={formatDate(d.updatedAt)}>{timeAgo(d.updatedAt)}</p>
              <div className="flex items-center gap-1">
                <button className="btn-secondary px-2.5 py-1.5" onClick={() => navigate(`/editor/${d.id}`)} title={available ? 'Reopen in editor' : 'Original not stored – you can re-attach the file'}>
                  <FolderOpen className="h-4 w-4" /> {available ? 'Reopen' : 'Re-attach'}
                </button>
                <button className="btn-icon" onClick={() => void download(d)} disabled={!d.hasSigned} aria-label={`Download signed ${d.name}`} title={d.hasSigned ? 'Download signed PDF' : 'No signed copy stored'}>
                  <Download className="h-4 w-4" />
                </button>
                <button className="btn-icon hover:!text-red-600" onClick={() => setDeleting(d)} aria-label={`Delete ${d.name}`} title="Delete record">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={!!deleting}
        title="Delete document record?"
        message={<>“{deleting?.name}” and any stored copies will be removed from this device. Files you already downloaded are not affected.</>}
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
