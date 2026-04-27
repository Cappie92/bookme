/**
 * Яндекс.Метрика: загрузка tag.js, init, page hit (SPA), reachGoal.
 * Счётчик ID задан в коде счётчика.
 */

const COUNTER_ID = 108773879
const TAG_URL = 'https://mc.yandex.ru/metrika/tag.js'

let initPromise = null

function loadYm() {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  if (window.ym) {
    return Promise.resolve()
  }
  for (let j = 0; j < document.scripts.length; j += 1) {
    if (document.scripts[j].src === TAG_URL) {
      return new Promise((resolve) => {
        const t = setInterval(() => {
          if (window.ym) {
            clearInterval(t)
            resolve()
          }
        }, 30)
        setTimeout(() => {
          clearInterval(t)
          resolve()
        }, 8000)
      })
    }
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.async = true
    s.src = `${TAG_URL}?id=${COUNTER_ID}`
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('metrika tag.js load error'))
    document.head.appendChild(s)
  })
}

/**
 * Один раз: загрузка + ym(init). Далее page hit вызывается вручную на смене роута.
 */
export function metrikaInitOnce() {
  if (initPromise) {
    return initPromise
  }
  initPromise = (async () => {
    if (typeof window === 'undefined') {
      return
    }
    await loadYm()
    if (typeof window.ym !== 'function') {
      return
    }
    const ref = document.referrer || undefined
    window.ym(
      COUNTER_ID,
      'init',
      {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: 'dataLayer',
        accurateTrackBounce: true,
        trackLinks: true,
        referer: ref,
        // Виртуальные pageview при смене роута — в MetrikaRouteListener
        defer: true,
      }
    )
  })()
  return initPromise
}

export function metrikaPageView() {
  if (typeof window === 'undefined' || typeof window.ym !== 'function') {
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
  window.ym(COUNTER_ID, 'hit', url, opts)
}

/**
 * @param {string} name — короткое имя goal (см. metrikaEvents.js)
 * @param {Record<string, unknown>} [params] — params для отчёта
 */
export function metrikaGoal(name, params) {
  if (typeof window === 'undefined' || !name) {
    return
  }
  if (typeof window.ym === 'function') {
    if (params && Object.keys(params).length > 0) {
      window.ym(COUNTER_ID, 'reachGoal', name, params)
    } else {
      window.ym(COUNTER_ID, 'reachGoal', name)
    }
  }
}
