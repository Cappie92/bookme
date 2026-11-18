import React, { useMemo } from 'react'
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { dayClipMinutes } from '../../utils/calendarB3'
import { blockEventSource, bookingEventSource, gridEventSurface } from '../../utils/dedatoCalendarEventTokens'
import {
  layoutOverlappingLanes,
  minuteToTimelinePx,
  timelineDurationPx,
  weekGridVariantFromHeight,
  WEEK_SLOTS_PER_DAY,
  WEEK_TIMELINE_ROW_HEIGHT_PX,
  timeIndexFromParts,
} from '../../utils/masterWeekTimeline'
import { weekColumnHoursLabel } from '../../utils/daySlotSummary'
import DedatoCalendarEvent from './DedatoCalendarEvent'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 30]
const DAY_COLUMN_HEIGHT = WEEK_SLOTS_PER_DAY * WEEK_TIMELINE_ROW_HEIGHT_PX

function collectDayTimelineItems(dateStr, bookings, blocks) {
  const raw = []
  ;(bookings || []).forEach((booking) => {
    const clip = dayClipMinutes(booking.start_time, booking.end_time, dateStr)
    if (!clip) return
    raw.push({
      id: `b-${booking.id}`,
      kind: 'booking',
      startMinute: clip.startMinute,
      endMinute: clip.endMinute,
      data: booking,
    })
  })
  ;(blocks || []).forEach((block) => {
    const clip = dayClipMinutes(block.start_time, block.end_time, dateStr)
    if (!clip) return
    raw.push({
      id: `bl-${block.id}`,
      kind: 'block',
      startMinute: clip.startMinute,
      endMinute: clip.endMinute,
      data: block,
    })
  })
  return layoutOverlappingLanes(raw)
}

function wallHm(iso, fallback) {
  if (!iso) return fallback
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  if (!m) return fallback
  return `${m[1]}:${m[2]}`
}

/**
 * Figma week grid — div timeline (replaces table layout) with continuous event blocks.
 */
