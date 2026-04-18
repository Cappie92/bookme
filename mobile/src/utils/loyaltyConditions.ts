import type { QuickDiscountTemplate, LoyaltyDiscount } from '@src/types/loyalty_discounts';
import { LoyaltyDiscountType } from '@src/types/loyalty_discounts';

/**
 * Нормализует условия скидки для отправки на API
 * 
 * @param input - Входные данные условий (может быть null, undefined, object, array)
 * @returns Dict с condition_type и parameters (не Array!)
 */
export function normalizeConditionsForApi(input: any): Record<string, any> {
  // Маппинг UI type → backend condition_type (для legacy совместимости)
  const UI_TO_BACKEND_TYPE_MAP: Record<string, string> = {
    "visits_count": "visit_count",
    "total_spent": "spent_amount",
    "days_since_last": "days_since_last_visit",
    "service_category": "service_category",
  }

  // Если null или undefined → пустой dict
  if (input == null) {
    return {}
  }

  // Если уже объект с condition_type и parameters → вернуть как есть
  if (typeof input === 'object' && !Array.isArray(input)) {
    if (input.condition_type && input.parameters) {
      return input
    }
    // Если объект без condition_type/parameters → попробовать преобразовать
    if (input.type) {
      return _convertUIFormatToBackend(input, UI_TO_BACKEND_TYPE_MAP)
    }
    // Иначе → вернуть как есть
    return input
  }

  // Если массив → взять первое условие и преобразовать
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return {}
    }
    const first = input[0]
    return _convertUIFormatToBackend(first, UI_TO_BACKEND_TYPE_MAP)
  }

  // Если другой тип → пустой dict
  if (__DEV__) {
    console.warn('[loyaltyConditions] Unexpected input type, returning empty dict:', typeof input, input)
  }
  return {}
}

/**
 * Преобразует UI формат условия в backend формат
 */
function _convertUIFormatToBackend(uiCondition: any, typeMap: Record<string, string>): Record<string, any> {
  const uiType = uiCondition.type || uiCondition.condition_type
  const backendType = typeMap[uiType] || uiType

  // Формируем parameters в зависимости от типа
  let parameters: Record<string, any> = {}

  // Поддерживаемые типы (из backend/utils/loyalty_discounts.py)
  if (backendType === "first_visit") {
    parameters = {}
  } else if (backendType === "returning_client") {
    parameters = {
      days_since_last_visit: parseInt(uiCondition.value) || 0,
    }
  } else if (backendType === "regular_visits") {
    parameters = {
      visits_count: parseInt(uiCondition.value) || 0,
      period: uiCondition.period || "month",  // week, month, year
    }
  } else if (backendType === "happy_hours") {
    parameters = {
      start_time: uiCondition.start_time || "09:00",
      end_time: uiCondition.end_time || "18:00",
      days_of_week: Array.isArray(uiCondition.days_of_week) ? uiCondition.days_of_week : [1, 2, 3, 4, 5],
    }
  } else if (backendType === "service_discount") {
    parameters = {
      service_ids: Array.isArray(uiCondition.service_ids) ? uiCondition.service_ids : [],
      category_ids: Array.isArray(uiCondition.category_ids) ? uiCondition.category_ids : [],
    }
  } else {
    // Для неизвестных типов - минимальный формат
    parameters = {
      value: uiCondition.value,
      operator: uiCondition.operator,
    }
  }

  return {
    condition_type: backendType,
    parameters: parameters,
  }
}

/**
 * Whitelist поддерживаемых condition_type (реально обрабатываются в backend)
 * Совпадает с backend utils/loyalty_discounts + loyalty_params.
 */
export const SUPPORTED_CONDITION_TYPES = [
  "first_visit",
  "returning_client",
  "regular_visits",
  "birthday",
  "happy_hours",
  "service_discount",
]

/**
 * Проверяет, поддерживается ли condition_type в backend
 * @param conditionType - Backend condition_type
 * @returns boolean
 */
export function isConditionTypeSupported(conditionType: string): boolean {
  return SUPPORTED_CONDITION_TYPES.includes(conditionType)
}

/**
 * Получает список поддерживаемых типов для UI
 * @returns Array<{uiType: string, backendType: string, label: string}>
 */
export function getSupportedConditionTypesForUI() {
  return [
    { uiType: "first_visit", backendType: "first_visit", label: "Первая запись" },
    { uiType: "returning_client", backendType: "returning_client", label: "Возвращение клиента" },
    { uiType: "regular_visits", backendType: "regular_visits", label: "Регулярные визиты" },
    { uiType: "birthday", backendType: "birthday", label: "День рождения" },
    { uiType: "happy_hours", backendType: "happy_hours", label: "Счастливые часы" },
    { uiType: "service_discount", backendType: "service_discount", label: "Скидка на услуги" },
  ]
}

