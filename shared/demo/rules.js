/**
 * Демо-данные для раздела «Правила / ограничения клиентов».
 * Единый источник для web и mobile. Не создаёт записей в БД.
 */

export const rulesRestrictionsDemo = {
  blacklist: [
    { id: 1, client_phone: '+7 900 ***-**-12', reason: 'Не пришёл на запись', restriction_type: 'blacklist', created_at: '2025-01-15' },
    { id: 2, client_phone: '+7 900 ***-**-34', reason: 'Двойная отмена', restriction_type: 'blacklist', created_at: '2025-01-10' },
  ],
  advance_payment_only: [
    { id: 3, client_phone: '+7 900 ***-**-56', reason: 'Предоплата обязательна', restriction_type: 'advance_payment_only', created_at: '2025-01-20' },
  ],
  total_restrictions: 3,
};

export const rulesAutoRulesDemo = [
  { id: 1, cancellation_reason: 'client_no_show', cancel_count: 2, period_days: 30, restriction_type: 'blacklist' },
  { id: 2, cancellation_reason: 'client_requested', cancel_count: 3, period_days: 60, restriction_type: 'advance_payment_only' },
];
