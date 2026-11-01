import { apiClient } from '@src/services/api/client';

export const BLOCK_CATEGORIES = [
  { value: 'personal', label: 'Личное' },
  { value: 'break', label: 'Перерыв' },
  { value: 'busy', label: 'Занято' },
] as const;

export const MANUAL_CAP_NOTE = 'Ручная запись не входит в лимит Free 20.';
export const BLOCK_CAP_NOTE = 'Личный блок не входит в лимит Free 20.';

const PHONE_RE = /^\+?[0-9]{10,15}$/;
const WALL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:([+-]\d{2}:\d{2}|Z))?$/;
const versions = new Map<string, number>();

export interface CalendarBlock {
  id: number;
  master_id: number;
  category: string;
  title: string | null;
  description: string | null;
  start_time: string;
  end_time: string;
  time_zone?: string | null;
  version: number;
  deleted_at?: string | null;
}

export interface ManualBookingBody {
  client_name: string;
  start_time: string;
  end_time: string;
  client_phone?: string;
  service_id?: number | null;
  master_service_id?: number | null;
  notes?: string;
  version?: number;
}

export interface CalendarError {
  status: number;
  code: string | null;
  message: string;
  refresh: boolean;
}

export function wallClock(value: string | null | undefined) {
  const match = WALL_RE.exec(String(value || ''));
  if (!match) return null;
  return { date: match[1], time: `${match[2]}:${match[3]}`, offset: match[5] || null };
}

export function wallLabel(value: string | null | undefined) {
  return wallClock(value)?.time || '';
}

export function intervalFromClocks(date: string, startTime: string, endTime: string, endDate: string = date) {
  const finish = endDate || date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(finish) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  if (`${finish}T${endTime}:00` <= `${date}T${startTime}:00`) return null;
  return { start_time: `${date}T${startTime}:00`, end_time: `${finish}T${endTime}:00` };
}

export function elapsedMinutes(start?: string | null, end?: string | null) {
  const aware = /(?:Z|[+-]\d{2}:\d{2})$/;
  const startMs = Date.parse(String(start || ''));
  const endMs = Date.parse(String(end || ''));
  if (aware.test(String(start || '')) && aware.test(String(end || '')) && Number.isFinite(startMs) && Number.isFinite(endMs)) {
    return (endMs - startMs) / 60000;
  }
  return wallSpanMinutes(String(start || ''), String(end || ''));
}

export function wallSpanMinutes(start: string, end: string) {
  const left = wallClock(start);
  const right = wallClock(end);
  if (!left || !right) return null;
  const [y1, m1, d1] = left.date.split('-').map(Number);
  const [h1, min1] = left.time.split(':').map(Number);
  const [y2, m2, d2] = right.date.split('-').map(Number);
  const [h2, min2] = right.time.split(':').map(Number);
  return (Date.UTC(y2, m2 - 1, d2, h2, min2) - Date.UTC(y1, m1 - 1, d1, h1, min1)) / 60000;
}

export function intervalForService(date: string, startTime: string, durationMinutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match || durationMinutes <= 0) return null;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = startMinutes + durationMinutes;
  const dayOffset = Math.floor(endMinutes / 1440);
  const endClock = endMinutes % 1440;
  const endDate = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + dayOffset);
  const pad = (value: number) => String(value).padStart(2, '0');
  const endDay = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
  return {
    start_time: `${date}T${startTime}:00`,
    end_time: `${endDay}T${pad(Math.floor(endClock / 60))}:${pad(endClock % 60)}:00`,
  };
}

export function halfOpenOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

function nextDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function overlapsDay(start: string, end: string, dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return false;
  return halfOpenOverlap(start || '', end || '', `${dateStr}T00:00:00`, `${nextDate(dateStr)}T00:00:00`);
}

export function bookingsOnDay<T extends { id?: number; start_time: string; end_time: string }>(rows: T[], date: string) {
  const seen = new Set<number>();
  return (rows || []).filter((row) => {
    if (!overlapsDay(row.start_time, row.end_time, date)) return false;
    if (row.id == null || !seen.has(row.id)) {
      if (row.id != null) seen.add(row.id);
      return true;
    }
    return false;
  });
}

