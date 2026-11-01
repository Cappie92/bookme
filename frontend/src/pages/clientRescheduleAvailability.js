/**
 * Загрузка слотов переноса. Ответ применяется только если запрос всё ещё актуален
 * для той же записи: старый успех, ошибка и finally не трогают новый запрос.
 */
export async function loadGuardedAvailableSlots({
  bookingId,
  dateOnly,
  request,
  isBookingCurrent,
  fetcher,
  onStart,
  onSlots,
  onSettled,
}) {
  if (!bookingId || !dateOnly) return
  onStart()
  try {
    const response = await fetcher(bookingId, dateOnly)
    if (!request.isCurrent() || !isBookingCurrent(bookingId)) return
    if (response.ok) {
      const data = await response.json()
      if (!request.isCurrent() || !isBookingCurrent(bookingId)) return
      onSlots(data.available_slots || [])
    } else {
      console.error('Ошибка при загрузке слотов:', response.status)
    }
  } catch (error) {
    if (!request.isCurrent() || !isBookingCurrent(bookingId)) return
    console.error('Ошибка при загрузке слотов:', error)
  } finally {
    if (request.isCurrent() && isBookingCurrent(bookingId)) onSettled()
  }
}

export async function loadGuardedDateAvailability({
  bookingId,
  dateStrs,
  request,
  isBookingCurrent,
  fetcher,
  mergePrevious,
  onStart,
  onAvailability,
  onSettled,
}) {
  if (!bookingId) return
  onStart()
  const availability = mergePrevious ? { ...mergePrevious } : {}
  try {
    const results = await Promise.all(dateStrs.map(async (dateStr) => {
      try {
        const response = await fetcher(bookingId, dateStr)
        if (!response.ok) return { date: dateStr, hasSlots: false }
        const data = await response.json()
        return {
          date: dateStr,
          hasSlots: Boolean(data.available_slots && data.available_slots.length > 0),
        }
      } catch {
        return { date: dateStr, hasSlots: false }
      }
    }))
    if (!request.isCurrent() || !isBookingCurrent(bookingId)) return
    results.forEach((result) => {
      availability[result.date] = result.hasSlots
    })
    onAvailability(availability)
  } catch (error) {
    if (!request.isCurrent() || !isBookingCurrent(bookingId)) return
    console.error('Ошибка при загрузке доступности дат для месяца:', error)
  } finally {
    if (request.isCurrent() && isBookingCurrent(bookingId)) onSettled()
  }
}
