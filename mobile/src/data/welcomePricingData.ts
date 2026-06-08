/**
 * Статические тарифы для welcome (mirror backend/scripts/subscription_plans_export.json).
 * priceNMonths = ₽/мес в пакете N месяцев (семантика backend SubscriptionPlan).
 * Обновляйте при изменении тарифов в prod или после нового export.
 */
export type WelcomePricingPlan = {
  id: string;
  name: string;
  displayName: string;
  price1Month: number;
  price3Months: number;
  price6Months: number;
  price12Months: number;
  highlights: string[];
  popular?: boolean;
};

export const WELCOME_PRICING_PLANS: WelcomePricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    displayName: 'Бесплатный',
    price1Month: 0,
    price3Months: 0,
    price6Months: 0,
    price12Months: 0,
    highlights: ['30 активных записей', 'Онлайн-запись', 'Базовая страница мастера'],
  },
  {
    id: 'basic',
    name: 'Basic',
    displayName: 'Базовый',
    price1Month: 500,
    price3Months: 470,
    price6Months: 430,
    price12Months: 400,
    highlights: ['Безлимитные записи', 'Свой домен', 'Расширенная страница'],
  },
  {
    id: 'standart',
    name: 'Standart',
    displayName: 'Стандартный',
    price1Month: 800,
    price3Months: 760,
    price6Months: 720,
    price12Months: 680,
    highlights: ['Статистика', 'Стоп-листы', 'Расширенная аналитика'],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    displayName: 'Профессиональный',
    price1Month: 1000,
    price3Months: 950,
    price6Months: 900,
    price12Months: 850,
    highlights: ['Лояльность', 'Финансы', 'Список клиентов', 'Все функции'],
  },
];

export const WELCOME_PRICING_FOOTNOTE =
  'Цены — помесячная ставка в выбранном пакете. Актуальные тарифы после регистрации в приложении.';
