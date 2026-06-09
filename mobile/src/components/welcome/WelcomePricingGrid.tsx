import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomePlanFeatureRow, WelcomePricingPlan } from '@src/data/welcomePricingData';
import {
  formatWelcomePlanDiscountSuffix,
  formatWelcomePlanPricePerMonth,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';

function pairFeatureRowsIntoRows(rows: WelcomePlanFeatureRow[]): WelcomePlanFeatureRow[][] {
  const paired: WelcomePlanFeatureRow[][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    paired.push(rows.slice(i, i + 2));
  }
  return paired;
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
          {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
        </View>
      ))}
    </View>
  );
}

type WelcomePlanFeaturesBlockProps = {
  plans: WelcomePricingPlan[];
  planId: string;
  fallbackMode?: boolean;
};

export function WelcomePlanFeaturesBlock({
  plans,
  planId,
  fallbackMode = false,
}: WelcomePlanFeaturesBlockProps) {
  const { width } = useWindowDimensions();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return null;

  const useComparison = !fallbackMode && (plan.featureRows?.length ?? 0) > 0;
  const featureRows: WelcomePlanFeatureRow[] = useComparison
    ? plan.featureRows!
    : plan.featuresIncluded.map((text) => ({ text, available: true }));

  const useTwoCols = width >= 300;
  const rowGroups = useTwoCols
    ? pairFeatureRowsIntoRows(featureRows)
    : featureRows.map((row) => [row]);

  return (
    <View style={styles.featuresBlock}>
      <Text style={styles.featuresTitle}>
        {useComparison ? 'Что входит / не входит' : 'Что входит'}
      </Text>
      <Text style={styles.featuresPlanName}>{plan.displayName}</Text>
      <View style={styles.featuresGrid}>
        {rowGroups.map((rowFeatures, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.featureRowPair}>
            {rowFeatures.map((feature, featureIndex) => (
              <View key={`${rowIndex}-${featureIndex}-${feature.text}`} style={styles.featureCell}>
                <Ionicons
                  name={feature.available ? 'checkmark-circle' : 'remove-circle-outline'}
                  size={11}
                  color={feature.available ? '#4CAF50' : '#BDBDBD'}
                  style={styles.featureIcon}
                />
                <Text
                  style={[styles.featureText, !feature.available && styles.featureTextExcluded]}
                  numberOfLines={2}
                >
                  {feature.text}
                </Text>
              </View>
            ))}
            {useTwoCols && rowFeatures.length === 1 ? <View style={styles.featureCellEmpty} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 6,
    marginTop: 0,
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  tileSpacer: {
    flex: 1,
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
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    minHeight: 50,
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
    marginBottom: 3,
    textAlign: 'center',
  },
  tileNameWithBadge: {
    marginTop: 10,
  },
  tileNameSelected: {
    color: '#2e7d32',
  },
  tilePrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  tilePriceSelected: {
    color: '#2e7d32',
  },
  tileDiscount: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
  },
  featuresBlock: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#eee',
  },
  featuresTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  featuresPlanName: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 3,
  },
  featuresGrid: {
    gap: 1,
  },
  featureRowPair: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  featureCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
    minWidth: 0,
    paddingVertical: 1,
  },
  featureCellEmpty: {
    flex: 1,
  },
  featureIcon: {
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 10,
    color: '#555',
    lineHeight: 13,
  },
  featureTextExcluded: {
    color: '#B0B0B0',
    opacity: 0.85,
  },
});
