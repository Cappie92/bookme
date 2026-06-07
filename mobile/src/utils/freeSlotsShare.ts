/**
 * Логика карточки свободных слотов — порт web FreeSlotsShareCardModal.jsx.
 * API: GET /api/public/masters/:slug, GET .../availability?service_id&from_date&to_date
 */
import type { PublicSlot } from '@src/services/api/publicMasters';

export const FREE_SLOTS_DAYS_AHEAD = 14;
export const FREE_SLOTS_MAX_HOURS = 7;

export function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const y2 = dt.getFullYear();
  const m2 = String(dt.getMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

function calendarDayInMasterTz(isoString: string, timeZone: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const tz = timeZone?.trim() || 'Europe/Moscow';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getWholeHourStartLabel(isoString: string, timeZone: string): string | null {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const tz = timeZone?.trim() || 'Europe/Moscow';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? 'NaN', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? 'NaN', 10);
  const second = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute !== 0 || second !== 0) return null;
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Целые часы начала на выбранный день (как web). */
export function buildWholeHourLabels(
  slots: PublicSlot[],
  selectedDate: string,
  masterTimezone: string
): string[] {
  if (!selectedDate || !slots.length) return [];
  const tz = masterTimezone || 'Europe/Moscow';
  const now = Date.now();
  const byLabel = new Map<string, number>();
  for (const s of slots) {
    if (!s.start_time) continue;
    if (calendarDayInMasterTz(s.start_time, tz) !== selectedDate) continue;
    const startMs = new Date(s.start_time).getTime();
    if (Number.isNaN(startMs) || startMs <= now) continue;
    const label = getWholeHourStartLabel(s.start_time, tz);
    if (!label) continue;
    const prev = byLabel.get(label);
    if (prev == null || startMs < prev) byLabel.set(label, startMs);
  }
  return [...byLabel.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label)
    .slice(0, FREE_SLOTS_MAX_HOURS);
}

export function pickReferenceServiceId(
  services: { id: number; duration: number }[]
): number | null {
  if (!services.length) return null;
  const ranked = [...services].sort((a, b) => {
    const da = Number(a.duration) > 0 ? Number(a.duration) : 999999;
    const db = Number(b.duration) > 0 ? Number(b.duration) : 999999;
    if (da !== db) return da - db;
    return a.id - b.id;
  });
  return ranked[0].id;
}

export function enumerateDaysInclusive(fromStr: string, toStr: string): string[] {
  const out: string[] = [];
  let cur = fromStr;
  while (cur && toStr && cur <= toStr) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

export function firstDateWithWholeCardHours(
  slots: PublicSlot[],
  fromStr: string,
  toStr: string,
  masterTimezone: string
): string | null {
  for (const d of enumerateDaysInclusive(fromStr, toStr)) {
    if (buildWholeHourLabels(slots, d, masterTimezone).length > 0) return d;
  }
  return null;
}

export function formatCardDateRu(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function shortBookingPath(bookingUrl: string): string {
  if (!bookingUrl) return '';
  try {
    const u = new URL(bookingUrl);
    return `${u.host}${u.pathname}`.replace(/\/$/, '') || bookingUrl;
  } catch {
    return bookingUrl.replace(/^https?:\/\//, '');
  }
}

export function buildFreeSlotsShareMessage(params: {
  masterName: string;
  dateLabel: string;
  hourLabels: string[];
  bookingUrl: string;
}): string {
  const hours =
    params.hourLabels.length > 0
      ? params.hourLabels.join(', ')
      : 'нет свободных часов на эту дату';
  return [
    params.masterName,
    params.dateLabel,
    '',
    `Свободные часы: ${hours}`,
    '',
    `Запись: ${params.bookingUrl}`,
  ].join('\n');
}
