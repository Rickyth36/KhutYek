import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Spinner, Toaster } from './components/ui'
import Dashboard from './pages/Dashboard'
import Signatures from './pages/Signatures'
import Documents from './pages/Documents'
import Settings from './pages/Settings'

// The editor (PDF.js + pdf-lib) is the heaviest part, so it loads on demand.
const Editor = lazy(() => import('./editor/Editor'))

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg font-semibold">Page not found</p>
      <Link to="/" className="btn-primary">Back to dashboard</Link>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-slate-400">
            <Spinner className="h-6 w-6" />
          </div>
        }
      >
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="signatures" element={<Signatures />} />
            <Route path="documents" element={<Documents />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="editor/:id" element={<Editor />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
