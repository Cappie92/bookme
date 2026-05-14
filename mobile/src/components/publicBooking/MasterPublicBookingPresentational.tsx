/**
 * Визуальный слой экрана публичной записи: iOS grouped vs Android Material 3.
 * Логика и API — в экране app/(public)/m/[slug].tsx.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Linking,
  type RefreshControlProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type {
  PublicMasterProfile,
  PublicService,
  PublicSlot,
} from '@src/services/api/publicMasters';
import { formatPublicAddressLine } from '@src/utils/publicAddressDisplay';
import { TimeSlotsPicker } from './TimeSlotsPicker';
import {
  getBookingNativeTheme,
  createBookingNativeStyles,
} from './bookingNativeTheme';

/** Строка label/value для summary в sheet входа (guest). */
export type PublicBookingConfirmSummaryRow = { label: string; value: string };

export type MasterPublicBookingPresentationalProps = {
  insets: EdgeInsets;
  onBack: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  diagBlock?: React.ReactNode;
  profile: PublicMasterProfile;
  avatarUri: string | null;
  /** Часовой пояс мастера без «живых» часов, напр. «Москва (GMT+3)» */
  masterTimezoneLine: string;
  /** Подсказка по скидке до выбора времени (eligibility), над блоком «3. Время». */
  discountPreface?: { title: string; subtitle: string } | null;
  /** Пояснение применённой скидки из price preview — над «Итог записи». */
  discountAppliedExplain?: { title: string; subtitle: string } | null;
  bookingBlocked: boolean;
  advancePayment: boolean;
  pointsLine: string | null;
  clientNote: string | null;
  isAuthenticated: boolean;
  onOpenClientNote: () => void;
  servicesEmpty: boolean;
  selectedService: PublicService | null;
  serviceRowDiscountBadge: string | null;
  onOpenServicePicker: () => void;
  canSelectDate: boolean;
  dateOptionsEmpty: boolean;
  selectedDate: string | null;
  dateDisplayLabel: string;
  onOpenDatePicker: () => void;
  slotsForDateEmpty: boolean;
  slots: PublicSlot[];
  slotsLoading: boolean;
  selectedSlot: PublicSlot | null;
  onSelectSlot: (s: PublicSlot) => void;
  slotHhBadgeForSlot?: (slot: PublicSlot) => string | null;
  discountHintForSlot?: (slot: PublicSlot) => string | null;
  /** Итог записи на экране: услуга/дата/время (value без «Услуга:» в одной строке). */
  mainBookingSummaryRows: PublicBookingConfirmSummaryRow[];
  /** Цены для итога (база/скидка/к оплате), строки уже отформатированы. */
  mainBookingPriceRows: PublicBookingConfirmSummaryRow[];
  canSubmit: boolean;
  submitting: boolean;
  ctaBlocked: boolean;
  ctaLabel: string;
  onPrimaryCtaPress: () => void;
  /** Правая кнопка шапки: вход (гость) или кабинет (клиент / не-клиент). */
  navRightMode: 'guest' | 'client' | 'staff';
  onNavRightPress: () => void;
  guestAuthSheet: {
    visible: boolean;
    summaryRows: PublicBookingConfirmSummaryRow[];
    priceRows?: PublicBookingConfirmSummaryRow[];
    onClose: () => void;
    onLogin: () => void;
    onRegister: () => void;
  };
};

