/**
 * Тексты скидок публичной записи — синхрон смысла с web
 * frontend/src/components/booking/PublicBookingWizard.jsx (LOYALTY_HINT_TITLE_BY_TYPE, buildLoyaltyHintCopy).
 */
import type { LoyaltyHint, BookingPricePreview, PublicHappyHoursVisual } from '@src/services/api/publicMasters';

/** en-US short weekday → isoweekday Пн=1 … Вс=7 (как happy_hours на backend). */
const WEEKDAY_SHORT_TO_ISO: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getMasterLocalWeekdayAndMinutes(isoString: string, timeZone: string): { weekday: number; minutes: number } | null {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  let weekday: number | undefined;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'weekday') weekday = WEEKDAY_SHORT_TO_ISO[p.value];
    if (p.type === 'hour') hour = parseInt(p.value, 10) || 0;
    if (p.type === 'minute') minute = parseInt(p.value, 10) || 0;
  }
  if (weekday == null) return null;
  return { weekday, minutes: hour * 60 + minute };
}

function hhmmToMinutes(hhmm: string): number | null {
  const parts = String(hhmm).split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Совпадение happy_hours: start включительно, end исключительно (как evaluate_discount_candidates). */
export function happyHoursChipLabel(
  slotStartIso: string,
  timeZone: string,
  rules: PublicHappyHoursVisual[] | undefined
): string | null {
  const loc = getMasterLocalWeekdayAndMinutes(slotStartIso, timeZone);
  if (!loc || !rules?.length) return null;
  let best = 0;
  for (const r of rules) {
    if (r.weekday !== loc.weekday) continue;
    const s = hhmmToMinutes(r.start_time);
    const e = hhmmToMinutes(r.end_time);
    if (s == null || e == null) continue;
    if (loc.minutes >= s && loc.minutes < e) {
      const p = Number(r.discount_percent) || 0;
      if (p > best) best = p;
    }
  }
  if (best <= 0) return null;
  if (Math.abs(best - Math.round(best)) < 1e-6) return `\u2212${Math.round(best)}%`;
  return `\u2212${best}%`;
}

export function hasHappyHoursVisual(rules: PublicHappyHoursVisual[] | undefined): boolean {
  return Array.isArray(rules) && rules.some((r) => Number(r.discount_percent) > 0);
}

/** Короткие русские названия (как desktop public booking). */
export const LOYALTY_TITLE_BY_CONDITION_TYPE: Record<string, string> = {
  birthday: 'День рождения',
  first_visit: 'Первый визит',
  returning_client: 'Скидка за возвращение',
  regular_visits: 'Постоянный клиент',
  service_discount: 'Скидка на услугу',
  personal: 'Персональная скидка',
  happy_hours: 'Счастливые часы',
};

function normalizeConditionType(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const aliases: Record<string, string> = {
    happyhours: 'happy_hours',
    happy_hours: 'happy_hours',
    returning: 'returning_client',
    returningclient: 'returning_client',
    returning_client: 'returning_client',
    firstvisit: 'first_visit',
    first_visit: 'first_visit',
    regular: 'regular_visits',
    regularvisits: 'regular_visits',
    regular_visits: 'regular_visits',
    servicediscount: 'service_discount',
    service_discount: 'service_discount',
    birthday: 'birthday',
    personal: 'personal',
  };
  return aliases[s] || s;
}

function titleFromRuleName(ruleName: string): string | null {
  const low = ruleName.toLowerCase();
  if (low.includes('happy') && (low.includes('hour') || low.includes('hours')))
    return LOYALTY_TITLE_BY_CONDITION_TYPE.happy_hours;
  if (low.includes('returning') || low.includes('возврат')) return LOYALTY_TITLE_BY_CONDITION_TYPE.returning_client;
  if (low.includes('first') && low.includes('visit')) return LOYALTY_TITLE_BY_CONDITION_TYPE.first_visit;
  if (low.includes('regular') || low.includes('постоянн')) return LOYALTY_TITLE_BY_CONDITION_TYPE.regular_visits;
  if (low.includes('service') && low.includes('discount')) return LOYALTY_TITLE_BY_CONDITION_TYPE.service_discount;
  if (low.includes('personal') || low.includes('персонал')) return LOYALTY_TITLE_BY_CONDITION_TYPE.personal;
  if (low.includes('birthday') || low.includes('рожден')) return LOYALTY_TITLE_BY_CONDITION_TYPE.birthday;
  return null;
}

function titleForConditionType(conditionType: string | null | undefined, ruleName: string | null | undefined): string {
  const ct = normalizeConditionType(conditionType);
  if (ct && LOYALTY_TITLE_BY_CONDITION_TYPE[ct]) return LOYALTY_TITLE_BY_CONDITION_TYPE[ct];
  const rn = String(ruleName ?? '').trim();
  if (rn) {
    const fromRn = titleFromRuleName(rn);
    if (fromRn) return fromRn;
    return rn;
  }
  return 'Скидка';
}

export type DiscountPrefaceOptions = {
  /** В профиле мастера есть окна happy hours — показать подсказку про слоты, если hint не про HH. */
  profileHasHappyHours?: boolean;
};

/** Блок до выбора слота: из eligibility loyalty_hint (как buildLoyaltyHintCopy на web). */
export function buildDiscountPrefaceFromHint(
  hint: LoyaltyHint | null | undefined,
  options?: DiscountPrefaceOptions
): { title: string; subtitle: string } | null {
  if (!hint?.active) return null;
  const pct = hint.discount_percent != null ? Math.round(Number(hint.discount_percent)) : null;
  const pctPart = pct != null && pct > 0 ? ` — ${pct}%` : '';
  const baseTitle = titleForConditionType(hint.condition_type, hint.rule_name);
  const title =
    hint.condition_type === 'birthday' ? `${baseTitle} активна${pctPart}` : `${baseTitle}${pctPart}`;
  let subtitle: string;
  if (hint.condition_type === 'happy_hours') {
    subtitle = 'Выберите отмеченный слот, чтобы применить скидку.';
  } else if (hint.condition_type === 'birthday') {
    subtitle = 'Размер будет учтён при выборе времени визита.';
  } else if (options?.profileHasHappyHours && hint.condition_type !== 'happy_hours') {
    subtitle =
      'На части слотов действуют счастливые часы — выгоднее. Итог пересчитывается после выбора времени.';
  } else {
    subtitle = 'Итог пересчитывается после выбора времени.';
  }
  return { title, subtitle };
}

/**
 * Явное объяснение применённой скидки из price preview (источник истины — backend).
 */
export function buildAppliedDiscountExplain(preview: BookingPricePreview | null): {
  title: string;
  subtitle: string;
} | null {
  if (!preview || preview.final_price == null || preview.discount_amount <= 0.001) return null;
  const pct =
    preview.discount_percent != null && Number.isFinite(Number(preview.discount_percent))
      ? Math.round(Number(preview.discount_percent))
      : null;
  const base = titleForConditionType(preview.condition_type, preview.rule_name);
  const title = pct != null && pct > 0 ? `${base} — ${pct}%` : base;
  const subtitle = 'Итог пересчитан в блоке ниже.';
  return { title, subtitle };
}
