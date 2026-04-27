import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Recovery от stale chunk после деплоя (1 controlled reload, без loop)
// Причина: "Failed to fetch dynamically imported module" / ChunkLoadError при lazy-import после обновления ассетов.
;(() => {
  if (typeof window === 'undefined') return
  const RELOAD_KEY = 'dedato_reload_once_after_chunk_error'

  const shouldReloadForError = (message) => {
    if (!message) return false
    const m = String(message)
    return (
      m.includes('Failed to fetch dynamically imported module') ||
      m.includes('ChunkLoadError') ||
      /Loading chunk \d+ failed/i.test(m) ||
      /Importing a module script failed/i.test(m)
    )
  }

  const reloadOnce = () => {
    try {
      if (window.sessionStorage.getItem(RELOAD_KEY) === '1') return
      window.sessionStorage.setItem(RELOAD_KEY, '1')
    } catch {
      // если sessionStorage недоступен — лучше не рисковать loop
      return
    }
    window.location.reload()
  }

  window.addEventListener('error', (e) => {
    if (shouldReloadForError(e?.message)) reloadOnce()
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason
    const msg = reason?.message || reason?.toString?.() || ''
    if (shouldReloadForError(msg)) reloadOnce()
  })
})()

// TEMP DEBUG — remove this block after fixing the tracked runtime error
if (import.meta.env.DEV) {
  const _qs = new URLSearchParams(window.location.search)
  if (_qs.get('debugErrors') === '1') {
    void import('./tempDebugErrorCapture.js').then((m) => m.installTempErrorCapture())
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
