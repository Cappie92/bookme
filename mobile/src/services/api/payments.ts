import { apiClient } from './client';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';

export type { SubscriptionPaymentHistoryItem };

export interface PaymentInitRequest {
  plan_id?: number;
  duration_months?: number;
  payment_period?: string;
  upgrade_type?: string;
  calculation_id?: number | null;
  enable_auto_renewal?: boolean;
  payment_source?: 'web' | 'mobile_app';
  amount?: number; // Для пополнения баланса
}

export interface PaymentInitResponse {
  requires_payment?: boolean;
  message?: string | null;
  payment?: string;
  payment_url?: string | null;
  invoice_id?: string | null;
  balance_portion?: number | null;
  card_portion?: number | null;
  points_portion?: number | null;
  paid_from_balance?: number | null;
  subscription_id?: number | null;
  already_applied?: boolean | null;
}

export interface PaymentStatusResponse {
  public_id: string;
  status: string;
  amount: number;
  subscription_apply_status?: string | null;
  paid_at: string | null;
}

/**
 * Инициализация платежа за подписку
 */
export async function initSubscriptionPayment(
  data: PaymentInitRequest
): Promise<PaymentInitResponse> {
  const response = await apiClient.post<PaymentInitResponse>(
    '/api/payments/subscription/init',
    data
  );
  return response.data;
}

/**
 * Инициализация платежа для пополнения баланса
 */
export async function initDepositPayment(
  amount: number
): Promise<PaymentInitResponse> {
  const response = await apiClient.post<PaymentInitResponse>('/api/payments/deposit/init', {
    amount,
  });
  return response.data;
}

/**
 * Получить статус платежа по публичному идентификатору (auth).
 */
export async function getPaymentStatus(paymentPublicId: string): Promise<PaymentStatusResponse> {
  const response = await apiClient.get<PaymentStatusResponse[]>(
    '/api/payments/status',
    { params: { payment: paymentPublicId } }
  );
  const row = response.data[0];
  if (!row) {
    throw new Error('Payment not found');
  }
  return row;
}

export type PaymentPublicStatusResponse = {
  status: string;
  subscription_apply_status?: string | null;
  payment_source?: 'web' | 'mobile_app' | string;
};

/**
 * Публичная проверка статуса оплаты (без auth) — канон подтверждения success.
 */
export async function getPaymentPublicStatus(lookup: {
  paymentPublicId?: string | null;
  invoiceId?: string | null;
}): Promise<
  | { kind: 'ok'; data: PaymentPublicStatusResponse }
  | { kind: 'not_found' }
  | { kind: 'error' }
> {
  const paymentPublicId = (lookup.paymentPublicId || '').trim();
  const invoiceId = (lookup.invoiceId || '').trim();
  if (!paymentPublicId && !invoiceId) {
    return { kind: 'not_found' };
  }
  try {
    const response = await apiClient.get<PaymentPublicStatusResponse>(
      '/api/payments/public-status',
      {
        params: paymentPublicId
          ? { payment: paymentPublicId }
          : { invoice_id: invoiceId },
        // public endpoint — не требовать auth header
        headers: {},
      }
    );
    return { kind: 'ok', data: response.data };
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 404) return { kind: 'not_found' };
    return { kind: 'error' };
  }
}

/**
 * История оплат подписки текущего пользователя.
 * Не кэшируется — вызывающий код обновляет при открытии экрана и после оплаты.
 */
export async function getSubscriptionPaymentHistory(): Promise<SubscriptionPaymentHistoryItem[]> {
  const response = await apiClient.get<SubscriptionPaymentHistoryItem[]>(
    '/api/payments/subscription/history'
  );
  return Array.isArray(response.data) ? response.data : [];
}
