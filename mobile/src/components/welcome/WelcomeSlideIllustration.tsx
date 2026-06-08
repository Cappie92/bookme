import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomeIllustrationType } from '@src/data/welcomeSlidesData';
import { WELCOME_PRICING_PLANS } from '@src/data/welcomePricingData';
import {
  formatWelcomePlanPrice,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';

type WelcomeSlideIllustrationProps = {
  type: WelcomeIllustrationType;
  selectedPeriodMonths?: WelcomePeriodMonths;
};

export function WelcomeSlideIllustration({
  type,
  selectedPeriodMonths = 1,
}: WelcomeSlideIllustrationProps) {
  switch (type) {
    case 'public-page':
      return <PublicPageIllustration />;
    case 'schedule-services':
      return <ScheduleIllustration />;
    case 'analytics':
      return <AnalyticsIllustration />;
    case 'loyalty':
      return <LoyaltyIllustration />;
    case 'social-post':
      return <SocialPostIllustration />;
    case 'pricing':
      return <PricingIllustration periodMonths={selectedPeriodMonths} />;
    case 'registration':
    case 'client-registration':
      return <RegistrationIllustration isMaster={type === 'registration'} />;
    case 'client-masters':
      return <ClientMastersIllustration />;
    case 'client-loyalty':
      return <ClientLoyaltyIllustration />;
    case 'client-reschedule':
      return <ClientRescheduleIllustration />;
    default:
      return null;
  }
}

function PublicPageIllustration() {
  return (
    <View style={styles.frame}>
      <View style={styles.profileRow}>
        <View style={styles.avatar} />
        <View style={styles.profileMeta}>
          <Text style={styles.mockTitle}>Анна · мастер</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color="#FFB300" />
            <Text style={styles.mockMuted}>4.9 · Москва</Text>
          </View>
        </View>
      </View>
      <View style={styles.discountChip}>
        <Text style={styles.discountText}>Скидка 10% новым клиентам</Text>
      </View>
      {['Стрижка · 45 мин', 'Окрашивание · 90 мин', 'Укладка · 30 мин'].map((s) => (
        <View key={s} style={styles.serviceRow}>
          <Text style={styles.mockBody}>{s}</Text>
          <Text style={styles.mockPrice}>1 500 ₽</Text>
        </View>
      ))}
      <View style={styles.mockBtn}>
        <Text style={styles.mockBtnText}>Записаться</Text>
      </View>
    </View>
  );
}

function ScheduleIllustration() {
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'];
  return (
    <View style={styles.frame}>
      <View style={styles.weekRow}>
        {days.map((d, i) => (
          <View key={d} style={[styles.dayCell, i === 2 && styles.dayCellActive]}>
            <Text style={[styles.dayText, i === 2 && styles.dayTextActive]}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.slotGrid}>
        {['10:00', '11:30', '14:00', '15:30', '17:00', '18:30'].map((t, i) => (
          <View key={t} style={[styles.slot, i === 2 && styles.slotSelected, i === 4 && styles.slotBusy]}>
            <Text style={[styles.slotText, i === 2 && styles.slotTextSelected]}>{t}</Text>
          </View>
        ))}
      </View>
      <View style={styles.serviceCard}>
        <Text style={styles.mockTitle}>Стрижка · 45 мин</Text>
        <Text style={styles.mockMuted}>Новая запись · 14:00</Text>
      </View>
    </View>
  );
}

function AnalyticsIllustration() {
  return (
    <View style={styles.frame}>
      <View style={styles.kpiRow}>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Доход</Text>
          <Text style={styles.kpiValue}>48 200 ₽</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Записи</Text>
          <Text style={styles.kpiValue}>36</Text>
        </View>
      </View>
      <View style={styles.chart}>
        {[40, 55, 48, 70, 62, 80].map((h, i) => (
          <View key={i} style={styles.barWrap}>
            <View style={[styles.bar, { height: h }]} />
          </View>
        ))}
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.mockMuted}>Выручка за неделю</Text>
        </View>
      </View>
    </View>
  );
}

function LoyaltyIllustration() {
  return (
    <View style={styles.frame}>
      <View style={styles.loyaltyHeader}>
        <Text style={styles.mockTitle}>Мария К.</Text>
        <Text style={styles.loyaltyPoints}>320 баллов</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: '65%' }]} />
      </View>
      <Text style={styles.mockMuted}>До скидки 15% — 80 баллов</Text>
      <View style={styles.loyaltyCards}>
        <View style={styles.loyaltyCard}>
          <Text style={styles.mockBody}>Скидка 10%</Text>
        </View>
        <View style={styles.loyaltyCard}>
          <Text style={styles.mockBody}>+50 баллов</Text>
        </View>
      </View>
    </View>
  );
}

