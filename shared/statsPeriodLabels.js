/**
 * Подписи периодов для графиков статистики (mobile + web).
 * Источник границ bucket'а: period_start / period_end (ISO YYYY-MM-DD) из API.
 */

/**
 * @param {string | undefined | null} iso
 * @returns {{ y: number, mo: number, d: number } | null}
 */
export function parseIsoDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const head = iso.slice(0, 10);
  const m = head.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

/**
 * ДД.ММ из ISO-даты
 * @param {string | undefined | null} iso
 */
export function formatDayMonth(iso) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${String(p.d).padStart(2, '0')}.${String(p.mo).padStart(2, '0')}`;
}

/**
 * ДД.ММ.ГГ для разных лет
 * @param {string | undefined | null} iso
 */
export function formatDayMonthYearShort(iso) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  const yy = String(p.y).slice(-2);
  return `${String(p.d).padStart(2, '0')}.${String(p.mo).padStart(2, '0')}.${yy}`;
}

/**
 * Точный диапазон bucket'а для тултипа / нижнего блока (ДД.ММ или ДД.ММ–ДД.ММ).
 * При разных годах: ДД.ММ.ГГ–ДД.ММ.ГГ
 * @param {string | undefined | null} periodStart ISO
 * @param {string | undefined | null} periodEnd ISO
 */
export function formatStatsBucketRange(periodStart, periodEnd) {
  if (!periodStart) return '';
  const a = parseIsoDate(periodStart);
  const b = periodEnd ? parseIsoDate(periodEnd) : a;
  if (!a) return '';
  if (!b) return formatDayMonth(periodStart);
  const sameDay = a.y === b.y && a.mo === b.mo && a.d === b.d;
  if (sameDay) return formatDayMonth(periodStart);
  const sameYear = a.y === b.y;
  if (sameYear) {
    return `${formatDayMonth(periodStart)}–${formatDayMonth(periodEnd)}`;
  }
  return `${formatDayMonthYearShort(periodStart)}–${formatDayMonthYearShort(periodEnd)}`;
}

/**
 * ММ.ГГГГ (для полного месяца на оси)
 */
function formatMonthYearFromStart(iso) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${String(p.mo).padStart(2, '0')}.${p.y}`;
}

function isFullCalendarMonth(startIso, endIso) {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  if (!a || !b) return false;
  if (a.y !== b.y || a.mo !== b.mo) return false;
  if (a.d !== 1) return false;
  const last = new Date(a.y, a.mo, 0).getDate();
  return b.d === last;
}

function isFullCalendarYear(startIso, endIso) {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  if (!a || !b) return false;
  return a.d === 1 && a.mo === 1 && b.d === 31 && b.mo === 12 && a.y === b.y;
}

/**
 * Короткая подпись для оси X (компактно, стиль ДД.ММ / ММ.ГГГГ / год).
 * @param {string | undefined | null} periodStart
 * @param {string | undefined | null} periodEnd
 * @param {string | undefined | null} periodLabelFallback backend period_label
 */
export function formatStatsAxisLabel(periodStart, periodEnd, periodLabelFallback) {
  if (periodStart && periodEnd) {
    const a = parseIsoDate(periodStart);
    const b = parseIsoDate(periodEnd);
    if (a && b) {
      if (a.y === b.y && a.mo === b.mo && a.d === b.d) {
        return formatDayMonth(periodStart);
      }
      if (isFullCalendarYear(periodStart, periodEnd)) {
        return String(a.y);
      }
      if (isFullCalendarMonth(periodStart, periodEnd)) {
        return formatMonthYearFromStart(periodStart);
      }
      return formatDayMonth(periodStart);
    }
  }
  if (periodStart) {
    return formatDayMonth(periodStart);
  }
  return normalizeLegacyPeriodLabel(periodLabelFallback);
}

/**
 * Старые подписи вида ДД-ММ или ММ-ГГГГ → с точками
 * @param {string | undefined | null} label
 */
export function normalizeLegacyPeriodLabel(label) {
  if (!label || typeof label !== 'string') return '';
  let s = label.trim();
  // ММ-ГГГГ или ММ.ГГГГ уже
  const my = s.match(/^(\d{1,2})[-.](\d{4})$/);
  if (my) {
    return `${String(my[1]).padStart(2, '0')}.${my[2]}`;
  }
  // ДД-ММ
  const dm = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (dm) {
    return `${String(dm[1]).padStart(2, '0')}.${String(dm[2]).padStart(2, '0')}`;
  }
  return s.replace(/(\d{2})-(\d{2})(?!\.)/g, '$1.$2');
}
