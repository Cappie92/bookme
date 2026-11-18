import React from 'react'
import { formatLocalDate } from '../../utils/scheduleDates'
import { wallClock } from '../../utils/calendarB3'
import MasterBookingDetailSheet from './mobile/MasterBookingDetailSheet'
import CalendarB3Composer from './CalendarB3Composer'
import { isPast as isBookingPast } from '../../utils/bookingOutcome'

/** Mobile day view: bottom sheet for selection (inline B3 edit or online detail). */
export default function MasterScheduleDayMobileSheet({
  selection,
  focusDate,
  timeZone,
  bookings,
  blocks,
  master,
  hasExtendedStats,
  onClearSelection,
  onConfirmBooking,
  onCancelBookingRequest,
  actionBookingId,
  onSaved,
  onReload,
  zIndexClass,
}) {
  if (!selection) return null

  if (selection.kind === 'booking' && selection.data.source !== 'manual') {
    const booking = selection.data
    return (
      <MasterBookingDetailSheet
        isOpen
        booking={booking}
        onClose={onClearSelection}
        sectionType={isBookingPast(booking) ? 'past' : 'future'}
        master={master}
        hasExtendedStats={hasExtendedStats}
        actionBookingId={actionBookingId}
        onConfirm={onConfirmBooking}
        onCancelRequest={onCancelBookingRequest}
        zIndexClass={zIndexClass}
      />
    )
  }

  const isBlock = selection.kind === 'block'
  const event = selection.data
  const dateStr = wallClock(isBlock ? event.start_time : event.start_time)?.date || formatLocalDate(focusDate)

  return (
    <CalendarB3Composer
      open
      variant="sheet"
      mode={isBlock ? 'block' : 'manual'}
      event={event}
      dateStr={dateStr}
      timeZone={timeZone}
      bookings={bookings}
      blocks={blocks}
      onClose={onClearSelection}
      onSaved={onSaved}
      onReload={onReload}
    />
  )
}
