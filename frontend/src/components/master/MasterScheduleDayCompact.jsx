import React, { useMemo } from 'react'
import { formatLocalDate } from '../../utils/scheduleDates'
import { mcCard, mcDaySplitGrid } from '../../utils/masterCabinetUi'
import { buildMasterDayAgenda } from '../../utils/masterDayAgenda'
import DedatoCalendarEvent from './DedatoCalendarEvent'
import MasterScheduleDayDetailAside from './MasterScheduleDayDetailAside'

/**
 * Figma WEB / Calendar Day (88:2930) — agenda list + desktop detail aside.
 */
export default function MasterScheduleDayCompact({
  date,
  schedule,
  bookings = [],
  blocks = [],
  bookingsLoading = false,
  bookingsError = '',
  blocksError = '',
  master,
  hasExtendedStats,
  selection,
  onSelect,
  timeZone,
  onConfirmBooking,
  onCancelBookingRequest,
  actionBookingId,
  onDetailSaved,
  onDetailReload,
  createPrefill,
  onIntervalManualCreate,
}) {
  const { rows } = useMemo(
    () => buildMasterDayAgenda({ date, schedule, bookings, blocks }),
    [date, schedule, bookings, blocks],
  )

  const dateLabel = date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className={`mx-2 mb-3 min-w-0 lg:mx-0 ${mcDaySplitGrid}`}>
      <div className={`min-w-0 p-3 lg:min-h-0 lg:p-6 ${mcCard}`} data-testid="master-day-agenda">
        <p className="mb-1 text-[13px] font-medium text-[var(--dedato-text-secondary,#5f6368)]">{dateLabel}</p>
        <p className="mb-3 text-[12px] text-[var(--dedato-text-secondary,#5f6368)]">
          Записи и личные дела на этот день.
        </p>
        {bookingsLoading ? (
          <p className="rounded-lg border border-[var(--dedato-border-decorative,#e7e2df)] px-3 py-6 text-center text-sm text-[var(--dedato-text-secondary,#5f6368)]">
            Загрузка записей…
          </p>
        ) : bookingsError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-6 text-center text-sm text-red-800" role="alert">
            {bookingsError}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--dedato-border-decorative,#e7e2df)] px-3 py-6 text-center text-sm text-[var(--dedato-text-secondary,#5f6368)]">
            На этот день записей и блоков нет. Создайте событие в форме справа.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row, idx) => {
              const selected =
                selection
                && ((row.kind === 'booking' && selection.kind === 'booking' && Number(selection.data?.id) === Number(row.meta?.id))
                  || (row.kind === 'block' && selection.kind === 'block' && Number(selection.data?.id) === Number(row.meta?.id)))
              return (
                <li key={`${row.kind}-${row.meta?.id ?? idx}`}>
                  <DedatoCalendarEvent
                    source={row.source}
                    density="Agenda"
                    time={row.time}
                    title={row.title}
                    detail={row.detail}
                    showStatus={row.showStatus}
                    selected={selected}
                    outsideWorkingHours={row.outsideWorkingHours}
                    onClick={() => {
                      if (row.kind === 'block') {
                        onSelect?.({ kind: 'block', data: row.meta })
                        return
                      }
                      onSelect?.({ kind: 'booking', data: row.meta })
                    }}
                  />
                </li>
              )
            })}
          </ul>
        )}
        {blocksError ? (
          <p className="mt-2 text-[12px] text-amber-800" role="status">
            {blocksError}
          </p>
        ) : null}
      </div>

      <MasterScheduleDayDetailAside
        selection={selection}
        focusDate={date}
        timeZone={timeZone}
        bookings={bookings}
        blocks={blocks}
        master={master}
        hasExtendedStats={hasExtendedStats}
        onClearSelection={() => onSelect?.(null)}
        onConfirmBooking={onConfirmBooking}
        onCancelBookingRequest={onCancelBookingRequest}
        actionBookingId={actionBookingId}
        onSaved={onDetailSaved}
        onReload={onDetailReload}
        createPrefill={createPrefill}
      />
    </div>
  )
}