export default function MasterScheduleWeekTimeline({
  weekDates,
  schedule,
  bookings,
  blocks,
  selected,
  isLg,
  isIosRestrictedContext,
  todayRef,
  formatLocalDate,
  getSlotKey,
  getTimeLabel,
  isSameCalendarDay,
  onEmptySlotCreate,
  onSlotMouseDown,
  onSlotTapMobile,
  onSlotMouseEnter,
  onSlotMouseMove,
  onDayLabelClick,
  openDayDrawerMenu,
  onTimeHeaderClick,
  onBookingClickMobile,
  onBookingHover,
  onBookingHoverEnd,
  onBlockClick,
  onBookingEditDesktop,
  wallLabel,
}) {
  const dayMeta = useMemo(
    () =>
      weekDates.map((day) => {
        const dateStr = formatLocalDate(day.date)
        const events = collectDayTimelineItems(dateStr, bookings, blocks)
        return { day, dateStr, events }
      }),
    [weekDates, bookings, blocks, formatLocalDate],
  )

  return (
    <div className="master-week-timeline w-full min-w-0 select-none bg-[var(--dedato-surface-elevated,#fff)]" data-testid="master-week-timeline">
      <div
        className="sticky top-0 z-30 grid border-b border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)]"
        style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}
      >
        <div className="h-12" />
        {dayMeta.map(({ day, dateStr }) => {
          const isTodayCol = isSameCalendarDay(day.date, todayRef)
          const hoursLabel = weekColumnHoursLabel(schedule, dateStr)
          const isDayOff = hoursLabel === 'Выходной'
          return (
            <div
              key={dateStr}
              className={`group/header relative flex min-h-[52px] flex-col items-center justify-center px-1 py-1.5 text-center ${isTodayCol ? 'bg-[var(--dedato-action-selected,#e8f5e9)]' : ''} ${isDayOff ? 'bg-[var(--dedato-surface-subtle,#f3f4f6)]' : ''}`}
            >
              {isLg ? (
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 inline-flex items-center justify-center rounded p-0.5 text-[var(--dedato-action-primary,#4caf50)] opacity-0 transition-opacity hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] focus-visible:opacity-100 group-hover/header:opacity-100"
                  title="Слоты дня"
                  aria-label="Слоты дня"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDayDrawerMenu(day)
                  }}
                >
                  <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="text-[13px] font-semibold leading-4 text-[var(--dedato-text-primary,#2d2d2d)] hover:text-[var(--dedato-action-primary,#4caf50)]"
                onClick={onDayLabelClick(dateStr)}
              >
                {day.label}
              </button>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--dedato-text-secondary,#5f6368)]">{hoursLabel}</p>
            </div>
          )
        })}
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))',
          minHeight: DAY_COLUMN_HEIGHT,
        }}
      >
        <div className="relative border-r border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)]">
          {HOURS.flatMap((hour) =>
            MINUTES.map((minute) => (
              <button
                key={`${hour}:${minute}`}
                type="button"
                className="flex h-6 w-full items-center justify-end pr-2 text-xs text-[var(--dedato-text-secondary,#5f6368)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]"
                onClick={() => onTimeHeaderClick(hour, minute)}
              >
                {getTimeLabel(hour, minute)}
              </button>
            )),
          )}
        </div>

        {dayMeta.map(({ day, dateStr, events }, dayIndex) => (
          <div
            key={dateStr}
            className="relative border-r border-[var(--dedato-border-decorative,#e7e2df)] last:border-r-0"
            style={{ height: DAY_COLUMN_HEIGHT }}
          >
            {HOURS.flatMap((hour) =>
              MINUTES.map((minute) => {
                const slotKey = getSlotKey(day.date, hour, minute)
                const slotData = schedule?.[slotKey]
                const isActive = slotData?.is_working || false
                const workType = slotData?.work_type
                const hasConflict = slotData?.has_conflict || false
                const isFrozen = !isIosRestrictedContext && (slotData?.is_frozen || false)
                const isSelected = selected.has(slotKey)
                const timeIndex = timeIndexFromParts(hour, minute)
                const slotStart = hour * 60 + minute
                const slotHasEvents = events.some(
                  (ev) => ev.startMinute < slotStart + 30 && ev.endMinute > slotStart,
                )

                let bg = 'bg-[var(--dedato-surface-subtle,#f3f4f6)]'
                if (isSelected) bg = 'selected-slot bg-[var(--dedato-action-selected,#e8f5e9)]'
                else if (isFrozen) bg = 'bg-cyan-100'
                else if (isActive) {
                  if (hasConflict) bg = 'bg-red-100'
                  else if (workType === 'salon') bg = 'bg-blue-50'
                  else bg = 'bg-[var(--dedato-surface-elevated,#fff)]'
                }

                return (
                  <div
                    key={slotKey}
                    role="presentation"
                    data-day-index={dayIndex}
                    data-hour={hour}
                    data-minute={minute}
                    data-working={isActive ? 'true' : 'false'}
                    data-slot-key={slotKey}
                    className={`group absolute left-0 right-0 h-6 cursor-pointer border-b border-[var(--dedato-border-decorative,#e7e2df)] ${bg}`}
                    style={{ top: minuteToTimelinePx(hour * 60 + minute) }}
                    title={isFrozen ? 'Тариф заморожен' : 'Наведите и нажмите + или двойной щелчок — новая запись'}
                    onMouseDown={isLg ? onSlotMouseDown(slotKey, isActive, dayIndex, timeIndex) : undefined}
                    onMouseEnter={onSlotMouseEnter(slotKey)}
                    onMouseMove={onSlotMouseMove(slotKey, dayIndex, timeIndex)}
                    onClick={(e) => {
                      if (!isLg) {
                        onSlotTapMobile(slotKey)(e)
                        return
                      }
                      if (slotHasEvents) return
                      if (e.detail > 1) {
                        e.stopPropagation()
                        onEmptySlotCreate(day, hour, minute)
                        return
                      }
                      if (!(e.altKey || e.metaKey)) return
                      e.stopPropagation()
                      onEmptySlotCreate(day, hour, minute)
                    }}
                  >
                    {isLg && !slotHasEvents ? (
                      <button
                        type="button"
                        className="absolute right-1 top-1/2 z-[0] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--dedato-border-default,#6f7972)] bg-white text-xs font-bold text-[var(--dedato-action-primary,#4caf50)] opacity-0 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                        style={{ pointerEvents: 'auto' }}
                        aria-label="Новая запись в это время"
                        data-testid="week-slot-create"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEmptySlotCreate(day, hour, minute)
                        }}
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                )
              }),
            )}

            {events.map((ev) => {
              const top = minuteToTimelinePx(ev.startMinute)
              const height = timelineDurationPx(ev.startMinute, ev.endMinute)
              const widthPct = 100 / ev.laneCount
              const leftPct = ev.lane * widthPct
              const timeStr = `${wallHm(ev.data.start_time, '00:00')}–${wallHm(ev.data.end_time, '00:30')}`
              const gridVariant = weekGridVariantFromHeight(height)
              const blockTitle = ev.kind === 'block' ? (ev.data.title || 'Личное') : null
              const bookingTitle = ev.kind === 'booking' ? (ev.data.service_name || 'Запись') : null
              const eventLabel = `${timeStr}, ${blockTitle || bookingTitle || ''}`
              const gridChrome =
                gridVariant === 'compact'
                  ? 'flex items-stretch overflow-hidden'
                  : 'block overflow-hidden'
              if (ev.kind === 'block') {
                return (
                  <button
                    key={ev.id}
                    type="button"
                    aria-label={eventLabel}
                    className={`absolute z-[2] rounded-[6px] text-left shadow-[0_1px_2px_rgba(45,45,45,0.06)] ${gridChrome} ${gridEventSurface(blockEventSource())}`}
                    style={{ top: `${top}px`, height: `${height}px`, left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)` }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isLg) onBlockClick(ev.data, day)
                      else onBlockClick(ev.data, day)
                    }}
                  >
                    <DedatoCalendarEvent
                      source="personal"
                      density="Grid"
                      gridVariant={gridVariant}
                      time={timeStr}
                      title={blockTitle}
                      as="div"
                    />
                  </button>
                )
              }
              const booking = ev.data
              return (
                <button
                  key={ev.id}
                  type="button"
                  aria-label={eventLabel}
                  className={`absolute z-[2] rounded-[6px] text-left shadow-[0_1px_2px_rgba(45,45,45,0.06)] ${gridChrome} ${gridEventSurface(bookingEventSource(booking))}`}
                  style={{ top: `${top}px`, height: `${height}px`, left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)` }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isLg) onBookingClickMobile(booking)
                    else if (booking.source === 'manual') onBookingEditDesktop(booking, day)
                  }}
                  onMouseEnter={isLg ? (e) => onBookingHover(booking, e) : undefined}
                  onMouseLeave={isLg ? onBookingHoverEnd : undefined}
                >
                  <DedatoCalendarEvent
                    source={bookingEventSource(booking)}
                    density="Grid"
                    gridVariant={gridVariant}
                    time={timeStr}
                    title={bookingTitle}
                    as="div"
                  />
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--dedato-text-secondary,#5f6368)]" data-testid="week-slot-create-hint">
        Пустой слот: кнопка «+» при наведении, двойной щелчок или Alt+клик — новая запись (без подтверждения доступности для клиента).
      </p>
    </div>
  )
}
