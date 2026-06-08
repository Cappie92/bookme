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
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import {
  WELCOME_PRICING_PLANS,
  WELCOME_PRICING_FOOTNOTE,
} from '@src/data/welcomePricingData';
import { WelcomePeriodSelector } from './WelcomePeriodSelector';
import {
  formatWelcomePlanPrice,
  formatWelcomePeriodLabel,
  getWelcomePlanSavings,
  getWelcomePlanTotalPrice,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';
import { formatMoney } from '@src/utils/money';

type WelcomePricingModalProps = {
  visible: boolean;
  onClose: () => void;
  selectedPeriodMonths: WelcomePeriodMonths;
  onPeriodChange: (months: WelcomePeriodMonths) => void;
};

export function WelcomePricingModal({
  visible,
  onClose,
  selectedPeriodMonths,
  onPeriodChange,
}: WelcomePricingModalProps) {
  const insets = useSafeAreaInsets();

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

          <Text style={styles.periodHint}>{formatWelcomePeriodLabel(selectedPeriodMonths)}</Text>
          <WelcomePeriodSelector
            value={selectedPeriodMonths}
            onChange={onPeriodChange}
            testIDPrefix="welcome-modal-period"
          />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {WELCOME_PRICING_PLANS.map((plan) => {
              const savings = getWelcomePlanSavings(plan, selectedPeriodMonths);
              const total = getWelcomePlanTotalPrice(plan, selectedPeriodMonths);
              return (
                <Card
                  key={plan.id}
                  style={plan.popular ? styles.planCardPopular : styles.planCard}
                  padding={16}
                >
                  {plan.popular ? (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularBadgeText}>Популярный</Text>
                    </View>
                  ) : null}
                  <Text style={styles.planName}>{plan.displayName}</Text>
                  <Text style={styles.planPrice}>
                    {formatWelcomePlanPrice(plan, selectedPeriodMonths)}
                  </Text>
                  {selectedPeriodMonths > 1 && plan.price1Month > 0 ? (
                    <Text style={styles.planTotal}>
                      Итого за {selectedPeriodMonths} мес: {formatMoney(total)}
                    </Text>
                  ) : null}
                  {savings ? (
                    <Text style={styles.planSaving}>
                      Экономия {formatMoney(savings.savingsRub)} ({savings.savingsPercent}%)
                    </Text>
                  ) : null}
                  <View style={styles.highlights}>
                    {plan.highlights.map((h) => (
                      <View key={h} style={styles.highlightRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                        <Text style={styles.highlightText}>{h}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              );
            })}
            <Text style={styles.footnote}>{WELCOME_PRICING_FOOTNOTE}</Text>
            <PrimaryButton title="Выбрать тариф" onPress={handleSelectPlan} style={styles.cta} />
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
    maxHeight: '90%',
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
  periodHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 12,
  },
  planCard: {},
  planCardPopular: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 4,
  },
  planTotal: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  planSaving: {
    fontSize: 13,
    color: '#4CAF50',
    marginBottom: 12,
    fontWeight: '500',
  },
  highlights: {
    gap: 6,
    marginTop: 4,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  highlightText: {
    fontSize: 14,
    color: '#555',
    flex: 1,
  },
  footnote: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  cta: {
    marginTop: 4,
    marginBottom: 8,
  },
});
