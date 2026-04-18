/**
 * TEMP DEBUG — remove entire file after fixing the tracked runtime error.
 * Safe dev-only error capture: localStorage + small fixed overlay (?debugErrors=1).
 */

const STORAGE_KEY = '__dedato_last_error__'
/** TEMP DEBUG — last handled apiRequest / fetch-layer failure (not uncaught). */
const HANDLED_API_KEY = '__dedato_last_handled_api__'
const OVERLAY_ID = '__dedato_temp_error_overlay__'
const MAX_MESSAGE_CHARS = 2000
const MAX_STACK_CHARS = 6000
const MAX_BODY_PREVIEW = 3000

/** TEMP DEBUG — gate for all helpers in this file (dev + query flag). */
export function isTempDebugErrorsEnabled() {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debugErrors') === '1'
}

function truncate(s, n) {
  if (s == null || s === '') return ''
  const t = String(s)
  return t.length <= n ? t : `${t.slice(0, n)}\n… [truncated]`
}

function parseStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    return o
  } catch {
    return null
  }
}

function parseHandledApi() {
  try {
    const raw = localStorage.getItem(HANDLED_API_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    return o
  } catch {
    return null
  }
}

function persist(rec) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec))
  } catch {
    /* ignore quota / private mode */
  }
}

function buildTextRecord(rec) {
  return [
    `kind: ${rec.kind}`,
    `at: ${rec.at}`,
    `url: ${rec.url}`,
    `message: ${rec.message}`,
    `stack:\n${rec.stack || '(none)'}`,
  ].join('\n')
}

function buildHandledApiText(rec) {
  if (!rec) return '(no handled API record)'
  return [
    `phase: ${rec.phase}`,
    `at: ${rec.at}`,
    `pageUrl: ${rec.pageUrl}`,
    `source: ${rec.source}`,
    `${rec.method} ${rec.fullUrl || rec.endpoint}`,
    `endpoint: ${rec.endpoint}`,
    rec.status != null ? `status: ${rec.status} ${rec.statusText || ''}` : 'status: (n/a)',
    `errorMessage: ${rec.errorMessage}`,
    `errorStack:\n${rec.errorStack || '(none)'}`,
    `responseBodyPreview:\n${rec.responseBodyPreview || '(none)'}`,
  ].join('\n')
}

/**
 * TEMP DEBUG — log handled API failure (axios-like errors + raw fetch failures without response).
 * Called from api.js apiRequest; does nothing unless isTempDebugErrorsEnabled().
 */
