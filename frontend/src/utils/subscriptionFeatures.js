/**
 * Реэкспорт единого модуля из shared/ (см. shared/subscriptionPlanFeatures.js).
 */
export {
  SUBSCRIPTION_FEATURES_CONFIG,
  getPlanFeatures,
  getPlanFeaturesByName,
  getMasterTariffComparisonRows,
  splitTariffComparisonColumns,
  TARIFF_COMPARISON_LEFT_COUNT,
  TARIFF_COMPARISON_RIGHT_COUNT,
} from '../../../shared/subscriptionPlanFeatures.js'