const PERIOD_TO_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 };
const DEFAULT_RETURNING_MIN = 30;
const DEFAULT_BIRTHDAY_BEFORE = 7;
const DEFAULT_BIRTHDAY_AFTER = 7;
const DEFAULT_REGULAR_VISITS_COUNT = 2;
const DEFAULT_REGULAR_VISITS_PERIOD_DAYS = 60;

function _toHHMM(s: any): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function _sortNum(a: number[]): number[] {
  return [...a].sort((x, y) => x - y);
}

/**
 * Нормализует parameters для сравнения (template vs discount).
 * Совпадает с backend utils/loyalty_params.normalize_parameters.
 * Принимает старый и новый форматы, возвращает канонический.
 */
export function normalizeParametersForComparison(
  conditionType: string,
  parameters: Record<string, any>,
  ruleDiscountPercent?: number | null
): Record<string, any> {
  const p = parameters && typeof parameters === 'object' ? { ...parameters } : {};

  if (conditionType === 'first_visit') return {};

  if (conditionType === 'regular_visits') {
    let periodDays = p.period_days;
    const period = p.period;
    if (periodDays != null && typeof periodDays === 'number') periodDays = Math.floor(periodDays);
    else if (typeof period === 'string' && period in PERIOD_TO_DAYS) periodDays = PERIOD_TO_DAYS[period];
    else periodDays = DEFAULT_REGULAR_VISITS_PERIOD_DAYS;
    let visitsCount = p.visits_count;
    if (visitsCount != null && typeof visitsCount === 'number') visitsCount = Math.floor(visitsCount);
    else visitsCount = DEFAULT_REGULAR_VISITS_COUNT;
    return { visits_count: Math.max(1, visitsCount), period_days: Math.max(1, periodDays) };
  }

  if (conditionType === 'returning_client') {
    let minDays = p.min_days_since_last_visit;
    const legacy = p.days_since_last_visit;
    if (minDays != null && typeof minDays === 'number') minDays = Math.floor(minDays);
    else if (legacy != null && typeof legacy === 'number') minDays = Math.floor(legacy);
    else minDays = DEFAULT_RETURNING_MIN;
    let maxDays: number | null = p.max_days_since_last_visit;
    if (maxDays != null && typeof maxDays === 'number') maxDays = Math.floor(maxDays);
    else maxDays = null;
    const out: Record<string, any> = { min_days_since_last_visit: Math.max(0, minDays) };
    out.max_days_since_last_visit = maxDays != null ? Math.max(0, maxDays) : null;
    return out;
  }

  if (conditionType === 'birthday') {
    let before = p.days_before;
    let after = p.days_after;
    if (before != null && typeof before === 'number') before = Math.floor(before);
    else before = DEFAULT_BIRTHDAY_BEFORE;
    if (after != null && typeof after === 'number') after = Math.floor(after);
    else after = DEFAULT_BIRTHDAY_AFTER;
    return { days_before: Math.max(0, before), days_after: Math.max(0, after) };
  }

  if (conditionType === 'happy_hours') {
    let days: number[] = p.days ?? p.days_of_week;
    if (Array.isArray(days)) {
      days = _sortNum([...new Set((days as number[]).filter((d) => typeof d === 'number' && d >= 1 && d <= 7))]);
    } else {
      days = [1, 2, 3, 4, 5];
    }
    const intervals = p.intervals;
    const startTime = p.start_time;
    const endTime = p.end_time;
    let outIntervals: Array<{ start: string; end: string }> = [];
    if (Array.isArray(intervals) && intervals.length > 0) {
      for (const iv of intervals) {
        if (!iv || typeof iv !== 'object') continue;
        const s = _toHHMM(iv.start);
        const e = _toHHMM(iv.end);
        if (s && e && s < e) outIntervals.push({ start: s, end: e });
      }
      outIntervals.sort((a, b) => (a.start + a.end).localeCompare(b.start + b.end));
    } else if (startTime && endTime) {
      const s = _toHHMM(startTime);
      const e = _toHHMM(endTime);
      if (s && e && s < e) outIntervals = [{ start: s, end: e }];
      else outIntervals = [{ start: '09:00', end: '12:00' }];
    } else {
      outIntervals = [{ start: '09:00', end: '12:00' }];
    }
    return { days, intervals: outIntervals };
  }

  if (conditionType === 'service_discount') {
    const items = (p.items as any[]) ?? [];
    const serviceIds = (p.service_ids as any[]) ?? [];
    const categoryIds = (p.category_ids as any[]) ?? [];

    const invalid = (): Record<string, any> => ({ _invalid: true });

    if (p.service_id != null) {
      const n = typeof p.service_id === 'number' ? p.service_id : parseInt(String(p.service_id), 10);
      if (!isNaN(n)) return { service_id: n };
      return invalid();
    }
    if (p.category_id != null) {
      const n = typeof p.category_id === 'number' ? p.category_id : parseInt(String(p.category_id), 10);
      if (!isNaN(n)) return { category_id: n };
      return invalid();
    }

    if (Array.isArray(items) && items.length > 1) return invalid();
    if (Array.isArray(serviceIds) && serviceIds.length > 1) return invalid();
    if (Array.isArray(categoryIds) && categoryIds.length > 1) return invalid();

    if (Array.isArray(items) && items.length === 1) {
      const it = items[0];
      if (it && typeof it === 'object' && it.service_id != null) {
        const n = typeof it.service_id === 'number' ? it.service_id : parseInt(String(it.service_id), 10);
        if (!isNaN(n)) return { service_id: n };
      }
      return invalid();
    }
    if (Array.isArray(serviceIds) && serviceIds.length === 1) {
      const s = serviceIds[0];
      const n = typeof s === 'number' ? s : parseInt(String(s), 10);
      if (!isNaN(n)) return { service_id: n };
      return invalid();
    }
    if (Array.isArray(categoryIds) && categoryIds.length === 1) {
      const c = categoryIds[0];
      const n = typeof c === 'number' ? c : parseInt(String(c), 10);
      if (!isNaN(n)) return { category_id: n };
      return invalid();
    }

    return invalid();
  }

  return p;
}

