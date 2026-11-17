import React, { useEffect, useRef, useState } from 'react'
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { buildMasterScheduleOverview, hasSavedScheduleTemplate } from '../../utils/masterScheduleOverview'
import { formatTimezoneLabel } from '../../utils/dateFormat'
import { mcBtnPrimary, mcBtnSecondary } from '../../utils/masterCabinetUi'

export default function MasterScheduleTemplatePanel({
  scheduleRules,
  scheduleRulesLoading,
  scheduleRulesError,
  materializedSchedule,
  masterTimezone,
  onCreateSchedule,
  onEditSchedule,
  onOpenMonthly,
  onOpenSlotManagement,
  onOpenPastAppointments,
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  useEffect(() => {
    if (!moreOpen) return undefined
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [moreOpen])

  const overview = buildMasterScheduleOverview({
    scheduleRules,
    scheduleRulesLoading,
    scheduleRulesError,
    materializedSchedule,
  })
  const tz = formatTimezoneLabel(masterTimezone || '')
  const hasTemplate = hasSavedScheduleTemplate(scheduleRules)

  return (
    <div
      data-testid="master-schedule-hub"
      className="w-full px-3 pb-6 pt-4 lg:px-6 lg:pt-6"
    >
      <div className="flex flex-col gap-3 min-[390px]:gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold leading-7 text-[var(--dedato-text-primary,#2d2d2d)] lg:text-2xl">
            Текущее расписание
          </h2>
          {tz ? (
            <p className="mt-1 text-[13px] leading-[18px] text-[var(--dedato-text-secondary,#5f6368)]">
              Часовой пояс мастера: {tz}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {hasTemplate ? (
            <button
              type="button"
              className={mcBtnPrimary}
              data-testid="master-schedule-edit-template"
              onClick={onEditSchedule}
            >
              Изменить расписание
            </button>
          ) : (
            <button
              type="button"
              className={mcBtnPrimary}
              data-testid="master-schedule-create-template"
              onClick={onCreateSchedule}
            >
              Создать расписание
            </button>
          )}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              className={mcBtnSecondary}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              data-testid="master-schedule-more"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <EllipsisHorizontalIcon className="mr-1 size-5" aria-hidden />
              Ещё
            </button>
            {moreOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[12rem] max-w-[min(16rem,calc(100vw-2.5rem))] rounded-[10px] border border-[var(--dedato-border-decorative,#e7e2df)] bg-white py-1 shadow-lg"
              >
                <button type="button" role="menuitem" className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]" onClick={() => { setMoreOpen(false); onOpenMonthly() }}>
                  Обзор месяца
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]"
                  data-testid="master-slot-management"
                  onClick={() => { setMoreOpen(false); onOpenSlotManagement() }}
                >
                  Управление слотами
                </button>
                {onOpenPastAppointments ? (
                  <button type="button" role="menuitem" className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]" onClick={() => { setMoreOpen(false); onOpenPastAppointments() }}>
                    Прошедшие записи
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[12px] border border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-base,#f9f7f6)] px-4 py-4">
        <p className="text-base font-semibold leading-6 text-[var(--dedato-text-primary,#2d2d2d)]">
          {overview.headline}
        </p>
        {overview.body ? (
          <p className="mt-2 text-sm leading-5 text-[var(--dedato-text-secondary,#5f6368)]">
            {overview.body}
          </p>
        ) : null}

        {overview.status === 'loading' ? (
          <p className="mt-3 text-sm text-[var(--dedato-text-secondary,#5f6368)]" role="status">
            Загрузка…
          </p>
        ) : null}

        {overview.rows?.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2" data-testid="master-schedule-overview-rows">
            {overview.rows.map((row, i) => (
              <li
                key={`${row.title}-${row.detail}-${i}`}
                className="flex flex-col gap-0.5 rounded-[10px] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-[var(--dedato-text-primary,#2d2d2d)]">
                  {row.title}
                </span>
                <span className={`text-sm ${row.enabled === false ? 'text-[var(--dedato-text-secondary,#5f6368)]' : 'text-[var(--dedato-action-primary,#4caf50)]'}`}>
                  {row.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {overview.meta?.length > 0 ? (
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            {overview.meta.map((item) => (
              <div key={item.label} className="text-sm">
                <dt className="text-[var(--dedato-text-secondary,#5f6368)]">{item.label}</dt>
                <dd className="font-medium text-[var(--dedato-text-primary,#2d2d2d)]">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
}