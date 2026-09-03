import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { DemoAccessBanner } from '@src/components/DemoAccessBanner';
import { useFeatureAccess } from '@src/hooks/useFeatureAccess';
import { clientsDemo } from '@src/shared/demo';
import { MasterClientCampaignTab } from '@src/components/master/MasterClientCampaignTab';
import {
  getMasterClients,
  getMasterClientDetail,
  updateMasterClientMetadata,
  addClientRestriction,
  removeClientRestriction,
  createPersonalDiscount,
  type MasterClientListItem,
  type MasterClientDetail,
} from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';
import { semanticColors } from 'shared/theme/semanticColors';

const CLIENTS_SORT_STORAGE_KEY = 'clients_sort_option';

const SORT_OPTIONS = [
  { key: 'last_visit_at_desc', label: 'По дате визита (сначала новые)', sort_by: 'last_visit_at', sort_dir: 'desc' as const },
  { key: 'last_visit_at_asc', label: 'По дате визита (сначала старые)', sort_by: 'last_visit_at', sort_dir: 'asc' as const },
  { key: 'total_revenue_desc', label: 'По доходу (по убыванию)', sort_by: 'total_revenue', sort_dir: 'desc' as const },
  { key: 'total_revenue_asc', label: 'По доходу (по возрастанию)', sort_by: 'total_revenue', sort_dir: 'asc' as const },
  { key: 'completed_count_desc', label: 'По визитам (по убыванию)', sort_by: 'completed_count', sort_dir: 'desc' as const },
  { key: 'completed_count_asc', label: 'По визитам (по возрастанию)', sort_by: 'completed_count', sort_dir: 'asc' as const },
] as const;

const DEFAULT_SORT = SORT_OPTIONS[0];

function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ru-RU');
  } catch {
    return '—';
  }
}

