import React, { useEffect, useState } from 'react'
import { apiGet } from '../../utils/api'
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
  eventVersion,
  explainCalendarError,
  elapsedMinutes,
  findOverlap,
  keyForPayload,
  manualBounds,
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

const inputCls = 'w-full border border-gray-300 rounded px-2 py-2 text-sm'

function initialClocks(event, dateStr) {
  const start = wallClock(event?.start_time)
  const end = wallClock(event?.end_time)
  return {
    date: start?.date || dateStr,
    startTime: start?.time || '10:00',
    endTime: end?.time || '11:00',
    endDate: end?.date || start?.date || dateStr,
  }
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
    if (!open) return
    const next = initialClocks(event, dateStr)
    setClientName(event?.guest_name || event?.client_name || '')
    setPhone(event?.client_phone || '')
    setServiceKey(event?.service_id ? `service:${event.service_id}` : (event?.master_service_id ? `master:${event.master_service_id}` : ''))
    setNotes(event?.notes || '')
    setCategory(event?.category || 'personal')
    setTitle(event?.title || '')
    setDescription(event?.description || '')
    setStartDate(next.date)
    setStartTime(next.startTime)
    setEndTime(next.endTime)
    setEndDate(next.endDate)
    setDraftVersion(null)
    setStartOffset('')
    setEndOffset('')
    setError('')
    openIdempotency(idempotency)
  }, [open, event, dateStr, idempotency])

  useEffect(() => {
    if (!open || mode !== 'manual') {
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
  }, [open, mode, editing])

  if (!open) return null

  const serviceSelection = mode === 'manual'
    ? serviceSelectionForSave({ serviceKey, options: services, editing, catalogState })
    : null
  const version = draftVersion || (editing ? eventVersion(mode === 'manual' ? 'booking' : 'block', { ...event, version: event?.version }) : null)
  const durationMinutes = serviceSelection?.duration || null

  const buildInterval = () => manualBounds({
    startDate, startTime, endDate, endTime, timeZone: timeZone || event?.time_zone,
    original: editing ? event : null, startOffset, endOffset, durationMinutes,
  })

  const persistVersion = (payload) => {
    if (payload?.id && payload.version) {
      rememberVersion(mode === 'manual' ? 'booking' : 'block', payload.id, payload.version)
    }
  }

  const submit = async () => {
    setError('')
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
      onSaved?.()
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
      onSaved?.()
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

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={mode === 'manual' ? 'Запись вручную' : 'Занять время'}>
        <h3 className="text-base font-bold text-gray-900">
          {mode === 'manual' ? (editing ? 'Ручная запись' : 'Запись вручную') : (editing ? 'Личный блок' : 'Занять время')}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{clocks.date} · время мастера, без пересчёта часового пояса</p>
        <p className="mt-1 text-xs text-gray-600">{mode === 'manual' ? MANUAL_CAP_NOTE : BLOCK_CAP_NOTE}</p>
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
                <select className={inputCls} value={serviceKey} onChange={(e) => {
                  const nextKey = e.target.value
                  if (nextKey === '' && durationMinutes) {
                    const preview = buildInterval()
                    const wall = wallClock(preview?.end_time)
                    if (wall) {
                      setEndDate(wall.date)
                      setEndTime(wall.time)
                    }
                  }
                  setServiceKey(nextKey)
                }}>
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
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-600">Дата начала
              <input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Начало
              <input className={inputCls} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-600">Дата конца
              <input className={inputCls} type="date" value={durationMinutes && buildInterval().end_time ? wallClock(buildInterval().end_time)?.date || endDate : endDate} onChange={(e) => setEndDate(e.target.value)} disabled={Boolean(durationMinutes)} />
            </label>
            <label className="block text-xs text-gray-600">Конец
              <input className={inputCls} type="time" value={durationMinutes && buildInterval().end_time ? wallClock(buildInterval().end_time)?.time || endTime : endTime} onChange={(e) => setEndTime(e.target.value)} disabled={Boolean(durationMinutes)} />
            </label>
          </div>
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
        {editing ? (
          <p className="mt-2 text-xs text-gray-500">
            {mode === 'manual' ? (event.guest_name || event.client_name) : (event.title || categoryLabel(event.category))}
            {version ? ` · version ${version}` : ' · version не получена'}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={submit} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          {editing ? (
            <button type="button" className="rounded-lg border border-red-600 px-3 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50" onClick={remove} disabled={saving}>
              {mode === 'manual' ? 'Отменить' : 'Удалить'}
            </button>
          ) : null}
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
