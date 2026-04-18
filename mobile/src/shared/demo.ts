/**
 * Демо-данные для платных разделов (Клиенты, Финансы, Лояльность, Правила, Статистика).
 * Локальная копия для mobile (Metro не резолвит shared/* вне проекта).
 * Используется только в режиме Demo (нет доступа к фиче).
 */

export const clientsDemo = [
  { client_key: 'phone:+79001234567', master_client_name: 'Анна С.', client_phone: '+7 900 123-45-67', completed_count: 12, total_revenue: 24500, last_visit_at: '2025-01-28', has_note: true },
  { client_key: 'phone:+79009876543', master_client_name: 'Мария К.', client_phone: '+7 900 987-65-43', completed_count: 8, total_revenue: 16800, last_visit_at: '2025-01-25', has_note: false },
  { client_key: 'phone:+79005551234', master_client_name: null, client_phone: '+7 900 555-12-34', completed_count: 5, total_revenue: 9200, last_visit_at: '2025-01-22', has_note: false },
  { client_key: 'phone:+79003334455', master_client_name: 'Елена В.', client_phone: '+7 900 333-44-55', completed_count: 15, total_revenue: 31200, last_visit_at: '2025-01-27', has_note: true },
  { client_key: 'phone:+79007778899', master_client_name: 'Ольга М.', client_phone: '+7 900 777-88-99', completed_count: 3, total_revenue: 5400, last_visit_at: '2025-01-20', has_note: false },
  { client_key: 'phone:+79001112233', master_client_name: 'Ирина П.', client_phone: '+7 900 111-22-33', completed_count: 7, total_revenue: 14200, last_visit_at: '2025-01-26', has_note: false },
  { client_key: 'phone:+79006667777', master_client_name: 'Светлана Л.', client_phone: '+7 900 666-77-77', completed_count: 9, total_revenue: 18900, last_visit_at: '2025-01-24', has_note: true },
  { client_key: 'phone:+79002223344', master_client_name: null, client_phone: '+7 900 222-33-44', completed_count: 4, total_revenue: 7600, last_visit_at: '2025-01-19', has_note: false },
  { client_key: 'phone:+79004445566', master_client_name: 'Татьяна Н.', client_phone: '+7 900 444-55-66', completed_count: 11, total_revenue: 22800, last_visit_at: '2025-01-29', has_note: false },
  { client_key: 'phone:+79008889900', master_client_name: 'Наталья Р.', client_phone: '+7 900 888-99-00', completed_count: 6, total_revenue: 11500, last_visit_at: '2025-01-23', has_note: true },
  { client_key: 'phone:+79001234098', master_client_name: 'Виктория С.', client_phone: '+7 900 123-40-98', completed_count: 2, total_revenue: 3800, last_visit_at: '2025-01-18', has_note: false },
  { client_key: 'phone:+79005678901', master_client_name: 'Юлия Д.', client_phone: '+7 900 567-89-01', completed_count: 10, total_revenue: 19500, last_visit_at: '2025-01-30', has_note: false },
  { client_key: 'phone:+79007890123', master_client_name: null, client_phone: '+7 900 789-01-23', completed_count: 1, total_revenue: 2100, last_visit_at: '2025-01-15', has_note: false },
];

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

export const statsDemo = {
  current_week_bookings: 18,
  previous_week_bookings: 15,
  current_week_income: 42100,
  previous_week_income: 35800,
  weeks_data: [
    { period_label: '28 янв', bookings: 4, income: 9200, bookings_change: 33, income_change: 25, is_current: false, is_past: true, is_future: false },
    { period_label: '4 фев', bookings: 5, income: 11200, bookings_change: 25, income_change: 22, is_current: false, is_past: true, is_future: false },
    { period_label: '11 фев', bookings: 6, income: 13400, bookings_change: 20, income_change: 20, is_current: false, is_past: true, is_future: false },
    { period_label: '18 фев', bookings: 4, income: 9800, bookings_change: -33, income_change: -27, is_current: true, is_past: false, is_future: false },
    { period_label: '25 фев', bookings: 0, income: 0, bookings_change: 0, income_change: 0, is_current: false, is_past: false, is_future: true },
  ],
  top_services_by_bookings: [
    { service_id: 1, service_name: 'Стрижка', booking_count: 45, total_earnings: 67500 },
    { service_id: 2, service_name: 'Окрашивание', booking_count: 28, total_earnings: 84000 },
    { service_id: 3, service_name: 'Маникюр', booking_count: 35, total_earnings: 35000 },
  ],
  top_services_by_earnings: [
    { service_id: 2, service_name: 'Окрашивание', booking_count: 28, total_earnings: 84000 },
    { service_id: 1, service_name: 'Стрижка', booking_count: 45, total_earnings: 67500 },
    { service_id: 3, service_name: 'Маникюр', booking_count: 35, total_earnings: 35000 },
  ],
};
