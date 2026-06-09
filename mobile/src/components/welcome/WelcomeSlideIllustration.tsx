import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomeIllustrationType } from '@src/data/welcomeSlidesData';

type WelcomeSlideIllustrationProps = {
  type: WelcomeIllustrationType;
  large?: boolean;
};

export function WelcomeSlideIllustration({ type, large = true }: WelcomeSlideIllustrationProps) {
  const frameStyle = large ? styles.frameLarge : styles.frame;

  switch (type) {
    case 'public-page':
      return <PublicPageIllustration frameStyle={frameStyle} />;
    case 'schedule-services':
      return <ScheduleIllustration frameStyle={frameStyle} />;
    case 'analytics':
      return <AnalyticsIllustration frameStyle={frameStyle} />;
    case 'loyalty':
      return <LoyaltyIllustration frameStyle={frameStyle} />;
    case 'social-post':
      return <SocialPostIllustration frameStyle={frameStyle} />;
    case 'master-dashboard':
      return <MasterDashboardIllustration frameStyle={frameStyle} />;
    case 'client-masters':
      return <ClientMastersIllustration frameStyle={frameStyle} />;
    case 'client-loyalty':
      return <ClientLoyaltyIllustration frameStyle={frameStyle} />;
    case 'client-reschedule':
      return <ClientRescheduleIllustration frameStyle={frameStyle} />;
    case 'client-dashboard':
      return <ClientDashboardIllustration frameStyle={frameStyle} />;
    default:
      return null;
  }
}

type FrameProps = { frameStyle: object };

function RatingRow({ value, reviews }: { value: string; reviews?: string }) {
  return (
    <View style={styles.ratingRow}>
      <Ionicons name="star" size={10} color="#F5A623" />
      <Text style={styles.ratingText}>{value}</Text>
      {reviews ? <Text style={styles.mockMuted}> · {reviews}</Text> : null}
    </View>
  );
}

function PillTabs({ tabs, activeIndex }: { tabs: string[]; activeIndex: number }) {
  return (
    <View style={styles.pillTabsRow}>
      {tabs.map((tab, i) => (
        <View key={tab} style={[styles.pillTab, i === activeIndex && styles.pillTabActive]}>
          <Text style={[styles.chipText, i === activeIndex && styles.pillTabActiveText]}>{tab}</Text>
        </View>
      ))}
    </View>
  );
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <View style={styles.progressWrap}>
      <Text style={styles.mockMuted}>{label}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

function PublicPageIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarLg} />
        <View style={styles.flex1}>
          <Text style={styles.mockTitleLg}>Анна Смирнова</Text>
          <RatingRow value="4.9" reviews="120+ отзывов" />
          <View style={[styles.chip, styles.chipSuccess, styles.chipInline]}>
            <Ionicons name="shield-checkmark" size={10} color="#2e7d32" />
            <Text style={styles.chipSuccessText}>Проверенный мастер</Text>
          </View>
        </View>
      </View>
      <View style={styles.legendRow}>
        <Ionicons name="location-outline" size={11} color="#888" />
        <Text style={styles.legendText}>Москва, ул. Тверская 12</Text>
      </View>
      <View style={[styles.sectionCard, styles.sectionCardWarm]}>
        <Text style={styles.bannerText}>Скидка на первый визит 10%</Text>
      </View>
      <View style={styles.serviceChipRow}>
        {['Стрижка', 'Окрашивание', 'Укладка'].map((s) => (
          <View key={s} style={styles.serviceChip}>
            <Text style={styles.serviceChipText}>{s}</Text>
          </View>
        ))}
      </View>
      <View style={styles.mockDivider} />
      <Text style={styles.stepLabel}>1. Услуга · Стрижка</Text>
      <Text style={styles.stepLabel}>2. Дата · Завтра</Text>
      <View style={styles.slotGridLg}>
        {['10:30', '11:00', '11:30', '12:00'].map((t, i) => (
          <View key={t} style={[styles.slotLg, i === 1 && styles.slotSelected]}>
            <Text style={[styles.slotText, i === 1 && styles.slotTextSelected]}>{t}</Text>
          </View>
        ))}
      </View>
      <View style={styles.mockBtn}>
        <Text style={styles.mockBtnText}>Записаться</Text>
      </View>
    </View>
  );
}

function ScheduleIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <PillTabs tabs={['День', 'Неделя']} activeIndex={0} />
      <View style={styles.weekRowLg}>
        {[
          ['Вс', '20'],
          ['Пн', '21', true],
          ['Вт', '22'],
          ['Ср', '23'],
          ['Чт', '24'],
        ].map((item) => {
          const w = item[0];
          const d = item[1];
          const active = item[2] === true;
          return (
            <View key={String(d)} style={[styles.dayCellLg, active && styles.dayCellActive]}>
              <Text style={[styles.dayW, active && styles.dayTextActive]}>{w}</Text>
              <Text style={[styles.dayD, active && styles.dayTextActive]}>{d}</Text>
            </View>
          );
        })}
      </View>
      {[
        { time: '10:00', title: 'Анна', sub: 'Подтверждено', tone: 'default' as const },
        { time: '13:30', title: 'Окрашивание', sub: '4 200 ₽', tone: 'yellow' as const },
        { time: '16:30', title: 'Свободное окно', sub: 'Слот открыт', tone: 'gray' as const },
      ].map((a) => (
        <View
          key={a.time}
          style={[
            styles.apptRow,
            a.tone === 'yellow' && styles.apptYellow,
            a.tone === 'gray' && styles.apptGray,
          ]}
        >
          <Text style={styles.apptTime}>{a.time}</Text>
          <View style={styles.apptBody}>
            <Text style={styles.mockBodySm} numberOfLines={1}>
              {a.title}
            </Text>
            <Text style={styles.mockMuted}>{a.sub}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.sectionLabel}>Услуги</Text>
      {[
        { name: 'Женская стрижка', price: '1 500 ₽', dur: '1ч' },
        { name: 'Окрашивание', price: '4 200 ₽', dur: '2ч' },
      ].map((s) => (
        <View key={s.name} style={styles.sectionCard}>
          <Text style={styles.mockBodySm}>
            {s.name} · {s.price} · {s.dur}
          </Text>
        </View>
      ))}
      <View style={styles.summaryStrip}>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>5</Text>
          <Text style={styles.miniStatLabel}>записей</Text>
        </View>
        <View style={styles.mockDividerV} />
        <View style={[styles.miniStat, styles.flex1]}>
          <Text style={[styles.miniStatValue, styles.textGreen]}>+92 400 ₽</Text>
          <Text style={styles.miniStatLabel}>за апрель</Text>
        </View>
      </View>
    </View>
  );
}

function AnalyticsIllustration({ frameStyle }: FrameProps) {
  const bars = [40, 52, 48, 58, 54, 68];
  const loadBars = [32, 44, 38, 50, 46, 62, 48];
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <View style={frameStyle}>
      <View style={styles.kpiRow3}>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>92 400 ₽</Text>
          <Text style={styles.miniStatLabel}>выручка</Text>
        </View>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>38%</Text>
          <Text style={styles.miniStatLabel}>повторные</Text>
        </View>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>82%</Text>
          <Text style={styles.miniStatLabel}>загрузка</Text>
        </View>
      </View>
      <View style={styles.sectionCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.mockTitle}>Выручка за 6 недель</Text>
          <View style={[styles.chip, styles.chipSuccess]}>
            <Text style={styles.chipSuccessText}>+14%</Text>
          </View>
        </View>
        <View style={styles.barsLg}>
          {bars.map((h, i) => (
            <View key={i} style={[styles.barLg, { height: h }, i === 5 && styles.barActive]} />
          ))}
        </View>
      </View>
      <View style={[styles.sectionCard, styles.sectionCardTint]}>
        <Text style={styles.mockTitle}>Загрузка по дням</Text>
        <View style={styles.lineBars}>
          {loadBars.map((h, i) => (
            <View key={i} style={styles.lineBarCol}>
              <View style={[styles.lineBar, { height: h * 0.55 }, i === 5 && styles.barActive]} />
              <Text style={styles.dayLabelTiny}>{days[i]}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.chip, styles.chipMuted, styles.chipInline, { marginTop: 6 }]}>
          <Text style={styles.chipMutedText}>Лучший день — Сб</Text>
        </View>
      </View>
    </View>
  );
}

function LoyaltyIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={[styles.sectionCard, styles.sectionCardTint]}>
        <Text style={styles.mockMuted}>Программа лояльности</Text>
        <Text style={styles.heroValue}>12 480</Text>
        <Text style={styles.mockBodySm}>активных баллов</Text>
      </View>
      <ProgressBar percent={38} label="Возвращаются 38% клиентов" />
      <View style={styles.sectionCard}>
        <View style={styles.spotlightRow}>
          <View style={styles.tinyAvatar} />
          <View style={styles.flex1}>
            <Text style={styles.mockTitle}>Екатерина Л.</Text>
            <Text style={styles.mockMuted}>740 баллов</Text>
          </View>
          <View style={[styles.chip, styles.chipWarn]}>
            <Text style={styles.chipWarnText}>VIP</Text>
          </View>
        </View>
        <View style={styles.benefitRow}>
          <Text style={styles.mockBodySm}>Персональная скидка</Text>
          <View style={styles.coupon}>
            <Text style={styles.couponText}>−300 ₽</Text>
          </View>
        </View>
      </View>
      <View style={styles.chipRowWrap}>
        {['Баллы после визита', 'Скидка на 3-й визит'].map((c) => (
          <View key={c} style={[styles.chip, styles.chipMuted]}>
            <Text style={styles.chipMutedText}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SocialPostIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={styles.sectionCard}>
        <Text style={styles.mockMuted}>Среда · выберите окно</Text>
        <View style={styles.slotGridLg}>
          {['14:00', '16:30', '18:00'].map((t, i) => (
            <View key={t} style={[styles.slotLg, i === 0 && styles.slotSelected]}>
              <Text style={[styles.slotText, i === 0 && styles.slotTextSelected]}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.sectionCard, styles.sectionCardTint]}>
        <Text style={styles.mockTitle}>Свободные окна на среду</Text>
        <Text style={styles.mockBodySm}>14:00 · 16:30 · 18:00</Text>
        <View style={styles.chipRowWrap}>
          {['#стрижка', '#окна', '#запись'].map((tag) => (
            <View key={tag} style={[styles.chip, styles.chipSuccess]}>
              <Text style={styles.chipSuccessText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.postPreview}>
        <View style={styles.postPreviewHeader}>
          <View style={styles.tinyAvatar} />
          <Text style={styles.mockBodySm}>DeDato · Анна</Text>
        </View>
        <Text style={styles.mockTitle}>Запись открыта на среду</Text>
        <Text style={styles.mockMuted}>14:00 · 16:30 · 18:00</Text>
        <View style={styles.mockBtnOutlineSm}>
          <Text style={styles.mockBtnOutlineText}>dedato.ru/m/anna</Text>
        </View>
      </View>
      <View style={styles.shareRow}>
        {['Telegram', 'Stories', 'Ссылка'].map((s) => (
          <View key={s} style={[styles.chip, styles.chipMuted, styles.shareChip]}>
            <Text style={styles.chipMutedText}>{s}</Text>
          </View>
        ))}
      </View>
      <View style={styles.mockBtn}>
        <Ionicons name="create-outline" size={12} color="#fff" />
        <Text style={styles.mockBtnText}> Создать пост</Text>
      </View>
    </View>
  );
}

function MasterDashboardIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={styles.dashHeader}>
        <Text style={styles.mockTitleLg}>Привет, Анна</Text>
        <Text style={styles.mockMuted}>Вторник, 14 июня</Text>
      </View>
      <View style={styles.chipRowWrap}>
        <View style={[styles.chip, styles.chipSuccess]}>
          <Text style={styles.chipSuccessText}>Страница готова</Text>
        </View>
        <View style={[styles.chip, styles.chipSuccess]}>
          <Text style={styles.chipSuccessText}>Онлайн-запись включена</Text>
        </View>
      </View>
      <View style={styles.kpiRowLg}>
        <View style={styles.kpiLg}>
          <Text style={styles.kpiLabel}>Сегодня</Text>
          <Text style={styles.kpiValueLg}>5 записей</Text>
        </View>
        <View style={styles.kpiLg}>
          <Text style={styles.kpiLabel}>Выручка</Text>
          <Text style={[styles.kpiValueLg, styles.textGreen]}>24 800 ₽</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>Ближайшие записи</Text>
      {[
        { time: '10:00', client: 'Мария', service: 'Стрижка' },
        { time: '13:30', client: 'Ольга', service: 'Окрашивание' },
      ].map((b) => (
        <View key={b.time} style={styles.bookingRow}>
          <Text style={styles.apptTime}>{b.time}</Text>
          <View style={styles.flex1}>
            <Text style={styles.mockBodySm}>
              {b.client} · {b.service}
            </Text>
          </View>
        </View>
      ))}
      <View style={styles.revenueStrip}>
        {[28, 42, 36, 50, 44, 58].map((h, i) => (
          <View key={i} style={[styles.barMini, { height: h * 0.5 }, i === 5 && styles.barActive]} />
        ))}
      </View>
      <View style={styles.footerStatus}>
        <Ionicons name="checkmark-circle" size={12} color={GREEN} />
        <Text style={styles.footerStatusText}>Кабинет готов к работе</Text>
      </View>
    </View>
  );
}

function ClientMastersIllustration({ frameStyle }: FrameProps) {
  const masters = [
    { name: 'Анна', tag: 'Стилист', rating: '4.9', slot: 'Ср 15:00' },
    { name: 'Олег', tag: 'Барбер', rating: '4.8', slot: 'Пт 12:30' },
    { name: 'Мария', tag: 'Colorist', rating: '5.0', slot: 'Сб 10:00' },
  ];

  return (
    <View style={frameStyle}>
      <View style={[styles.chip, styles.chipMuted, styles.chipInline, { marginBottom: 8 }]}>
        <Text style={styles.chipMutedText}>3 избранных · история под рукой</Text>
      </View>
      {masters.map((m) => (
        <View key={m.name} style={styles.masterCardLg}>
          <View style={styles.tinyAvatar} />
          <View style={styles.flex1}>
            <Text style={styles.mockTitle}>{m.name}</Text>
            <View style={styles.masterMetaRow}>
              <View style={styles.serviceChip}>
                <Text style={styles.serviceChipText}>{m.tag}</Text>
              </View>
              <RatingRow value={m.rating} reviews="" />
            </View>
            <Text style={styles.mockMuted}>Ближайшее: {m.slot}</Text>
          </View>
          <View style={styles.miniBtn}>
            <Text style={styles.miniBtnText}>Запись</Text>
          </View>
        </View>
      ))}
      <View style={[styles.sectionCard, styles.sectionCardTint]}>
        <Text style={styles.mockMuted}>Последний визит</Text>
        <Text style={styles.mockBodySm}>Окрашивание · 12 мая</Text>
      </View>
    </View>
  );
}

function ClientLoyaltyIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={[styles.sectionCard, styles.sectionCardTint]}>
        <Text style={styles.heroValue}>240</Text>
        <Text style={styles.mockBodySm}>баллов · растёт после каждого визита</Text>
        <View style={styles.ringWrap}>
          <View style={styles.ringOuter}>
            <View style={styles.ringInner}>
              <Text style={styles.ringText}>65%</Text>
            </View>
          </View>
        </View>
      </View>
      {['+20 баллов · стрижка', '+15 баллов · окрашивание', '+10 баллов · укладка'].map((row) => (
        <View key={row} style={styles.historyRow}>
          <Ionicons name="add-circle" size={14} color={GREEN} />
          <Text style={styles.mockBodySm}>{row}</Text>
        </View>
      ))}
      <View style={styles.sectionCard}>
        <Text style={styles.mockTitle}>Скидка 5% у 2 мастеров</Text>
        <Text style={styles.mockMuted}>Применяется при записи</Text>
      </View>
    </View>
  );
}

function ClientRescheduleIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={styles.bookingCardLg}>
        <Text style={styles.mockTitleLg}>Стрижка у Анны</Text>
        <Text style={styles.mockBody}>Ср, 14 июня · 15:00</Text>
        <View style={[styles.chip, styles.chipSuccess, styles.chipInline, { marginTop: 6 }]}>
          <Text style={styles.chipSuccessText}>Подтверждено</Text>
        </View>
        <View style={styles.stepRow}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>2</Text>
          </View>
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
      <Text style={styles.sectionLabel}>Альтернативы</Text>
      <View style={styles.chipRowWrap}>
        {['Пт 16:30', 'Сб 11:00'].map((alt) => (
          <View key={alt} style={[styles.chip, styles.chipMuted]}>
            <Text style={styles.chipMutedText}>{alt}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ClientDashboardIllustration({ frameStyle }: FrameProps) {
  return (
    <View style={frameStyle}>
      <View style={[styles.sectionCard, styles.sectionCardTint]}>
        <Text style={styles.mockMuted}>Ближайшая запись</Text>
        <Text style={styles.mockTitle}>Анна · Стрижка</Text>
        <Text style={styles.mockBodySm}>Ср, 15:00</Text>
      </View>
      <Text style={styles.sectionLabel}>Избранные мастера</Text>
      <View style={styles.avatarStackRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.tinyAvatar, i > 0 && styles.avatarStackOverlap]} />
        ))}
        <Text style={styles.legendText}>3 мастера</Text>
      </View>
      <View style={styles.kpiRowLg}>
        <View style={styles.kpiLg}>
          <Text style={styles.kpiLabel}>Баллы</Text>
          <Text style={[styles.kpiValueLg, styles.textGreen]}>240</Text>
        </View>
        <View style={styles.kpiLg}>
          <Text style={styles.kpiLabel}>Скидки</Text>
          <Text style={styles.kpiValueLg}>2</Text>
        </View>
      </View>
      <View style={styles.chipRowWrap}>
        {['Без звонков', 'История визитов', 'Баллы и скидки'].map((p) => (
          <View key={p} style={[styles.chip, styles.chipMuted]}>
            <Text style={styles.chipMutedText}>{p}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const GREEN = '#4CAF50';
const FRAME_BG = '#FBFBFA';

const styles = StyleSheet.create({
  frame: {
    backgroundColor: FRAME_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E6E3',
    padding: 10,
    marginVertical: 4,
  },
  frameLarge: {
    flex: 1,
    minHeight: 220,
    backgroundColor: FRAME_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E6E3',
    padding: 10,
    overflow: 'hidden',
  },
  flex1: { flex: 1 },

  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  chipInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  chipText: { fontSize: 10, fontWeight: '600', color: '#555' },
  chipMuted: { backgroundColor: '#F0EFED' },
  chipMutedText: { fontSize: 10, color: '#666', fontWeight: '500' },
  chipSuccess: { backgroundColor: '#E8F5E9' },
  chipSuccessText: { fontSize: 10, color: '#2e7d32', fontWeight: '600' },
  chipWarn: { backgroundColor: '#FFF8E1' },
  chipWarnText: { fontSize: 10, color: '#8d6e00', fontWeight: '700' },

  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  ratingText: { fontSize: 10, fontWeight: '700', color: '#333', marginLeft: 2 },

  serviceChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E6E3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  serviceChipText: { fontSize: 9, color: '#555', fontWeight: '500' },
  serviceChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },

  progressWrap: { marginVertical: 6 },
  progressTrack: {
    height: 5,
    backgroundColor: '#ECEAE7',
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },

  miniStat: { alignItems: 'center', flex: 1 },
  miniStatValue: { fontSize: 12, fontWeight: '700', color: '#333' },
  miniStatLabel: { fontSize: 9, color: '#888', marginTop: 1 },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  sectionCardTint: { backgroundColor: '#F7FAF7', borderColor: '#E0EDE2' },
  sectionCardWarm: { backgroundColor: '#FFF8E1', borderColor: '#F0E6C8' },

  floatingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: GREEN,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  floatingBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },

  mockDivider: { height: 1, backgroundColor: '#EEECEA', marginVertical: 6 },
  mockDividerV: { width: 1, height: 28, backgroundColor: '#EEECEA' },

  tinyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D8D6D3',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarLg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D8D6D3',
  },
  avatarStackRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  avatarStackOverlap: { marginLeft: -10 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  legendText: { fontSize: 10, color: '#666' },

  pillTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F0EFED',
    borderRadius: 10,
    padding: 3,
    marginBottom: 6,
  },
  pillTab: { flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: 8 },
  pillTabActive: { backgroundColor: '#fff' },
  pillTabActiveText: { color: '#333' },

  profileHeader: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  mockTitleLg: { fontSize: 13, fontWeight: '700', color: '#333' },
  mockTitle: { fontSize: 11, fontWeight: '700', color: '#333' },
  mockBody: { fontSize: 11, color: '#444' },
  mockBodySm: { fontSize: 10, color: '#444' },
  mockMuted: { fontSize: 9, color: '#888' },
  bannerText: { fontSize: 10, color: '#8d6e00', fontWeight: '600' },
  stepLabel: { fontSize: 9, color: '#888', marginBottom: 3 },
  textGreen: { color: '#2e7d32' },
  heroValue: { fontSize: 22, fontWeight: '700', color: GREEN, marginTop: 2 },

  slotGridLg: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 4 },
  slotLg: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  slotSelected: { backgroundColor: GREEN, borderColor: GREEN },
  slotText: { fontSize: 9, color: '#555' },
  slotTextSelected: { color: '#fff', fontWeight: '600' },

  mockBtn: {
    flexDirection: 'row',
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  mockBtnText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  mockBtnOutlineSm: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  mockBtnOutlineText: { fontSize: 9, color: GREEN, fontWeight: '600' },

  weekRowLg: { flexDirection: 'row', gap: 3, marginBottom: 6 },
  dayCellLg: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F0EFED',
    alignItems: 'center',
  },
  dayCellActive: { backgroundColor: GREEN },
  dayW: { fontSize: 8, color: '#666' },
  dayD: { fontSize: 11, fontWeight: '700', color: '#333' },
  dayTextActive: { color: '#fff' },
  dayLabelTiny: { fontSize: 7, color: '#888', marginTop: 2, textAlign: 'center' },

  apptRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  apptYellow: { backgroundColor: '#FFFDE7' },
  apptGray: { backgroundColor: '#F5F5F4' },
  apptTime: { fontSize: 10, fontWeight: '700', color: '#333', width: 34 },
  apptBody: { flex: 1 },

  sectionLabel: { fontSize: 10, fontWeight: '600', color: '#666', marginBottom: 4, marginTop: 2 },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },

  kpiRow3: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  kpiRowLg: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kpiLg: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  kpiLabel: { fontSize: 9, color: '#888' },
  kpiValueLg: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 2 },

  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barsLg: { flexDirection: 'row', alignItems: 'flex-end', height: 52, gap: 5, marginTop: 6 },
  barLg: { flex: 1, backgroundColor: '#C8E6C9', borderRadius: 3, minHeight: 6 },
  barActive: { backgroundColor: GREEN },
  lineBars: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 3, marginTop: 6 },
  lineBarCol: { flex: 1, alignItems: 'center' },
  lineBar: { width: '100%', backgroundColor: '#C8E6C9', borderRadius: 2, minHeight: 4 },

  benefitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  coupon: { backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  couponText: { fontSize: 10, fontWeight: '700', color: GREEN },
  spotlightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },

  postPreview: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  postPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  shareRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  shareChip: { flex: 1, alignItems: 'center' },

  dashHeader: { marginBottom: 4 },
  bookingRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  revenueStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 28,
    gap: 3,
    marginVertical: 6,
    paddingHorizontal: 4,
  },
  barMini: { flex: 1, backgroundColor: '#C8E6C9', borderRadius: 2, minHeight: 4 },
  footerStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  footerStatusText: { fontSize: 10, color: '#2e7d32', fontWeight: '500' },

  masterCardLg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#EEECEA',
  },
  masterMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  miniBtn: { backgroundColor: GREEN, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  miniBtnText: { fontSize: 9, color: '#fff', fontWeight: '600' },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  ringWrap: { alignItems: 'center', marginTop: 6 },
  ringOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: { fontSize: 10, fontWeight: '700', color: GREEN },

  bookingCardLg: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EEECEA',
    marginBottom: 6,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, gap: 4 },
  stepCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontSize: 9, fontWeight: '700', color: '#fff' },
  stepLine: { width: 24, height: 2, backgroundColor: '#D0CEC9' },
  actionRow: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionBtnMuted: { backgroundColor: '#F5F5F4', borderWidth: 1, borderColor: '#E0E0E0' },
  actionBtnText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  actionBtnTextMuted: { fontSize: 11, fontWeight: '600', color: '#666' },
});
