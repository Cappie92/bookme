/**
 * Общие действия с календарём для клиента: success-screen публичной записи и ЛК.
 * Сегмент пути: ref/{public_reference} или числовой id (см. bookingCalendarApi).
 */
import { clientBookingCalendarPathSegment } from './bookingCalendarApi'
import { apiGet, apiPost } from './api'

export { clientBookingCalendarPathSegment }

/** Данные успешного бронирования с публичной страницы → форма для path segment. */
export function bookingLikeFromSuccess(success) {
  if (!success) return null
  return { id: success.id, public_reference: success.public_reference }
}

export async function fetchClientGoogleCalendarUrl(bookingLike, alarmMinutes = 60) {
  const seg = clientBookingCalendarPathSegment(bookingLike)
  if (!seg) throw new Error('Нет данных записи для календаря')
  const q = typeof alarmMinutes === 'number' ? `?alarm_minutes=${alarmMinutes}` : ''
  const res = await apiGet(`/api/client/bookings/${seg}/calendar/google-link${q}`)
  if (!res?.url) throw new Error('Не удалось получить ссылку на Google Календарь')
  return res.url
}

export async function downloadClientBookingIcsFile(bookingLike, alarmMinutes = 60) {
  const seg = clientBookingCalendarPathSegment(bookingLike)
  if (!seg) throw new Error('Нет данных записи для календаря')
  const token = localStorage.getItem('access_token')
  if (!token) throw new Error('Чтобы добавить запись в календарь, нужно войти в аккаунт.')
  const url = `/api/client/bookings/${seg}/calendar.ics?alarm_minutes=${alarmMinutes}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail || 'Не удалось получить файл календаря')
  }
  return res.blob()
}

export function icsDownloadFilename(bookingLike) {
  const pr = bookingLike?.public_reference != null ? String(bookingLike.public_reference).trim() : ''
  if (pr) return `booking-${pr}.ics`
  if (bookingLike?.id != null) return `booking-${bookingLike.id}.ics`
  return 'booking.ics'
}

export function triggerIcsBlobDownload(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Письмо уходит на email учётной записи; адрес задаётся только на backend. */
export async function sendClientCalendarEmail(bookingLike, alarmMinutes = 60) {
  const seg = clientBookingCalendarPathSegment(bookingLike)
  if (!seg) throw new Error('Нет данных записи для календаря')
  await apiPost(`/api/client/bookings/${seg}/calendar/email`, { alarm_minutes: alarmMinutes })
}
