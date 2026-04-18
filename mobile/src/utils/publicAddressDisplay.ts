function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Одна строка адреса для публичного экрана — без дублирования города. */
export function formatPublicAddressLine(city: string | null | undefined, address: string | null | undefined): string {
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
