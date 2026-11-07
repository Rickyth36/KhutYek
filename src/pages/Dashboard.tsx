import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FileCheck2, FileText, FileUp, PenLine, Plus, Library } from 'lucide-react'
import { PageHeader } from '../components/Layout'
import { SignatureLibrary } from '../components/SignatureLibrary'
import { SignatureDialog } from '../components/SignatureDialog'
import { DocumentList } from '../components/DocumentList'
import { UploadDropzone } from '../components/UploadDropzone'
import { Spinner } from '../components/ui'
import { useApp } from '../context/AppContext'
import { usePdfUpload } from '../hooks/usePdfUpload'
import { timeAgo } from '../lib/utils'

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</span>
        {label}
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { signatures, documents } = useApp()
  const [creating, setCreating] = useState(false)
  const { upload, busy } = usePdfUpload()
  const input = useRef<HTMLInputElement>(null)

  const signed = documents.filter((d) => d.status === 'signed')
  const lastSigned = signed.slice().sort((a, b) => (b.signedAt ?? 0) - (a.signedAt ?? 0))[0]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Dashboard" subtitle="Sign once, reuse everywhere. Everything stays on this device." />

      {/* Overview */}
      <section aria-labelledby="overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <h2 id="overview" className="sr-only">Overview</h2>
        <Stat icon={<PenLine className="h-4 w-4" />} label="Saved signatures" value={signatures.length} />
        <Stat icon={<FileText className="h-4 w-4" />} label="Documents processed" value={documents.length} hint={`${documents.length - signed.length} not yet signed`} />
        <Stat icon={<FileCheck2 className="h-4 w-4" />} label="Signed documents" value={signed.length} />
        <Stat icon={<FileCheck2 className="h-4 w-4" />} label="Last signed" value={lastSigned?.signedAt ? timeAgo(lastSigned.signedAt) : '—'} hint={lastSigned?.name} />
      </section>

      {/* Quick actions */}
      <section aria-labelledby="quick" className="mt-8">
        <h2 id="quick" className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <button className="card flex items-center gap-3 p-4 text-left transition-shadow hover:shadow-pop" onClick={() => setCreating(true)} data-testid="qa-new-signature">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Plus className="h-5 w-5" /></span>
            <span><span className="block text-sm font-medium">Create a signature</span><span className="block text-xs text-slate-500">Draw or upload</span></span>
          </button>
          <button className="card flex items-center gap-3 p-4 text-left transition-shadow hover:shadow-pop disabled:opacity-60" onClick={() => input.current?.click()} disabled={busy} data-testid="qa-upload">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">{busy ? <Spinner className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}</span>
            <span><span className="block text-sm font-medium">Upload a PDF</span><span className="block text-xs text-slate-500">Open it in the editor</span></span>
          </button>
          <Link className="card flex items-center gap-3 p-4 text-left transition-shadow hover:shadow-pop" to="/signatures">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-white dark:bg-slate-700"><Library className="h-5 w-5" /></span>
            <span><span className="block text-sm font-medium">View saved signatures</span><span className="block text-xs text-slate-500">{signatures.length} saved</span></span>
          </Link>
        </div>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" data-testid="dashboard-pdf-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <UploadDropzone compact />
          <section aria-labelledby="recent" className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 id="recent" className="text-sm font-semibold">Recent documents</h2>
              <Link to="/documents" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">View all <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800"><DocumentList limit={5} /></div>
          </section>
        </div>
        <section aria-labelledby="library" className="card h-fit p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="library" className="text-sm font-semibold">Signature library</h2>
            <Link to="/signatures" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">Manage <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="[&>div]:!grid-cols-1 sm:[&>div]:!grid-cols-2 lg:[&>div]:!grid-cols-1"><SignatureLibrary limit={4} /></div>
        </section>
      </div>

      <SignatureDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
