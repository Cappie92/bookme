import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BLOCK_CAP_NOTE,
  MANUAL_CAP_NOTE,
  awareWall,
  blockPayload,
  canonicalServiceOptions,
  clientCalendarBlockLabels,
  clipStartsInSlot,
  createManualBooking,
  eventVersion,
  explainCalendarError,
  findOverlap,
  halfOpenOverlap,
  overlapsDay,
  elapsedMinutes,
  intervalForService,
  intervalFromClocks,
  manualBounds,
  wallSpanMinutes,
  keyForPayload,
  manualPayload,
  serviceSelectionForSave,
  offsetChoices,
  openIdempotency,
  readError,
  rememberVersion,
  sameWall,
  startsInSlot,
  submitBounds,
  wallClock,
} from './calendarB3'

describe('calendar B3 client contract', () => {
  it('builds a manual body without source and keeps a naive wall interval', () => {
    const interval = intervalFromClocks('2026-11-16', '02:00', '03:00')
    const result = manualPayload({
      clientName: ' Анна ',
      phone: '+79001234567',
      notes: ' окно ',
      start: interval.start_time,
      end: interval.end_time,
    })
    expect(result.body).toEqual({
      client_name: 'Анна',
      client_phone: '+79001234567',
      notes: 'окно',
      start_time: '2026-11-16T02:00:00',
      end_time: '2026-11-16T03:00:00',
    })
    expect(result.body.source).toBeUndefined()
    expect(JSON.stringify(result.body)).not.toContain('Z')
  })

  it('rejects a bad phone and an empty name before the request', () => {
    expect(manualPayload({ clientName: 'Анна', phone: '123', start: 'a', end: 'b' }).error).toMatch(/телефон/)
    expect(manualPayload({ clientName: '  ', start: 'a', end: 'b' }).error).toMatch(/имя/)
  })

  it('matches service duration without shifting the clock', () => {
    expect(intervalForService('2026-11-12', '10:00', 60)).toEqual({
      start_time: '2026-11-12T10:00:00',
      end_time: '2026-11-12T11:00:00',
    })
    expect(intervalFromClocks('2026-11-16', '22:00', '02:00', '2026-11-17')).toEqual({
      start_time: '2026-11-16T22:00:00',
      end_time: '2026-11-17T02:00:00',
    })
    expect(intervalFromClocks('2026-11-16', '11:00', '10:00')).toBeNull()
    expect(wallSpanMinutes('2026-11-16T22:00:00', '2026-11-17T02:00:00')).toBe(240)
  })

  it('keeps an aware backend wall clock as returned', () => {
    const clock = wallClock('2026-11-12T10:00:00+01:00')
    expect(clock.time).toBe('10:00')
    expect(clock.offset).toBe('+01:00')
    expect(sameWall('2026-11-12T10:00:00+01:00', '2026-11-12T10:00:00')).toBe(true)
  })

  it('treats intervals as half-open and names the conflicting event', () => {
    expect(halfOpenOverlap('2026-11-16T10:00:00', '2026-11-16T11:00:00', '2026-11-16T11:00:00', '2026-11-16T12:00:00')).toBe(false)
    expect(overlapsDay('2026-11-16T22:00:00', '2026-11-17T02:00:00', '2026-11-17')).toBe(true)
    expect(overlapsDay('2026-11-16T10:00:00', '2026-11-16T11:00:00', '2026-11-17')).toBe(false)
    const overlap = findOverlap(
      { start_time: '2026-11-16T10:30:00', end_time: '2026-11-16T11:30:00' },
      [{ id: 1, client_name: 'Борис', start_time: '2026-11-16T11:00:00', end_time: '2026-11-16T12:00:00', status: 'confirmed' }],
      [{ id: 2, title: 'Обед', category: 'break', start_time: '2026-11-16T15:00:00', end_time: '2026-11-16T16:00:00' }],
    )
    expect(overlap.label).toBe('Борис')
    expect(findOverlap(
      { start_time: '2026-11-16T11:00:00', end_time: '2026-11-16T12:00:00' },
      [],
      [{ id: 2, title: 'Секрет', category: 'personal', start_time: '2026-11-16T10:00:00', end_time: '2026-11-16T11:00:00' }],
    )).toBeNull()
  })

  it('sends version on update and reuses one idempotency key for the same payload', () => {
    const block = blockPayload({
      category: 'busy', title: 'Дорога', start: '2026-11-16T18:00:00', end: '2026-11-16T19:00:00', version: 2,
    })
    expect(block.body.version).toBe(2)
    expect(block.body.source).toBeUndefined()
    const state = { key: 'b3-once', lastPayload: null }
    const first = keyForPayload(state, block.body)
    const second = keyForPayload(state, block.body)
    const third = keyForPayload(state, { ...block.body, title: 'Другое' })
    expect(first).toBe('b3-once')
    expect(second).toBe(first)
    expect(third).not.toBe(first)
  })

  it('posts Idempotency-Key and does not hide a version conflict', async () => {
    const calls = []
    await createManualBooking({ client_name: 'Анна', start_time: '2026-11-16T10:00:00', end_time: '2026-11-16T11:00:00' }, 'b3-key', (url, options) => {
      calls.push({ url, options })
      return Promise.resolve({ id: 7, version: 1 })
    })
    expect(calls[0].url).toBe('/api/master/bookings/manual')
    expect(calls[0].options.headers['Idempotency-Key']).toBe('b3-key')
    expect(calls[0].options.body).not.toContain('source')
    const parsed = readError({
      response: { status: 409, headers: { get: (name) => (name.toLowerCase() === 'x-error-code' ? 'CALENDAR_VERSION_CONFLICT' : null) }, data: { detail: 'changed' } },
    })
    expect(parsed.refresh).toBe(true)
    expect(explainCalendarError(parsed, null)).toMatch(/повторите/)
  })

  it('remembers version and shows a block only in its start slot', () => {
    rememberVersion('booking', 9, 3)
    rememberVersion('booking', 9, 1)
    expect(eventVersion('booking', { id: 9 })).toBeNull()
    expect(eventVersion('booking', { id: 9, version: 4 })).toBe(4)
    expect(startsInSlot('2026-11-16', 10, 0, '2026-11-16T10:15:00')).toBe(true)
    expect(startsInSlot('2026-11-16', 10, 30, '2026-11-16T10:15:00')).toBe(false)
    expect(clipStartsInSlot('2026-11-17', 0, 0, '2026-11-16T22:00:00', '2026-11-17T02:00:00')).toBe(true)
    expect(clipStartsInSlot('2026-11-18', 0, 0, '2026-11-16T22:00:00', '2026-11-19T10:00:00')).toBe(true)
    expect(clipStartsInSlot('2026-11-18', 9, 0, '2026-11-16T22:00:00', '2026-11-19T10:00:00')).toBe(false)
    const state = { key: 'old', lastPayload: '{"a":1}' }
    const opened = openIdempotency(state)
    expect(opened).not.toBe('old')
    expect(keyForPayload(state, { a: 1 })).toBe(opened)
    expect(keyForPayload(state, { a: 1 })).toBe(opened)
    const next = keyForPayload(state, { a: 2 })
    expect(next).not.toBe(opened)
    const reopened = openIdempotency(state)
    expect(keyForPayload(state, { a: 2 })).toBe(reopened)
    expect(reopened).not.toBe(next)
  })

  it('keeps a Berlin fold instant and refuses a guessed offset', () => {
    const original = {
      start_time: '2030-10-27T02:15:00',
      end_time: '2030-10-27T02:45:00',
      start_utc_us: Date.parse('2030-10-27T00:15:00Z') * 1000,
      end_utc_us: Date.parse('2030-10-27T00:45:00Z') * 1000,
      time_zone: 'Europe/Berlin',
    }
    const kept = submitBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original,
    })
    expect(kept.start_time).toBe('2030-10-27T02:15:00+02:00')
    expect(kept.end_time).toBe('2030-10-27T02:45:00+02:00')
    expect(awareWall(original.start_utc_us, 'Europe/Berlin').offset).toBe('+02:00')
    const choices = offsetChoices('2030-10-27', '02:15', 'Europe/Berlin')
    expect(choices).toEqual(expect.arrayContaining(['+02:00', '+01:00']))
    const ambiguous = submitBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: null,
    })
    expect(ambiguous.ambiguous).toBe(true)
    expect(ambiguous.start_time).toBeUndefined()
    const chosen = submitBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', startOffset: '+01:00', endOffset: '+01:00',
    })
    expect(chosen.start_time).toBe('2030-10-27T02:15:00+01:00')
  })

  it('selects canonical service ids and ignores a colliding catalog id', () => {
    const options = canonicalServiceOptions([
      { id: 5, name: 'Каталог', duration: 60 },
      { id: 5, service_id: 9, name: 'Своя', duration: 60 },
      { master_service_id: 5, name: 'Каталог', duration: 40 },
      { service_id: 8, master_service_id: 5, name: 'Смешанная', duration: 60 },
      { service_id: 8, name: 'Вторая', duration: 60 },
    ])
    expect(options.map((item) => [item.service_id, item.master_service_id])).toEqual([[9, null], [null, 5], [8, null]])
    expect(manualPayload({
      clientName: 'Анна', masterServiceId: 5, start: '2026-11-16T10:00:00', end: '2026-11-16T10:40:00',
    }).body).toEqual({ client_name: 'Анна', start_time: '2026-11-16T10:00:00', end_time: '2026-11-16T10:40:00', master_service_id: 5 })
  })

  it('keeps the stored DST fold when a service duration is selected', () => {
    const original = {
      start_time: '2030-10-27T02:15:00',
      end_time: '2030-10-27T02:45:00',
      start_utc_us: Date.parse('2030-10-27T00:15:00Z') * 1000,
      end_utc_us: Date.parse('2030-10-27T00:45:00Z') * 1000,
      time_zone: 'Europe/Berlin',
    }
    const notesOnly = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original, durationMinutes: 30,
    })
    expect(notesOnly.start_time).toBe('2030-10-27T02:15:00+02:00')
    expect(notesOnly.end_time).toBe('2030-10-27T02:45:00+02:00')
    const laterFold = {
      ...original,
      start_utc_us: Date.parse('2030-10-27T01:15:00Z') * 1000,
      end_utc_us: Date.parse('2030-10-27T01:45:00Z') * 1000,
    }
    expect(manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: laterFold, durationMinutes: 30,
    }).start_time).toBe('2030-10-27T02:15:00+01:00')
    const moved = manualBounds({
      startDate: '2030-10-27', startTime: '01:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original, durationMinutes: 30,
    })
    expect(moved.start_time).toBe('2030-10-27T01:15:00+02:00')
    expect(moved.end_time).toBe('2030-10-27T01:45:00+02:00')
    expect(elapsedMinutes(moved.start_time, moved.end_time)).toBe(30)
    const fold = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '03:15',
      timeZone: 'Europe/Berlin', durationMinutes: 30,
    })
    expect(fold.ambiguous).toBe(true)
    expect(fold.start_time).toBeUndefined()
    expect(manualBounds({
      startDate: '2030-03-31', startTime: '02:30', endDate: '2030-03-31', endTime: '03:00',
      timeZone: 'Europe/Berlin', durationMinutes: 30,
    }).error).toMatch(/отсутствует/)
    expect(submitBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original,
    }).start_time).toBe('2030-10-27T02:15:00+02:00')
    const longer = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original, durationMinutes: 60,
    })
    expect(longer.start_time).toBe('2030-10-27T02:15:00+02:00')
    expect(longer.end_time).toBe('2030-10-27T02:15:00+01:00')
    expect(elapsedMinutes(longer.start_time, longer.end_time)).toBe(60)
    const shorter = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '03:15',
      timeZone: 'Europe/Berlin',
      original: {
        ...original,
        end_utc_us: Date.parse('2030-10-27T01:15:00Z') * 1000,
      },
      durationMinutes: 30,
    })
    expect(shorter.start_time).toBe('2030-10-27T02:15:00+02:00')
    expect(shorter.end_time).toBe('2030-10-27T02:45:00+02:00')
    const laterHour = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: laterFold, durationMinutes: 60,
    })
    expect(laterHour.start_time).toBe('2030-10-27T02:15:00+01:00')
    expect(laterHour.end_time).toBe('2030-10-27T03:15:00+01:00')
    const movedLonger = manualBounds({
      startDate: '2030-10-27', startTime: '01:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original, durationMinutes: 60,
    })
    expect(movedLonger.start_time).toBe('2030-10-27T01:15:00+02:00')
    expect(elapsedMinutes(movedLonger.start_time, movedLonger.end_time)).toBe(60)
    const cleared = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original, durationMinutes: null,
    })
    expect(cleared.start_time).toBe('2030-10-27T02:15:00+02:00')
    expect(cleared.end_time).toBe('2030-10-27T02:45:00+02:00')
  })

  it('keeps the original service until the catalog is ready or the user clears it', () => {
    const options = [{ service_id: null, master_service_id: 1, name: 'Audit40', duration: 40 }]
    expect(serviceSelectionForSave({ serviceKey: 'master:1', options: [], editing: true, catalogState: 'loading' }).mode).toBe('omit')
    expect(serviceSelectionForSave({ serviceKey: 'service:8', options: [], editing: true, catalogState: 'error' }).mode).toBe('omit')
    expect(serviceSelectionForSave({ serviceKey: 'master:9', options, editing: true, catalogState: 'ready' }).mode).toBe('omit')
    const chosen = serviceSelectionForSave({ serviceKey: 'master:1', options, editing: true, catalogState: 'ready' })
    expect(chosen).toMatchObject({ mode: 'set', masterServiceId: 1, serviceId: null, duration: 40 })
    expect(serviceSelectionForSave({ serviceKey: '', options, editing: true, catalogState: 'error' }).mode).toBe('clear')
    const kept = manualPayload({
      clientName: 'Анна', serviceMode: 'omit', start: '2026-11-16T10:00:00', end: '2026-11-16T10:40:00',
    }).body
    expect(kept.service_id).toBeUndefined()
    expect(kept.master_service_id).toBeUndefined()
    expect(manualPayload({
      clientName: 'Анна', serviceMode: 'clear', start: '2026-11-16T10:00:00', end: '2026-11-16T10:40:00',
    }).body).toMatchObject({ service_id: null, master_service_id: null })
    expect(manualPayload({
      clientName: 'Анна', serviceMode: 'set', serviceId: 8, start: '2026-11-16T10:00:00', end: '2026-11-16T11:00:00',
    }).body.service_id).toBe(8)
  })

  it('does not publish private block titles and states the Free limit', () => {
    expect(clientCalendarBlockLabels([{ title: 'Врач' }])).toEqual([])
    expect(MANUAL_CAP_NOTE).toMatch(/Free 20/)
    expect(BLOCK_CAP_NOTE).toMatch(/не входит/)
    const master = readFileSync(new URL('../components/MasterScheduleCalendar.jsx', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../components/MasterDayDrawerModal.jsx', import.meta.url), 'utf8')
    const pub = readFileSync(new URL('../components/booking/PublicBookingCalendarGrid.jsx', import.meta.url), 'utf8')
    expect(master).toContain('CalendarB3Composer')
    expect(master).toContain("source === 'manual'")
    const cancelFn = master.slice(master.indexOf('handleMobileCancelWithReason'), master.indexOf('handleMobileCancelWithReason') + 700)
    expect(cancelFn.indexOf("source === 'manual'")).toBeGreaterThan(-1)
    expect(cancelFn.indexOf("source === 'manual'")).toBeLessThan(cancelFn.indexOf('cancel-booking'))
    const sheet = readFileSync(new URL('../components/master/mobile/MasterBookingDetailSheet.jsx', import.meta.url), 'utf8')
    expect(sheet).toContain("source === 'manual'")
    expect(sheet).toContain('onEditManual')
    expect(drawer).toContain('Запись вручную')
    expect(pub).not.toContain('calendar-blocks')
    expect(pub).not.toContain('CalendarB3')
  })
})
