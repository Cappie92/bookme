/**
 * Демо-данные для раздела «Лояльность».
 * Единый источник для web и mobile. Не создаёт записей в БД.
 */

export const loyaltyQuickDiscountsDemo = [
  { id: 1, name: 'Скидка 10%', discount_percent: 10, conditions: { condition_type: 'visit_count', min_visits: 3 } },
  { id: 2, name: 'Скидка 15%', discount_percent: 15, conditions: { condition_type: 'visit_count', min_visits: 5 } },
  { id: 3, name: 'Скидка 20%', discount_percent: 20, conditions: { condition_type: 'visit_count', min_visits: 10 } },
];

export const loyaltyStatsDemo = {
  total_earned: 1250,
  total_spent: 380,
  active_clients_count: 42,
};

export const loyaltyHistoryDemo = [
  { id: 1, client_phone: '+7 900 ***-**-67', points: 50, transaction_type: 'earned', created_at: '2025-01-30', description: 'За визит' },
  { id: 2, client_phone: '+7 900 ***-**-43', points: -100, transaction_type: 'spent', created_at: '2025-01-29', description: 'Скидка 10%' },
  { id: 3, client_phone: '+7 900 ***-**-55', points: 50, transaction_type: 'earned', created_at: '2025-01-28', description: 'За визит' },
  { id: 4, client_phone: '+7 900 ***-**-99', points: 50, transaction_type: 'earned', created_at: '2025-01-27', description: 'За визит' },
  { id: 5, client_phone: '+7 900 ***-**-33', points: -50, transaction_type: 'spent', created_at: '2025-01-26', description: 'Скидка 5%' },
];