export function tempDebugLogHandledApiFailure(payload) {
  if (!isTempDebugErrorsEnabled()) return
  const rec = {
    at: new Date().toISOString(),
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    source: payload.source || 'apiRequest',
    endpoint: payload.endpoint || '',
    method: String(payload.method || 'GET').toUpperCase(),
    fullUrl: payload.fullUrl || '',
    phase: payload.phase || 'unknown',
    status: payload.status ?? null,
    statusText: payload.statusText ?? '',
    responseBodyPreview: truncate(payload.responseBodyPreview || '', MAX_BODY_PREVIEW),
    errorMessage: truncate(payload.errorMessage || '', MAX_MESSAGE_CHARS),
    errorStack: truncate(payload.errorStack || '', MAX_STACK_CHARS),
  }
  try {
    localStorage.setItem(HANDLED_API_KEY, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
  renderCombinedOverlay()
}

function reasonMessage(reason) {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object') {
    try {
      return JSON.stringify(reason)
    } catch {
      return String(reason)
    }
  }
  return String(reason)
}

function reasonStack(reason) {
  return reason instanceof Error ? reason.stack || '' : ''
}

function ensureOverlay() {
  let el = document.getElementById(OVERLAY_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = OVERLAY_ID
  el.setAttribute('data-temp-debug', 'true')
  el.style.cssText = [
    'position:fixed',
    'right:8px',
    'bottom:8px',
    'max-width:min(420px,calc(100vw - 16px))',
    'max-height:40vh',
    'overflow:auto',
    'z-index:2147483646',
    'font-family:ui-monospace,monospace',
    'font-size:11px',
    'line-height:1.35',
    'color:#f8fafc',
    'background:rgba(15,23,42,0.94)',
    'border:1px solid rgba(248,113,113,0.55)',
    'border-radius:8px',
    'padding:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
    'pointer-events:auto',
  ].join(';')
  document.body.appendChild(el)
  return el
}

function renderCombinedOverlay() {
  if (!isTempDebugErrorsEnabled()) return
  const uncaught = parseStored()
  const handled = parseHandledApi()
  const el = ensureOverlay()
  el.replaceChildren()

  const title = document.createElement('div')
  title.textContent = 'TEMP DEBUG (?debugErrors=1)'
  title.style.cssText = 'font-weight:700;margin-bottom:6px;color:#fca5a5;'
  el.appendChild(title)

  const subUncaught = document.createElement('div')
  subUncaught.textContent = '— Uncaught (window.onerror / unhandledrejection) —'
  subUncaught.style.cssText = 'font-weight:600;color:#93c5fd;margin:4px 0 2px;'
  el.appendChild(subUncaught)

  const metaUncaught = document.createElement('div')
  metaUncaught.style.cssText = 'white-space:pre-wrap;word-break:break-word;'
  if (!uncaught) {
    metaUncaught.textContent = '(none yet)'
  } else {
    metaUncaught.textContent = [
      uncaught.kind,
      uncaught.at,
      uncaught.url,
      '',
      uncaught.message,
      '',
      uncaught.stack || '(no stack)',
    ].join('\n')
  }
  el.appendChild(metaUncaught)

  const subHandled = document.createElement('div')
  subHandled.textContent = '— Handled API (utils/api apiRequest) —'
  subHandled.style.cssText = 'font-weight:600;color:#86efac;margin:8px 0 2px;'
  el.appendChild(subHandled)

  const metaHandled = document.createElement('div')
  metaHandled.style.cssText = 'white-space:pre-wrap;word-break:break-word;'
  if (!handled) {
    metaHandled.textContent =
      '(none yet — «Ошибка сети» from apiGet/apiPost usually appears here after the failing request)'
  } else {
    metaHandled.textContent = buildHandledApiText(handled)
  }
  el.appendChild(metaHandled)

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;'

  const btnCopy = document.createElement('button')
  btnCopy.type = 'button'
  btnCopy.textContent = 'Copy all'
  btnCopy.style.cssText =
    'cursor:pointer;padding:4px 8px;font:inherit;border-radius:4px;border:1px solid #64748b;background:#334155;color:#e2e8f0;'
  btnCopy.onclick = () => {
    const parts = [
      '=== UNCAUGHT ===',
      uncaught ? buildTextRecord(uncaught) : '(none)',
      '',
      '=== HANDLED API ===',
      buildHandledApiText(handled),
    ]
    void navigator.clipboard?.writeText(parts.join('\n'))
  }

  const btnClear = document.createElement('button')
  btnClear.type = 'button'
  btnClear.textContent = 'Clear all'
  btnClear.style.cssText = btnCopy.style.cssText
  btnClear.onclick = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(HANDLED_API_KEY)
    renderCombinedOverlay()
  }

  row.appendChild(btnCopy)
  row.appendChild(btnClear)
  el.appendChild(row)
}

function record(kind, message, stack) {
  const rec = {
    kind,
    at: new Date().toISOString(),
    url: window.location.href,
    message: truncate(message, MAX_MESSAGE_CHARS),
    stack: truncate(stack || '', MAX_STACK_CHARS),
  }
  persist(rec)
  renderCombinedOverlay()
}

/**
 * TEMP DEBUG — install global handlers + overlay. Dev + ?debugErrors=1 only.
 */
export function installTempErrorCapture() {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  if (new URLSearchParams(window.location.search).get('debugErrors') !== '1') return
  if (window.__dedatoTempErrorCaptureInstalled) return
  window.__dedatoTempErrorCaptureInstalled = true

  if (document.body) {
    renderCombinedOverlay()
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        renderCombinedOverlay()
      },
      { once: true },
    )
  }

  const prevOnerror = window.onerror
  window.onerror = function onDedatoTempError(message, source, lineno, colno, error) {
    try {
      const stack = error?.stack || `${source}:${lineno}:${colno}`
      record('error', message, stack)
    } catch {
      /* never throw from TEMP DEBUG */
    }
    if (typeof prevOnerror === 'function') {
      return prevOnerror.apply(this, arguments)
    }
    return false
  }

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const r = event.reason
      record('unhandledrejection', reasonMessage(r), reasonStack(r))
    } catch {
      /* never throw from TEMP DEBUG */
    }
  })
}
