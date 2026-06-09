/**
 * Fallback-only тарифы для welcome (offline / ошибка API).
 * Source of truth: GET /api/subscription-plans/pricing-catalog?subscription_type=master
 */
export type WelcomePlanFeatureRow = {
  text: string;
  available: boolean;
};

export type WelcomePricingPlan = {
  id: string;
  name: string;
  displayName: string;
  price1Month: number;
  price3Months: number;
  price6Months: number;
  price12Months: number;
  featuresIncluded: string[];
  /** Полное сравнение функций из API (online). */
  featureRows?: WelcomePlanFeatureRow[];
  popular?: boolean;
  apiPlanId?: number;
};

export const WELCOME_PRICING_FALLBACK_PLANS: WelcomePricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    displayName: 'Бесплатный',
    price1Month: 0,
    price3Months: 0,
    price6Months: 0,
    price12Months: 0,
    featuresIncluded: [
      '30 активных записей',
      'Онлайн-запись',
      'Базовая публичная страница',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    displayName: 'Базовый',
    price1Month: 500,
    price3Months: 460,
    price6Months: 440,
    price12Months: 380,
    featuresIncluded: [
      'Безлимитные записи',
      'Персональный домен',
      'Список клиентов',
      'Расширенная публичная страница',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    displayName: 'Стандартный',
    price1Month: 760,
    price3Months: 700,
    price6Months: 670,
    price12Months: 580,
    featuresIncluded: [
      'Безлимитные записи',
      'Статистика',
      'Стоп-листы и предоплата',
      'Персональный домен',
      'Список клиентов',
    ],
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    displayName: 'Премиум',
    price1Month: 1160,
    price3Months: 1070,
    price6Months: 1020,
    price12Months: 900,
    featuresIncluded: [
      'Все функции Стандартного',
      'Лояльность',
      'Финансы',
      'Расширенная статистика',
      'Максимум модулей страницы',
    ],
  },
];

export const WELCOME_PRICING_FOOTNOTE =
  'Цены — помесячная ставка в выбранном пакете. Актуальные тарифы после регистрации в приложении.';

export const WELCOME_PRICING_FALLBACK_NOTICE =
  'Показаны базовые тарифы. Актуальные цены обновятся при подключении.';

export const DEFAULT_WELCOME_SELECTED_PLAN_ID = 'pro';

/** @deprecated используйте findWelcomePricingPlan(plans, id) */
export function getWelcomePricingPlanById(
  planId: string,
  plans: WelcomePricingPlan[] = WELCOME_PRICING_FALLBACK_PLANS
): WelcomePricingPlan | undefined {
  return plans.find((p) => p.id === planId);
}
