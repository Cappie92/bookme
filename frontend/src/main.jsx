import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
