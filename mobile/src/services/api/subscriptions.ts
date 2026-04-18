import { apiClient } from './client';

// Типы статусов подписки
export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

// Типы подписок
export enum SubscriptionType {
  MASTER = 'master',
  SALON = 'salon',
}

// Интерфейс текущей подписки (соответствует backend SubscriptionOut)
export interface Subscription {
  id: number;
  user_id: number;
  subscription_type: SubscriptionType;
  status: SubscriptionStatus;
  salon_branches: number;
  salon_employees: number;
  master_bookings: number;
  end_date: string; // ISO datetime string
  price: number;
  daily_rate?: number | null;
  reserved_amount?: number | null;
  spent_amount?: number | null;
  days_remaining?: number | null;
  auto_renewal: boolean;
  payment_method: string;
  plan_id: number | null;
  plan_name: string | null;
  plan_display_name?: string | null;
  features?: Record<string, any> | null;
  limits?: Record<string, any> | null;
}

// Интерфейс плана подписки (соответствует backend SubscriptionPlanOut)
export interface SubscriptionPlan {
  id: number;
  name: string;
  display_name?: string | null; // Отображаемое название для пользователей
  subscription_type: SubscriptionType;
  price_1month: number;
  price_3months: number;
  price_6months: number;
  price_12months: number;
  features: Record<string, any> | null;
  limits: Record<string, any> | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// --- Расчет стоимости подписки (snapshot) ---
export interface SubscriptionCalculationRequest {
  plan_id: number;
  duration_months: 1 | 3 | 6 | 12;
  upgrade_type?: 'immediate' | 'after_expiry';
}

export interface SubscriptionCalculationResponse {
  calculation_id: number;
  plan_id: number;
  plan_name: string;
  duration_months: number;
  total_price: number;
  monthly_price: number;
  daily_price: number;
  price_per_month_display: number;
  reserved_balance: number;
  final_price: number;
  savings_percent?: number | null;
  start_date?: string | null; // ISO datetime
  end_date?: string | null; // ISO datetime
  upgrade_type: string;
  current_plan_display_order?: number | null;
  new_plan_display_order: number;
  requires_immediate_payment: boolean;

  // breakdown / rules
  current_plan_credit?: number | null;
  current_plan_accrued?: number | null;
  current_plan_reserved_remaining?: number | null;
  current_plan_price?: number | null;
  current_plan_daily_rate?: number | null;
  new_plan_cost?: number | null;
  payable?: number | null;
  credit_source?: string | null;
  breakdown_text?: string | null;
  is_downgrade?: boolean | null;
  forced_upgrade_type?: string | null;
}

/**
 * Получить текущую активную подписку пользователя.
 * GET /api/subscriptions/my — read-only, не создаёт подписку.
 * При отсутствии подписки возвращает 404 → null.
 */
export async function fetchCurrentSubscription(): Promise<Subscription | null> {
  try {
    const response = await apiClient.get<Subscription>('/api/subscriptions/my');
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 404 && (detail === 'no_subscription' || String(detail).includes('no_subscription'))) {
      return null;
    }
    throw err;
  }
}

/**
 * Получить список доступных планов подписки
 * @param subscriptionType - тип подписки ('master' или 'salon')
 */
export async function fetchAvailableSubscriptions(
  subscriptionType: SubscriptionType
): Promise<SubscriptionPlan[]> {
  const response = await apiClient.get<SubscriptionPlan[]>(
    `/api/subscription-plans/available?subscription_type=${subscriptionType}`
  );
  return response.data;
}

/**
 * Рассчитать стоимость подписки (создает snapshot на backend)
 */
export async function calculateSubscription(
  payload: SubscriptionCalculationRequest
): Promise<SubscriptionCalculationResponse> {
  const response = await apiClient.post<SubscriptionCalculationResponse>('/api/subscriptions/calculate', payload);
  return response.data;
}

/**
 * Применить immediate upgrade без оплаты (final_price<=0) по snapshot_id (TTL как у snapshot)
 */
export async function applyUpgradeFree(calculation_id: number): Promise<{ success: boolean; subscription_id?: number; already_applied?: boolean }> {
  const response = await apiClient.post<{ success: boolean; subscription_id?: number; already_applied?: boolean }>(
    '/api/subscriptions/apply-upgrade-free',
    { calculation_id }
  );
  return response.data;
}

/**
 * Удалить snapshot расчета (при закрытии модалки/сбросе расчета)
 */
export async function deleteSubscriptionCalculationSnapshot(calculationId: number): Promise<{ success: boolean }> {
  const response = await apiClient.delete<{ success: boolean }>(`/api/subscriptions/calculate/${calculationId}`);
  return response.data;
}

/**
 * Получить человекочитаемое название статуса
 */
export function getStatusLabel(status: SubscriptionStatus): string {
  const statusLabels: Record<SubscriptionStatus, string> = {
    [SubscriptionStatus.ACTIVE]: 'Активна',
    [SubscriptionStatus.EXPIRED]: 'Истекла',
    [SubscriptionStatus.CANCELLED]: 'Отменена',
    [SubscriptionStatus.PENDING]: 'Ожидает активации',
  };
  
  return statusLabels[status] || status;
}

/**
 * Получить цвет статуса для UI
 */
export function getStatusColor(status: SubscriptionStatus): string {
  const statusColors: Record<SubscriptionStatus, string> = {
    [SubscriptionStatus.ACTIVE]: '#4CAF50', // Зелёный
    [SubscriptionStatus.EXPIRED]: '#F44336', // Красный
    [SubscriptionStatus.CANCELLED]: '#9E9E9E', // Серый
    [SubscriptionStatus.PENDING]: '#FF9800', // Оранжевый
  };
  
  return statusColors[status] || '#757575';
}

/**
 * Проверить, истекает ли подписка в ближайшее время
 */
export function isExpiringSoon(endDate: string, daysThreshold: number = 7): boolean {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  return diffDays > 0 && diffDays <= daysThreshold;
}

/**
 * Получить количество оставшихся дней до окончания подписки
 */
export function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

