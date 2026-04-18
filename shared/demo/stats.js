/**
 * Демо-данные для раздела «Статистика».
 * Единый источник для web и mobile. Не создаёт записей в БД.
 */

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