/**
 * Каноническая сериализация для сравнения parameters (web+mobile+backend).
 * Строки/boolean/null — через JSON.stringify; ключи отсортированы.
 */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * Проверяет, совпадает ли скидка с шаблоном (condition_type + normalized parameters).
 * Единая логика для web и mobile. Используется для «Активен» / поиска скидки по шаблону.
 */
export function templateMatchesDiscount(
  template: QuickDiscountTemplate,
  discount: LoyaltyDiscount
): boolean {
  if (!discount.is_active || discount.discount_type !== LoyaltyDiscountType.QUICK) return false;
  if (!template.conditions?.condition_type) return false;
  const tc = template.conditions as { condition_type: string; parameters?: Record<string, any> };
  const dc = discount.conditions;
  let discountCt: string | undefined;
  let discountParams: Record<string, any> = {};
  if (dc && typeof dc === 'object' && !Array.isArray(dc)) {
    discountCt = (dc as any).condition_type;
    discountParams = ((dc as any).parameters ?? {}) as Record<string, any>;
  }
  if (!discountCt || discountCt !== tc.condition_type) return false;
  const templateParams = tc.parameters ?? {};
  const rulePercent = discount.discount_percent ?? null;
  const normT = normalizeParametersForComparison(tc.condition_type, templateParams, null);
  const normD = normalizeParametersForComparison(discountCt, discountParams, rulePercent);
  if (tc.condition_type === 'service_discount' && normT._invalid === true && normD._invalid !== true) {
    return true;
  }
  return stableStringify(normT) === stableStringify(normD);
}

/**
 * Проверяет, активен ли шаблон скидки (уже создана скидка из этого шаблона).
 * Использует templateMatchesDiscount (единая логика с web).
 */
export function isTemplateActive(
  template: QuickDiscountTemplate,
  discounts: LoyaltyDiscount[]
): boolean {
  return discounts.some((d) => templateMatchesDiscount(template, d));
}

/**
 * Находит активную скидку, соответствующую шаблону (для выключения/удаления).
 * Использует templateMatchesDiscount (единая логика с web).
 */
export function findActiveDiscountForTemplate(
  template: QuickDiscountTemplate,
  discounts: LoyaltyDiscount[]
): LoyaltyDiscount | null {
  const found = discounts.find((d) => templateMatchesDiscount(template, d));
  return found ?? null;
}

export const BINARY_QUICK_CONDITION_TYPES = new Set(['first_visit', 'birthday']);

export function getQuickConditionType(discount: LoyaltyDiscount): string | null {
  const c = discount?.conditions as Record<string, unknown> | undefined;
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    return (c.condition_type as string) ?? null;
  }
  return null;
}

export function quickDiscountsByConditionType(
  discounts: LoyaltyDiscount[],
  conditionType: string
): LoyaltyDiscount[] {
  return (discounts || []).filter(
    (d) => d.discount_type === LoyaltyDiscountType.QUICK && getQuickConditionType(d) === conditionType
  );
}

export function isBinaryQuickConditionType(ct: string | null | undefined): boolean {
  return !!ct && BINARY_QUICK_CONDITION_TYPES.has(ct);
}

/**
 * Одна каноническая запись «Новый клиент» для UI при legacy-дубликатах:
 * активная предпочтительнее, иначе максимальный id.
 */
export function canonicalFirstVisitQuickRule(discounts: LoyaltyDiscount[]): LoyaltyDiscount | null {
  const list = quickDiscountsByConditionType(discounts, 'first_visit');
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return [...list].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return b.id - a.id;
  })[0];
}
