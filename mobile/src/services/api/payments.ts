import { apiClient } from './client';

export interface PaymentInitRequest {
  plan_id?: number;
  duration_months?: number;
  payment_period?: string;
  upgrade_type?: string;
  calculation_id?: number | null;
  enable_auto_renewal?: boolean;
  amount?: number; // Для пополнения баланса
}

export interface PaymentInitResponse {
  requires_payment?: boolean;
  message?: string | null;
  payment_id?: number;
  payment_url?: string | null;
  invoice_id?: string | null;
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
 * Получить статус платежа
 */
export async function getPaymentStatus(paymentId: number): Promise<{
  id: number;
  status: string;
  amount: number;
  paid_at: string | null;
}> {
  const response = await apiClient.get(`/api/payments/${paymentId}/status`);
  return response.data;
}