function ConfirmSummarySection({
  heading,
  rows,
}: {
  heading: string;
  rows: PublicBookingConfirmSummaryRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <View style={modalStyles.guestSummaryBox}>
      <Text style={modalStyles.sectionHeading}>{heading}</Text>
      {rows.map((row, i) => (
        <View
          key={`${row.label}-${i}`}
          style={[modalStyles.kvRow, i === rows.length - 1 && modalStyles.kvRowLast]}
        >
          <Text style={modalStyles.kvLabel}>{row.label}</Text>
          <Text style={modalStyles.kvValue} selectable={false}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MasterPublicBookingPresentational(props: MasterPublicBookingPresentationalProps) {
  const t = useMemo(() => getBookingNativeTheme(), []);
  const s = useMemo(() => createBookingNativeStyles(t), [t]);
  const v = t.variant;

  const addressMain = formatPublicAddressLine(props.profile.city, props.profile.address);
  const hasContacts =
    !!props.profile.phone ||
    !!props.profile.yandex_maps_url ||
    !!addressMain ||
    !!(props.profile.address_detail && String(props.profile.address_detail).trim()) ||
    !!props.profile.master_timezone;

  return (
    <View style={s.screen}>
      <ScrollView
        refreshControl={props.refreshControl}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 120 + props.insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.navRow, { paddingTop: Math.max(4, props.insets.top - 4) }]}>
          <TouchableOpacity
            onPress={props.onBack}
            style={s.navIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color="#293529" />
          </TouchableOpacity>
          <View style={s.navTitleWrap}>
            <Text style={t.font.navTitle} numberOfLines={1}>
              Запись
            </Text>
          </View>
          {props.navRightMode === 'guest' ? (
            <TouchableOpacity
              onPress={props.onNavRightPress}
              style={s.navRightGuest}
              accessibilityRole="button"
              accessibilityLabel="Войти"
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              activeOpacity={0.78}
            >
              <Ionicons name="log-in-outline" size={20} color={t.colors.text} />
              <Text style={s.navRightGuestLabel}>Войти</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={props.onNavRightPress}
              style={s.navIconBtn}
              accessibilityRole="button"
              accessibilityLabel={props.navRightMode === 'client' ? 'Мой кабинет' : 'На главную'}
              hitSlop={8}
              activeOpacity={0.78}
            >
              <Ionicons
                name={props.navRightMode === 'client' ? 'person-circle-outline' : 'home-outline'}
                size={22}
                color={t.colors.text}
              />
            </TouchableOpacity>
          )}
        </View>

        {props.diagBlock}

        <View style={s.card}>
          <View style={s.masterRow}>
            {props.avatarUri ? (
              <Image
                source={{ uri: props.avatarUri }}
                style={s.avatar}
                accessibilityLabel="Фото мастера"
              />
            ) : (
              <View style={s.avatarPh} accessibilityLabel="Фото мастера отсутствует">
                <Ionicons name="person-outline" size={30} color="#9aa59b" />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={t.font.masterName} numberOfLines={2}>
                {props.profile.master_name}
              </Text>
              {props.profile.description ? (
                <Text style={{ fontSize: 14, color: t.colors.muted, marginTop: 4 }} numberOfLines={3}>
                  {props.profile.description}
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: t.colors.muted, marginTop: 4 }}>
                  Мастер принимает по записи
                </Text>
              )}
            </View>
          </View>

          {hasContacts ? (
            <View style={s.metaBlock}>
              {(addressMain || props.profile.city) ? (
                <View>
                  <Text style={s.metaLabel}>Адрес</Text>
                  <Text style={s.metaValue} numberOfLines={4}>
                    {addressMain || props.profile.city || '—'}
                  </Text>
                  {!!props.profile.address_detail?.trim() && (
                    <Text style={s.metaHint}>{props.profile.address_detail}</Text>
                  )}
                </View>
              ) : null}

              {props.profile.master_timezone && props.masterTimezoneLine ? (
                <View>
                  <Text style={s.metaLabel}>Местное время</Text>
                  <Text style={s.metaValue} numberOfLines={2}>
                    {props.masterTimezoneLine}
                  </Text>
                </View>
              ) : null}

              {props.profile.yandex_maps_url || props.profile.phone ? (
                <View style={s.actionBtnStack}>
                  {props.profile.yandex_maps_url ? (
                    <TouchableOpacity
                      style={s.mapsBtn}
                      onPress={() => {
                        const u = props.profile.yandex_maps_url;
                        if (u) Linking.openURL(u);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Открыть в Яндекс Картах"
                    >
                      <Ionicons name="map-outline" size={20} color={t.colors.primaryInk} />
                      <Text style={s.mapsBtnText}>Открыть в Яндекс Картах</Text>
                    </TouchableOpacity>
                  ) : null}
                  {props.profile.phone ? (
                    <TouchableOpacity
                      style={s.mapsBtn}
                      onPress={() => Linking.openURL(`tel:${props.profile.phone}`)}
                      accessibilityRole="button"
                      accessibilityLabel="Позвонить мастеру"
                    >
                      <Ionicons name="call-outline" size={20} color={t.colors.primaryInk} />
                      <Text style={s.mapsBtnText}>Позвонить мастеру</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {props.isAuthenticated && props.clientNote != null ? (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}
              onPress={props.onOpenClientNote}
            >
              <Ionicons name="document-text-outline" size={18} color="#666" />
              <Text style={{ fontSize: 14, color: '#666' }}>Ваша заметка</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {props.bookingBlocked ? (
          <View style={[s.tonalBanner, { backgroundColor: '#fff3e0', borderColor: '#ffe0b2' }]}>
            <Text style={[s.tonalBannerTitle, { color: '#e65100' }]}>Запись недоступна</Text>
          </View>
        ) : null}

        {props.advancePayment ? (
          <View style={[s.tonalBanner, { backgroundColor: '#e3f2fd', borderColor: '#bbdefb' }]}>
            <Text style={[s.tonalBannerTitle, { color: '#1565c0' }]}>
              Требуется предоплата для подтверждения записи
            </Text>
          </View>
        ) : null}

        {props.pointsLine ? (
          <View style={[s.tonalBanner, { backgroundColor: '#e8f5e9', borderColor: '#c8e6c9' }]}>
            <Text style={[s.tonalBannerTitle, { color: '#2e7d32' }]}>{props.pointsLine}</Text>
          </View>
        ) : null}

        <View style={s.sectionHead}>
          <Text style={t.font.sectionTitle}>1. Услуга</Text>
        </View>
        {props.servicesEmpty ? (
          <View style={[s.stepRow, { justifyContent: 'center' }]}>
            <Text style={s.stepMuted}>У мастера пока нет услуг</Text>
          </View>
        ) : (
          <TouchableOpacity style={s.stepRow} onPress={props.onOpenServicePicker} activeOpacity={0.75}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Text
                style={props.selectedService ? s.stepPrimary : s.stepMuted}
                numberOfLines={3}
              >
                {props.selectedService
                  ? `${props.selectedService.name} — ${props.selectedService.price} ₽, ${props.selectedService.duration} мин`
                  : 'Выберите услугу'}
              </Text>
              {props.selectedService && props.serviceRowDiscountBadge ? (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{props.serviceRowDiscountBadge}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} style={s.chev} />
          </TouchableOpacity>
        )}

        <View style={s.sectionHead}>
          <Text style={t.font.sectionTitle}>2. Дата</Text>
        </View>
        {!props.canSelectDate ? (
          <View style={[s.stepRow, s.stepRowDisabled]}>
            <Text style={[s.stepMuted, s.stepMutedDis]}>Сначала выберите услугу</Text>
          </View>
        ) : props.dateOptionsEmpty ? (
          <View style={[s.stepRow, { justifyContent: 'center' }]}>
            <Text style={s.stepMuted}>Нет свободных дат на ближайшие 14 дней</Text>
          </View>
        ) : (
          <TouchableOpacity style={s.stepRow} onPress={props.onOpenDatePicker} activeOpacity={0.75}>
            <View style={{ flex: 1 }}>
              {props.selectedDate ? (
                <>
                  <Text style={{ fontSize: 12, color: t.colors.muted, marginBottom: 3 }}>Выбранная дата</Text>
                  <Text style={s.stepPrimary}>{props.dateDisplayLabel}</Text>
                </>
              ) : (
                <Text style={s.stepMuted}>Выберите дату</Text>
              )}
            </View>
            {props.selectedDate ? (
              <Text style={s.stepAction}>Изменить</Text>
            ) : (
              <Ionicons name="chevron-forward" size={20} style={s.chev} />
            )}
          </TouchableOpacity>
        )}

        {props.selectedDate ? (
          <>
            {props.discountPreface ? (
              <View style={[s.tonalBanner, { marginBottom: 4 }]}>
                <Text style={s.tonalBannerTitle}>{props.discountPreface.title}</Text>
                <Text style={s.tonalBannerSub}>{props.discountPreface.subtitle}</Text>
              </View>
            ) : null}
            <View style={s.sectionHead}>
              <Text style={t.font.sectionTitle}>3. Время</Text>
            </View>
            {props.slotsForDateEmpty ? (
              <View style={[s.stepRow, { justifyContent: 'center' }]}>
                <Text style={s.stepMuted}>Нет свободного времени на выбранную дату</Text>
              </View>
            ) : (
              <TimeSlotsPicker
                slots={props.slots}
                selectedDate={props.selectedDate}
                selectedSlot={props.selectedSlot}
                onSelect={props.onSelectSlot}
                loading={props.slotsLoading}
                uiVariant={v}
                slotHhBadgeForSlot={props.slotHhBadgeForSlot}
                discountHintForSlot={props.discountHintForSlot}
              />
            )}
          </>
        ) : null}

        {props.selectedService && props.selectedDate && props.selectedSlot ? (
          <>
            {props.discountAppliedExplain ? (
              <View
                style={[
                  s.tonalBanner,
                  {
                    marginTop: 18,
                    marginBottom: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: t.colors.primary,
                  },
                ]}
              >
                <Text style={s.tonalBannerTitle}>{props.discountAppliedExplain.title}</Text>
                <Text style={s.tonalBannerSub}>{props.discountAppliedExplain.subtitle}</Text>
              </View>
            ) : null}
            <View style={s.summarySpacer} />
            <View style={s.summaryBox}>
              <Text style={[t.font.caption, s.summaryHeading]}>Итог записи</Text>
              {props.mainBookingSummaryRows.map((row, i) => (
                <View
                  key={`d-${row.label}-${i}`}
                  style={[
                    s.sumKvRow,
                    i === props.mainBookingSummaryRows.length - 1 && s.sumKvRowDetailLast,
                  ]}
                >
                  <Text style={s.sumKvLabel}>{row.label}</Text>
                  <Text style={s.sumKvValue} numberOfLines={4}>
                    {row.value}
                  </Text>
                </View>
              ))}
              {props.mainBookingPriceRows.length > 0 ? <View style={s.sumSectionSep} /> : null}
              {props.mainBookingPriceRows.map((row, i) => {
                const isPay = row.label === 'К оплате';
                const isLast = i === props.mainBookingPriceRows.length - 1;
                return (
                  <View
                    key={`p-${row.label}-${i}`}
                    style={[
                      s.sumKvRow,
                      isPay && i > 0 && s.sumKvRowPay,
                      isLast && s.sumKvRowDetailLast,
                    ]}
                  >
                    <Text style={isPay ? s.sumKvLabelPay : s.sumKvLabel}>{row.label}</Text>
                    <Text style={isPay ? s.sumKvValuePay : s.sumKvValue} numberOfLines={2}>
                      {row.value}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      {props.canSubmit ? (
        <View style={[s.ctaBar, { paddingBottom: props.insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[s.ctaBtn, (props.submitting || props.ctaBlocked) && s.ctaBtnDisabled]}
            onPress={props.onPrimaryCtaPress}
            disabled={props.submitting || props.ctaBlocked}
            activeOpacity={0.85}
          >
            {props.submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>{props.ctaLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={props.guestAuthSheet.visible} transparent animationType="slide">
        <Pressable style={modalStyles.overlay} onPress={props.guestAuthSheet.onClose}>
          <Pressable
            style={[
              modalStyles.sheet,
              v === 'ios'
                ? { borderTopLeftRadius: 24, borderTopRightRadius: 24 }
                : { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {v === 'ios' ? <View style={modalStyles.grab} /> : null}
            <ScrollView
              style={modalStyles.sheetScroll}
              contentContainerStyle={modalStyles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              <Text style={modalStyles.title}>Вход для записи</Text>
              <Text style={modalStyles.subtitle}>
                Войдите или зарегистрируйтесь, чтобы подтвердить запись.
              </Text>
              <ConfirmSummarySection
                heading="Детали записи"
                rows={props.guestAuthSheet.summaryRows}
              />
              <ConfirmSummarySection
                heading="Стоимость"
                rows={props.guestAuthSheet.priceRows ?? []}
              />
            </ScrollView>
            <View style={modalStyles.sheetActions}>
              <TouchableOpacity
                style={modalStyles.primary}
                onPress={props.guestAuthSheet.onLogin}
                accessibilityRole="button"
              >
                <Text style={modalStyles.primaryText}>Войти</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={modalStyles.secondaryOutline}
                onPress={props.guestAuthSheet.onRegister}
                accessibilityRole="button"
              >
                <Text style={modalStyles.secondaryOutlineText}>Зарегистрироваться</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalStyles.tertiary} onPress={props.guestAuthSheet.onClose}>
                <Text style={modalStyles.tertiaryText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#dfe7df',
    maxHeight: '88%',
  },
  grab: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d9dfd9',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#182218', lineHeight: 30, marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    color: '#6f7a70',
    lineHeight: 23,
    marginBottom: 18,
    maxWidth: '100%',
  },
  sheetScroll: {
    maxHeight: 400,
  },
  sheetScrollContent: {
    paddingBottom: 4,
  },
  sheetActions: {
    paddingTop: 22,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#dde5dd',
    gap: 0,
  },
  guestSummaryBox: {
    backgroundColor: '#f4faf5',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cfe8d3',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#55835d',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  kvRow: {
    marginBottom: 14,
  },
  kvRowLast: {
    marginBottom: 0,
  },
  kvLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6f7a70',
    marginBottom: 4,
  },
  kvValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#182218',
    lineHeight: 22,
  },
  primary: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#50b95a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  secondaryOutline: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#50b95a',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  secondaryOutlineText: { color: '#2b7b34', fontSize: 16, fontWeight: '800' },
  tertiary: { paddingVertical: 16, alignItems: 'center' },
  tertiaryText: { fontSize: 15, fontWeight: '600', color: '#7a857b' },
});
