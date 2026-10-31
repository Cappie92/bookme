jest.mock('@src/services/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import {
  BLOCK_CAP_NOTE,
  MANUAL_CAP_NOTE,
  blockPayload,
  clientCalendarBlockLabels,
  canonicalServiceOptions,
  eventVersion,
  explainCalendarError,
  findOverlap,
  dayClipMinutes,
  halfOpenOverlap,
  overlapsDay,
  bookingsOnDay,
  elapsedMinutes,
  intervalForService,
  intervalFromClocks,
  manualBounds,
  manualPayload,
  serviceSelectionForSave,
  keyForPayload,
  openIdempotency,
  submitBounds,
  wallSpanMinutes,
  readError,
  rememberVersion,
  wallClock,
} from '@src/services/calendarB3';

describe('calendar B3 mobile contract', () => {
  it('keeps naive wall time and omits source', () => {
    const interval = intervalFromClocks('2026-11-16', '02:00', '03:00');
    const result = manualPayload({
      clientName: ' Анна ',
      phone: '+79001234567',
      notes: 'окно',
      start: interval!.start_time,
      end: interval!.end_time,
    });
    expect(result.body).toEqual({
      client_name: 'Анна',
      client_phone: '+79001234567',
      notes: 'окно',
      start_time: '2026-11-16T02:00:00',
      end_time: '2026-11-16T03:00:00',
    });
    expect(JSON.stringify(result.body)).not.toContain('source');
    expect(intervalForService('2026-11-12', '10:00', 60)?.end_time).toBe('2026-11-12T11:00:00');
    expect(intervalFromClocks('2026-11-16', '22:00', '02:00', '2026-11-17')?.end_time).toBe('2026-11-17T02:00:00');
    expect(intervalFromClocks('2026-11-16', '11:00', '10:00')).toBeNull();
    expect(wallSpanMinutes('2026-11-16T22:00:00', '2026-11-17T02:00:00')).toBe(240);
  });

  it('does not guess a DST offset and names a half-open conflict', () => {
    expect(wallClock('2026-11-12T10:00:00+01:00')).toMatchObject({ time: '10:00', offset: '+01:00' });
    expect(halfOpenOverlap('2026-11-16T10:00:00', '2026-11-16T11:00:00', '2026-11-16T11:00:00', '2026-11-16T12:00:00')).toBe(false);
    expect(overlapsDay('2026-11-16T22:00:00', '2026-11-17T02:00:00', '2026-11-17')).toBe(true);
    expect(dayClipMinutes('2026-11-16T22:00:00', '2026-11-17T02:00:00', '2026-11-17')).toEqual({ startMinute: 0, endMinute: 120 });
    expect(findOverlap(
      { start_time: '2026-11-16T10:30:00', end_time: '2026-11-16T11:30:00' },
      [{ id: 1, client_name: 'Борис', start_time: '2026-11-16T11:00:00', end_time: '2026-11-16T12:00:00', status: 'confirmed' }],
      [],
    )?.label).toBe('Борис');
  });

  it('reuses an idempotency key and surfaces version conflicts', () => {
    const body = blockPayload({ category: 'personal', title: 'Врач', start: '2026-11-18T15:00:00', end: '2026-11-18T16:00:00', version: 2 }).body!;
    const state = { key: 'b3-once', lastPayload: null as string | null };
    expect(keyForPayload(state, body)).toBe(keyForPayload(state, body));
    expect(keyForPayload(state, { ...body, title: 'Другое' })).not.toBe('b3-once');
    const parsed = readError({ response: { status: 409, headers: { 'x-error-code': 'CALENDAR_VERSION_CONFLICT' }, data: { detail: 'changed' } } });
    expect(parsed.refresh).toBe(true);
    expect(explainCalendarError(parsed)).toMatch(/повторите/);
    rememberVersion('booking', 4, 1);
    expect(eventVersion('booking', { id: 4 })).toBeNull();
    expect(eventVersion('booking', { id: 4, version: 3 })).toBe(3);
    const reopenedState = { key: 'old', lastPayload: 'kept' };
    const opened = openIdempotency(reopenedState);
    expect(keyForPayload(reopenedState, { a: 1 })).toBe(opened);
    expect(keyForPayload(reopenedState, { a: 1 })).toBe(opened);
    const reopened = openIdempotency(reopenedState);
    expect(reopened).not.toBe(opened);
    const original = {
      start_time: '2030-10-27T02:15:00',
      end_time: '2030-10-27T02:45:00',
      start_utc_us: Date.parse('2030-10-27T00:15:00Z') * 1000,
      end_utc_us: Date.parse('2030-10-27T00:45:00Z') * 1000,
      time_zone: 'Europe/Berlin',
    };
    expect(submitBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original,
    }).start_time).toBe('2030-10-27T02:15:00+02:00');
    expect(canonicalServiceOptions([
      { name: 'Каталог', duration: 60 },
      { service_id: 9, name: 'Своя', duration: 60 },
      { master_service_id: 5, name: 'Каталог', duration: 40 },
    ]).map((row) => [row.service_id, row.master_service_id])).toEqual([[9, null], [null, 5]]);
    expect(manualPayload({ clientName: 'Анна', masterServiceId: 5, start: '2026-11-16T10:00:00', end: '2026-11-16T10:40:00' }).body?.master_service_id).toBe(5);
    const storedFold = {
      start_time: '2030-10-27T02:15:00', end_time: '2030-10-27T02:45:00',
      start_utc_us: Date.parse('2030-10-27T00:15:00Z') * 1000,
      end_utc_us: Date.parse('2030-10-27T00:45:00Z') * 1000,
      time_zone: 'Europe/Berlin',
    };
    expect(manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: storedFold, durationMinutes: 30,
    }).start_time).toBe('2030-10-27T02:15:00+02:00');
    expect(manualBounds({
      startDate: '2030-03-31', startTime: '02:30', endDate: '2030-03-31', endTime: '03:00',
      timeZone: 'Europe/Berlin', durationMinutes: 30,
    }).error).toMatch(/отсутствует/);
    expect(bookingsOnDay([
      { id: 1, start_time: '2030-01-06T22:00:00', end_time: '2030-01-07T02:00:00' },
      { id: 1, start_time: '2030-01-06T22:00:00', end_time: '2030-01-07T02:00:00' },
      { id: 2, start_time: '2030-01-06T21:00:00', end_time: '2030-01-07T00:00:00' },
      { id: 3, start_time: '2030-01-05T18:00:00', end_time: '2030-01-08T10:00:00' },
    ], '2030-01-07').map((row) => row.id)).toEqual([1, 3]);
    expect(elapsedMinutes('2030-10-27T02:15:00+02:00', '2030-10-27T02:45:00+02:00')).toBe(30);
    const longer = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: storedFold, durationMinutes: 60,
    });
    expect(longer.start_time).toBe('2030-10-27T02:15:00+02:00');
    expect(longer.end_time).toBe('2030-10-27T02:15:00+01:00');
    expect(elapsedMinutes(longer.start_time || '', longer.end_time || '')).toBe(60);
    const shorter = manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '03:15',
      timeZone: 'Europe/Berlin',
      original: { ...storedFold, end_utc_us: Date.parse('2030-10-27T01:15:00Z') * 1000 },
      durationMinutes: 30,
    });
    expect(shorter.end_time).toBe('2030-10-27T02:45:00+02:00');
    const laterFold = {
      ...storedFold,
      start_utc_us: Date.parse('2030-10-27T01:15:00Z') * 1000,
      end_utc_us: Date.parse('2030-10-27T01:45:00Z') * 1000,
    };
    expect(manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: laterFold, durationMinutes: 60,
    }).end_time).toBe('2030-10-27T03:15:00+01:00');
    expect(manualBounds({
      startDate: '2030-10-27', startTime: '01:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: storedFold, durationMinutes: 60,
    }).start_time).toBe('2030-10-27T01:15:00+02:00');
    expect(manualBounds({
      startDate: '2030-10-27', startTime: '02:15', endDate: '2030-10-27', endTime: '02:45',
      timeZone: 'Europe/Berlin', original: storedFold,
    }).end_time).toBe('2030-10-27T02:45:00+02:00');
    expect(serviceSelectionForSave({ serviceKey: 'master:1', options: [], editing: true, catalogState: 'loading' }).mode).toBe('omit');
    expect(serviceSelectionForSave({ serviceKey: 'service:8', options: [], editing: true, catalogState: 'error' }).mode).toBe('omit');
    expect(serviceSelectionForSave({
      serviceKey: 'master:1',
      options: [{ master_service_id: 1, duration: 40 }],
      editing: true,
      catalogState: 'ready',
    })).toMatchObject({ mode: 'set', masterServiceId: 1, duration: 40 });
    expect(serviceSelectionForSave({ serviceKey: '', options: [], editing: true, catalogState: 'ready' }).mode).toBe('clear');
    const kept = manualPayload({ clientName: 'Анна', serviceMode: 'omit', start: 'a', end: 'b' }).body;
    expect(kept?.service_id).toBeUndefined();
    expect(kept?.master_service_id).toBeUndefined();
    expect(manualPayload({ clientName: 'Анна', serviceMode: 'clear', start: 'a', end: 'b' }).body).toMatchObject({
      service_id: null,
      master_service_id: null,
    });
  });

  it('keeps private block titles out of the client calendar and states the Free limit', () => {
    expect(clientCalendarBlockLabels()).toEqual([]);
    expect(MANUAL_CAP_NOTE).toMatch(/Free 20/);
    expect(BLOCK_CAP_NOTE).toMatch(/не входит/);
    expect(manualPayload({ clientName: ' ', start: 'a', end: 'b' }).error).toMatch(/имя/);
    expect(manualPayload({ clientName: 'Анна', phone: '12', start: 'a', end: 'b' }).error).toMatch(/телефон/);
  });
});
