import { apiRequest } from './api'
import { masterWallInterval } from './scheduleDates'

export const BLOCK_CATEGORIES = [
  { value: 'personal', label: 'Личное' },
  { value: 'break', label: 'Перерыв' },
  { value: 'busy', label: 'Занято' },
]

export const MANUAL_CAP_NOTE = 'Ручная запись не входит в лимит Free 20.'
export const BLOCK_CAP_NOTE = 'Личный блок не входит в лимит Free 20.'

const PHONE_RE = /^\+?[0-9]{10,15}$/
const WALL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:([+-]\d{2}:\d{2}|Z))?$/

const memoryVersions = {}

function versionStorage() {
  if (typeof sessionStorage !== 'undefined') return sessionStorage
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(memoryVersions, key) ? memoryVersions[key] : null),
    setItem: (key, value) => {
      memoryVersions[key] = value
    },
  }
}

export function wallClock(value) {
  const match = WALL_RE.exec(String(value || ''))
  if (!match) return null
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`,
    start_time: `${match[1]}T${match[2]}:${match[3] || '00'}`,
    offset: match[5] || null,
  }
}

export function wallLabel(value) {
  const clock = wallClock(value)
  return clock ? clock.time : ''
}

export function sameWall(left, right) {
  const a = wallClock(left)
  const b = wallClock(right)
  if (!a || !b) return false
  return a.start_time === b.start_time
}

export function intervalFromClocks(date, startTime, endTime, endDate = date) {
  const start = masterWallInterval(date, startTime, 1)
  const end = masterWallInterval(endDate || date, endTime, 1)
  if (!start || !end) return null
  if (end.start_time <= start.start_time) return null
  return { start_time: start.start_time, end_time: end.start_time }
}

export function elapsedMinutes(start, end) {
  const aware = /(?:Z|[+-]\d{2}:\d{2})$/
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (aware.test(String(start || '')) && aware.test(String(end || '')) && Number.isFinite(startMs) && Number.isFinite(endMs)) {
    return (endMs - startMs) / 60000
  }
  return wallSpanMinutes(start, end)
}

export function wallSpanMinutes(start, end) {
  const left = wallClock(start)
  const right = wallClock(end)
  if (!left || !right) return null
  const [y1, m1, d1] = left.date.split('-').map(Number)
  const [h1, min1] = left.time.split(':').map(Number)
  const [y2, m2, d2] = right.date.split('-').map(Number)
  const [h2, min2] = right.time.split(':').map(Number)
  return (Date.UTC(y2, m2 - 1, d2, h2, min2) - Date.UTC(y1, m1 - 1, d1, h1, min1)) / 60000
}

export function intervalForService(date, startTime, durationMinutes) {
  return masterWallInterval(date, startTime, durationMinutes)
}

export function halfOpenOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA
}

function nextDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  const pad = (value) => String(value).padStart(2, '0')
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

export function overlapsDay(start, end, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return false
  return halfOpenOverlap(String(start || ''), String(end || ''), `${dateStr}T00:00:00`, `${nextDate(dateStr)}T00:00:00`)
}

export function dayClipMinutes(start, end, dateStr) {
  if (!overlapsDay(start, end, dateStr)) return null
  const startClock = wallClock(start)
  const endClock = wallClock(end)
  if (!startClock || !endClock) return null
  const minutes = (clock) => Number(clock.time.slice(0, 2)) * 60 + Number(clock.time.slice(3, 5))
  const startMinute = startClock.date < dateStr ? 0 : minutes(startClock)
  const endMinute = endClock.date > dateStr ? 1440 : minutes(endClock)
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) return null
  return { startMinute, endMinute }
}

export function clipStartsInSlot(dateStr, hour, minute, start, end) {
  const clip = dayClipMinutes(start, end, dateStr)
  if (!clip) return false
  const slot = hour * 60 + minute
  return clip.startMinute >= slot && clip.startMinute < slot + 30
}

function offsetLabel(label) {
  if (!label || label === 'GMT' || label === 'UTC') return '+00:00'
  const match = /(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/.exec(label)
  if (!match) return null
  return `${match[1]}${match[2].padStart(2, '0')}:${(match[3] || '00').padStart(2, '0')}`
}

export function awareWall(utcMicroseconds, timeZone) {
  const ms = Number(utcMicroseconds) / 1000
  if (!Number.isFinite(ms) || !timeZone) return null
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(ms))
  } catch {
    return null
  }
  const read = (type) => parts.find((part) => part.type === type)?.value
  let hour = read('hour')
  if (hour === '24') hour = '00'
  const offset = offsetLabel(read('timeZoneName'))
  if (!hour || !offset) return null
  const date = `${read('year')}-${read('month')}-${read('day')}`
  const time = `${hour}:${read('minute')}`
  return { date, time, offset, iso: `${date}T${time}:${read('second') || '00'}${offset}` }
}

export function offsetChoices(date, time, timeZone) {
  if (!timeZone || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return []
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const seen = new Set()
  const choices = []
  for (let offsetMinutes = -12 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60000
    const wall = awareWall(utcMs * 1000, timeZone)
    if (wall && wall.date === date && wall.time === time && !seen.has(wall.offset)) {
      seen.add(wall.offset)
      choices.push(wall.offset)
    }
  }
  return choices
}

export function submitBounds({ startDate, startTime, endDate, endTime, timeZone, original, startOffset, endOffset }) {
  const zone = timeZone || original?.time_zone || null
  const sameStart = original && wallClock(original.start_time)?.date === startDate && wallClock(original.start_time)?.time === startTime
  const sameEnd = original && wallClock(original.end_time)?.date === endDate && wallClock(original.end_time)?.time === endTime
  if (sameStart && sameEnd && original.start_utc_us != null && original.end_utc_us != null && zone) {
    const start = awareWall(original.start_utc_us, zone)
    const end = awareWall(original.end_utc_us, zone)
    if (start && end) return { start_time: start.iso, end_time: end.iso }
  }
  const startChoices = zone ? offsetChoices(startDate, startTime, zone) : []
  const endChoices = zone ? offsetChoices(endDate, endTime, zone) : []
  if (zone && (startChoices.length === 0 || endChoices.length === 0)) {
    return { error: 'Это время отсутствует в часовом поясе мастера. Сдвиг часов не выполняется.' }
  }
  if ((startChoices.length > 1 && !startChoices.includes(startOffset)) || (endChoices.length > 1 && !endChoices.includes(endOffset))) {
    return {
      ambiguous: true,
      startChoices,
      endChoices,
      error: 'В часовом поясе мастера это время наступает дважды. Выберите вариант и повторите действие.',
    }
  }
  const interval = intervalFromClocks(startDate, startTime, endTime, endDate)
  if (!interval) return { error: 'Укажите дату и время конца позже начала. Сдвиг часов не выполняется.' }
  const startMark = startChoices.length === 1 ? startChoices[0] : (startOffset || '')
  const endMark = endChoices.length === 1 ? endChoices[0] : (endOffset || '')
  return { start_time: `${interval.start_time}${startMark}`, end_time: `${interval.end_time}${endMark}` }
}

export function manualBounds({ startDate, startTime, endDate, endTime, timeZone, original, startOffset, endOffset, durationMinutes }) {
  const duration = Number(durationMinutes)
  const hasDuration = Number.isFinite(duration) && duration > 0
  if (!hasDuration) {
    return submitBounds({ startDate, startTime, endDate, endTime, timeZone, original, startOffset, endOffset })
  }
  const zone = timeZone || original?.time_zone || null
  const sameStart = original && wallClock(original.start_time)?.date === startDate && wallClock(original.start_time)?.time === startTime
  if (sameStart && original.start_utc_us != null && original.end_utc_us != null && zone) {
    const elapsed = (Number(original.end_utc_us) - Number(original.start_utc_us)) / 60000000
    if (Math.abs(elapsed - duration) <= 1) {
      const storedEnd = awareWall(original.end_utc_us, zone)
      if (storedEnd) {
        return submitBounds({
          startDate, startTime, endDate: storedEnd.date, endTime: storedEnd.time, timeZone: zone, original, startOffset, endOffset,
        })
      }
    }
    const start = awareWall(Number(original.start_utc_us), zone)
    const end = awareWall(Number(original.start_utc_us) + duration * 60000000, zone)
    if (start && end) return { start_time: start.iso, end_time: end.iso }
  }
  if (!zone) return { error: 'Часовой пояс мастера не задан. Сдвиг часов не выполняется.' }
  const startChoices = offsetChoices(startDate, startTime, zone)
  if (startChoices.length === 0) {
    return { error: 'Это время отсутствует в часовом поясе мастера. Сдвиг часов не выполняется.' }
  }
  if (startChoices.length > 1 && !startChoices.includes(startOffset)) {
    return {
      ambiguous: true,
      startChoices,
      endChoices: [],
      error: 'В часовом поясе мастера это время наступает дважды. Выберите вариант и повторите действие.',
    }
  }
  const mark = startChoices.length === 1 ? startChoices[0] : startOffset
  const startMs = Date.parse(`${startDate}T${startTime}:00${mark}`)
  const end = Number.isFinite(startMs) ? awareWall((startMs + duration * 60000) * 1000, zone) : null
  if (!end) return { error: 'Не удалось сохранить длительность услуги в часовом поясе мастера.' }
  return { start_time: `${startDate}T${startTime}:00${mark}`, end_time: end.iso }
}

export function serviceOptionKey(row) {
  if (row?.service_id) return `service:${row.service_id}`
  if (row?.master_service_id) return `master:${row.master_service_id}`
  return ''
}

export function canonicalServiceOptions(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    const serviceId = Number(row?.service_id)
    const masterServiceId = Number(row?.master_service_id)
    const hasService = Number.isInteger(serviceId) && serviceId >= 1
    const hasMaster = Number.isInteger(masterServiceId) && masterServiceId >= 1
    if (hasService === hasMaster) return []
    return [{
      service_id: hasService ? serviceId : null,
      master_service_id: hasMaster ? masterServiceId : null,
      name: row.name,
      duration: row.duration,
      price: row.price,
    }]
  })
}

export function openIdempotency(state) {
  state.key = newIdempotencyKey()
  state.lastPayload = null
  return state.key
}

export function findOverlap(candidate, bookings, blocks, ignore) {
  const own = ignore || {}
  const rows = [
    ...(bookings || []).filter((item) => item && item.status !== 'cancelled' && !(own.kind === 'booking' && own.id === item.id)).map((item) => ({
      kind: 'booking',
      id: item.id,
      label: item.guest_name || item.client_display_name || item.client_name || 'Запись',
      start_time: item.start_time,
      end_time: item.end_time,
    })),
    ...(blocks || []).filter((item) => item && !item.deleted_at && !(own.kind === 'block' && own.id === item.id)).map((item) => ({
      kind: 'block',
      id: item.id,
      label: item.title || categoryLabel(item.category),
      start_time: item.start_time,
      end_time: item.end_time,
    })),
  ]
  return rows.find((row) => halfOpenOverlap(candidate.start_time, candidate.end_time, row.start_time, row.end_time)) || null
}

export function categoryLabel(value) {
  return BLOCK_CATEGORIES.find((item) => item.value === value)?.label || 'Занято'
}

export function validPhone(value) {
  const phone = String(value || '').trim()
  if (!phone) return { ok: true, phone: null }
  if (!PHONE_RE.test(phone)) return { ok: false, phone: null }
  return { ok: true, phone }
}

export function serviceSelectionForSave({ serviceKey, options, editing, catalogState }) {
  if (serviceKey === '') {
    return { mode: 'clear', serviceId: null, masterServiceId: null, duration: null }
  }
  const selected = (options || []).find((item) => serviceOptionKey(item) === serviceKey)
  if (selected && catalogState === 'ready') {
    return {
      mode: 'set',
      serviceId: selected.service_id || null,
      masterServiceId: selected.master_service_id || null,
      duration: Number(selected.duration) || null,
    }
  }
  if (editing) {
    return { mode: 'omit', serviceId: null, masterServiceId: null, duration: null }
  }
  return { mode: 'omit', serviceId: null, masterServiceId: null, duration: null }
}

export function manualPayload({ clientName, phone, serviceId, masterServiceId, serviceMode, notes, start, end, version }) {
  const name = String(clientName || '').trim()
  const body = { client_name: name, start_time: start, end_time: end }
  const parsedPhone = validPhone(phone)
  if (!parsedPhone.ok) return { error: 'Некорректный телефон клиента.' }
  if (parsedPhone.phone) body.client_phone = parsedPhone.phone
  const mode = serviceMode || ((serviceId || masterServiceId) ? 'set' : 'omit')
  if (mode === 'clear') {
    body.service_id = null
    body.master_service_id = null
  } else if (mode === 'set') {
    if (serviceId && masterServiceId) return { error: 'Выберите одну услугу.' }
    if (serviceId) body.service_id = Number(serviceId)
    else if (masterServiceId) body.master_service_id = Number(masterServiceId)
  }
  const note = String(notes || '').trim()
  if (note) body.notes = note
  if (version != null) body.version = Number(version)
  if (!name) return { error: 'Укажите имя клиента.' }
  return { body }
}

export function blockPayload({ category, title, description, start, end, version }) {
  const body = {
    start_time: start,
    end_time: end,
    category: category || 'personal',
  }
  const heading = String(title || '').trim()
  const text = String(description || '').trim()
  if (heading) body.title = heading
  if (text) body.description = text
  if (version != null) body.version = Number(version)
  if (!BLOCK_CATEGORIES.some((item) => item.value === body.category)) {
    return { error: 'Недопустимая категория блока.' }
  }
  return { body }
}

export function newIdempotencyKey() {
  return `b3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function keyForPayload(state, payload) {
  const serialized = JSON.stringify(payload)
  if (state.lastPayload === serialized) return state.key
  const key = state.lastPayload == null ? state.key : newIdempotencyKey()
  state.key = key
  state.lastPayload = serialized
  return key
}

export function readError(error) {
  const status = error?.response?.status || 0
  const headers = error?.response?.headers
  const code = typeof headers?.get === 'function'
    ? headers.get('x-error-code') || headers.get('X-Error-Code')
    : headers?.['x-error-code'] || headers?.['X-Error-Code'] || null
  const detail = error?.response?.data?.detail
  const message = typeof detail === 'string' && detail ? detail : 'Не удалось сохранить'
  return {
    status,
    code,
    message,
    refresh: code === 'CALENDAR_VERSION_CONFLICT',
  }
}

export function explainCalendarError(parsed, overlap) {
  if (parsed.code === 'BOOKING_SLOT_CONFLICT' && overlap) {
    return `${parsed.message} Пересечение с «${overlap.label}» ${wallLabel(overlap.start_time)}–${wallLabel(overlap.end_time)}.`
  }
  if (parsed.code === 'CALENDAR_VERSION_CONFLICT') {
    return 'Запись уже изменена. Календарь обновлён, повторите действие.'
  }
  if (parsed.code === 'IDEMPOTENCY_KEY_REUSED') {
    return 'Этот запрос уже отправлен с другими данными. Проверьте форму и сохраните ещё раз.'
  }
  if (parsed.code === 'BOOKING_TIME_INVALID') return parsed.message
  if (parsed.code === 'BOOKING_TIME_UNRESOLVED') return parsed.message
  if (parsed.code === 'BOOKING_SLOT_BUSY') return parsed.message || 'Слот сейчас занят. Повторите действие один раз.'
  return parsed.message
}

export function rememberVersion(kind, id, version) {
  if (!kind || id == null || !Number.isInteger(Number(version))) return
  versionStorage().setItem(`dedato.calendarB3.${kind}.${id}`, String(version))
}

export function rememberedVersion(kind, id) {
  const raw = versionStorage().getItem(`dedato.calendarB3.${kind}.${id}`)
  const version = Number(raw)
  return Number.isInteger(version) && version >= 1 ? version : null
}

export function eventVersion(kind, event) {
  const direct = Number(event?.version)
  if (Number.isInteger(direct) && direct >= 1) return direct
  return null
}

export function startsInSlot(dateStr, hour, minute, value) {
  const clock = wallClock(value)
  if (!clock || clock.date !== dateStr) return false
  const [h, m] = clock.time.split(':').map(Number)
  const start = h * 60 + m
  const slot = hour * 60 + minute
  return start >= slot && start < slot + 30
}

export function clientCalendarBlockLabels() {
  return []
}

function request(endpoint, options) {
  return apiRequest(endpoint, options)
}

export function createManualBooking(body, key, transport = request) {
  return transport('/api/master/bookings/manual', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': key },
  })
}

export function updateManualBooking(id, body, transport = request) {
  return transport(`/api/master/bookings/manual/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteManualBooking(id, version, transport = request) {
  return transport(`/api/master/bookings/manual/${id}?version=${version}`, { method: 'DELETE' })
}

export function listCalendarBlocks(transport = request) {
  return transport('/api/master/calendar-blocks', { method: 'GET' })
}

export function createCalendarBlock(body, key, transport = request) {
  return transport('/api/master/calendar-blocks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': key },
  })
}

export function updateCalendarBlock(id, body, transport = request) {
  return transport(`/api/master/calendar-blocks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteCalendarBlock(id, version, transport = request) {
  return transport(`/api/master/calendar-blocks/${id}?version=${version}`, { method: 'DELETE' })
}
