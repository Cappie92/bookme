/**
 * Путь для эндпоинтов календаря клиента: /api/client/bookings/<segment>/calendar.ics|google-link|email
 * При наличии public_reference используется ref/..., иначе числовой id (обратная совместимость).
 */
export function clientBookingCalendarPathSegment(booking) {
  const ref = booking?.public_reference != null ? String(booking.public_reference).trim() : ''
  if (ref) {
    return `ref/${encodeURIComponent(ref)}`
  }
  if (booking?.id != null && booking.id !== '') {
    return String(booking.id)
  }
  return ''
}
