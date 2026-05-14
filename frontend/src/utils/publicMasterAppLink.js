/**
 * Deep link в нативное приложение: публичная запись /m/:slug (Expo Router).
 *
 * Важно: форма `dedato://m/<slug>` на Android даёт host=m и path=/slug — intent-filter
 * с pathPrefix `/m` не срабатывает, кнопка «молчит». Нужен путь `/m/<slug>`:
 * `dedato:/m/<slug>` (или `dedato:///m/...` после нормализации в приложении).
 *
 * В dev (Vite) опционально: VITE_EXPO_DEV_ROUTER_PREFIX=exp://10.0.2.2:8081/--
 * → откроется Expo Go / dev client: exp://10.0.2.2:8081/--/m/<slug>
 */
export function buildPublicMasterAppDeepLink(slug) {
  const s = String(slug ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
  if (!s) return null

  const encoded = encodeURIComponent(s)

  try {
    const dev =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.DEV === true
    const expoPrefix =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      String(import.meta.env.VITE_EXPO_DEV_ROUTER_PREFIX || '').trim()
    if (dev && expoPrefix) {
      const base = expoPrefix.replace(/\/+$/, '')
      return `${base}/m/${encoded}`
    }
  } catch {
    /* ignore */
  }

  return `dedato:/m/${encoded}`
}

/**
 * Открытие custom scheme из mobile Safari/Chrome: надёжнее, чем только location.href.
 */
export function openPublicMasterAppDeepLink(slug) {
  const url = buildPublicMasterAppDeepLink(slug)
  if (!url) return

  try {
    const a = document.createElement('a')
    a.setAttribute('href', url)
    a.setAttribute('rel', 'noopener noreferrer')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    try {
      window.location.assign(url)
    } catch {
      window.location.href = url
    }
  }
}
