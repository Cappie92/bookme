import React from 'react'
import { CheckCircleIcon, GlobeAltIcon, LockClosedIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { gridEventSurface, sourceLabelColor } from '../../utils/dedatoCalendarEventTokens'

const SOURCE_META = {
  online: { Icon: GlobeAltIcon, label: 'Онлайн' },
  manual: { Icon: PencilSquareIcon, label: 'Вручную' },
  personal: { Icon: LockClosedIcon, label: 'Личное' },
}

/**
 * Figma 121:883 — Agenda density for day list; Grid for week cells.
 */
export default function DedatoCalendarEvent({
  source = 'online',
  density = 'Agenda',
  gridVariant = 'standard',
  time,
  title,
  detail,
  statusLabel = 'Подтверждено',
  showStatus = true,
  selected = false,
  className = '',
  onClick,
  as: Component = onClick ? 'button' : 'div',
}) {
  const meta = SOURCE_META[source] || SOURCE_META.online
  const Icon = meta.Icon

  if (density === 'Grid') {
    if (gridVariant === 'compact') {
      return (
        <Component
          type={Component === 'button' ? 'button' : undefined}
          onClick={onClick}
          className={`flex h-full w-full min-w-0 items-center justify-start gap-1 overflow-hidden px-1.5 text-left ${className}`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate text-[13px] leading-4 text-[var(--dedato-text-primary,#2d2d2d)]">
            {time}
          </span>
        </Component>
      )
    }

    return (
      <Component
        type={Component === 'button' ? 'button' : undefined}
        onClick={onClick}
        className={`flex h-full min-h-0 w-full flex-col justify-center gap-0.5 overflow-hidden px-1 py-0.5 text-left ${className}`}
      >
        <div className="flex min-h-0 shrink-0 items-center gap-1 overflow-hidden">
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate text-[13px] leading-4 text-[var(--dedato-text-primary,#2d2d2d)]">{time}</span>
        </div>
        {title ? (
          <p className="min-h-0 shrink truncate text-[13px] leading-4 text-[var(--dedato-text-primary,#2d2d2d)]">{title}</p>
        ) : null}
      </Component>
    )
  }

  const surface = gridEventSurface(source, selected)
  return (
    <Component
      type={Component === 'button' ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full flex-col gap-1 rounded-[var(--dedato-radius-control,10px)] border p-3 text-left ${surface} ${className}`}
    >
      <p className="text-base font-semibold leading-5 text-[var(--dedato-text-primary,#2d2d2d)]">{time}</p>
      <p className="text-base font-semibold leading-5 text-[var(--dedato-text-primary,#2d2d2d)]">{title}</p>
      {detail ? <p className="text-[13px] leading-[18px] text-[var(--dedato-text-secondary,#5f6368)]">{detail}</p> : null}
      <div className={`flex items-center gap-1 text-[13px] leading-[18px] ${sourceLabelColor(source)}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {meta.label}
      </div>
      {showStatus && source !== 'personal' ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--dedato-status-success,#1b5e20)]">
          <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
          {statusLabel}
        </div>
      ) : null}
      {source === 'personal' ? (
        <p className="text-[13px] text-[var(--dedato-text-secondary,#5f6368)]">Недоступно для записи</p>
      ) : null}
    </Component>
  )
}