export function dayClipMinutes(start: string, end: string, dateStr: string) {
  if (!overlapsDay(start, end, dateStr)) return null;
  const startClock = wallClock(start);
  const endClock = wallClock(end);
  if (!startClock || !endClock) return null;
  const minutes = (clock: { time: string }) => Number(clock.time.slice(0, 2)) * 60 + Number(clock.time.slice(3, 5));
  const startMinute = startClock.date === dateStr ? minutes(startClock) : 0;
  const endMinute = endClock.date === dateStr ? minutes(endClock) : 1440;
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}

export function categoryLabel(value: string | null | undefined) {
  return BLOCK_CATEGORIES.find((item) => item.value === value)?.label || 'Занято';
}

export function findOverlap(
  candidate: { start_time: string; end_time: string },
  bookings: Array<{ id: number; client_name?: string | null; guest_name?: string | null; start_time: string; end_time: string; status?: string }>,
  blocks: CalendarBlock[],
  ignore?: { kind: 'booking' | 'block'; id: number },
) {
  const rows = [
    ...bookings.filter((item) => item.status !== 'cancelled' && !(ignore?.kind === 'booking' && ignore.id === item.id)).map((item) => ({
      kind: 'booking' as const,
      id: item.id,
      label: item.guest_name || item.client_name || 'Запись',
      start_time: item.start_time,
      end_time: item.end_time,
    })),
    ...blocks.filter((item) => !item.deleted_at && !(ignore?.kind === 'block' && ignore.id === item.id)).map((item) => ({
      kind: 'block' as const,
      id: item.id,
      label: item.title || categoryLabel(item.category),
      start_time: item.start_time,
      end_time: item.end_time,
    })),
  ];
  return rows.find((row) => halfOpenOverlap(candidate.start_time, candidate.end_time, row.start_time, row.end_time)) || null;
}

export function validPhone(value: string) {
  const phone = value.trim();
  if (!phone) return { ok: true, phone: null as string | null };
  if (!PHONE_RE.test(phone)) return { ok: false, phone: null as string | null };
  return { ok: true, phone };
}

export function serviceSelectionForSave(input: {
  serviceKey: string;
  options?: Array<{ service_id?: number | null; master_service_id?: number | null; duration?: number | null }> | null;
  editing?: boolean;
  catalogState?: 'loading' | 'error' | 'ready' | string;
}) {
  if (input.serviceKey === '') {
    return { mode: 'clear' as const, serviceId: null, masterServiceId: null, duration: null as number | null };
  }
  const selected = (input.options || []).find((item) => serviceOptionKey(item) === input.serviceKey);
  if (selected && input.catalogState === 'ready') {
    return {
      mode: 'set' as const,
      serviceId: selected.service_id || null,
      masterServiceId: selected.master_service_id || null,
      duration: Number(selected.duration) || null,
    };
  }
  return { mode: 'omit' as const, serviceId: null, masterServiceId: null, duration: null as number | null };
}

export function manualPayload(input: {
  clientName: string; phone?: string; serviceId?: string | number | null; masterServiceId?: string | number | null;
  serviceMode?: 'clear' | 'set' | 'omit';
  notes?: string;
  start: string; end: string; version?: number | null;
}) {
  const name = input.clientName.trim();
  if (!name) return { error: 'Укажите имя клиента.' };
  const phone = validPhone(input.phone || '');
  if (!phone.ok) return { error: 'Некорректный телефон клиента.' };
  const body: ManualBookingBody = { client_name: name, start_time: input.start, end_time: input.end };
  if (phone.phone) body.client_phone = phone.phone;
  const mode = input.serviceMode || ((input.serviceId || input.masterServiceId) ? 'set' : 'omit');
  if (mode === 'clear') {
    body.service_id = null;
    body.master_service_id = null;
  } else if (mode === 'set') {
    if (input.serviceId && input.masterServiceId) return { error: 'Выберите одну услугу.' };
    if (input.serviceId) body.service_id = Number(input.serviceId);
    else if (input.masterServiceId) body.master_service_id = Number(input.masterServiceId);
  }
  const notes = (input.notes || '').trim();
  if (notes) body.notes = notes;
  if (input.version != null) body.version = Number(input.version);
  return { body };
}