export default function ClientsScreen() {
  const { allowed: hasClientsAccess, cheapestPlanName } = useFeatureAccess('has_clients_access');
  const [clients, setClients] = useState<MasterClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState<typeof SORT_OPTIONS[number]>(DEFAULT_SORT);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteModalText, setNoteModalText] = useState('');
  const [noteModalLoading, setNoteModalLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<MasterClientListItem | null>(null);
  const [detail, setDetail] = useState<MasterClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCancellations, setShowCancellations] = useState(false);
  const [showAddRestriction, setShowAddRestriction] = useState(false);
  const [showAddDiscount, setShowAddDiscount] = useState(false);
  const [editAlias, setEditAlias] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('10');
  const [clientsTab, setClientsTab] = useState<'base' | 'campaigns'>('base');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CLIENTS_SORT_STORAGE_KEY);
        if (cancelled) return;
        const found = SORT_OPTIONS.find((o) => o.key === stored);
        if (found) setSortOption(found);
      } catch {
        // use default
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadClients = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!hasClientsAccess) return;
    const pull = opts?.refresh === true;
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const q = search.trim() || undefined;
      const data = await getMasterClients({
        q,
        sort_by: sortOption.sort_by,
        sort_dir: sortOption.sort_dir,
      });
      setClients(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Ошибка загрузки');
      setClients([]);
    } finally {
      if (pull) setRefreshing(false);
      else setLoading(false);
    }
  }, [search, sortOption, hasClientsAccess]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleShowNote = useCallback(async (clientKey: string) => {
    setShowNoteModal(true);
    setNoteModalText('');
    setNoteModalLoading(true);
    try {
      const d = await getMasterClientDetail(clientKey);
      setNoteModalText(d.note || '');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось загрузить заметку');
      setNoteModalText('');
    } finally {
      setNoteModalLoading(false);
    }
  }, []);

  const handleSelectSort = useCallback(async (option: typeof SORT_OPTIONS[number]) => {
    setSortOption(option);
    setShowSortModal(false);
    try {
      await AsyncStorage.setItem(CLIENTS_SORT_STORAGE_KEY, option.key);
    } catch {
      // ignore
    }
  }, []);

  const openClient = useCallback(async (client: MasterClientListItem) => {
    setSelectedClient(client);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getMasterClientDetail(client.client_key);
      setDetail(d);
      setEditAlias(d.master_client_name ?? '');
      setEditNote(d.note ?? '');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSaveMetadata = async () => {
    if (!selectedClient) return;
    setSaving(true);
    try {
      await updateMasterClientMetadata(selectedClient.client_key, {
        alias_name: editAlias.trim() || null,
        note: editNote.length > 280 ? editNote.slice(0, 280) : (editNote.trim() || null),
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              master_client_name: editAlias.trim() || null,
              note: editNote.slice(0, 280).trim() || null,
              has_note: !!editNote.trim(),
            }
          : null
      );
      loadClients();
      setSelectedClient(null);
      setTimeout(() => {
        Alert.alert('Сохранено', 'Имя и заметка обновлены.');
      }, 300);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRestriction = async (type: 'blacklist' | 'advance_payment_only') => {
    if (!selectedClient) return;
    try {
      await addClientRestriction(selectedClient.client_key, { restriction_type: type });
      const d = await getMasterClientDetail(selectedClient.client_key);
      setDetail(d);
      setShowAddRestriction(false);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось добавить');
    }
  };

  const handleRemoveRestriction = async (restrictionId: number) => {
    if (!selectedClient) return;
    try {
      await removeClientRestriction(selectedClient.client_key, restrictionId);
      const d = await getMasterClientDetail(selectedClient.client_key);
      setDetail(d);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось удалить');
    }
  };

  const handleAddPersonalDiscount = async () => {
    if (!detail?.client_phone) return;
    const pct = parseFloat(discountPercent);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      Alert.alert('Ошибка', 'Введите процент 1–100');
      return;
    }
    try {
      await createPersonalDiscount({
        client_phone: detail.client_phone,
        discount_percent: pct,
        description: 'Персональная скидка',
      });
      const d = await getMasterClientDetail(selectedClient!.client_key);
      setDetail(d);
      setShowAddDiscount(false);
      setDiscountPercent('10');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось добавить');
    }
  };

  const displayName = (c: MasterClientListItem) =>
    c.master_client_name || c.client_phone || '—';

  if (!hasClientsAccess) {
    const demoDescription = cheapestPlanName
      ? `Раздел «Клиенты» доступен в тарифе ${cheapestPlanName}.`
      : 'Раздел «Клиенты» доступен в подписке.';
    return (
      <ScreenContainer scrollable={false}>
        <DemoAccessBanner
          description={demoDescription}
          ctaText="Перейти к тарифам"
          onCtaPress={() => router.push('/subscriptions')}
        />
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={styles.title}>Клиенты</Text>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Демо</Text>
          </View>
        </View>
        <FlatList
          data={clientsDemo}
          keyExtractor={(item) => item.client_key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Card style={styles.clientCard}>
              <View style={styles.clientRow}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {item.master_client_name || item.client_phone || '—'}
                  </Text>
                  <Text style={styles.clientMeta}>
                    {item.completed_count} визитов • {formatMoney(item.total_revenue)} • {formatDate(item.last_visit_at)}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Клиенты</Text>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tabBtn, clientsTab === 'base' && styles.tabBtnActive]}
            onPress={() => setClientsTab('base')}
          >
            <Text style={[styles.tabText, clientsTab === 'base' && styles.tabTextActive]}>База клиентов</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, clientsTab === 'campaigns' && styles.tabBtnActive]}
            onPress={() => setClientsTab('campaigns')}
          >
            <Text style={[styles.tabText, clientsTab === 'campaigns' && styles.tabTextActive]}>Рассылки</Text>
          </TouchableOpacity>
        </View>
        {clientsTab === 'base' && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по телефону или имени..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={semanticColors.text.placeholder}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={loadClients}>
            <Ionicons name="search" size={20} color={semanticColors.text.onPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setShowSortModal(true)}
            accessibilityLabel="Сортировка"
          >
            <Ionicons name="swap-vertical" size={22} color={semanticColors.action.primary} />
          </TouchableOpacity>
        </View>
        )}
      </View>

      {clientsTab === 'campaigns' ? (
        <MasterClientCampaignTab />
      ) : (
        <>

      {/* Модалка сортировки */}
      <Modal
        visible={showSortModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSortModal(false)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.sheetContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Сортировка</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sheetOption, styles.sheetOptionRow, sortOption.key === opt.key && styles.sheetOptionSelected]}
                onPress={() => handleSelectSort(opt)}
              >
                <Text style={[styles.sheetOptionText, sortOption.key === opt.key && styles.sheetOptionTextSelected]}>
                  {opt.label}
                </Text>
                {sortOption.key === opt.key && (
                  <Ionicons name="checkmark" size={20} color={semanticColors.action.primary} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowSortModal(false)}>
              <Text style={styles.cancelLink}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Модалка заметки */}
      <Modal
        visible={showNoteModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNoteModal(false)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowNoteModal(false)}>
          <View style={styles.sheetContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Заметка клиента</Text>
            {noteModalLoading ? (
              <ActivityIndicator size="small" color={semanticColors.action.primary} style={{ marginVertical: 16 }} />
            ) : (
              <Text style={styles.noteModalText}>{noteModalText || '—'}</Text>
            )}
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Text style={styles.cancelLink}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={semanticColors.action.primary} />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      ) : clients.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Нет клиентов с завершёнными визитами</Text>
        </View>
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(item) => item.client_key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadClients({ refresh: true })} />
          }
          renderItem={({ item }) => (
            <Card style={styles.clientCard}>
              <View style={styles.clientRow}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {displayName(item)}
                  </Text>
                  <Text style={styles.clientMeta}>
                    {item.completed_count} визитов • {formatMoney(item.total_revenue)} • {formatDate(item.last_visit_at)}
                  </Text>
                </View>
                <View style={styles.clientActions}>
                  {item.has_note ? (
                    <TouchableOpacity
                      style={styles.noteBadge}
                      onPress={() => handleShowNote(item.client_key)}
                      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                      accessibilityLabel="Просмотреть заметку"
                      accessibilityRole="button"
                    >
                      <Ionicons name="information-circle-outline" size={19} color={semanticColors.action.primary} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.openCardBtn}
                    onPress={() => openClient(item)}
                    hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                    accessibilityLabel="Открыть карточку клиента"
                    accessibilityRole="button"
                  >
                    <Ionicons name="id-card-outline" size={20} color={semanticColors.text.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          )}
        />
      )}

      {/* Карточка клиента */}
      <Modal
        visible={!!selectedClient}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedClient(null)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {detail ? displayName(detail) : 'Клиент'}
              </Text>
              <TouchableOpacity onPress={() => setSelectedClient(null)}>
                <Ionicons name="close" size={28} color={semanticColors.text.primary} />
              </TouchableOpacity>
            </View>
            {detailLoading ? (
              <ActivityIndicator size="large" color={semanticColors.action.primary} style={{ marginVertical: 40 }} />
            ) : detail ? (
              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{detail.completed_count}</Text>
                    <Text style={styles.metricLabel}>Визитов</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.metric}
                    onPress={() => setShowCancellations(!showCancellations)}
                  >
                    <Text style={styles.metricValue}>{detail.cancelled_count}</Text>
                    <Text style={styles.metricLabel}>Отмен</Text>
                  </TouchableOpacity>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{formatMoney(detail.total_revenue)}</Text>
                    <Text style={styles.metricLabel}>Доход</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{formatDate(detail.last_visit_at)}</Text>
                    <Text style={styles.metricLabel}>Последний визит</Text>
                  </View>
                </View>
                {showCancellations && detail.cancellations_breakdown?.length > 0 && (
                  <View style={styles.breakdown}>
                    <Text style={styles.breakdownTitle}>Причины отмен</Text>
                    {detail.cancellations_breakdown.map((cb, i) => (
                      <Text key={i} style={styles.breakdownRow}>
                        {cb.reason_label}: {cb.count}
                      </Text>
                    ))}
                  </View>
                )}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Имя для мастера</Text>
                  <TextInput
                    style={styles.input}
                    value={editAlias}
                    onChangeText={setEditAlias}
                    placeholder="Как вы зовёте клиента"
                    placeholderTextColor={semanticColors.text.placeholder}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Заметка (макс. 280)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={editNote}
                    onChangeText={setEditNote}
                    maxLength={280}
                    multiline
                    placeholder="Заметка по клиенту"
                    placeholderTextColor={semanticColors.text.placeholder}
                  />
                  <Text style={styles.charCount}>{editNote.length}/280</Text>
                </View>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSaveMetadata}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? 'Сохранение...' : 'Сохранить'}</Text>
                </TouchableOpacity>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Скидки</Text>
                  {detail.applicable_discounts?.length > 0 ? (
                    detail.applicable_discounts.map((d, i) => (
                      <Text key={i} style={styles.discountRow}>
                        {d.name} — {d.discount_percent}%
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.emptySection}>У клиента нет скидок</Text>
                  )}
                  <TouchableOpacity onPress={() => setShowAddDiscount(true)}>
                    <Text style={styles.addLink}>+ Добавить персональную скидку</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Ограничения</Text>
                  {detail.restrictions?.length > 0 ? (
                    detail.restrictions.map((r) => (
                      <View key={r.id} style={styles.restrictionRow}>
                        <Text style={styles.restrictionText}>
                          {r.type === 'blacklist' ? 'Черный список' : 'Предоплата'}
                          {r.reason ? `: ${r.reason}` : ''}
                        </Text>
                        <TouchableOpacity onPress={() => handleRemoveRestriction(r.id)}>
                          <Text style={styles.removeLink}>Удалить</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptySection}>Ограничений нет</Text>
                  )}
                  <TouchableOpacity onPress={() => setShowAddRestriction(true)}>
                    <Text style={styles.addLink}>+ Добавить ограничение</Text>
                  </TouchableOpacity>
                </View>
                {detail.top_services?.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Популярные услуги</Text>
                    {detail.top_services.map((s, i) => (
                      <Text key={i} style={styles.serviceRow}>
                        {s.service_name} — {s.count} раз
                      </Text>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Модалка добавления ограничения */}
      <Modal
        visible={showAddRestriction}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAddRestriction(false)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowAddRestriction(false)}>
          <View style={styles.sheetContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Добавить ограничение</Text>
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => handleAddRestriction('blacklist')}
            >
              <Text>Черный список</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => handleAddRestriction('advance_payment_only')}
            >
              <Text>Только предоплата</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddRestriction(false)}>
              <Text style={styles.cancelLink}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Модалка добавления скидки */}
      <Modal
        visible={showAddDiscount}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAddDiscount(false)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowAddDiscount(false)}>
          <View style={styles.sheetContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Добавить персональную скидку</Text>
            {detail?.client_phone && (
              <Text style={styles.discountClient}>Клиент: {detail.client_phone}</Text>
            )}
            <Text style={styles.fieldLabel}>Процент скидки</Text>
            <TextInput
              style={styles.input}
              value={discountPercent}
              onChangeText={setDiscountPercent}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={semanticColors.text.placeholder}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleAddPersonalDiscount}>
                <Text style={styles.primaryBtnText}>Добавить</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddDiscount(false)}>
                <Text style={styles.cancelLink}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockCard: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
  },
  lockIcon: { marginBottom: 12 },
  lockTitle: { fontSize: 20, fontWeight: '700', color: semanticColors.text.primary, marginBottom: 8 },
  lockText: { fontSize: 15, color: '#92400E', textAlign: 'center', marginBottom: 20 },
  lockCta: { alignSelf: 'stretch' },
  demoBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  demoBadgeText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: semanticColors.text.primary },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: semanticColors.surface.subtle,
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: semanticColors.surface.card,
  },
  tabText: {
    fontSize: 13,
    color: semanticColors.text.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: semanticColors.text.primary,
    fontWeight: '600',
  },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: semanticColors.text.primary,
  },
  searchBtn: {
    backgroundColor: semanticColors.action.primary,
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    backgroundColor: semanticColors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetOptionSelected: {
    backgroundColor: semanticColors.surface.highlight,
    borderColor: semanticColors.action.primary,
  },
  sheetOptionText: { fontSize: 15, color: semanticColors.text.primary, flex: 1 },
  sheetOptionTextSelected: { fontWeight: '600', color: semanticColors.text.primary },
  noteModalText: { fontSize: 15, color: semanticColors.text.primary, marginBottom: 16, lineHeight: 22 },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    backgroundColor: semanticColors.feedback.errorBg,
    borderRadius: 8,
  },
  errorText: { color: semanticColors.feedback.errorFg, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: semanticColors.text.muted, fontSize: 14 },
  emptyText: { color: semanticColors.text.muted, fontSize: 14, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  clientCard: { marginBottom: 12 },
  clientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientInfo: { flex: 1, marginRight: 8, minWidth: 0 },
  clientName: { fontSize: 16, fontWeight: '600', color: semanticColors.text.primary },
  clientMeta: { fontSize: 13, color: semanticColors.text.muted, marginTop: 4 },
  clientActions: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  noteBadge: {
    width: 32,
    height: 30,
    borderRadius: 7,
    backgroundColor: semanticColors.finance.incomeChipBg,
    borderWidth: 1,
    borderColor: semanticColors.border.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openCardBtn: {
    width: 32,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface.subtle,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: semanticColors.surface.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: semanticColors.border.muted,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: semanticColors.text.primary },
  modalScroll: { padding: 20 },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  metric: { alignItems: 'center' },
  metricValue: { fontSize: 16, fontWeight: '700', color: semanticColors.text.primary },
  metricLabel: { fontSize: 12, color: semanticColors.text.muted, marginTop: 4 },
  breakdown: { backgroundColor: semanticColors.surface.muted, padding: 14, borderRadius: 10, marginBottom: 16 },
  breakdownTitle: { fontWeight: '600', marginBottom: 8 },
  breakdownRow: { fontSize: 14, color: semanticColors.text.primary, marginBottom: 4 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: semanticColors.text.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: semanticColors.text.primary,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: semanticColors.text.placeholder, marginTop: 4 },
  saveBtn: {
    backgroundColor: semanticColors.action.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: semanticColors.text.onPrimary, fontWeight: '600', fontSize: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: semanticColors.text.primary, marginBottom: 10 },
  emptySection: { fontSize: 14, color: semanticColors.text.muted, marginBottom: 8 },
  discountRow: { fontSize: 14, color: semanticColors.text.primary, marginBottom: 4 },
  addLink: { fontSize: 14, color: semanticColors.action.primary, marginTop: 6 },
  restrictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  restrictionText: { fontSize: 14, color: semanticColors.text.primary, flex: 1 },
  removeLink: { fontSize: 14, color: semanticColors.status.error },
  serviceRow: { fontSize: 14, color: semanticColors.text.primary, marginBottom: 4 },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: semanticColors.text.primary, marginBottom: 16 },
  sheetOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    borderRadius: 10,
    marginBottom: 8,
  },
  cancelLink: { fontSize: 14, color: semanticColors.text.muted, marginTop: 16, textAlign: 'center' },
  discountClient: { fontSize: 14, color: semanticColors.text.muted, marginBottom: 12 },
  sheetActions: { marginTop: 16, gap: 12 },
  primaryBtn: {
    backgroundColor: semanticColors.action.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: semanticColors.text.onPrimary, fontWeight: '600', fontSize: 16 },
});
