/**
 * Публичная страница записи к мастеру — /m/:slug (нативный экран)
 * Deep links: dedato://m/{slug} и https://<WEB_URL>/m/{slug} (Universal / App Links)
 * Wizard: Услуга → Дата → Время
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  BackHandler,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@src/auth/AuthContext';
import {
  getPublicMaster,
  getPublicMasterAvailability,
  getClientNoteForMaster,
  getPublicEligibility,
  createPublicBooking,
  getPublicBookingPricePreview,
  PublicMasterProfile,
  PublicService,
  PublicSlot,
  type BookingPricePreview,
  type CreatePublicBookingResponse,
  type PublicEligibility,
} from '@src/services/api/publicMasters';
import {
  savePublicBookingDraft,
  getPublicBookingDraft,
  clearPublicBookingDraft,
  updatePublicBookingDraftStatus,
  type DraftPricePreviewSnapshot,
} from '@src/stores/publicBookingDraftStore';
import { fetchCalendarIcs } from '@src/services/api/bookings';
import { writeIcsToCacheAndGetUri } from '@src/utils/calendarIcsPath';
import * as Sharing from 'expo-sharing';
import { ServicePicker } from '@src/components/publicBooking/ServicePicker';
import { DatePicker, buildDateOptionsFromSlots } from '@src/components/publicBooking/DatePicker';
import { formatDateForPicker, formatTimeRange, formatTimeHHMM } from '@src/utils/format';
import {
  MasterPublicBookingPresentational,
  type PublicBookingConfirmSummaryRow,
} from '@src/components/publicBooking/MasterPublicBookingPresentational';
import { getBookingNativeVariant } from '@src/components/publicBooking/bookingNativeTheme';
import { getServiceDiscountBadge, formatPriceRub } from '@src/components/publicBooking/publicBookingDiscountUi';
import { logger } from '@src/utils/logger';
import { env } from '@src/config/env';
import { debugConnectivity, type ConnectivityResult } from '@src/services/api/diagnostics';
import { resolveBackendUploadUrl } from '@src/utils/resolveBackendUploadUrl';
import { buildMasterTimezoneDisplayLine } from '@src/utils/masterTimezoneDisplay';
import { formatPublicAddressLine } from '@src/utils/publicAddressDisplay';
import { buildGoogleCalendarTemplateUrl } from '@src/utils/googleCalendarUrl';
import {
  buildAppliedDiscountExplain,
  buildDiscountPrefaceFromHint,
  happyHoursChipLabel,
  hasHappyHoursVisual,
} from '@src/utils/publicBookingLoyaltyCopy';

const DAYS_AHEAD = 14;
const LOAD_PROFILE_WATCHDOG_MS = 10000;
const BOOT_GUARD_MS = 500;

type BookingSuccessCardDetail = {
  masterName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  addressLine: string | null;
  addressDetail: string | null;
  detailRows: PublicBookingConfirmSummaryRow[];
  priceRows: PublicBookingConfirmSummaryRow[];
  calendarTitle: string;
  calendarStartIso: string;
  calendarEndIso: string;
  calendarLocation: string;
  calendarDetails: string;
};

function previewLikeToPriceRows(p: {
  base_price: number;
  discount_amount: number;
  final_price: number;
  discount_percent?: number | null;
}): PublicBookingConfirmSummaryRow[] {
  const rows: PublicBookingConfirmSummaryRow[] = [];
  if (p.final_price == null) return rows;
  if (p.discount_amount > 0.001) {
    rows.push({ label: 'Базовая цена', value: formatPriceRub(p.base_price) });
    const disc =
      `−${formatPriceRub(p.discount_amount)}` +
      (p.discount_percent != null ? ` (${Math.round(p.discount_percent)}%)` : '');
    rows.push({ label: 'Скидка', value: disc });
    rows.push({ label: 'К оплате', value: formatPriceRub(p.final_price) });
  } else {
    rows.push({ label: 'К оплате', value: formatPriceRub(p.final_price) });
  }
  return rows;
}

function buildBookingSuccessCardDetail(
  profile: PublicMasterProfile,
  serviceName: string,
  startIso: string,
  endIso: string,
  priceFrom:
    | BookingPricePreview
    | DraftPricePreviewSnapshot
    | Pick<
        CreatePublicBookingResponse,
        'base_price' | 'discount_amount' | 'final_price' | 'discount_percent'
      >
    | null
): BookingSuccessCardDetail {
  const dateStr = startIso.length >= 10 ? startIso.slice(0, 10) : startIso;
  const dateLabel = formatDateForPicker(dateStr);
  const timeLabel = formatTimeRange(startIso, endIso);
  const addressLine = formatPublicAddressLine(profile.city, profile.address);
  const addressDetail =
    profile.address_detail && String(profile.address_detail).trim()
      ? String(profile.address_detail).trim()
      : null;

  const detailRows: PublicBookingConfirmSummaryRow[] = [
    { label: 'Мастер', value: profile.master_name },
    { label: 'Услуга', value: serviceName },
    { label: 'Дата', value: dateLabel },
    { label: 'Время', value: timeLabel },
  ];
  if (addressLine) detailRows.push({ label: 'Адрес', value: addressLine });
  if (addressDetail) detailRows.push({ label: 'Как добраться', value: addressDetail });

  let priceRows: PublicBookingConfirmSummaryRow[] = [];
  if (priceFrom != null) {
    const fp = priceFrom as {
      base_price?: number | null;
      discount_amount?: number;
      final_price?: number | null;
      discount_percent?: number | null;
    };
    if (fp.final_price != null && typeof fp.final_price === 'number') {
      priceRows = previewLikeToPriceRows({
        base_price: Number(fp.base_price ?? 0),
        discount_amount: Number(fp.discount_amount ?? 0),
        final_price: Number(fp.final_price),
        discount_percent: fp.discount_percent ?? null,
      });
    }
  }

  const loc = [addressLine, addressDetail].filter(Boolean).join(', ');
  const details = [profile.phone ? `Тел.: ${profile.phone}` : '', `Мастер: ${profile.master_name}`]
    .filter(Boolean)
    .join('\n');

  return {
    masterName: profile.master_name,
    serviceName,
    dateLabel,
    timeLabel,
    addressLine,
    addressDetail,
    detailRows,
    priceRows,
    calendarTitle: `${serviceName} — ${profile.master_name}`,
    calendarStartIso: startIso,
    calendarEndIso: endIso,
    calendarLocation: loc,
    calendarDetails: details || 'Запись DeDato',
  };
}

export default function MasterPublicBookingScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();

  const [profile, setProfile] = useState<PublicMasterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<PublicService | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<PublicEligibility | null>(null);
  const [clientNote, setClientNote] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** После успешной записи: id для API/legacy, publicReference для клиентского кода и календаря */
  const [successBookingCal, setSuccessBookingCal] = useState<{
    id: number;
    publicReference?: string;
    detail: BookingSuccessCardDetail | null;
  } | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [pricePreview, setPricePreview] = useState<BookingPricePreview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [diagResult, setDiagResult] = useState<ConnectivityResult | null>(null);
  const [profileLoadResult, setProfileLoadResult] = useState<{ ok: boolean; ms: number; code?: string } | null>(null);

  const avatarUri = profile?.avatar_url
    ? resolveBackendUploadUrl(profile.avatar_url)
    : null;

  /** «Назад» на этом экране всегда по правилам: не по history, а login / кабинет по роли. */
  const handleBack = useCallback(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    const role = (user?.role != null ? String(user.role) : '').toLowerCase();
    if (role === 'client') {
      router.replace('/client/dashboard');
    } else {
      router.replace('/');
    }
  }, [isAuthenticated, user?.role, router]);

  const navRightMode: 'guest' | 'client' | 'staff' = !isAuthenticated
    ? 'guest'
    : String(user?.role ?? '').toLowerCase() === 'client'
      ? 'client'
      : 'staff';

  const handleNavRightPress = useCallback(() => {
    if (!isAuthenticated) {
      router.push('/login?tab=login&role=client' as any);
      return;
    }
    const role = (user?.role != null ? String(user.role) : '').toLowerCase();
    if (role === 'client' && slug) {
      router.push({ pathname: '/client/dashboard', params: { returnTo: `/m/${slug}` } } as any);
    } else {
      router.push('/' as any);
    }
  }, [isAuthenticated, user?.role, router, slug]);

  useEffect(() => {
    if (!__DEV__ || !(env.DEBUG_HTTP || env.DEBUG_LOGS)) return;
    debugConnectivity().then((r) => {
      if (r) setDiagResult(r);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const canGoBack =
        typeof (router as any).canGoBack === 'function' ? (router as any).canGoBack() : false;
      if (canGoBack) return false;
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack, router]);

  // При смене slug сбрасываем состояние и даём loadProfile заново загрузить профиль (warm deeplink на другого мастера).
  useEffect(() => {
    if (!slug) return;
    setProfile(null);
    setLoading(true);
    setError(null);
    setLoadTimeout(false);
    setProfileLoadResult(null);
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setSlotsError(null);
  }, [slug]);

  const loadProfile = useCallback(async () => {
    if (!slug) return;
    const start = Date.now();
    const apiUrl = env.API_URL || '';
    if (__DEV__ && (env.DEBUG_LOGS || env.DEBUG_HTTP)) {
      logger.debug('auth', '[PUBLIC_BOOKING] load start', { slug, apiUrl });
    }
    setLoading(true);
    setError(null);
    setLoadTimeout(false);
    try {
      const data = await getPublicMaster(slug);
      const ms = Date.now() - start;
      if (__DEV__ && (env.DEBUG_LOGS || env.DEBUG_HTTP)) {
        logger.debug('auth', '[PUBLIC_BOOKING] load success', { slug, apiUrl, ms });
      }
      setProfile(data);
      setProfileLoadResult({ ok: true, ms: Date.now() - start });
    } catch (e: unknown) {
      const ms = Date.now() - start;
      const err = e as { response?: { status?: number }; message?: string; code?: string };
      setProfileLoadResult({ ok: false, ms, code: (err as any).code });
      if (__DEV__ && (env.DEBUG_LOGS || env.DEBUG_HTTP)) {
        logger.debug('auth', '[PUBLIC_BOOKING] load fail', {
          slug,
          apiUrl,
          ms,
          'error.code': (err as any).code,
          'error.message': err?.message,
        });
      }
      if (err?.response?.status === 404) setError('Мастер не найден');
      else setError('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const loadAvailability = useCallback(async () => {
    if (!slug || !selectedService) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots([]);
    try {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + DAYS_AHEAD);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);
      const data = await getPublicMasterAvailability(slug, selectedService.id, fromStr, toStr);
      setSlots(data.slots);
    } catch {
      setSlotsError('Не удалось загрузить доступные даты');
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, selectedService]);

  const loadEligibilityAndNote = useCallback(async () => {
    if (!slug || !isAuthenticated) return;
    try {
      const [elig, note] = await Promise.all([
        getPublicEligibility(slug),
        getClientNoteForMaster(slug),
      ]);
      setEligibility(elig);
      setClientNote(note.note_text ?? null);
    } catch {
      setEligibility(null);
      setClientNote(null);
    }
  }, [slug, isAuthenticated]);

  useEffect(() => {
    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      watchdogId = setTimeout(() => {
        if (__DEV__ && (env.DEBUG_LOGS || env.DEBUG_HTTP)) {
          logger.debug('auth', '[PUBLIC_BOOKING] load timeout', { slug, apiUrl: env.API_URL || '', ms: LOAD_PROFILE_WATCHDOG_MS });
        }
        setLoadTimeout(true);
        setLoading(false);
      }, LOAD_PROFILE_WATCHDOG_MS);
      loadProfile().finally(() => {
        if (watchdogId) clearTimeout(watchdogId);
        watchdogId = null;
      });
    };
    if (Platform.OS === 'android') {
      const guardId = setTimeout(run, BOOT_GUARD_MS);
      return () => {
        clearTimeout(guardId);
        if (watchdogId) clearTimeout(watchdogId);
      };
    } else {
      run();
      return () => {
        if (watchdogId) clearTimeout(watchdogId);
      };
    }
  }, [loadProfile]);

  useEffect(() => {
    if (selectedService) {
      loadAvailability();
    } else {
      setSlots([]);
      setSlotsError(null);
    }
  }, [selectedService, loadAvailability]);

  useEffect(() => {
    if (profile && isAuthenticated) loadEligibilityAndNote();
  }, [profile, isAuthenticated, loadEligibilityAndNote]);

  useEffect(() => {
    if (!slug || !selectedService || !selectedSlot) {
      setPricePreview(null);
      return;
    }
    if (authLoading) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const prev = await getPublicBookingPricePreview(
          slug,
          selectedService.id,
          selectedSlot.start_time
        );
        if (!cancelled) setPricePreview(prev);
      } catch {
        if (!cancelled) setPricePreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    slug,
    selectedService?.id,
    selectedSlot?.start_time,
    selectedSlot?.end_time,
    isAuthenticated,
    user?.id,
    authLoading,
  ]);

  const tzLabel = (tz: string): string => {
    const m: Record<string, string> = {
      'Europe/Moscow': 'МСК',
      'Europe/Samara': 'SAMT',
      'Asia/Yekaterinburg': 'ЕКБ',
      'Asia/Krasnoyarsk': 'КРС',
    };
    return m[tz] || tz.split('/').pop() || tz;
  };

  const masterTimezoneLine = React.useMemo(() => {
    if (!profile?.master_timezone) return '';
    return buildMasterTimezoneDisplayLine(profile.master_timezone, tzLabel(profile.master_timezone));
  }, [profile?.master_timezone]);

  const handleSelectService = (s: PublicService) => {
    setSelectedService(s);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
  };

  const dateOptions = React.useMemo(
    () => buildDateOptionsFromSlots(slots, profile?.master_timezone),
    [slots, profile?.master_timezone]
  );

  const slotHhBadgeForSlot = useCallback(
    (slot: PublicSlot) =>
      happyHoursChipLabel(
        slot.start_time,
        profile?.master_timezone || 'Europe/Moscow',
        profile?.loyalty_visual?.happy_hours ?? []
      ),
    [profile?.master_timezone, profile?.loyalty_visual?.happy_hours]
  );

  const discountPreface = React.useMemo(() => {
    if (!isAuthenticated || !profile || !selectedService || !selectedDate) return null;
    const hint = eligibility?.loyalty_hint;
    if (!hint?.active) return null;
    if (selectedSlot) return null;
    return buildDiscountPrefaceFromHint(hint, {
      profileHasHappyHours: hasHappyHoursVisual(profile.loyalty_visual?.happy_hours),
    });
  }, [
    isAuthenticated,
    profile,
    selectedService,
    selectedDate,
    selectedSlot,
    eligibility?.loyalty_hint,
  ]);

  const discountAppliedExplain = React.useMemo(() => {
    if (!selectedSlot) return null;
    return buildAppliedDiscountExplain(pricePreview);
  }, [selectedSlot, pricePreview]);

  // Draft: после логина автосоздание только если draft.intent === 'create_after_auth' (confirm flow). Логин из шапки не ставит intent.
  useEffect(() => {
    if (!slug || !profile || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const draft = await getPublicBookingDraft();
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) {
        logger.debug('auth', '[public-booking] post-login effect', {
          hasDraft: !!draft,
          intent: draft?.intent,
          status: draft?.status,
          slugMatch: draft?.slug === slug,
        });
      }
      if (!draft || draft.slug !== slug || cancelled) return;
      if (draft.intent !== 'create_after_auth') return;
      if (
        draft.status === 'submitted' ||
        draft.status === 'done' ||
        draft.created_booking_id != null ||
        draft.created_public_reference
      ) {
        if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) {
          logger.debug('auth', '[public-booking] draft idempotency skip', {
            status: draft.status,
            created_booking_id: draft.created_booking_id,
            created_public_reference: draft.created_public_reference,
          });
        }
        if (
          draft.status === 'done' &&
          draft.created_booking_id != null &&
          !cancelled
        ) {
          const svcNameDone =
            draft.service_name ||
            profile.services.find((s) => s.id === draft.service_id)?.name ||
            'Услуга';
          const detail = buildBookingSuccessCardDetail(
            profile,
            svcNameDone,
            draft.start_time,
            draft.end_time,
            draft.price_preview_snapshot ?? null
          );
          setSuccessBookingCal({
            id: draft.created_booking_id,
            publicReference: draft.created_public_reference,
            detail,
          });
          setSelectedService(null);
          setSelectedDate(null);
          setSelectedSlot(null);
          await clearPublicBookingDraft();
        }
        return;
      }
      const svc = profile.services.find((s) => s.id === draft.service_id);
      if (!svc) return;
      setSubmitting(true);
      try {
        await updatePublicBookingDraftStatus({ status: 'submitted' });
        const res = await createPublicBooking(slug, {
          service_id: draft.service_id,
          start_time: draft.start_time,
          end_time: draft.end_time,
        });
        await updatePublicBookingDraftStatus({
          status: 'done',
          created_booking_id: res.id,
          created_public_reference: res.public_reference,
        });
        if (!cancelled) {
          const svcName = res.service_name?.trim() || draft.service_name || svc.name;
          const detail = buildBookingSuccessCardDetail(
            profile,
            svcName,
            draft.start_time,
            draft.end_time,
            res
          );
          setSuccessBookingCal({ id: res.id, publicReference: res.public_reference, detail });
          setSelectedService(null);
          setSelectedDate(null);
          setSelectedSlot(null);
        }
        await clearPublicBookingDraft();
      } catch {
        await updatePublicBookingDraftStatus({ status: 'pending' });
        if (!cancelled) Alert.alert('Ошибка', 'Не удалось создать запись');
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, profile, isAuthenticated]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProfile().then(() => {
      if (selectedService) loadAvailability();
      if (isAuthenticated) loadEligibilityAndNote();
      setRefreshing(false);
    });
  };

  const executeAuthenticatedBooking = async () => {
    if (!slug || !profile || !selectedService || !selectedSlot) return;
    setSubmitting(true);
    try {
      const res = await createPublicBooking(slug, {
        service_id: selectedService.id,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
      });
      const detail = buildBookingSuccessCardDetail(
        profile,
        selectedService.name,
        selectedSlot.start_time,
        selectedSlot.end_time,
        res
      );
      setSuccessBookingCal({ id: res.id, publicReference: res.public_reference, detail });
      setSelectedService(null);
      setSelectedDate(null);
      setSelectedSlot(null);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } };
      const msg = err?.response?.data?.detail || 'Не удалось создать запись';
      Alert.alert('Ошибка', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const prepareGuestDraftAndOpenAuth = async () => {
    if (!slug || !profile || !selectedService || !selectedSlot) return;
    const attemptId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await savePublicBookingDraft({
      slug,
      service_id: selectedService.id,
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
      status: 'pending',
      attempt_id: attemptId,
      intent: 'create_after_auth',
      service_name: selectedService.name,
      master_name: profile.master_name,
      price_preview_snapshot:
        pricePreview && pricePreview.final_price != null
          ? {
              base_price: pricePreview.base_price,
              discount_amount: pricePreview.discount_amount,
              final_price: pricePreview.final_price,
              discount_percent: pricePreview.discount_percent ?? null,
              rule_name: pricePreview.rule_name ?? null,
            }
          : undefined,
    });
    if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) {
      logger.debug('auth', '[public-booking] draft saved with intent create_after_auth', { slug });
    }
    setShowAuthPrompt(true);
  };

  const handlePrimaryBookingPress = () => {
    if (!slug || !selectedService || !selectedSlot) return;
    if (!isAuthenticated) {
      void prepareGuestDraftAndOpenAuth();
      return;
    }
    void executeAuthenticatedBooking();
  };

  const handleAddToCalendar = async () => {
    if (!successBookingCal) return;
    const d = successBookingCal.detail;
    try {
      if (Platform.OS === 'android' && d) {
        const url = buildGoogleCalendarTemplateUrl({
          title: d.calendarTitle,
          startIso: d.calendarStartIso,
          endIso: d.calendarEndIso,
          details: d.calendarDetails,
          location: d.calendarLocation,
        });
        const can = await Linking.canOpenURL(url);
        if (can) {
          await Linking.openURL(url);
          return;
        }
      }
      const target =
        successBookingCal.publicReference?.trim()
          ? {
              id: successBookingCal.id,
              public_reference: successBookingCal.publicReference,
            }
          : successBookingCal.id;
      const ics = await fetchCalendarIcs(target, 60);
      const path = writeIcsToCacheAndGetUri(
        typeof target === 'number'
          ? target
          : { id: successBookingCal.id, public_reference: successBookingCal.publicReference },
        ics
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/calendar' });
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось добавить в календарь');
    }
  };

  const getGoToMyBookingsButton = () => {
    const role = (user?.role ?? '').toString().toLowerCase();
    if (role === 'client') {
      return (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/client/dashboard' as any)}
        >
          <Text style={styles.secondaryBtnText}>Перейти в мои записи</Text>
        </TouchableOpacity>
      );
    }
    if (role === 'master' || role === 'indie') {
      return (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/' as any)}
        >
          <Text style={styles.secondaryBtnText}>Перейти в кабинет мастера</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const canSelectDate = !!selectedService;
  const canSubmit = !!selectedService && !!selectedDate && !!selectedSlot;

  if (!slug) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </SafeAreaView>
    );
  }

  if (loading && !profile) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Загрузка...</Text>
        {Platform.OS !== 'android' && (
          <View style={styles.skeletonCard}>
            <View style={[styles.skeletonLine, { width: '70%' }]} />
            <View style={[styles.skeletonLine, { width: '50%', marginTop: 12 }]} />
            <View style={[styles.skeletonLine, { width: '40%', marginTop: 8 }]} />
          </View>
        )}
        {__DEV__ && (env.DEBUG_HTTP || env.DEBUG_LOGS) && (diagResult || profileLoadResult) && (
          <View style={styles.diagBlock}>
            <Text style={styles.diagTitle}>[NET_DIAG]</Text>
            {diagResult && (
              <>
                <Text style={styles.diagLine}>API_URL: {diagResult.apiUrl}</Text>
                <Text style={styles.diagLine}>baseURL: {diagResult.baseURL}</Text>
                <Text style={styles.diagLine}>
                  health: {diagResult.health.ok ? 'OK' : 'FAIL'} {diagResult.health.ms}ms
                  {diagResult.health.status != null ? ` (${diagResult.health.status})` : ''}
                </Text>
              </>
            )}
            {profileLoadResult && (
              <Text style={styles.diagLine}>
                getPublicMaster: {profileLoadResult.ok ? 'OK' : 'FAIL'} {profileLoadResult.ms}ms
                {profileLoadResult.code != null ? ` code=${profileLoadResult.code}` : ''}
              </Text>
            )}
          </View>
        )}
      </SafeAreaView>
    );
  }

  if (loadTimeout) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { paddingTop: Math.max(16, insets.top) }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Не удалось загрузить данные мастера</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoadTimeout(false);
              setError(null);
              setLoading(true);
              loadProfile();
            }}
          >
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backButton, { marginTop: 12 }]} onPress={handleBack}>
            <Text style={styles.backButtonText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { paddingTop: Math.max(16, insets.top) }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || 'Мастер не найден'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (successBookingCal) {
    const refLabel = successBookingCal.publicReference?.trim();
    const det = successBookingCal.detail;
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.successScroll,
            { paddingTop: insets.top + 16, paddingBottom: Math.max(24, insets.bottom + 16) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.successHeader}>
            <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            <Text style={styles.successTitle}>Запись создана</Text>
            {refLabel ? <Text style={styles.successRef}>Номер записи: {refLabel}</Text> : null}
            <Text style={styles.successSub}>Мастер подтвердит запись</Text>
          </View>

          {det ? (
            <View style={styles.successDetailCard} accessibilityLabel="Детали записи">
              <Text style={styles.successDetailHeading}>Детали записи</Text>
              {det.detailRows.map((row, i) => (
                <View key={`sd-${row.label}-${i}`} style={styles.successKvRow}>
                  <Text style={styles.successKvLabel}>{row.label}</Text>
                  <Text style={styles.successKvValue}>{row.value}</Text>
                </View>
              ))}
              {det.priceRows.length > 0 ? (
                <>
                  <View style={styles.successPriceSep} />
                  {det.priceRows.map((row, i) => (
                    <View key={`sp-${row.label}-${i}`} style={styles.successKvRow}>
                      <Text
                        style={[
                          styles.successKvLabel,
                          row.label === 'К оплате' && styles.successKvLabelStrong,
                        ]}
                      >
                        {row.label}
                      </Text>
                      <Text
                        style={[
                          styles.successKvValue,
                          row.label === 'К оплате' && styles.successKvValueStrong,
                        ]}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity style={styles.calendarBtn} onPress={handleAddToCalendar}>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={styles.calendarBtnText}>Добавить в календарь</Text>
          </TouchableOpacity>
          {isAuthenticated && user && getGoToMyBookingsButton()}
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setSuccessBookingCal(null)}>
            <Text style={styles.secondaryBtnText}>Вернуться к записи</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const servicesEmpty = profile.services.length === 0;
  const dateOptionsEmpty = Boolean(!slotsLoading && selectedService && slots.length === 0);
  const slotsForDateEmpty = Boolean(
    selectedDate &&
      !slotsLoading &&
      slots.filter((s) => s.start_time.startsWith(selectedDate)).length === 0
  );

  const dateDisplayLabel =
    selectedDate != null
      ? dateOptions.find((d) => d.dateStr === selectedDate)?.displayLabel ?? formatDateForPicker(selectedDate)
      : '';

  const mainBookingSummaryRows: PublicBookingConfirmSummaryRow[] =
    selectedService && selectedDate && selectedSlot
      ? [
          { label: 'Услуга', value: selectedService.name },
          { label: 'Дата', value: dateDisplayLabel },
          {
            label: 'Время',
            value: formatTimeRange(selectedSlot.start_time, selectedSlot.end_time),
          },
        ]
      : [];

  const confirmationSummaryRows: PublicBookingConfirmSummaryRow[] =
    selectedService && selectedDate && selectedSlot
      ? [
          { label: 'Мастер', value: profile.master_name },
          {
            label: 'Услуга',
            value: `${selectedService.name} — ${selectedService.price} ₽, ${selectedService.duration} мин`,
          },
          { label: 'Дата', value: dateDisplayLabel },
          {
            label: 'Время',
            value: formatTimeRange(selectedSlot.start_time, selectedSlot.end_time),
          },
        ]
      : [];

  const confirmationPriceRows: PublicBookingConfirmSummaryRow[] =
    pricePreview && pricePreview.final_price != null ? previewLikeToPriceRows(pricePreview) : [];

  const svcDisc = selectedService ? getServiceDiscountBadge(profile, selectedService.id) : null;
  const serviceRowDiscountBadge = svcDisc?.label ?? null;

  const pointsLine =
    isAuthenticated && eligibility?.points != null && eligibility.points > 0
      ? `Доступно баллов: ${eligibility.points}`
      : null;

  const diagEl =
    __DEV__ && (env.DEBUG_HTTP || env.DEBUG_LOGS) && (diagResult || profileLoadResult) ? (
      <View style={styles.diagBlock}>
        <Text style={styles.diagTitle}>[NET_DIAG]</Text>
        {diagResult && (
          <>
            <Text style={styles.diagLine}>API_URL: {diagResult.apiUrl}</Text>
            <Text style={styles.diagLine}>baseURL: {diagResult.baseURL}</Text>
            <Text style={styles.diagLine}>
              health: {diagResult.health.ok ? 'OK' : 'FAIL'} {diagResult.health.ms}ms
              {diagResult.health.status != null ? ` (${diagResult.health.status})` : ''}
            </Text>
          </>
        )}
        {profileLoadResult && (
          <Text style={styles.diagLine}>
            getPublicMaster: {profileLoadResult.ok ? 'OK' : 'FAIL'} {profileLoadResult.ms}ms
            {profileLoadResult.code != null ? ` code=${profileLoadResult.code}` : ''}
          </Text>
        )}
      </View>
    ) : null;

  const nativeVariant = getBookingNativeVariant();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6f4' }} edges={['top']}>
      <MasterPublicBookingPresentational
        insets={insets}
        onBack={handleBack}
        navRightMode={navRightMode}
        onNavRightPress={handleNavRightPress}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        diagBlock={diagEl}
        profile={profile}
        avatarUri={avatarUri}
        masterTimezoneLine={masterTimezoneLine}
        discountPreface={discountPreface}
        discountAppliedExplain={discountAppliedExplain}
        bookingBlocked={Boolean(profile.booking_blocked || eligibility?.booking_blocked)}
        advancePayment={Boolean(profile.requires_advance_payment || eligibility?.requires_advance_payment)}
        pointsLine={pointsLine}
        clientNote={clientNote}
        isAuthenticated={isAuthenticated}
        onOpenClientNote={() => setShowNoteModal(true)}
        servicesEmpty={servicesEmpty}
        selectedService={selectedService}
        serviceRowDiscountBadge={serviceRowDiscountBadge}
        onOpenServicePicker={() => setShowServicePicker(true)}
        canSelectDate={canSelectDate}
        dateOptionsEmpty={dateOptionsEmpty}
        selectedDate={selectedDate}
        dateDisplayLabel={dateDisplayLabel}
        onOpenDatePicker={() => setShowDatePicker(true)}
        slotsForDateEmpty={slotsForDateEmpty}
        slots={slots}
        slotsLoading={slotsLoading}
        selectedSlot={selectedSlot}
        onSelectSlot={setSelectedSlot}
        slotHhBadgeForSlot={slotHhBadgeForSlot}
        mainBookingSummaryRows={mainBookingSummaryRows}
        mainBookingPriceRows={confirmationPriceRows}
        canSubmit={canSubmit}
        submitting={submitting}
        ctaBlocked={Boolean(profile.booking_blocked || eligibility?.booking_blocked)}
        ctaLabel={
          profile.booking_blocked || eligibility?.booking_blocked ? 'Запись недоступна' : 'Записаться'
        }
        onPrimaryCtaPress={handlePrimaryBookingPress}
        guestAuthSheet={{
          visible: showAuthPrompt,
          summaryRows: confirmationSummaryRows,
          priceRows: confirmationPriceRows,
          onClose: () => setShowAuthPrompt(false),
          onLogin: () => {
            setShowAuthPrompt(false);
            router.replace('/login');
          },
          onRegister: () => {
            setShowAuthPrompt(false);
            router.replace('/login?tab=register&role=client' as any);
          },
        }}
      />

      <ServicePicker
        visible={showServicePicker}
        onClose={() => setShowServicePicker(false)}
        services={profile.services}
        selectedService={selectedService}
        onSelect={handleSelectService}
        nativeVariant={nativeVariant}
        discountForService={(s) => getServiceDiscountBadge(profile, s.id)?.label ?? null}
      />

      <DatePicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        dates={dateOptions}
        selectedDate={selectedDate}
        onSelect={handleSelectDate}
        loading={slotsLoading}
        error={slotsError}
        onRetry={loadAvailability}
        nativeVariant={nativeVariant}
      />

      <Modal visible={showNoteModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNoteModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ваша заметка</Text>
            <Text style={styles.modalBody}>{clientNote || '—'}</Text>
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Text style={styles.modalClose}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F7F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingTop: 8, paddingBottom: 12 },
  header: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 8 },
  loadingText: { marginTop: 12, color: '#666' },
  skeletonCard: {
    marginTop: 24,
    marginHorizontal: 24,
    padding: 20,
    backgroundColor: '#eee',
    borderRadius: 12,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: '#ddd',
    borderRadius: 4,
  },
  emptyState: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  summary: {
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#2e7d32',
    marginBottom: 4,
    lineHeight: 20,
  },
  errorText: { color: '#c00', fontSize: 16 },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backButton: {
    backgroundColor: '#666',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'center',
  },
  backButtonText: { color: '#fff', fontSize: 16 },
  diagBlock: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    maxWidth: '100%',
  },
  diagTitle: { fontSize: 10, fontWeight: '700', color: '#333', marginBottom: 4 },
  diagLine: { fontSize: 10, color: '#555', marginTop: 2 },
  profileCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headerMain: { flex: 1, minWidth: 0 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f2f2f2' },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  masterName: { fontSize: 18, fontWeight: '600', color: '#333', flexShrink: 1 },
  tzBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tzBadgeText: { fontSize: 11, color: '#4CAF50', fontWeight: '600' },
  description: { marginTop: 4, fontSize: 14, color: '#666' },
  city: { marginTop: 4, fontSize: 12, color: '#888' },
  address: { marginTop: 1, fontSize: 12, color: '#888' },
  addressDetail: { fontSize: 11, color: '#666', flexShrink: 1, marginTop: 2, lineHeight: 15 },
  contactsCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactText: { fontSize: 14, color: '#666', flexShrink: 1, lineHeight: 20 },
  contactLink: { color: '#4CAF50', fontWeight: '600' },
  mapsBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  mapsBtnText: { fontSize: 13, fontWeight: '600', color: '#2f7d32' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  noteLabel: { fontSize: 14, color: '#666' },
  warning: { backgroundColor: '#fff3e0', marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 10 },
  warningText: { color: '#e65100', fontSize: 14 },
  info: { backgroundColor: '#e3f2fd', marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 10 },
  infoText: { color: '#1565c0', fontSize: 14, lineHeight: 20 },
  points: { backgroundColor: '#e8f5e9', marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 10 },
  pointsText: { color: '#4CAF50', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginHorizontal: 16, marginBottom: 8, marginTop: 12 },
  stepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  stepButtonDisabled: {
    backgroundColor: '#f5f5f5',
    opacity: 0.8,
  },
  stepButtonText: { fontSize: 15, fontWeight: '500', color: '#333', flex: 1, marginRight: 8 },
  stepButtonPlaceholder: { fontSize: 15, color: '#999', flex: 1, marginRight: 8 },
  stepButtonPlaceholderDisabled: { color: '#bbb' },
  cta: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bottomPad: { height: 40 },
  successScroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  successHeader: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  successDetailCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  successDetailHeading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  successKvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  successKvLabel: {
    fontSize: 14,
    color: '#666',
    flexShrink: 0,
    maxWidth: '44%',
  },
  successKvValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    textAlign: 'right',
    flexWrap: 'wrap',
  },
  successKvLabelStrong: { fontWeight: '700', color: '#222' },
  successKvValueStrong: { fontWeight: '700', color: '#222' },
  successPriceSep: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  successTitle: { fontSize: 22, fontWeight: '600', color: '#333', marginTop: 16 },
  successRef: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 10 },
  successSub: { fontSize: 15, color: '#666', marginTop: 8 },
  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  calendarBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { marginTop: 12 },
  secondaryBtnText: { color: '#4CAF50', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 },
  modalBody: { fontSize: 15, color: '#666', marginBottom: 16 },
  modalClose: { color: '#4CAF50', fontSize: 14 },
});
