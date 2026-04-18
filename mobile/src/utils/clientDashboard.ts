/**
 * Утилиты для ClientDashboard (форматирование дат, нормализация ID мастеров)
 */

/**
 * Форматирует цену: "1 200 ₽" (пробел как разделитель тысяч)
 */
export function formatPrice(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount))) return ''
  const n = Math.round(Number(amount))
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

/**
 * Извлекает цену из booking. Приоритет: price → service_price → payment_amount → total_price.
 */
export function getBookingPrice(booking: any): number | null | undefined {
  const b = booking ?? {}
  const v = b.price ?? b.service_price ?? b.payment_amount ?? b.total_price
  if (v == null) return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

/**
 * Форматирует цену для отображения. Если строка уже содержит ₽ — не дублирует.
 */
export function formatPriceDisplay(amount: number | string | null | undefined): string {
  if (amount == null) return ''
  if (typeof amount === 'string') {
    if (/₽|руб|RUB/i.test(amount)) return amount.trim()
    const n = Number(amount.replace(/\s/g, ''))
    if (isNaN(n)) return ''
    return formatPrice(n)
  }
  return formatPrice(amount)
}

/**
 * Форматирует дату в формат ДД.ММ.ГГ
 * @param dateStr ISO datetime string
 * @returns Строка формата "01.02.26"
 */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '-'
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = String(date.getFullYear()).slice(-2)
    
    return `${day}.${month}.${year}`
  } catch (error) {
    return '-'
  }
}

/**
 * Форматирует дату и время в формат ДД.ММ.ГГ, ЧЧ:ММ
 * @param dateStr ISO datetime string
 * @returns Строка формата "01.02.26, 14:30"
 */
export function formatDateTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '-'
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = String(date.getFullYear()).slice(-2)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    return `${day}.${month}.${year}, ${hours}:${minutes}`
  } catch (error) {
    return '-'
  }
}

/**
 * Форматирует диапазон даты/времени в формат ДД.ММ.ГГ, ЧЧ:ММ–ЧЧ:ММ
 * Если end_time нет или совпадает — возвращает ДД.ММ.ГГ, ЧЧ:ММ
 */
export function formatDateTimeRange(
  startStr: string | null | undefined,
  endStr?: string | null
): string {
  const start = formatDateTimeShort(startStr)
  if (start === '-') return '-'
  if (!endStr) return start
  
  try {
    const startDate = new Date(startStr!)
    const endDate = new Date(endStr)
    if (isNaN(endDate.getTime())) return start
    
    const sameDay = startDate.toDateString() === endDate.toDateString()
    if (!sameDay) return start
    
    const endHours = String(endDate.getHours()).padStart(2, '0')
    const endMinutes = String(endDate.getMinutes()).padStart(2, '0')
    const startHours = String(startDate.getHours()).padStart(2, '0')
    const startMinutes = String(startDate.getMinutes()).padStart(2, '0')
    
    if (startHours === endHours && startMinutes === endMinutes) return start
    
    const [datePart] = start.split(', ')
    return `${datePart}, ${startHours}:${startMinutes}–${endHours}:${endMinutes}`
  } catch {
    return start
  }
}

/**
 * Нормализует ID мастера из различных полей booking/favorite объекта.
 * Master-only: используем только master_id (indie_master_id не используется для favorites).
 * @param row Объект с данными мастера (booking, favorite, etc)
 * @returns Number ID или null
 */
export function getMasterKey(row: any): number | null {
  const id = row.master_id ??
             row.masterId ??
             row.master?.id ??
             row.master?.master_id ??
             row.master_user_id ??
             row.master?.user_id ??
             row.masterUserId

  const numId = Number(id)
  if (isNaN(numId) || numId === 0) return null
  return numId
}

/** Master-only: favKey всегда "master:N" */
export type FavoriteType = 'master'

/**
 * Canonical ключ избранного. Master-only: "master:${master_id}"
 */
export function getFavoriteKey(type: FavoriteType, id: number): string {
  return `master:${Number(id)}`
}

/**
 * Canonical ключ из booking. Master-only: только master_id.
 */
export function getFavoriteKeyFromBooking(booking: any): string | null {
  if (booking.master_id != null) {
    const id = Number(booking.master_id)
    if (!isNaN(id) && id !== 0) return getFavoriteKey('master', id)
  }
  return null
}

/**
 * Canonical ключ из favorite. Master-only: только master_id.
 */
export function getFavoriteKeyFromFavorite(fav: any): string | null {
  const itemId = fav.master_id
  const numId = Number(itemId)
  if (isNaN(numId) || numId === 0) return null
  return getFavoriteKey('master', numId)
}

/**
 * Парсит canonical ключ. Master-only: только "master:N".
 */
export function parseFavoriteKey(key: string): { type: FavoriteType; itemId: number } | null {
  const [type, idStr] = key.split(':')
  const itemId = Number(idStr)
  if (type !== 'master') return null
  if (isNaN(itemId) || itemId === 0) return null
  return { type: 'master', itemId }
}

/**
 * Type и id из booking (для addContext). Master-only.
 */
export function getBookingTypeAndId(booking: any): { type: FavoriteType; itemId: number } | null {
  const key = getFavoriteKeyFromBooking(booking)
  return key ? parseFavoriteKey(key) : null
}
