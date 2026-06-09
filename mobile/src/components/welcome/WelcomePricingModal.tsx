import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PrimaryButton } from '@src/components/PrimaryButton';
import {
  WELCOME_PRICING_FOOTNOTE,
  WELCOME_PRICING_FALLBACK_NOTICE,
  type WelcomePricingPlan,
} from '@src/data/welcomePricingData';
import { WelcomePeriodSelector } from './WelcomePeriodSelector';
import { WelcomePricingGrid, WelcomePlanFeaturesBlock } from './WelcomePricingGrid';
import {
  getWelcomePlanSavings,
  getWelcomePlanTotalPrice,
  formatWelcomePlanPricePerMonth,
  findWelcomePricingPlan,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';
import { formatMoney } from '@src/utils/money';

type WelcomePricingModalProps = {
  visible: boolean;
  onClose: () => void;
  pricingPlans: WelcomePricingPlan[];
  pricingLoading?: boolean;
  pricingFallbackUsed?: boolean;
  selectedPeriodMonths: WelcomePeriodMonths;
  onPeriodChange: (months: WelcomePeriodMonths) => void;
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
};

export function WelcomePricingModal({
  visible,
  onClose,
  pricingPlans,
  pricingLoading = false,
  pricingFallbackUsed = false,
  selectedPeriodMonths,
  onPeriodChange,
  selectedPlanId,
  onSelectPlan,
}: WelcomePricingModalProps) {
  const insets = useSafeAreaInsets();
  const selectedPlan = findWelcomePricingPlan(pricingPlans, selectedPlanId);
  const savings = selectedPlan ? getWelcomePlanSavings(selectedPlan, selectedPeriodMonths) : null;
  const total = selectedPlan ? getWelcomePlanTotalPrice(selectedPlan, selectedPeriodMonths) : 0;

  const handleSelectPlan = () => {
    onClose();
    router.push('/login?tab=register&role=master' as any);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Тарифы для мастеров</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть">
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {pricingFallbackUsed ? (
              <Text style={styles.fallbackNotice}>{WELCOME_PRICING_FALLBACK_NOTICE}</Text>
            ) : null}
            <WelcomePeriodSelector
              value={selectedPeriodMonths}
              onChange={onPeriodChange}
              testIDPrefix="welcome-modal-period"
            />
            <WelcomePricingGrid
              plans={pricingPlans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={onSelectPlan}
              periodMonths={selectedPeriodMonths}
              loading={pricingLoading}
              testIDPrefix="welcome-modal-plan"
            />
            {selectedPlan && !pricingLoading ? (
              <View style={styles.summary}>
                <Text style={styles.summaryPrice}>
                  {formatWelcomePlanPricePerMonth(selectedPlan, selectedPeriodMonths)}
                </Text>
                {selectedPeriodMonths > 1 && selectedPlan.price1Month > 0 ? (
                  <Text style={styles.summaryTotal}>
                    Итого за {selectedPeriodMonths} мес: {formatMoney(total)}
                  </Text>
                ) : null}
                {savings ? (
                  <Text style={styles.summarySaving}>
                    Экономия {formatMoney(savings.savingsRub)} ({savings.savingsPercent}%)
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!pricingLoading ? (
              <WelcomePlanFeaturesBlock
                plans={pricingPlans}
                planId={selectedPlanId}
                fallbackMode={pricingFallbackUsed}
              />
            ) : null}
            <Text style={styles.footnote}>{WELCOME_PRICING_FOOTNOTE}</Text>
            <PrimaryButton title="Подключить тариф" onPress={handleSelectPlan} style={styles.cta} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  scrollContent: {
    paddingBottom: 8,
  },
  fallbackNotice: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 18,
  },
  summary: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  summaryPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2e7d32',
  },
  summaryTotal: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  summarySaving: {
    fontSize: 13,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
  },
  footnote: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  cta: {
    marginBottom: 8,
  },
});
