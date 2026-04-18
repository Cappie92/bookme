/**
 * Типы для системы лояльности (скидки)
 * Источник истины: backend/schemas.py
 */

export enum LoyaltyDiscountType {
  QUICK = 'quick',
  COMPLEX = 'complex',
  PERSONAL = 'personal',
}

export enum LoyaltyConditionType {
  // Быстрые скидки
  FIRST_VISIT = 'first_visit',
  REGULAR_VISITS = 'regular_visits',
  RETURNING_CLIENT = 'returning_client',
  BIRTHDAY = 'birthday',
  HAPPY_HOURS = 'happy_hours',
  SERVICE_DISCOUNT = 'service_discount',
  
  // Сложные скидки
  VISIT_COUNT = 'visit_count',
  SPENT_AMOUNT = 'spent_amount',
  DAYS_SINCE_LAST_VISIT = 'days_since_last_visit',
  BIRTHDAY_RANGE = 'birthday_range',
  TIME_SLOT = 'time_slot',
  DAY_OF_WEEK = 'day_of_week',
  SEASON = 'season',
  ADVANCE_BOOKING = 'advance_booking',
  SERVICE_CATEGORY = 'service_category',
  SPECIFIC_SERVICE = 'specific_service',
  MULTIPLE_SERVICES = 'multiple_services',
  REFERRAL_COUNT = 'referral_count',
  PROMO_CODE = 'promo_code',
  SOCIAL_ACTIVITY = 'social_activity',
  ONLINE_PAYMENT = 'online_payment',
  PACKAGE_PURCHASE = 'package_purchase',
  CHECK_AMOUNT = 'check_amount',
  REPEAT_SERVICE = 'repeat_service',
}

/**
 * Быстрая/сложная скидка
 */
export interface LoyaltyDiscount {
  id: number;
  master_id: number;
  salon_id?: number | null; // Legacy
  discount_type: LoyaltyDiscountType;
  name: string;
  description?: string | null;
  discount_percent: number; // 0-100
  max_discount_amount?: number | null;
  conditions: Record<string, any>; // dict (JSON в БД)
  is_active: boolean;
  priority: number; // 1-10
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

/**
 * Персональная скидка
 */
export interface PersonalDiscount {
  id: number;
  master_id: number;
  salon_id?: number | null; // Legacy
  client_phone: string;
  discount_percent: number; // 0-100
  max_discount_amount?: number | null;
  description?: string | null;
  is_active: boolean;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

/**
 * Статус системы лояльности
 */
export interface LoyaltySystemStatus {
  quick_discounts: LoyaltyDiscount[];
  complex_discounts: LoyaltyDiscount[];
  personal_discounts: PersonalDiscount[];
  total_discounts: number;
  active_discounts: number;
}

/**
 * Шаблон быстрой скидки
 */
export interface QuickDiscountTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditions: {
    condition_type: string;
    parameters: Record<string, any>;
  };
  default_discount: number;
}

/**
 * Создание быстрой/сложной скидки
 */
export interface LoyaltyDiscountCreate {
  discount_type: LoyaltyDiscountType;
  name: string;
  description?: string | null;
  discount_percent: number; // 0-100
  max_discount_amount?: number | null;
  conditions: Record<string, any>; // dict (для quick) или массив (для complex, как в WEB)
  is_active?: boolean;
  priority?: number; // 1-10
}

/**
 * Обновление быстрой/сложной скидки
 */
export interface LoyaltyDiscountUpdate {
  discount_type?: LoyaltyDiscountType;
  name?: string;
  description?: string | null;
  discount_percent?: number; // 0-100
  max_discount_amount?: number | null;
  conditions?: Record<string, any>;
  is_active?: boolean;
  priority?: number; // 1-10
}

/**
 * Создание персональной скидки
 */
export interface PersonalDiscountCreate {
  client_phone: string;
  discount_percent: number; // 0-100
  max_discount_amount?: number | null;
  description?: string | null;
  is_active?: boolean;
}

/**
 * Обновление персональной скидки
 */
export interface PersonalDiscountUpdate {
  client_phone?: string;
  discount_percent?: number; // 0-100
  max_discount_amount?: number | null;
  description?: string | null;
  is_active?: boolean;
}

/**
 * Форма для создания сложной скидки (UI)
 */
export interface ComplexDiscountForm {
  name: string;
  description: string;
  discount_percent: string; // string для input
  conditions: Array<{
    type: string;
    operator: string;
    value: string;
    description: string;
  }>;
}

/**
 * Форма для создания персональной скидки (UI)
 */
export interface PersonalDiscountForm {
  client_phone: string;
  discount_percent: string; // string для input
  max_discount_amount: string; // string для input
  description: string;
}