function SocialPostIllustration() {
  return (
    <View style={styles.frame}>
      <View style={styles.postPreview}>
        <Text style={styles.mockTitle}>Свободные окна на среду</Text>
        <Text style={styles.mockBody}>14:00 · 16:30 · 18:00</Text>
        <View style={styles.chipRow}>
          {['#запись', '#beauty', '#moscow'].map((tag) => (
            <View key={tag} style={styles.hashChip}>
              <Text style={styles.hashText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.mockInput}>
        <Text style={styles.mockPlaceholder}>Текст публикации…</Text>
      </View>
      <View style={styles.mockBtnOutline}>
        <Ionicons name="share-social-outline" size={14} color="#4CAF50" />
        <Text style={styles.mockBtnOutlineText}>Создать пост</Text>
      </View>
    </View>
  );
}

function PricingIllustration({ periodMonths }: { periodMonths: WelcomePeriodMonths }) {
  const plans = WELCOME_PRICING_PLANS.slice(0, 3);
  return (
    <View style={styles.frame}>
      <View style={styles.miniPlansRow}>
        {plans.map((plan, i) => (
          <View key={plan.id} style={[styles.miniPlan, i === 1 && styles.miniPlanHighlight]}>
            <Text style={styles.miniPlanName} numberOfLines={1}>
              {plan.displayName}
            </Text>
            <Text style={styles.miniPlanPrice}>{formatWelcomePlanPrice(plan, periodMonths)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.miniPlanWide}>
        <Text style={styles.mockTitle}>{WELCOME_PRICING_PLANS[3].displayName}</Text>
        <Text style={styles.mockPrice}>
          {formatWelcomePlanPrice(WELCOME_PRICING_PLANS[3], periodMonths)}
        </Text>
      </View>
    </View>
  );
}

function RegistrationIllustration({ isMaster }: { isMaster: boolean }) {
  return (
    <View style={[styles.frame, styles.previewFrame]}>
      <View style={styles.previewBadge}>
        <Text style={styles.previewBadgeText}>Превью</Text>
      </View>
      <View style={styles.mockField}>
        <Text style={styles.mockFieldLabel}>Имя</Text>
        <Text style={styles.mockPlaceholder}>Иван Иванов</Text>
      </View>
      <View style={styles.mockField}>
        <Text style={styles.mockFieldLabel}>Телефон</Text>
        <Text style={styles.mockPlaceholder}>+7 (999) 000-00-00</Text>
      </View>
      {isMaster ? (
        <View style={styles.mockField}>
          <Text style={styles.mockFieldLabel}>Город</Text>
          <Text style={styles.mockPlaceholder}>Москва</Text>
        </View>
      ) : null}
      <View style={styles.mockField}>
        <Text style={styles.mockFieldLabel}>Пароль</Text>
        <Text style={styles.mockPlaceholder}>••••••••</Text>
      </View>
    </View>
  );
}

function ClientMastersIllustration() {
  return (
    <View style={styles.frame}>
      {[
        { name: 'Анна · стилист', next: 'Ср, 15:00' },
        { name: 'Олег · барбер', next: 'Пт, 12:30' },
      ].map((m) => (
        <View key={m.name} style={styles.masterCard}>
          <View style={styles.avatarSmall} />
          <View style={styles.flex1}>
            <Text style={styles.mockTitle}>{m.name}</Text>
            <Text style={styles.mockMuted}>Ближайшая: {m.next}</Text>
          </View>
          <View style={styles.miniBtn}>
            <Text style={styles.miniBtnText}>Запись</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ClientLoyaltyIllustration() {
  return (
    <View style={styles.frame}>
      <View style={styles.balanceCard}>
        <Text style={styles.mockMuted}>Ваши баллы</Text>
        <Text style={styles.balanceValue}>240</Text>
        <Text style={styles.discountText}>Скидка 5% у 2 мастеров</Text>
      </View>
      {['+20 баллов · стрижка', '+15 баллов · окрашивание'].map((row) => (
        <View key={row} style={styles.historyRow}>
          <Ionicons name="add-circle-outline" size={16} color="#4CAF50" />
          <Text style={styles.mockBody}>{row}</Text>
        </View>
      ))}
    </View>
  );
}

function ClientRescheduleIllustration() {
  return (
    <View style={styles.frame}>
      <View style={styles.bookingCard}>
        <Text style={styles.mockTitle}>Стрижка у Анны</Text>
        <Text style={styles.mockBody}>Ср, 14 июня · 15:00</Text>
        <View style={styles.stepRow}>
          <View style={styles.stepDot} />
          <View style={styles.stepLine} />
          <View style={styles.stepDot} />
          <Text style={styles.mockMuted}>2 касания</Text>
        </View>
        <View style={styles.actionRow}>
          <View style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Перенести</Text>
          </View>
          <View style={[styles.actionBtn, styles.actionBtnMuted]}>
            <Text style={styles.actionBtnTextMuted}>Отменить</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const GREEN = '#4CAF50';

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  previewFrame: {
    backgroundColor: '#f0f0f0',
    borderStyle: 'dashed',
    borderColor: '#ccc',
  },
  previewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e8e8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 8,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ddd' },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ddd' },
  profileMeta: { marginLeft: 10, flex: 1 },
  mockTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  mockBody: { fontSize: 12, color: '#444' },
  mockMuted: { fontSize: 11, color: '#888' },
  mockPrice: { fontSize: 12, fontWeight: '600', color: GREEN },
  mockPlaceholder: { fontSize: 12, color: '#bbb' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  discountChip: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  discountText: { fontSize: 10, color: '#2e7d32', fontWeight: '600' },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  mockBtn: {
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  mockBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  weekRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  dayCell: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  dayCellActive: { backgroundColor: GREEN },
  dayText: { fontSize: 10, fontWeight: '600', color: '#666' },
  dayTextActive: { color: '#fff' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slot: {
    width: '30%',
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  slotSelected: { backgroundColor: GREEN, borderColor: GREEN },
  slotBusy: { backgroundColor: '#ffebee', borderColor: '#ffcdd2' },
  slotText: { fontSize: 10, color: '#555' },
  slotTextSelected: { color: '#fff', fontWeight: '600' },
  serviceCard: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  kpi: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  kpiLabel: { fontSize: 10, color: '#888' },
  kpiValue: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 2 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    gap: 6,
    paddingHorizontal: 4,
  },
  barWrap: { flex: 1, justifyContent: 'flex-end' },
  bar: { backgroundColor: GREEN, borderRadius: 4, minHeight: 8 },
  chartLegend: { marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  loyaltyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  loyaltyPoints: { fontSize: 12, fontWeight: '700', color: GREEN },
  progressTrack: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  loyaltyCards: { flexDirection: 'row', gap: 8, marginTop: 10 },
  loyaltyCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  postPreview: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  hashChip: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hashText: { fontSize: 9, color: '#2e7d32' },
  mockInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  mockBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: GREEN,
    borderRadius: 8,
    paddingVertical: 8,
  },
  mockBtnOutlineText: { fontSize: 12, fontWeight: '600', color: GREEN },
  miniPlansRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  miniPlan: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  miniPlanHighlight: { borderColor: GREEN, borderWidth: 2 },
  miniPlanName: { fontSize: 9, color: '#666', marginBottom: 2 },
  miniPlanPrice: { fontSize: 10, fontWeight: '700', color: GREEN },
  miniPlanWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  mockField: {
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  mockFieldLabel: { fontSize: 10, color: '#999', marginBottom: 2 },
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  flex1: { flex: 1, marginLeft: 8 },
  miniBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  miniBtnText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 8,
    alignItems: 'center',
  },
  balanceValue: { fontSize: 22, fontWeight: '700', color: GREEN },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  stepLine: { width: 24, height: 2, backgroundColor: '#ccc' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionBtnMuted: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd' },
  actionBtnText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  actionBtnTextMuted: { fontSize: 11, fontWeight: '600', color: '#666' },
});
