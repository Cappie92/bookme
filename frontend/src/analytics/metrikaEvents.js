/**
 * Имена reachGoal: зона_действие_уточнение (snake_case, единообразно)
 */
export const M = {
  // landing
  LANDING_HERO_REGISTER: 'landing_hero_register',
  LANDING_HERO_DEMO: 'landing_hero_demo',
  LANDING_FINAL_CTA_REGISTER: 'landing_final_cta_register',

  // pricing
  PRICING_CTA_REGISTER: 'pricing_cta_register',
  PRICING_PERIOD_CHANGE: 'pricing_period_change',

  // about
  ABOUT_HERO_REGISTER: 'about_hero_register',
  ABOUT_CTA_PRICING: 'about_cta_pricing',
  ABOUT_FINAL_CTA_REGISTER: 'about_final_cta_register',

  // public_booking
  PUBLIC_BOOKING_PAGE_VIEW: 'public_booking_page_view',
  /** Показан промпт «войти/зарегистрироваться» до отправки (wizard) */
  PUBLIC_BOOKING_WIZARD_NEED_AUTH: 'public_booking_wizard_need_auth',
  /** Выбор в модалке подтверждения: login | register */
  PUBLIC_BOOKING_AUTH_CHOICE: 'public_booking_auth_choice',
  /** Нет клиента в сессии — открыт экран/модалка ввода телефона (MasterBookingModule + slug) */
  PUBLIC_BOOKING_AUTH_REQUIRED: 'public_booking_auth_required',
  /** Старт отправки формы (логин есть, идёт POST) */
  PUBLIC_BOOKING_FORM_SUBMIT: 'public_booking_form_submit',
  PUBLIC_BOOKING_SUCCESS: 'public_booking_success',

  // payment (subscription return URL)
  PAYMENT_SUBSCRIPTION_SUCCESS: 'payment_subscription_success',

  // auth
  AUTH_MODAL_OPEN: 'auth_modal_open',
  AUTH_LOGIN_SUCCESS: 'auth_login_success',
  AUTH_REGISTER_SUCCESS: 'auth_register_success',
}
