import React, { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../utils/api'
import { mcBtnPrimary, mcBtnSecondary, mcCard, mcInput } from '../../utils/masterCabinetUi'
import { annotateManualStartOptions, isManualStartOccupied } from '../../utils/calendarOccupancy'
import {
  BLOCK_CAP_NOTE,
  BLOCK_CATEGORIES,
  MANUAL_CAP_NOTE,
  blockPayload,
  canonicalServiceOptions,
  categoryLabel,
  createCalendarBlock,
  createManualBooking,
  deleteCalendarBlock,
  deleteManualBooking,
  elapsedMinutes,
  eventVersion,
  explainCalendarError,
  findOverlap,
  keyForPayload,
  manualBounds,
  manualDurationOptions,
  openIdempotency,
  serviceOptionKey,
  serviceSelectionForSave,
  manualPayload,
  readError,
  rememberVersion,
  updateCalendarBlock,
  updateManualBooking,
  wallClock,
} from '../../utils/calendarB3'

const inputCls = mcInput
const DURATION_OPTIONS = manualDurationOptions()

function initialClocks(event, dateStr) {
  const isNew = !event?.id
  const start = wallClock(event?.start_time)
  const end = wallClock(event?.end_time)
  return {
    date: start?.date || dateStr,
    startTime: start?.time || (isNew ? '' : '10:00'),
    endTime: end?.time || (isNew ? '' : '11:00'),
    endDate: end?.date || start?.date || dateStr,
  }
}

function initialManualDuration(event, serviceKey) {
  if (!event?.start_time || !event?.end_time || serviceKey) return ''
  const minutes = elapsedMinutes(event.start_time, event.end_time)
  if (minutes == null || minutes < 30) return ''
  const rounded = Math.round(minutes / 30) * 30
  return DURATION_OPTIONS.some((o) => String(o.value) === String(rounded)) ? String(rounded) : ''
}

export function CalendarB3ComposerForm({
  mode,
  event,
  dateStr,
  timeZone,
  bookings,
  blocks,
  onClose,
  onSaved,
  onReload,
  variant = 'modal',
  allowTypeSwitch = false,
  onTypeChange,
}) {
  const editing = Boolean(event?.id)
  const clocks = initialClocks(event, dateStr)
  const [clientName, setClientName] = useState(event?.guest_name || event?.client_name || '')
  const [phone, setPhone] = useState(event?.client_phone || '')
  const [serviceKey, setServiceKey] = useState(event?.service_id ? `service:${event.service_id}` : (event?.master_service_id ? `master:${event.master_service_id}` : ''))
  const [notes, setNotes] = useState(event?.notes || '')
  const [category, setCategory] = useState(event?.category || 'personal')
  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [startDate, setStartDate] = useState(clocks.date)
  const [startTime, setStartTime] = useState(clocks.startTime)
  const [endTime, setEndTime] = useState(clocks.endTime)
  const [endDate, setEndDate] = useState(clocks.endDate)
  const [manualDuration, setManualDuration] = useState(() => initialManualDuration(event, serviceKey))
  const [draftVersion, setDraftVersion] = useState(null)
  const [startOffset, setStartOffset] = useState('')
  const [endOffset, setEndOffset] = useState('')
  const [services, setServices] = useState([])
  const [catalogState, setCatalogState] = useState('loading')
  const [servicesNote, setServicesNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [idempotency] = useState(() => ({ key: `b3-${Date.now().toString(36)}`, lastPayload: null }))

  useEffect(() => {
    const next = initialClocks(event, dateStr)
    const nextServiceKey = event?.service_id ? `service:${event.service_id}` : (event?.master_service_id ? `master:${event.master_service_id}` : '')
    setClientName(event?.guest_name || event?.client_name || '')
    setPhone(event?.client_phone || '')
    setServiceKey(nextServiceKey)
    setNotes(event?.notes || '')
    setCategory(event?.category || 'personal')
    setTitle(event?.title || '')
    setDescription(event?.description || '')
    setStartDate(next.date)
    setStartTime(next.startTime)
    setEndTime(next.endTime)
    setEndDate(next.endDate)
    setManualDuration(initialManualDuration(event, nextServiceKey))
    setDraftVersion(null)
    setStartOffset('')
    setEndOffset('')
    setError('')
    openIdempotency(idempotency)
  }, [event, dateStr, idempotency])

  useEffect(() => {
    if (mode !== 'manual') {
      setServices([])
      setCatalogState('ready')
      setServicesNote('')
      return undefined
    }
    let cancelled = false
    setCatalogState('loading')
    setServicesNote(editing ? 'Услуги загружаются. Текущая услуга сохранится, пока не выбрано «Без услуги».' : 'Услуги загружаются.')
    apiGet('/api/master/calendar-services')
      .then((data) => {
        if (cancelled) return
        const options = canonicalServiceOptions(data)
        setServices(options)
        setCatalogState('ready')
        setServicesNote(options.length ? '' : 'Услуги не найдены. Запись можно сохранить без услуги.')
      })
      .catch(() => {
        if (cancelled) return
        setServices([])
        setCatalogState('error')
        setServicesNote(editing
          ? 'Не удалось загрузить услуги. Текущая услуга сохранится, пока не выбрано «Без услуги».'
          : 'Не удалось загрузить услуги. Запись можно сохранить без услуги.')
      })
    return () => {
      cancelled = true
    }
  }, [mode, editing])

  const serviceSelection = mode === 'manual'
    ? serviceSelectionForSave({ serviceKey, options: services, editing, catalogState })
    : null

  const durationMinutes = useMemo(() => {
    if (mode !== 'manual') return null
    if (serviceSelection?.duration) return serviceSelection.duration
    const picked = Number(manualDuration)
    return Number.isFinite(picked) && picked >= 10 ? picked : null
  }, [mode, serviceSelection, manualDuration])

  const handleServiceKeyChange = (nextKey) => {
    setServiceKey(nextKey)
    const selected = (services || []).find((item) => serviceOptionKey(item) === nextKey)
    const nextDuration = selected?.duration
      ? Number(selected.duration)
      : (Number(manualDuration) >= 10 ? Number(manualDuration) : null)
    setStartTime((currentStart) => {
      if (!currentStart || !nextDuration) return currentStart
      return isManualStartOccupied({
        dateStr: startDate,
        startTime: currentStart,
        durationMinutes: nextDuration,
        bookings,
        blocks,
        editing,
        event,
      }) ? '' : currentStart
    })
  }

  const manualStartOptions = useMemo(() => {
    if (mode !== 'manual') return []
    return annotateManualStartOptions({
      dateStr: startDate,
      durationMinutes,
      bookings,
      blocks,
      editing,
      event,
    })
  }, [mode, startDate, durationMinutes, bookings, blocks, editing, event, startTime])

  useEffect(() => {
    if (mode !== 'manual' || !startTime || !durationMinutes) return
    const occupied = isManualStartOccupied({
      dateStr: startDate,
      startTime,
      durationMinutes,
      bookings,
      blocks,
      editing,
      event,
    })
    if (occupied) {
      setStartTime('')
      return
    }
    const current = manualStartOptions.find((row) => row.value === startTime)
    if (current?.busy) setStartTime('')
  }, [manualStartOptions, mode, startDate, startTime, durationMinutes, serviceKey, bookings, blocks, editing, event])

  const version = draftVersion || (editing ? eventVersion(mode === 'manual' ? 'booking' : 'block', { ...event, version: event?.version }) : null)

  const buildInterval = () => manualBounds({
    startDate,
    startTime,
    endDate,
    endTime,
    timeZone: timeZone || event?.time_zone,
    original: editing ? event : null,
    startOffset,
    endOffset,
    durationMinutes: mode === 'manual' ? durationMinutes : null,
  })

  const previewEnd = useMemo(() => {
    const interval = buildInterval()
    if (!interval?.end_time) return null
    return wallClock(interval.end_time)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildInterval closes over form state
  }, [startDate, startTime, endDate, endTime, durationMinutes, startOffset, endOffset, mode, timeZone, event, editing])

  const persistVersion = (payload) => {
    if (payload?.id && payload.version) {
      rememberVersion(mode === 'manual' ? 'booking' : 'block', payload.id, payload.version)
    }
  }

  const submit = async () => {
    setError('')
    if (!startTime) {
      setError('Выберите время начала.')
      return
    }
    if (mode === 'manual' && !serviceKey && !durationMinutes) {
      setError('Выберите услугу или укажите длительность записи.')
      return
    }
    const interval = buildInterval()
    if (!interval || interval.error || !interval.start_time) {
      setError(interval?.error || 'Укажите дату и время конца позже начала. Сдвиг часов не выполняется.')
      return
    }
    const minutes = elapsedMinutes(interval.start_time, interval.end_time)
    const maxMinutes = mode === 'manual' ? 12 * 60 : 62 * 24 * 60
    if (minutes == null || minutes < 10 || minutes > maxMinutes) {
      setError(mode === 'manual' ? 'Ручная запись длится от 10 минут до 12 часов.' : 'Блок длится от 10 минут до 62 дней.')
      return
    }
    const built = mode === 'manual'
      ? manualPayload({
        clientName, phone, serviceId: serviceSelection?.serviceId, masterServiceId: serviceSelection?.masterServiceId, serviceMode: serviceSelection?.mode, notes, start: interval.start_time, end: interval.end_time, version: editing ? version : undefined,
      })
      : blockPayload({
        category, title, description, start: interval.start_time, end: interval.end_time, version: editing ? version : undefined,
      })
    if (built.error) {
      setError(built.error)
      return
    }
    if (editing && !version) {
      setError('В списке календаря нет version этой записи. Повторите действие сразу после создания или когда список начнёт возвращать version.')
      return
    }
    const overlap = findOverlap(interval, bookings, blocks, editing ? { kind: mode === 'manual' ? 'booking' : 'block', id: event.id } : null)
    setSaving(true)
    try {
      let saved
      if (mode === 'manual') {
        saved = editing
          ? await updateManualBooking(event.id, built.body)
          : await createManualBooking(built.body, keyForPayload(idempotency, built.body))
      } else {
        saved = editing
          ? await updateCalendarBlock(event.id, built.body)
          : await createCalendarBlock(built.body, keyForPayload(idempotency, built.body))
      }
      persistVersion(saved)
      onSaved?.(saved)
      onClose?.()
    } catch (err) {
      const parsed = readError(err)
      if (parsed.code === 'CALENDAR_VERSION_CONFLICT' && editing) {
        const fresh = await onReload?.()
        const rows = mode === 'manual' ? fresh?.bookings : fresh?.blocks
        const current = (rows || []).find((row) => row.id === event.id)
        if (current?.version) setDraftVersion(current.version)
        setError(current?.version
          ? `Запись уже изменена. Черновик сохранён, серверная version ${current.version}. Повторите действие.`
          : 'Запись уже изменена. Обновите календарь и повторите действие.')
      } else {
        if (parsed.refresh) onSaved?.()
        setError(explainCalendarError(parsed, overlap))
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!version) {
      setError('Удаление ждёт version события.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = mode === 'manual'
        ? await deleteManualBooking(event.id, version)
        : await deleteCalendarBlock(event.id, version)
      persistVersion(saved)
      onSaved?.(saved)
      onClose?.()
    } catch (err) {
      const parsed = readError(err)
      if (parsed.code === 'CALENDAR_VERSION_CONFLICT') {
        const fresh = await onReload?.()
        const rows = mode === 'manual' ? fresh?.bookings : fresh?.blocks
        const current = (rows || []).find((row) => row.id === event.id)
        if (current?.version) setDraftVersion(current.version)
        setError(current?.version
          ? `Запись уже изменена. Черновик сохранён, серверная version ${current.version}. Повторите действие.`
          : 'Запись уже изменена. Обновите календарь и повторите действие.')
      } else {
        setError(explainCalendarError(parsed, null))
      }
    } finally {
      setSaving(false)
    }
  }

  const heading = mode === 'manual'
    ? (editing ? 'Ручная запись' : 'Запись вручную')
    : (editing ? 'Личное событие' : 'Личное событие')

  const compact = variant === 'inline'
  const subtitleDate = startDate || dateStr
  const formBody = (
    <div data-testid={allowTypeSwitch ? 'master-add-event' : undefined}>
      {allowTypeSwitch ? (
        <div className="mb-3 flex min-w-0 gap-1 rounded-lg border border-[var(--dedato-border-decorative,#e7e2df)] p-1" role="tablist" aria-label="Тип события">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-xs font-semibold leading-snug ${mode === 'manual' ? 'bg-[var(--dedato-brand-primary,#4caf50)] text-white' : 'text-[var(--dedato-text-secondary,#5f6368)]'}`}
            onClick={() => onTypeChange?.('manual')}
          >
            Запись
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'block'}
            className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-xs font-semibold leading-snug ${mode === 'block' ? 'bg-[var(--dedato-brand-primary,#4caf50)] text-white' : 'text-[var(--dedato-text-secondary,#5f6368)]'}`}
            onClick={() => onTypeChange?.('block')}
          >
            Личное событие
          </button>
        </div>
      ) : null}
      {!compact ? (
        <>
          <h3 className="text-xl font-bold text-[var(--dedato-text-primary,#2d2d2d)]">{heading}</h3>
          <p className="mt-1 text-xs text-gray-500">{subtitleDate} · время мастера, без пересчёта часового пояса</p>
        </>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--dedato-text-secondary,#5f6368)]">{heading}</p>
      )}
      {compact ? (
        <p className="mt-1 text-xs text-gray-500">{subtitleDate} · время мастера, без пересчёта часового пояса</p>
      ) : null}
      <p className={`${compact ? 'mt-1' : 'mt-1'} text-xs text-gray-600`}>{mode === 'manual' ? MANUAL_CAP_NOTE : BLOCK_CAP_NOTE}</p>
      {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-3 space-y-2">
        {mode === 'manual' ? (
          <>
            <label className="block text-xs text-gray-600">Имя клиента
              <input className={inputCls} value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Телефон, необязательно
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+79001234567" />
            </label>
            <label className="block text-xs text-gray-600">Услуга, необязательно
              <select className={inputCls} value={serviceKey} onChange={(e) => handleServiceKeyChange(e.target.value)}>
                <option value="">Без услуги</option>
                {serviceKey && !services.some((item) => serviceOptionKey(item) === serviceKey) ? (
                  <option value={serviceKey}>{event?.service_name || 'Текущая услуга'}</option>
                ) : null}
                {services.map((item) => (
                  <option key={serviceOptionKey(item)} value={serviceOptionKey(item)}>{item.name} · {item.duration} мин</option>
                ))}
              </select>
            </label>
            {servicesNote ? <p className="text-xs text-gray-500">{servicesNote}</p> : null}
            {!serviceKey ? (
              <label className="block text-xs text-gray-600">Длительность
                <select className={inputCls} value={manualDuration} onChange={(e) => setManualDuration(e.target.value)}>
                  <option value="">Выберите длительность</option>
                  {DURATION_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-xs text-gray-600">Заметка, необязательно
              <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="block text-xs text-gray-600">Категория
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                {BLOCK_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-600">Заголовок, необязательно
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Описание, необязательно
              <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </>
        )}
        {mode === 'manual' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-600">Дата записи
              <input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Начало
              <select
                className={inputCls}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={!durationMinutes}
              >
                <option value="">{durationMinutes ? 'Выберите время' : 'Сначала выберите длительность'}</option>
                {manualStartOptions.map((row) => (
                  <option key={row.value} value={row.value} disabled={row.disabled}>
                    {row.label}{row.busy ? ' · занято' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-600">Дата начала
              <input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Начало
              <input className={inputCls} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Дата окончания
              <input className={inputCls} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Окончание
              <input className={inputCls} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        )}
        {mode === 'manual' && previewEnd ? (
          <p className="text-xs text-[var(--dedato-text-secondary,#5f6368)]">
            Окончание: {previewEnd.date} · {previewEnd.time}
            {serviceKey && durationMinutes ? ' (по услуге)' : ''}
          </p>
        ) : null}
        {(() => {
          const preview = buildInterval()
          if (!preview?.ambiguous) return null
          return (
            <div className="grid grid-cols-2 gap-2">
              {preview.startChoices.length > 1 ? (
                <label className="block text-xs text-gray-600">Вариант начала
                  <select className={inputCls} value={startOffset} onChange={(e) => setStartOffset(e.target.value)}>
                    <option value="">Выберите offset</option>
                    {preview.startChoices.map((offset) => <option key={offset} value={offset}>{startTime} {offset}</option>)}
                  </select>
                </label>
              ) : null}
              {preview.endChoices.length > 1 ? (
                <label className="block text-xs text-gray-600">Вариант конца
                  <select className={inputCls} value={endOffset} onChange={(e) => setEndOffset(e.target.value)}>
                    <option value="">Выберите offset</option>
                    {preview.endChoices.map((offset) => <option key={offset} value={offset}>{endTime} {offset}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          )
        })()}
      </div>
      {editing && !compact ? (
        <p className="mt-2 text-xs text-gray-500">
          {mode === 'manual' ? (event.guest_name || event.client_name) : (event.title || categoryLabel(event.category))}
          {version ? ` · version ${version}` : ' · version не получена'}
        </p>
      ) : null}
      <div className={`${compact ? 'mt-3' : 'mt-4'} flex flex-col gap-2 sm:flex-row`}>
        <button type="button" className={`${mcBtnPrimary} flex-1`} onClick={submit} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        {editing ? (
          <button type="button" className="rounded-lg border border-red-600 px-3 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50" onClick={remove} disabled={saving}>
            {mode === 'manual' ? 'Отменить' : 'Удалить'}
          </button>
        ) : null}
        <button type="button" className={mcBtnSecondary} onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )

  if (variant === 'inline') {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{formBody}</div>
  }

  return formBody
}

export default function CalendarB3Composer({
  open,
  mode,
  event,
  dateStr,
  timeZone,
  bookings,
  blocks,
  onClose,
  onSaved,
  onReload,
  variant = 'modal',
}) {
  if (!open) return null

  const form = (
    <CalendarB3ComposerForm
      mode={mode}
      event={event}
      dateStr={dateStr}
      timeZone={timeZone}
      bookings={bookings}
      blocks={blocks}
      onClose={onClose}
      onSaved={onSaved}
      onReload={onReload}
      variant={variant === 'sheet' ? 'modal' : variant}
    />
  )

  if (variant === 'inline') {
    return form
  }

  const shellCls = variant === 'sheet'
    ? `max-h-[85vh] w-full overflow-y-auto rounded-t-[var(--dedato-radius-card,16px)] p-4 shadow-xl ${mcCard}`
    : `max-h-[90vh] w-full overflow-y-auto rounded-t-[var(--dedato-radius-card,16px)] p-4 shadow-xl sm:max-w-lg sm:rounded-[var(--dedato-radius-card,16px)] sm:p-6 ${mcCard}`

  const overlayCls = variant === 'sheet'
    ? 'fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0'
    : 'fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4'

  return (
    <div className={overlayCls} onClick={onClose} role="presentation">
      <div className={shellCls} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={mode === 'manual' ? 'Запись вручную' : 'Личное событие'}>
        {form}
      </div>
    </div>
  )
}
