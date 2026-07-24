/**
 * Типизированные события аналитики DeDato.
 * Экраны используют только AnalyticsEvent — без строковых литералов.
 */
export enum AnalyticsEvent {
  // Auth
  AuthPhoneStarted = 'auth_phone_started',
  AuthPhoneSuccess = 'auth_phone_success',
  AuthYandexStarted = 'auth_yandex_started',
  AuthYandexSuccess = 'auth_yandex_success',
  RegistrationCompleted = 'registration_completed',
  RoleSelected = 'role_selected',
  OnboardingCompleted = 'onboarding_completed',
  Logout = 'logout',

  // Booking
  BookingStarted = 'booking_started',
  BookingCreated = 'booking_created',
  BookingCancelled = 'booking_cancelled',
  BookingCompleted = 'booking_completed',

  // Subscription
  SubscriptionScreenOpened = 'subscription_screen_opened',
  SubscriptionPlanSelected = 'subscription_plan_selected',
  SubscriptionPaymentStarted = 'subscription_payment_started',
  SubscriptionPaymentWebReturned = 'subscription_payment_web_returned',
  SubscriptionPaymentStatusChecked = 'subscription_payment_status_checked',
  SubscriptionPaymentSuccess = 'subscription_payment_success',
  SubscriptionPaymentFailed = 'subscription_payment_failed',
  SubscriptionPaymentExpired = 'subscription_payment_expired',
  PaymentHistoryOpened = 'payment_history_opened',

  // Promo
  PromoCodeApplyStarted = 'promo_code_apply_started',
  PromoCodeApplied = 'promo_code_applied',
  PromoCodeFailed = 'promo_code_failed',

  // Network
  NetworkErrorShown = 'network_error_shown',

  // Test
  AppMetricaIntegrationTest = 'appmetrica_integration_test',
}
