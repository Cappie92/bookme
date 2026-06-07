import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  getPublicMaster,
  getPublicMasterAvailability,
  type PublicMasterProfile,
} from '@src/services/api/publicMasters';
import {
  FREE_SLOTS_DAYS_AHEAD,
  addDaysYmd,
  buildFreeSlotsShareMessage,
  buildWholeHourLabels,
  enumerateDaysInclusive,
  firstDateWithWholeCardHours,
  formatCardDateRu,
  localTodayYmd,
  pickReferenceServiceId,
  shortBookingPath,
} from '@src/utils/freeSlotsShare';
import {
  FreeSlotsShareCardImage,
  FREE_SLOTS_CARD_HEIGHT,
  FREE_SLOTS_CARD_WIDTH,
} from '@src/components/freeSlots/FreeSlotsShareCardImage';
import {
  captureFreeSlotsCardPng,
  saveImageToGallery,
  shareImageViaSheet,
  shareToInstagramStory,
  shareToTelegramStory,
  showShareError,
} from '@src/utils/freeSlotsShareImage';

type PeriodKey = 'today' | 'tomorrow' | 'week';

interface FreeSlotsShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  slug: string;
  bookingUrl: string;
  masterNameFallback?: string;
}

export function FreeSlotsShareCardModal({
  visible,
  onClose,
  slug,
  bookingUrl,
  masterNameFallback = '',
}: FreeSlotsShareCardModalProps) {
  const { width: screenWidth } = useWindowDimensions();
  const previewWidth = Math.max(240, Math.min(screenWidth - 56, 360));
  const cardCaptureRef = useRef<View>(null);
  const [loading, setLoading] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicMasterProfile | null>(null);
  const [slots, setSlots] = useState<{ start_time: string; end_time: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('today');

  const fromStr = localTodayYmd();
  const toStr = addDaysYmd(fromStr, FREE_SLOTS_DAYS_AHEAD - 1);
  const dayList = useMemo(() => enumerateDaysInclusive(fromStr, toStr), [fromStr, toStr]);

  const loadData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const prof = await getPublicMaster(slug);
      const serviceId = pickReferenceServiceId(prof.services);
      if (!serviceId) {
        setProfile(prof);
        setSlots([]);
        setError('Добавьте хотя бы одну услугу, чтобы показать свободные слоты');
        return;
      }
      const avail = await getPublicMasterAvailability(slug, serviceId, fromStr, toStr);
      setProfile(prof);
      setSlots(avail.slots);
      const first = firstDateWithWholeCardHours(avail.slots, fromStr, toStr, prof.master_timezone);
      setSelectedDate(first || fromStr);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить слоты';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slug, fromStr, toStr]);

  useEffect(() => {
    if (visible && slug) {
      void loadData();
    } else if (!visible) {
      setProfile(null);
      setSlots([]);
      setSelectedDate(null);
      setError(null);
      setPeriod('today');
      setImageBusy(false);
    }
  }, [visible, slug, loadData]);

  const masterTimezone = profile?.master_timezone || 'Europe/Moscow';
  const masterName = profile?.master_name?.trim() || masterNameFallback || 'Мастер';

  const hourLabels = useMemo(
    () => (selectedDate ? buildWholeHourLabels(slots, selectedDate, masterTimezone) : []),
    [slots, selectedDate, masterTimezone]
  );

  const dateLabel = selectedDate ? formatCardDateRu(selectedDate) : '';

  const shareMessage = useMemo(
    () =>
      buildFreeSlotsShareMessage({
        masterName,
        dateLabel,
        hourLabels,
        bookingUrl,
      }),
    [masterName, dateLabel, hourLabels, bookingUrl]
  );

  const shortLink = useMemo(() => shortBookingPath(bookingUrl), [bookingUrl]);

  const cardImageProps = useMemo(
    () => ({
      masterName,
      dateLabel,
      hourLabels,
      shortLink,
      avatarUrl: profile?.avatar_url ?? null,
    }),
    [masterName, dateLabel, hourLabels, shortLink, profile?.avatar_url]
  );

  const applyPeriod = (key: PeriodKey) => {
    setPeriod(key);
    if (key === 'today') {
      setSelectedDate(fromStr);
      return;
    }
    if (key === 'tomorrow') {
      setSelectedDate(addDaysYmd(fromStr, 1));
      return;
    }
    const weekEnd = addDaysYmd(fromStr, 6);
    const first = firstDateWithWholeCardHours(slots, fromStr, weekEnd, masterTimezone);
    setSelectedDate(first || fromStr);
  };

  const withCardImage = async (
    action: (fileUri: string) => Promise<void>,
    busyLabel = 'Подготовка изображения…'
  ) => {
    if (imageBusy) return;
    setImageBusy(true);
    try {
      const uri = await captureFreeSlotsCardPng(cardCaptureRef);
      await action(uri);
    } catch (e) {
      showShareError(e, busyLabel);
    } finally {
      setImageBusy(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch {
      Alert.alert('Ошибка', 'Не удалось открыть меню «Поделиться»');
    }
  };

  const handleShareImage = () => {
    void withCardImage((uri) => shareImageViaSheet(uri, 'Поделиться карточкой'));
  };

  const handleSaveImage = () => {
    void withCardImage(async (uri) => {
      await saveImageToGallery(uri);
      Alert.alert('Готово', 'Карточка сохранена');
    });
  };

  const handleTelegram = () => {
    void withCardImage(async (uri) => {
      await shareToTelegramStory(uri);
    });
  };

  const handleInstagram = () => {
    void withCardImage(async (uri) => {
      const mode = await shareToInstagramStory(uri);
      if (mode === 'sheet') {
        /* share sheet уже открыт */
      }
    });
  };

  const handleCopyText = async () => {
    try {
      await Clipboard.setStringAsync(shareMessage);
      Alert.alert('Готово', 'Текст карточки скопирован');
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать текст');
    }
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(bookingUrl);
      Alert.alert('Готово', 'Ссылка скопирована');
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать ссылку');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Карточка со свободными слотами</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadData()}>
                <Text style={styles.retryBtnText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={styles.periodLabel}>Период</Text>
              <View style={styles.periodRow}>
                {(
                  [
                    ['today', 'Сегодня'],
                    ['tomorrow', 'Завтра'],
                    ['week', 'Неделя'],
                  ] as const
                ).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.periodChip, period === key && styles.periodChipActive]}
                    onPress={() => applyPeriod(key)}
                  >
                    <Text style={[styles.periodChipText, period === key && styles.periodChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.periodLabel}>День</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
                {dayList.map((d) => {
                  const active = d === selectedDate;
                  const hasHours = buildWholeHourLabels(slots, d, masterTimezone).length > 0;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.dayChip,
                        active && styles.dayChipActive,
                        !hasHours && styles.dayChipMuted,
                      ]}
                      onPress={() => setSelectedDate(d)}
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                        {d.slice(8, 10)}.{d.slice(5, 7)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.previewCaption}>Превью</Text>
              <View style={styles.previewFrame}>
                <FreeSlotsShareCardImage
                  layoutMode="preview"
                  previewWidth={previewWidth}
                  {...cardImageProps}
                />
              </View>

              {imageBusy ? (
                <View style={styles.imageBusyRow}>
                  <ActivityIndicator size="small" color="#4CAF50" />
                  <Text style={styles.imageBusyText}>Готовим изображение…</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => void handleShare()}
                disabled={imageBusy}
              >
                <Ionicons name="share-outline" size={22} color="#fff" />
                <Text style={styles.actionBtnText}>Поделиться (текст)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void handleShareImage()}
                disabled={imageBusy}
              >
                <Ionicons name="image-outline" size={22} color="#2e7d32" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
                  Поделиться изображением
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void handleCopyText()}
                disabled={imageBusy}
              >
                <Ionicons name="document-text-outline" size={22} color="#2e7d32" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Скопировать текст</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void handleCopyLink()}
                disabled={imageBusy}
              >
                <Ionicons name="link-outline" size={22} color="#2e7d32" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Скопировать ссылку</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void handleSaveImage()}
                disabled={imageBusy}
              >
                <Ionicons name="download-outline" size={22} color="#2e7d32" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Сохранить изображение</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void handleTelegram()}
                disabled={imageBusy}
              >
                <Ionicons name="paper-plane-outline" size={22} color="#2e7d32" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Поделиться в Telegram</Text>
              </TouchableOpacity>
              <Text style={styles.actionHelper}>Для истории выберите Telegram → История</Text>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void handleInstagram()}
                disabled={imageBusy}
              >
                <Ionicons name="logo-instagram" size={22} color="#2e7d32" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Поделиться в Instagram</Text>
              </TouchableOpacity>
              <Text style={styles.actionHelper}>Для истории выберите Instagram → История</Text>
            </ScrollView>
          )}

          {/* Capture-слой отдельно от preview: full 1080×1920 offscreen для ViewShot */}
          {!loading && !error ? (
            <View
              style={styles.offscreenCapture}
              collapsable={false}
              pointerEvents="none"
              accessibilityElementsHidden
            >
              <FreeSlotsShareCardImage
                ref={cardCaptureRef}
                layoutMode="capture"
                {...cardImageProps}
              />
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  closeButton: { padding: 4 },
  centered: { padding: 32, alignItems: 'center' },
  errorText: { color: '#c62828', textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  content: { padding: 20, paddingBottom: 28 },
  periodLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  periodChipActive: { backgroundColor: '#4CAF50' },
  periodChipText: { fontSize: 14, color: '#333' },
  periodChipTextActive: { color: '#fff', fontWeight: '600' },
  daysScroll: { marginBottom: 16, maxHeight: 44 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  dayChipActive: { backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#4CAF50' },
  dayChipMuted: { opacity: 0.55 },
  dayChipText: { fontSize: 14, color: '#333' },
  dayChipTextActive: { fontWeight: '700', color: '#2e7d32' },
  previewCaption: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  previewFrame: {
    alignItems: 'center',
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    paddingVertical: 8,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  offscreenCapture: {
    position: 'absolute',
    left: -FREE_SLOTS_CARD_WIDTH - 100,
    top: 0,
    width: FREE_SLOTS_CARD_WIDTH,
    height: FREE_SLOTS_CARD_HEIGHT,
    opacity: 1,
    zIndex: -1,
  },
  imageBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  imageBusyText: { fontSize: 13, color: '#666' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  actionBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actionBtnTextSecondary: { color: '#2e7d32' },
  actionHelper: {
    fontSize: 12,
    color: '#888',
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
