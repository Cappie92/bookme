import { apiClient } from './client';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';

export type { SubscriptionPaymentHistoryItem };

export type AppleTransactionSource =
  | 'purchase'
  | 'restore'
  | 'current_entitlement'
  | 'transaction_update';

export interface AppleBillingIdentityResponse {
  app_account_token: string;
}

export interface ApplePurchaseEligibilityResponse {
  allowed: boolean;
  reason?: string;
  blocking_end_date?: string | null;
  blocking_subscription_id?: number;
  blocking_billing_provider?: string;
}

export interface AppleTransactionVerifyRequest {
  signed_transaction: string;
  source: AppleTransactionSource;
}

export interface AppleTransactionVerifyResponse {
  verified: boolean;
  recorded: boolean;
  finish_transaction: boolean;
  source: AppleTransactionSource;
  active?: boolean;
  reason?: string;
  conflict?: boolean;
  subscription_id?: number;
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
}

export interface AppleSubscriptionRefreshResponse {
  verified: boolean;
  recorded: boolean;
  refreshed: number;
  subscriptions: unknown[];
}

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

/**
 * Stable Apple appAccountToken for the current authenticated master.
 */
export async function fetchAppleBillingIdentity(): Promise<AppleBillingIdentityResponse> {
  const response = await apiClient.get<AppleBillingIdentityResponse>(
    '/api/payments/apple/billing-identity'
  );
  return response.data;
}

/**
 * Whether App Store purchase may proceed (no overlapping non-Apple subscription).
 */
export async function fetchApplePurchaseEligibility(): Promise<ApplePurchaseEligibilityResponse> {
  const response = await apiClient.get<ApplePurchaseEligibilityResponse>(
    '/api/payments/apple/purchase-eligibility'
  );
  return response.data;
}

/**
 * Verify a StoreKit 2 signed transaction with the authoritative backend.
 */
export async function verifyAppleTransaction(
  request: AppleTransactionVerifyRequest
): Promise<AppleTransactionVerifyResponse> {
  const response = await apiClient.post<AppleTransactionVerifyResponse>(
    '/api/payments/apple/transactions/verify',
    request
  );
  return response.data;
}

/** Refresh authoritative subscription lifecycle from App Store Server API. */
export async function refreshAppleSubscriptions(): Promise<AppleSubscriptionRefreshResponse> {
  const response = await apiClient.post<AppleSubscriptionRefreshResponse>(
    '/api/payments/apple/subscriptions/refresh'
  );
  return response.data;
}
