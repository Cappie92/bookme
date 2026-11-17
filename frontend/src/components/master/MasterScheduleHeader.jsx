import React, { useEffect, useRef } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { formatTimezoneLabel } from '../../utils/dateFormat'
import { formatMasterSchedulePeriodLabel } from '../../utils/masterSchedulePeriodLabel'
import {
  mcCalNavIconBtn,
  mcCalOutlineAction,
  mcCalPeriodLabel,
  mcCalSegmentActive,
  mcCalSegmentInactive,
  mcCalSegmentTrack,
  mcCalTodayBtn,
  mcCalMobilePanel,
  mcPageTitle,
} from '../../utils/masterCabinetUi'

const MODE_IDS = ['day', 'week', 'schedule']

export default function MasterScheduleHeader({
  calendarLayoutMode,
  onLayoutModeChange,
  showMonthlyView,
  showCreateActions,
  focusDay,
  weekDates,
  onPreviousPeriod,
  onNextPeriod,
  onToday,
  onOpenNewBooking,
  onOpenNewBlock,
  masterTimezone,
  monthNav,
}) {
  const tzLabel = formatTimezoneLabel(masterTimezone || '')
  const showPeriodNav = !showMonthlyView && calendarLayoutMode !== 'schedule'
  const tabRefs = useRef({})

  useEffect(() => {
    tabRefs.current[calendarLayoutMode]?.focus()
  }, [calendarLayoutMode])

  const handleTabListKeyDown = (event) => {
    const idx = MODE_IDS.indexOf(calendarLayoutMode)
    if (idx < 0) return

    let nextIdx = null
    if (event.key === 'ArrowRight') {
      nextIdx = (idx + 1) % MODE_IDS.length
    } else if (event.key === 'ArrowLeft') {
      nextIdx = (idx + MODE_IDS.length - 1) % MODE_IDS.length
    } else if (event.key === 'Home') {
      nextIdx = 0
    } else if (event.key === 'End') {
      nextIdx = MODE_IDS.length - 1
    } else {
      return
    }

    event.preventDefault()
    onLayoutModeChange(MODE_IDS[nextIdx])
  }

  const modeTabs = (
    <div
      className={`${mcCalSegmentTrack} ${mcCalMobilePanel}`}
      role="tablist"
      aria-label="Режим календаря"
      data-testid="master-schedule-mode-tabs"
      onKeyDown={handleTabListKeyDown}
    >
      {[
        { id: 'day', label: 'День' },
        { id: 'week', label: 'Неделя' },
        { id: 'schedule', label: 'Расписание' },
      ].map(({ id, label }) => (
        <button
          key={id}
          ref={(node) => {
            if (node) tabRefs.current[id] = node
          }}
          type="button"
          role="tab"
          id={`master-schedule-tab-${id}`}
          aria-controls={`master-schedule-panel-${id}`}
          aria-selected={calendarLayoutMode === id}
          tabIndex={calendarLayoutMode === id ? 0 : -1}
          className={calendarLayoutMode === id ? mcCalSegmentActive : mcCalSegmentInactive}
          onClick={() => onLayoutModeChange(id)}
          onKeyDown={handleTabListKeyDown}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const createActions = showCreateActions ? (
    <div
      className={`flex gap-2 ${mcCalMobilePanel}`}
      data-testid="master-schedule-create-actions"
    >
      <button
        type="button"
        className={mcCalOutlineAction}
        data-testid="master-schedule-new-booking"
        onClick={onOpenNewBooking}
      >
        + Новая запись
      </button>
      <button
        type="button"
        className={mcCalOutlineAction}
        data-testid="master-schedule-new-block"
        onClick={onOpenNewBlock}
      >
        + Личное дело
      </button>
    </div>
  ) : null

  const periodNav = showPeriodNav ? (
    <div
      className={`box-border flex items-center gap-2 max-lg:justify-between lg:w-auto lg:max-w-none lg:justify-end ${mcCalMobilePanel}`}
      data-testid="master-schedule-period-nav"
    >
      <button
        type="button"
        onClick={onPreviousPeriod}
        className={mcCalNavIconBtn}
        aria-label={calendarLayoutMode === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}
        data-testid={calendarLayoutMode === 'day' ? 'master-day-prev' : 'master-week-prev'}
      >
        <ChevronLeftIcon className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>
      <p className={`${mcCalPeriodLabel} text-balance max-lg:max-w-[166px]`}>
        {formatMasterSchedulePeriodLabel(calendarLayoutMode, focusDay, weekDates)}
      </p>
      <button
        type="button"
        onClick={onNextPeriod}
        className={mcCalNavIconBtn}
        aria-label={calendarLayoutMode === 'day' ? 'Следующий день' : 'Следующая неделя'}
        data-testid={calendarLayoutMode === 'day' ? 'master-day-next' : 'master-week-next'}
      >
        <ChevronRightIcon className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToday}
        className={mcCalTodayBtn}
        data-testid={calendarLayoutMode === 'day' ? 'master-day-today' : 'master-week-today'}
      >
        Сегодня
      </button>
    </div>
  ) : null

  const monthNavRow = showMonthlyView && monthNav ? (
    <div className="flex w-full items-center justify-end gap-2" data-testid="master-schedule-month-nav">
      <button type="button" onClick={monthNav.onPrevious} className={mcCalNavIconBtn} aria-label="Предыдущий месяц">
        <ChevronLeftIcon className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>
      <p className={mcCalPeriodLabel}>{monthNav.label}</p>
      <button type="button" onClick={monthNav.onNext} className={mcCalNavIconBtn} aria-label="Следующий месяц">
        <ChevronRightIcon className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>
    </div>
  ) : null

  return (
    <header
      className="flex w-full min-w-0 max-w-full flex-col gap-3 lg:mx-auto lg:max-w-[1120px] lg:gap-6"
      data-testid="master-schedule-header"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className={`flex flex-col gap-3 lg:w-auto lg:max-w-none lg:gap-0 ${mcCalMobilePanel}`}>
          <h1 className={`${mcPageTitle} max-lg:text-2xl max-lg:font-semibold max-lg:leading-8 lg:font-bold`}>
            Расписание
          </h1>
          {tzLabel ? (
            <p className="text-[13px] font-normal leading-[18px] text-[var(--dedato-text-secondary,#5f6368)] lg:hidden">
              {tzLabel}
            </p>
          ) : null}
        </div>
        {createActions}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {modeTabs}
        {monthNavRow || periodNav}
      </div>
    </header>
  )
}