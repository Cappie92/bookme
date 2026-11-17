import React from 'react'
import { LockClosedIcon, PlusIcon } from '@heroicons/react/24/outline'

/** Figma 121:978 — available / unavailable / neutral (no client availability claim). */
export default function DedatoCalendarTimeRow({
  state = 'Available',
  label,
  time,
  density = 'Agenda',
  className = '',
  onClick,
}) {
  const isNeutral = state === 'Neutral'
  const isAvailable = state === 'Available'
  const base =
    density === 'Grid'
      ? 'flex w-full flex-col rounded-[var(--dedato-radius-control,8px)] border p-1 text-[13px]'
      : 'flex min-h-[48px] w-full items-center gap-2 rounded-[var(--dedato-radius-control,8px)] border p-3 text-[13px]'

  const tone = isNeutral
    ? 'border-dashed border-[var(--dedato-border-default,#6f7972)] bg-[var(--dedato-surface-elevated,#fff)] text-[var(--dedato-text-secondary,#5f6368)]'
    : isAvailable
      ? 'border-[var(--dedato-event-available,#6f7972)] bg-[var(--dedato-event-availableBg,#fff)] text-[var(--dedato-text-primary,#2d2d2d)]'
      : 'border-[var(--dedato-event-unavailable,#737373)] bg-[var(--dedato-event-unavailableBg,#e7e2df)] text-[var(--dedato-text-primary,#2d2d2d)]'

  const Icon = isAvailable ? PlusIcon : LockClosedIcon
  const text = label || (isAvailable ? 'Свободно' : 'Нерабочее время')
  const Tag = onClick ? 'button' : 'div'

  if (isNeutral) {
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`${base} ${tone} ${className} ${onClick ? 'w-full cursor-pointer text-left hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]' : ''}`}
      >
        <span className="text-base font-semibold leading-5 text-[var(--dedato-text-primary,#2d2d2d)]">{time}</span>
        <span className="text-sm leading-5">Промежуток · не подтверждает доступность для клиента</span>
      </Tag>
    )
  }

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${base} ${tone} ${className}`}
    >
      {density === 'Agenda' ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : null}
      <span>{text}</span>
    </Tag>
  )
}
