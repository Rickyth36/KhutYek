import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { DocumentList } from '../components/DocumentList'
import { UploadDropzone } from '../components/UploadDropzone'
import type { DocStatus } from '../types'

const tabs: { id: 'all' | DocStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'uploaded', label: 'Uploaded' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'signed', label: 'Signed' },
]

export default function Documents() {
  const [tab, setTab] = useState<'all' | DocStatus>('all')
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Documents" subtitle="History of the documents you opened or signed." />
      <UploadDropzone compact />
      <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 sm:w-fit" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="card mt-3 overflow-hidden">
        <DocumentList filter={tab === 'all' ? undefined : (d) => d.status === tab} />
      </div>
    </div>
  )
}
