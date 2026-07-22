/**
 * Публичная проверка статуса оплаты.
 *
 * Канон успешной покупки подписки (backend):
 *   status === 'paid' AND subscription_apply_status === 'applied'
 *
 * null/'' НЕ считаем успехом: колонка NOT NULL default 'pending';
 * web paymentPublicStatus.js допускает null/'' только как UX-legacy на return page,
 * history/billing требуют строго 'applied'.
 */

export type PaymentPublicStatusData = {
  status: string;
  subscription_apply_status?: string | null;
  payment_source?: 'web' | 'mobile_app' | string;
};

export type PaymentPublicStatusResult =
  | { kind: 'ok'; data: PaymentPublicStatusData }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'loading' };

export type PaymentVerifyState =
  | 'loading'
  | 'success'
  | 'activating'
  | 'pending'
  | 'failed'
  | 'expired'
  | 'error'
  | 'not_found';

export function resolvePaymentVerifyState(result: PaymentPublicStatusResult): PaymentVerifyState {
  if (!result || result.kind === 'loading') return 'loading';
  if (result.kind === 'not_found') return 'not_found';
  if (result.kind === 'error') return 'error';

  const payment = result.data;
  if (!payment) return 'error';

  const { status, subscription_apply_status: applyStatus } = payment;

  if (status === 'paid') {
    if (applyStatus === 'applied') {
      return 'success';
    }
    if (applyStatus === 'pending' || applyStatus == null || applyStatus === '') {
      // null/'' — не доказательство apply (см. модель NOT NULL + default pending).
      // Пока apply не 'applied' — ждём / activating.
      return 'activating';
    }
    return 'error';
  }

  if (status === 'pending') return 'pending';

  if (status === 'expired') return 'expired';

  if (status === 'failed' || status === 'cancelled') return 'failed';

  return 'error';
}

export function isPaymentFullyConfirmed(state: PaymentVerifyState): boolean {
  return state === 'success';
}
