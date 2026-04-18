function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Одна строка адреса для публичной страницы: без дублирования города из city и поля address.
 * Не меняет данные в БД и не влияет на построение ссылки на карты (yandex_maps_url).
 */
export function formatPublicAddressLine(city, address) {
  const c = (city || '').trim()
  let a = (address || '').trim()
  if (!c && !a) return ''
  if (!a) return c
  if (!c) return a

  const cLower = c.toLowerCase()
  const aLower = a.toLowerCase()

  if (
    aLower === cLower ||
    aLower.startsWith(cLower + ',') ||
    aLower.startsWith(cLower + ' ') ||
    aLower.startsWith('г. ' + cLower) ||
    aLower.startsWith('г ' + cLower + ',') ||
    aLower.startsWith('г. ' + cLower + ',')
  ) {
    return a
  }

  const trailing = new RegExp(`,\\s*${escapeRegex(c)}\\s*$`, 'i')
  if (trailing.test(a)) {
    a = a.replace(trailing, '').trim()
  }

  return `${c}, ${a}`
}
