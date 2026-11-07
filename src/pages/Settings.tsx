import { useEffect, useState } from 'react'
import { HardDrive, Lock, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/Layout'
import { ConfirmDialog, Switch } from '../components/ui'
import { useApp, type Theme } from '../context/AppContext'
import { storageEstimate } from '../lib/db'
import { formatBytes } from '../lib/utils'

export default function Settings() {
  const { theme, setTheme, settings, setKeepCopies, clearAll, notify, signatures, documents, persistent } = useApp()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)

  useEffect(() => {
    void storageEstimate().then(setUsage)
  }, [signatures.length, documents.length])

  const wipe = async () => {
    setBusy(true)
    try {
      await clearAll()
      notify('success', 'All KhutYek data was deleted from this device.')
      setConfirm(false)
    } catch {
      /* toast shown */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Settings" subtitle="Appearance, storage and privacy." />
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={theme === t ? 'btn-primary capitalize' : 'btn-secondary capitalize'}>
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Keep copies of PDFs on this device</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Lets you reopen a document and re-download the signed file later. Turn this off to keep only signatures and history – PDFs then stay in memory until you refresh.
              </p>
            </div>
            <Switch checked={settings.keepCopies} onChange={setKeepCopies} label="Keep copies of PDFs" />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4" /> Privacy</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            KhutYek has no server, no accounts and no analytics. Documents and signatures are processed and stored only in this browser (IndexedDB) and are never transmitted anywhere. Fonts and scripts are bundled with the app.
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <HardDrive className="h-4 w-4" />
            {persistent ? 'Persistent browser storage is active.' : 'Persistent storage is unavailable – data lives in memory for this tab only.'}
            {usage && <span className="text-slate-400">Using {formatBytes(usage.usage)} of {formatBytes(usage.quota)}.</span>}
          </p>
        </section>

        <section className="card border-red-200 p-5 dark:border-red-500/30">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Delete all local data</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Removes all {signatures.length} saved signature{signatures.length === 1 ? '' : 's'}, {documents.length} document record{documents.length === 1 ? '' : 's'}, stored PDFs and settings. This cannot be undone.
          </p>
          <button className="btn-danger mt-4" onClick={() => setConfirm(true)} data-testid="delete-all">
            <Trash2 className="h-4 w-4" /> Delete all data
          </button>
        </section>
      </div>
      <ConfirmDialog open={confirm} title="Delete all data?" message="Every saved signature, document record and stored PDF on this device will be permanently erased." confirmLabel="Delete everything" busy={busy} onConfirm={wipe} onCancel={() => setConfirm(false)} />
    </div>
  )
}
