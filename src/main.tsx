import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { configured } from './config'
import ParticipantApp from './participant/ParticipantApp'

const AdminApp = lazy(() => import('./admin/AdminApp'))

function Misconfigured() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Study not configured</h1>
      <p className="mt-2 text-slate-600">
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>) and rebuild.
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      {!configured ? <Misconfigured /> : (
        <Routes>
          <Route path="/admin/*" element={<Suspense fallback={<div className="p-10 text-center text-slate-500">Loading…</div>}><AdminApp /></Suspense>} />
          <Route path="*" element={<ParticipantApp />} />
        </Routes>
      )}
    </HashRouter>
  </StrictMode>,
)
