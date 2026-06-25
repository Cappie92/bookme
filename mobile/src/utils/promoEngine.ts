import type { PromoPreview } from '@src/services/api/subscriptions';
import type { SubscriptionPointsLedgerItem } from '@src/services/api/promoEngine';

export const PROMO_FIRST_PAYMENT_ONLY_MESSAGE =
  'Бонус по промокоду доступен только до первой оплаты подписки.';
export const PROMO_ALREADY_APPLIED_INLINE_MESSAGE =
  'Промокод уже применён. Второй промокод применить нельзя.';
export const PROMO_ALREADY_APPLIED_FALLBACK_MESSAGE =
  'Промокод уже применён для этого мастера.';

const PROMO_ERROR_FALLBACK = 'Не удалось применить промокод. Попробуйте ещё раз.';

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  if (typeof value === 'number') return value === 1;
  return false;
}

function pickDetail(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;

  const maybeAxios = input as {
    response?: {
      data?: {
        detail?: unknown;
        message?: unknown;
      };
    };
    detail?: unknown;
    message?: unknown;
  };

  return (
    maybeAxios.response?.data?.detail ??
    maybeAxios.response?.data?.message ??
    maybeAxios.detail ??
    maybeAxios.message ??
    input
  );
}

function detailCode(detail: unknown): string | null {
  if (detail && typeof detail === 'object' && 'code' in detail) {
    const code = (detail as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return typeof detail === 'string' ? detail : null;
}

export function getPromoErrorCode(errorOrDetail: unknown): string | null {
  return detailCode(pickDetail(errorOrDetail));
}

export function isPromoAlreadyAppliedError(errorOrDetail: unknown): boolean {
  const detail = pickDetail(errorOrDetail);
  const code = detailCode(detail);
  const message = detailMessage(detail) || '';
  return (
    code === 'acquisition_promo_already_used' ||
    /промокод\s+уже\s+примен[её]н/i.test(message) ||
    /promo.*already.*used/i.test(message)
  );
}

export function getPromoAlreadyAppliedInlineMessage(currentCode?: string | null): string {
  return currentCode ? PROMO_ALREADY_APPLIED_INLINE_MESSAGE : PROMO_ALREADY_APPLIED_FALLBACK_MESSAGE;
}

export function getCurrentPromoCodeValue(currentPromo: unknown): string | null {
  if (!currentPromo || typeof currentPromo !== 'object') return null;
  const data = currentPromo as {
    code?: unknown;
    promo_code?: unknown;
    current_promo?: unknown;
    promo?: unknown;
  };

  const directCode = data.code ?? data.promo_code;
  if (typeof directCode === 'string' && directCode.trim()) return directCode.trim();
  if (directCode && typeof directCode === 'object') return getCurrentPromoCodeValue(directCode);

  return getCurrentPromoCodeValue(data.current_promo) ?? getCurrentPromoCodeValue(data.promo);
}

export function getCurrentPromoStatusValue(currentPromo: unknown): string | null {
  if (!currentPromo || typeof currentPromo !== 'object') return null;
  const data = currentPromo as {
    status?: unknown;
    promo_code?: unknown;
    current_promo?: unknown;
    promo?: unknown;
  };

  if (typeof data.status === 'string' && data.status.trim()) return data.status.trim();
  return (
    getCurrentPromoStatusValue(data.promo_code) ??
    getCurrentPromoStatusValue(data.current_promo) ??
    getCurrentPromoStatusValue(data.promo)
  );
}

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const message = (detail as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

export function getPromoErrorMessage(errorOrDetail: unknown): string {
  const detail = pickDetail(errorOrDetail);
  const code = detailCode(detail);

  if (code === 'first_payment_already_done') return PROMO_FIRST_PAYMENT_ONLY_MESSAGE;
  if (code === 'acquisition_promo_already_used') return 'Промокод уже применён.';
  if (code === 'self_referral') return 'Нельзя применить собственный промокод.';
  if (code === 'not_eligible' || code === 'promo_not_eligible') {
    return 'Этот промокод недоступен для выбранных условий.';
  }
  if (code === 'invalid_code' || code === 'code_not_found') {
    return 'Промокод не найден. Проверьте код и попробуйте ещё раз.';
  }
  if (code === 'minimum_period_3_months') return 'Бонус доступен при оплате от 3 месяцев.';

  return detailMessage(detail) || PROMO_ERROR_FALLBACK;
}

export function getPromoPreviewMessage(preview?: PromoPreview | null): string | null {
  if (!preview) return null;

  const points = Number(preview.points_amount);
  if (Number.isFinite(points) && points > 0) {
    if (isTruthyFlag(preview.eligible) || preview.eligible == null) {
      return `По промокоду: +${formatInteger(points)} бонусных баллов после оплаты`;
    }
  }

  if (isTruthyFlag(preview.eligible)) {
    if (preview.label) return preview.label;
  }

  const reason = preview.ineligible_reason || preview.reason;
  if (
    reason === 'minimum_period_3_months' ||
    reason === 'min_period_3_months' ||
    reason === 'period_too_short'
  ) {
    return 'Бонус доступен при оплате от 3 месяцев.';
  }
  if (
    reason === 'first_payment_already_done' ||
    reason === 'already_paid_subscription' ||
    reason === 'acquisition_promo_already_used' ||
    reason === 'not_first_payment'
  ) {
    return PROMO_FIRST_PAYMENT_ONLY_MESSAGE;
  }

  if (preview.eligible === false && preview.label) return preview.label;

  return 'Промокод не применим к выбранному тарифу.';
}

export type PromoPreviewDisplay = {
  message: string;
  tone: 'positive' | 'neutral';
  helper: string;
};

export function getPromoPreviewDisplay(preview?: PromoPreview | null): PromoPreviewDisplay | null {
  const message = getPromoPreviewMessage(preview);
  if (!preview || !message) return null;
  const points = Number(preview.points_amount);
  const isPositive =
    isTruthyFlag(preview.eligible) ||
    (preview.eligible == null && Number.isFinite(points) && points > 0);

  return {
    message,
    tone: isPositive ? 'positive' : 'neutral',
    helper: 'Цена сейчас не уменьшается. Баллы можно будет использовать для оплаты подписки позже.',
  };
}

export function formatSubscriptionPointsAmount(value: number | string | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return formatInteger(amount);
}

export function getSubscriptionPointsHistoryTitle(item: SubscriptionPointsLedgerItem): string {
  const source = String(item.source || item.direction || '').toLowerCase();
  if (source.includes('referrer')) return 'Бонус за приглашённого мастера';
  if (source.includes('beneficiary')) return 'Бонус по применённому промокоду';
  if (item.description) return String(item.description);
  return 'Начисление бонусных баллов';
}

export function getCurrentPromoStatusLabel(status?: string | null): string | null {
  const normalized = String(status || '').trim().toLowerCase();
  if (
    normalized === 'pending' ||
    normalized === 'created' ||
    normalized === 'awaiting_payment' ||
    normalized === 'pending_first_payment'
  ) {
    return 'Ожидает первой оплаты';
  }
  if (
    normalized === 'applied' ||
    normalized === 'active' ||
    normalized === 'completed' ||
    normalized === 'rewarded' ||
    normalized === 'redeemed'
  ) {
    return 'Применён';
  }
  return null;
}