export function blockPayload(input: {
  category: string; title?: string; description?: string; start: string; end: string; version?: number | null;
}) {
  if (!BLOCK_CATEGORIES.some((item) => item.value === input.category)) return { error: 'Недопустимая категория блока.' };
  const body: {
    start_time: string; end_time: string; category: string; title?: string; description?: string; version?: number;
  } = { start_time: input.start, end_time: input.end, category: input.category };
  const title = (input.title || '').trim();
  const description = (input.description || '').trim();
  if (title) body.title = title;
  if (description) body.description = description;
  if (input.version != null) body.version = Number(input.version);
  return { body };
}

export function newIdempotencyKey() {
  return `b3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function keyForPayload(state: { key: string; lastPayload: string | null }, payload: object) {
  const serialized = JSON.stringify(payload);
  if (state.lastPayload === serialized) return state.key;
  const key = state.lastPayload == null ? state.key : newIdempotencyKey();
  state.key = key;
  state.lastPayload = serialized;
  return key;
}

export function readError(error: unknown): CalendarError {
  const response = (error as { response?: { status?: number; data?: { detail?: unknown }; headers?: Record<string, string> } })?.response;
  const headers = response?.headers || {};
  const code = headers['x-error-code'] || headers['X-Error-Code'] || null;
  const detail = response?.data?.detail;
  return {
    status: response?.status || 0,
    code,
    message: typeof detail === 'string' && detail ? detail : 'Не удалось сохранить',
    refresh: code === 'CALENDAR_VERSION_CONFLICT',
  };
}

export function explainCalendarError(parsed: CalendarError, overlap?: { label: string; start_time: string; end_time: string } | null) {
  if (parsed.code === 'BOOKING_SLOT_CONFLICT' && overlap) {
    return `${parsed.message} Пересечение с «${overlap.label}» ${wallLabel(overlap.start_time)}–${wallLabel(overlap.end_time)}.`;
  }
  if (parsed.code === 'CALENDAR_VERSION_CONFLICT') return 'Запись уже изменена. Календарь обновлён, повторите действие.';
  if (parsed.code === 'IDEMPOTENCY_KEY_REUSED') return 'Этот запрос уже отправлен с другими данными. Проверьте форму и сохраните ещё раз.';
  if (parsed.code === 'BOOKING_SLOT_BUSY') return parsed.message || 'Слот сейчас занят. Повторите действие один раз.';
  return parsed.message;
}

export function rememberVersion(kind: string, id: number, version: number) {
  if (Number.isInteger(version) && version >= 1) versions.set(`${kind}:${id}`, version);
}

export function eventVersion(_kind: string, event?: { id?: number; version?: number | null } | null) {
  const direct = Number(event?.version);
  if (Number.isInteger(direct) && direct >= 1) return direct;
  return null;
}

function offsetLabel(label: string | undefined) {
  if (!label || label === 'GMT' || label === 'UTC') return '+00:00';
  const match = /(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/.exec(label);
  if (!match) return null;
  return `${match[1]}${match[2].padStart(2, '0')}:${(match[3] || '00').padStart(2, '0')}`;
}

export function awareWall(utcMicroseconds: number | null | undefined, timeZone: string | null | undefined) {
  const ms = Number(utcMicroseconds) / 1000;
  if (!Number.isFinite(ms) || !timeZone) return null;
  let parts: Intl.DateTimeFormatPart[];
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
    }).formatToParts(new Date(ms));
  } catch {
    return null;
  }
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  let hour = read('hour');
  if (hour === '24') hour = '00';
  const offset = offsetLabel(read('timeZoneName'));
  if (!hour || !offset) return null;
  const date = `${read('year')}-${read('month')}-${read('day')}`;
  const time = `${hour}:${read('minute')}`;
  return { date, time, offset, iso: `${date}T${time}:${read('second') || '00'}${offset}` };
}

export function offsetChoices(date: string, time: string, timeZone: string | null | undefined) {
  if (!timeZone || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return [] as string[];
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const seen = new Set<string>();
  const choices: string[] = [];
  for (let offsetMinutes = -12 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60000;
    const wall = awareWall(utcMs * 1000, timeZone);
    if (wall && wall.date === date && wall.time === time && !seen.has(wall.offset)) {
      seen.add(wall.offset);
      choices.push(wall.offset);
    }
  }
  return choices;
}

export function submitBounds(input: {
  startDate: string; startTime: string; endDate: string; endTime: string;
  timeZone?: string | null;
  original?: { start_time?: string | null; end_time?: string | null; start_utc_us?: number | null; end_utc_us?: number | null; time_zone?: string | null } | null;
  startOffset?: string; endOffset?: string;
}) {
  const zone = input.timeZone || input.original?.time_zone || null;
  const originalStart = wallClock(input.original?.start_time);
  const originalEnd = wallClock(input.original?.end_time);
  const sameStart = Boolean(originalStart && originalStart.date === input.startDate && originalStart.time === input.startTime);
  const sameEnd = Boolean(originalEnd && originalEnd.date === input.endDate && originalEnd.time === input.endTime);
  if (sameStart && sameEnd && input.original?.start_utc_us != null && input.original?.end_utc_us != null && zone) {
    const start = awareWall(input.original.start_utc_us, zone);
    const end = awareWall(input.original.end_utc_us, zone);
    if (start && end) return { start_time: start.iso, end_time: end.iso };
  }
  const startChoices = zone ? offsetChoices(input.startDate, input.startTime, zone) : [];
  const endChoices = zone ? offsetChoices(input.endDate, input.endTime, zone) : [];
  if (zone && (startChoices.length === 0 || endChoices.length === 0)) {
    return { error: 'Это время отсутствует в часовом поясе мастера. Сдвиг часов не выполняется.' };
  }
  if ((startChoices.length > 1 && !startChoices.includes(input.startOffset || '')) || (endChoices.length > 1 && !endChoices.includes(input.endOffset || ''))) {
    return {
      ambiguous: true,
      startChoices,
      endChoices,
      error: 'В часовом поясе мастера это время наступает дважды. Выберите вариант и повторите действие.',
    };
  }
  const interval = intervalFromClocks(input.startDate, input.startTime, input.endTime, input.endDate);
  if (!interval) return { error: 'Укажите дату и время конца позже начала. Сдвиг часов не выполняется.' };
  const startMark = startChoices.length === 1 ? startChoices[0] : (input.startOffset || '');
  const endMark = endChoices.length === 1 ? endChoices[0] : (input.endOffset || '');
  return { start_time: `${interval.start_time}${startMark}`, end_time: `${interval.end_time}${endMark}` };
}

export function manualBounds(input: {
  startDate: string; startTime: string; endDate: string; endTime: string;
  timeZone?: string | null;
  original?: { start_time?: string | null; end_time?: string | null; start_utc_us?: number | null; end_utc_us?: number | null; time_zone?: string | null } | null;
  startOffset?: string; endOffset?: string;
  durationMinutes?: number | null;
}) {
  const duration = Number(input.durationMinutes);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  if (!hasDuration) return submitBounds(input);
  const zone = input.timeZone || input.original?.time_zone || null;
  const originalStart = wallClock(input.original?.start_time);
  const sameStart = Boolean(originalStart && originalStart.date === input.startDate && originalStart.time === input.startTime);
  if (sameStart && input.original?.start_utc_us != null && input.original?.end_utc_us != null && zone) {
    const elapsed = (Number(input.original.end_utc_us) - Number(input.original.start_utc_us)) / 60000000;
    if (Math.abs(elapsed - duration) <= 1) {
      const storedEnd = awareWall(input.original.end_utc_us, zone);
      if (storedEnd) {
        return submitBounds({ ...input, endDate: storedEnd.date, endTime: storedEnd.time, timeZone: zone });
      }
    }
    const start = awareWall(Number(input.original.start_utc_us), zone);
    const end = awareWall(Number(input.original.start_utc_us) + duration * 60000000, zone);
    if (start && end) return { start_time: start.iso, end_time: end.iso };
  }
  if (!zone) return { error: 'Часовой пояс мастера не задан. Сдвиг часов не выполняется.' };
  const startChoices = offsetChoices(input.startDate, input.startTime, zone);
  if (startChoices.length === 0) {
    return { error: 'Это время отсутствует в часовом поясе мастера. Сдвиг часов не выполняется.' };
  }
  if (startChoices.length > 1 && !startChoices.includes(input.startOffset || '')) {
    return {
      ambiguous: true,
      startChoices,
      endChoices: [] as string[],
      error: 'В часовом поясе мастера это время наступает дважды. Выберите вариант и повторите действие.',
    };
  }
  const mark = startChoices.length === 1 ? startChoices[0] : input.startOffset;
  const startMs = Date.parse(`${input.startDate}T${input.startTime}:00${mark}`);
  const end = Number.isFinite(startMs) ? awareWall((startMs + duration * 60000) * 1000, zone) : null;
  if (!end) return { error: 'Не удалось сохранить длительность услуги в часовом поясе мастера.' };
  return { start_time: `${input.startDate}T${input.startTime}:00${mark}`, end_time: end.iso };
}

export function serviceOptionKey(row?: { service_id?: number | null; master_service_id?: number | null } | null) {
  if (row?.service_id) return `service:${row.service_id}`;
  if (row?.master_service_id) return `master:${row.master_service_id}`;
  return '';
}

export function canonicalServiceOptions(rows: Array<{ service_id?: number | null; master_service_id?: number | null; name?: string; duration?: number; price?: number }> | null | undefined) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const serviceId = Number(row?.service_id);
    const masterServiceId = Number(row?.master_service_id);
    const hasService = Number.isInteger(serviceId) && serviceId >= 1;
    const hasMaster = Number.isInteger(masterServiceId) && masterServiceId >= 1;
    if (hasService === hasMaster) return [];
    return [{
      service_id: hasService ? serviceId : null,
      master_service_id: hasMaster ? masterServiceId : null,
      name: row.name,
      duration: row.duration,
      price: row.price,
    }];
  });
}

export function openIdempotency(state: { key: string; lastPayload: string | null }) {
  state.key = newIdempotencyKey();
  state.lastPayload = null;
  return state.key;
}

export function clientCalendarBlockLabels() {
  return [] as string[];
}

export async function listCalendarBlocks() {
  const response = await apiClient.get<CalendarBlock[]>('/api/master/calendar-blocks');
  return (response.data || []).filter((row) => !row.deleted_at);
}

export async function createManualBooking(body: ManualBookingBody, key: string) {
  const response = await apiClient.post('/api/master/bookings/manual', body, { headers: { 'Idempotency-Key': key } });
  return response.data;
}

export async function updateManualBooking(id: number, body: ManualBookingBody) {
  const response = await apiClient.put(`/api/master/bookings/manual/${id}`, body);
  return response.data;
}

export async function deleteManualBooking(id: number, version: number) {
  const response = await apiClient.delete(`/api/master/bookings/manual/${id}?version=${version}`);
  return response.data;
}

export async function createCalendarBlock(body: object, key: string) {
  const response = await apiClient.post('/api/master/calendar-blocks', body, { headers: { 'Idempotency-Key': key } });
  return response.data;
}

export async function updateCalendarBlock(id: number, body: object) {
  const response = await apiClient.put(`/api/master/calendar-blocks/${id}`, body);
  return response.data;
}

export async function deleteCalendarBlock(id: number, version: number) {
  const response = await apiClient.delete(`/api/master/calendar-blocks/${id}?version=${version}`);
  return response.data;
}
