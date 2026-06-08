import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import type { WelcomeSlide } from '@src/data/welcomeSlidesData';
import { WELCOME_PRICING_PLANS } from '@src/data/welcomePricingData';
import { WelcomeSlideIllustration } from './WelcomeSlideIllustration';
import { WelcomePeriodSelector } from './WelcomePeriodSelector';
import {
  formatWelcomePlanPrice,
  formatWelcomePeriodLabel,
  getWelcomePlanSavings,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';

type WelcomeFeatureCardProps = {
  slide: WelcomeSlide;
  selectedPeriodMonths: WelcomePeriodMonths;
  onPeriodChange: (months: WelcomePeriodMonths) => void;
  onPricingPress?: () => void;
};

export function WelcomeFeatureCard({
  slide,
  selectedPeriodMonths,
  onPeriodChange,
  onPricingPress,
}: WelcomeFeatureCardProps) {
  const iconName = slide.icon ?? 'sparkles-outline';

  return (
    <Card style={styles.card} padding={16}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          {slide.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{slide.badge}</Text>
            </View>
          ) : null}
          <View style={styles.iconWrap}>
            <Ionicons name={iconName} size={22} color="#4CAF50" />
          </View>
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <WelcomeSlideIllustration
          type={slide.illustration}
          selectedPeriodMonths={selectedPeriodMonths}
        />
        <Text style={styles.description}>{slide.description}</Text>

        {slide.type === 'pricing' ? (
          <>
            <Text style={styles.periodLabel}>Период: {formatWelcomePeriodLabel(selectedPeriodMonths)}</Text>
            <WelcomePeriodSelector
              value={selectedPeriodMonths}
              onChange={onPeriodChange}
              compact
              testIDPrefix="welcome-slide-period"
            />
            <View style={styles.pricingPreview}>
              {WELCOME_PRICING_PLANS.map((plan) => {
                const savings = getWelcomePlanSavings(plan, selectedPeriodMonths);
                return (
                  <View key={plan.id} style={[styles.pricingRow, plan.popular && styles.pricingRowPopular]}>
                    <Text style={styles.pricingName}>{plan.displayName}</Text>
                    <View style={styles.pricingRight}>
                      <Text style={styles.pricingPrice}>
                        {formatWelcomePlanPrice(plan, selectedPeriodMonths)}
                      </Text>
                      {savings ? (
                        <Text style={styles.pricingSaving}>−{savings.savingsPercent}%</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
            {slide.ctaLabel && onPricingPress ? (
              <TouchableOpacity style={styles.cta} onPress={onPricingPress} accessibilityRole="button">
                <Text style={styles.ctaText}>{slide.ctaLabel}</Text>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 420,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    lineHeight: 24,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 8,
  },
  periodLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  pricingPreview: {
    marginTop: 4,
    marginBottom: 12,
    gap: 6,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  pricingRowPopular: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f1',
  },
  pricingName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  pricingRight: {
    alignItems: 'flex-end',
  },
  pricingPrice: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  pricingSaving: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 4,
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
