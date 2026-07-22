/**
 * Яндекс.Метрика: загрузка tag.js, init, page hit (SPA), reachGoal.
 * ID счётчика: VITE_YANDEX_METRIKA_ID или дефолт 108773879.
 * Важно: tag.js грузится БЕЗ ?id= — иначе отдаётся auto-init бандл без window.ym API.
 */

const DEFAULT_COUNTER_ID = 108773879
export const METRIKA_TAG_URL = 'https://mc.yandex.ru/metrika/tag.js'

let initPromise = null

/**
 * @param {ImportMetaEnv | Record<string, string | undefined>} [env]
 * @returns {number | null}
 */
export function resolveMetrikaCounterId(env = import.meta.env) {
  const raw = env?.VITE_YANDEX_METRIKA_ID
  if (raw === '' || raw === '0' || raw === 'false') {
    return null
  }
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(String(raw).trim())
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
  }
  return DEFAULT_COUNTER_ID
}

/**
 * Очередь вызовов до загрузки tag.js (официальный паттерн Яндекса).
 * Важно: push(arguments), не rest-array — как в snippet Метрики.
 * @param {Window & { ym?: (...args: unknown[]) => void }} win
 */
export function ensureYmStub(win = window) {
  if (typeof win === 'undefined' || typeof win.ym === 'function') {
    return
  }
  const stub = function ymStub() {
    ;(stub.a = stub.a || []).push(arguments)
  }
  stub.l = 1 * new Date()
  win.ym = stub
}

function scriptSrcMatchesTagUrl(src) {
  if (!src) return false
  return src === METRIKA_TAG_URL || src.startsWith(`${METRIKA_TAG_URL}?`)
}

function loadTagScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve()
  }

  ensureYmStub(window)

  for (let j = 0; j < document.scripts.length; j += 1) {
    if (scriptSrcMatchesTagUrl(document.scripts[j].src)) {
      return Promise.resolve()
    }
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.async = true
    s.src = METRIKA_TAG_URL
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('metrika tag.js load error'))
    document.head.appendChild(s)
  })
}

function getCounterId() {
  return resolveMetrikaCounterId()
}

/**
 * Один раз: stub + tag.js + ym(init). Page hit — в MetrikaRouteListener.
 */
export function metrikaInitOnce() {
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    if (typeof window === 'undefined') {
      return
    }

    const counterId = getCounterId()
    if (!counterId) {
      return
    }

    ensureYmStub(window)
    // SPA init: defer + manual hit. Не передавать ssr:true —
    // явный ssr:true ломает создание yaCounter / watch (проверено на tag.js).
    window.ym(counterId, 'init', {
      defer: true,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      ecommerce: 'dataLayer',
    })

    await loadTagScript()
    if (typeof window.ym !== 'function') {
      return
    }
  })()

  return initPromise
}

export function metrikaPageView() {
  if (typeof window === 'undefined') {
    return
  }
  const counterId = getCounterId()
  if (!counterId) {
    return
  }
  ensureYmStub(window)
  if (typeof window.ym !== 'function') {
    return
  }

  const url = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`
  const opts = { title: document.title }
  if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer)
      opts.referer = refUrl.toString()
    } catch {
      // ignore
    }
  }
  window.ym(counterId, 'hit', url, opts)
}

/**
 * @param {string} name — короткое имя goal (см. metrikaEvents.js)
 * @param {Record<string, unknown>} [params]
 */
export function metrikaGoal(name, params) {
  if (typeof window === 'undefined' || !name) {
    return
  }
  const counterId = getCounterId()
  if (!counterId) {
    return
  }
  ensureYmStub(window)
  if (typeof window.ym !== 'function') {
    return
  }
  if (params && Object.keys(params).length > 0) {
    window.ym(counterId, 'reachGoal', name, params)
  } else {
    window.ym(counterId, 'reachGoal', name)
  }
}

/** @internal */
export function __resetMetrikaForTests() {
  initPromise = null
}
