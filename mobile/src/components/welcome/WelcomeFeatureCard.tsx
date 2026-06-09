import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import type { WelcomeSlide } from '@src/data/welcomeSlidesData';
import type { WelcomePricingPlan } from '@src/data/welcomePricingData';
import { WELCOME_PRICING_FALLBACK_NOTICE } from '@src/data/welcomePricingData';
import { WelcomeSlideIllustration } from './WelcomeSlideIllustration';
import { WelcomePeriodSelector } from './WelcomePeriodSelector';
import { WelcomePricingGrid, WelcomePlanFeaturesBlock } from './WelcomePricingGrid';
import type { WelcomePeriodMonths } from '@src/utils/welcomePricing';

type WelcomeFeatureCardProps = {
  slide: WelcomeSlide;
  pricingPlans: WelcomePricingPlan[];
  pricingLoading?: boolean;
  pricingFallbackUsed?: boolean;
  selectedPeriodMonths: WelcomePeriodMonths;
  onPeriodChange: (months: WelcomePeriodMonths) => void;
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  onPricingPress?: () => void;
};

export function WelcomeFeatureCard({
  slide,
  pricingPlans,
  pricingLoading = false,
  pricingFallbackUsed = false,
  selectedPeriodMonths,
  onPeriodChange,
  selectedPlanId,
  onSelectPlan,
  onPricingPress,
}: WelcomeFeatureCardProps) {
  const iconName = slide.icon ?? 'sparkles-outline';

  if (slide.type === 'pricing') {
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
          <Text style={styles.description} numberOfLines={2}>
            {slide.description}
          </Text>
          {pricingFallbackUsed ? (
            <Text style={styles.fallbackNotice}>{WELCOME_PRICING_FALLBACK_NOTICE}</Text>
          ) : null}
          <WelcomePeriodSelector
            value={selectedPeriodMonths}
            onChange={onPeriodChange}
            compact
            testIDPrefix="welcome-slide-period"
          />
          <WelcomePricingGrid
            plans={pricingPlans}
            selectedPlanId={selectedPlanId}
            onSelectPlan={onSelectPlan}
            periodMonths={selectedPeriodMonths}
            loading={pricingLoading}
            testIDPrefix="welcome-slide-plan"
          />
          {!pricingLoading ? (
            <WelcomePlanFeaturesBlock
              plans={pricingPlans}
              planId={selectedPlanId}
              fallbackMode={pricingFallbackUsed}
            />
          ) : null}
          {slide.ctaLabel && onPricingPress ? (
            <TouchableOpacity style={styles.cta} onPress={onPricingPress} accessibilityRole="button">
              <Text style={styles.ctaText}>{slide.ctaLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </Card>
    );
  }

  return (
    <Card style={styles.card} padding={16}>
      <View style={styles.featureBody}>
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
        <Text style={styles.description} numberOfLines={3}>
          {slide.description}
        </Text>
        <View style={styles.illustrationWrap}>
          <WelcomeSlideIllustration type={slide.illustration} large />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 480,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  featureBody: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    lineHeight: 22,
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 4,
  },
  fallbackNotice: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 18,
  },
  illustrationWrap: {
    flex: 1,
    minHeight: 248,
    marginTop: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 4,
    marginTop: 4,
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
