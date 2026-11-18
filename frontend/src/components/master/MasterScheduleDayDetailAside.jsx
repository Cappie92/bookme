import React, { useEffect, useState } from 'react'
import { mcCard, mcDayAsideShell } from '../../utils/masterCabinetUi'
import { wallClock } from '../../utils/calendarB3'
import { formatLocalDate } from '../../utils/scheduleDates'
import MasterBookingDetailAside from './MasterBookingDetailAside'
import { CalendarB3ComposerForm } from './CalendarB3Composer'

const asideFrame = `${mcDayAsideShell} ${mcCard} min-w-0 max-w-full px-4 py-5 lg:px-6 lg:py-6`

/**
 * Desktop day view: detail / inline B3 edit (manual + block), read-only online actions.
 */
export default function MasterScheduleDayDetailAside({
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
  createPrefill = null,
}) {
  const dateStr = formatLocalDate(focusDate)
  const prefillKey = createPrefill
    ? `${createPrefill.commandId ?? 0}\u0000${createPrefill.mode || ''}\u0000${createPrefill.startIso || ''}\u0000${createPrefill.dateStr || ''}`
    : ''
  const [createMode, setCreateMode] = useState(createPrefill?.mode || 'manual')

  useEffect(() => {
    if (createPrefill?.mode) setCreateMode(createPrefill.mode)
  }, [prefillKey, createPrefill?.mode])

  if (!selection) {
    const prefillEvent = createPrefill?.startIso
      ? { start_time: createPrefill.startIso }
      : null
    return (
      <aside className={asideFrame} data-testid="master-day-detail-aside">
        <CalendarB3ComposerForm
          key={`create-${createMode}-${createPrefill?.commandId ?? 0}-${createPrefill?.startIso || ''}`}
          mode={createMode}
          event={prefillEvent}
          dateStr={createPrefill?.dateStr || dateStr}
          timeZone={timeZone}
          bookings={bookings}
          blocks={blocks}
          onClose={() => {}}
          onSaved={onSaved}
          onReload={onReload}
          variant="inline"
          allowTypeSwitch
          onTypeChange={setCreateMode}
        />
      </aside>
    )
  }

  if (selection.kind === 'booking') {
    const booking = selection.data
    if (booking.source === 'manual') {
      return (
        <aside className={`${asideFrame}`} data-testid="master-day-detail-aside">
          <CalendarB3ComposerForm
            mode="manual"
            event={booking}
            dateStr={wallClock(booking.start_time)?.date || dateStr}
            timeZone={timeZone}
            bookings={bookings}
            blocks={blocks}
            onClose={onClearSelection}
            onSaved={onSaved}
            onReload={onReload}
            variant="inline"
          />
        </aside>
      )
    }
    return (
      <aside className={`${asideFrame} !p-0`} data-testid="master-day-detail-aside">
        <MasterBookingDetailAside
          booking={booking}
          master={master}
          hasExtendedStats={hasExtendedStats}
          onClose={onClearSelection}
          onConfirm={onConfirmBooking}
          onCancelRequest={onCancelBookingRequest}
          actionBookingId={actionBookingId}
        />
      </aside>
    )
  }

  const block = selection.data
  return (
    <aside className={asideFrame} data-testid="master-day-detail-aside">
      <CalendarB3ComposerForm
        mode="block"
        event={block}
        dateStr={wallClock(block.start_time)?.date || dateStr}
        timeZone={timeZone}
        bookings={bookings}
        blocks={blocks}
        onClose={onClearSelection}
        onSaved={onSaved}
        onReload={onReload}
        variant="inline"
      />
    </aside>
  )
}
