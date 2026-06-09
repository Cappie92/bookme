import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomePricingPlan } from '@src/data/welcomePricingData';
import {
  formatWelcomePlanDiscountSuffix,
  formatWelcomePlanPricePerMonth,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';

const FEATURES_TWO_COLUMN_MIN_WIDTH = 340;

function splitFeaturesIntoColumns(features: string[], columnCount: number): string[][] {
  if (columnCount <= 1 || features.length === 0) return [features];
  const columnSize = Math.ceil(features.length / columnCount);
  return Array.from({ length: columnCount }, (_, index) =>
    features.slice(index * columnSize, (index + 1) * columnSize)
  ).filter((column) => column.length > 0);
}

type WelcomePricingGridProps = {
  plans: WelcomePricingPlan[];
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  periodMonths: WelcomePeriodMonths;
  loading?: boolean;
  testIDPrefix?: string;
};

function chunkPlans(plans: WelcomePricingPlan[], size: number): WelcomePricingPlan[][] {
  const rows: WelcomePricingPlan[][] = [];
  for (let i = 0; i < plans.length; i += size) {
    rows.push(plans.slice(i, i + size));
  }
  return rows;
}

export function WelcomePricingGrid({
  plans,
  selectedPlanId,
  onSelectPlan,
  periodMonths,
  loading = false,
  testIDPrefix = 'welcome-pricing-plan',
}: WelcomePricingGridProps) {
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#4CAF50" />
        <Text style={styles.loadingText}>Загрузка тарифов…</Text>
      </View>
    );
  }

  if (plans.length === 0) {
    return <Text style={styles.emptyText}>Тарифы временно недоступны</Text>;
  }

  const rows = chunkPlans(plans, 2);

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.gridRow}>
          {row.map((plan) => {
            const selected = plan.id === selectedPlanId;
            const discountSuffix = formatWelcomePlanDiscountSuffix(plan, periodMonths);
            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.tile,
                  selected && styles.tileSelected,
                  plan.popular && !selected && styles.tilePopular,
                ]}
                onPress={() => onSelectPlan(plan.id)}
                testID={`${testIDPrefix}-${plan.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                {plan.popular ? (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Популярный</Text>
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.tileName,
                    selected && styles.tileNameSelected,
                    plan.popular && styles.tileNameWithBadge,
                  ]}
                  numberOfLines={1}
                >
                  {plan.displayName}
                </Text>
                <Text
                  style={[styles.tilePrice, selected && styles.tilePriceSelected]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {formatWelcomePlanPricePerMonth(plan, periodMonths)}
                  {discountSuffix ? (
                    <Text style={styles.tileDiscount}> {discountSuffix}</Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

type WelcomePlanFeaturesBlockProps = {
  plans: WelcomePricingPlan[];
  planId: string;
  title?: string;
};

export function WelcomePlanFeaturesBlock({
  plans,
  planId,
  title = 'Что входит',
}: WelcomePlanFeaturesBlockProps) {
  const { width } = useWindowDimensions();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return null;

  const columnCount = width < FEATURES_TWO_COLUMN_MIN_WIDTH ? 1 : 2;
  const featureColumns = splitFeaturesIntoColumns(plan.featuresIncluded, columnCount);

  return (
    <View style={styles.featuresBlock}>
      <Text style={styles.featuresTitle}>{title}</Text>
      <Text style={styles.featuresPlanName}>{plan.displayName}</Text>
      <View style={styles.featuresGrid}>
        {featureColumns.map((columnFeatures, columnIndex) => (
          <View
            key={`col-${columnIndex}`}
            style={[styles.featuresColumn, columnCount > 1 && styles.featuresColumnHalf]}
          >
            {columnFeatures.map((feature, featureIndex) => (
              <View key={`${columnIndex}-${featureIndex}-${feature}`} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={12} color="#4CAF50" style={styles.featureIcon} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#888',
  },
  emptyText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 16,
  },
  tile: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ececec',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  tilePopular: {
    borderColor: '#C8E6C9',
    backgroundColor: '#FAFCFA',
  },
  tileSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    paddingVertical: 1,
    alignItems: 'center',
  },
  popularBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tileName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
    textAlign: 'center',
  },
  tileNameWithBadge: {
    marginTop: 10,
  },
  tileNameSelected: {
    color: '#2e7d32',
  },
  tilePrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  tilePriceSelected: {
    color: '#2e7d32',
  },
  tileDiscount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  featuresBlock: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  featuresTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  featuresPlanName: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 6,
  },
  featuresGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  featuresColumn: {
    flex: 1,
  },
  featuresColumnHalf: {
    flex: 1,
    minWidth: 0,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  featureIcon: {
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11,
    color: '#555',
    lineHeight: 14,
  },
});
