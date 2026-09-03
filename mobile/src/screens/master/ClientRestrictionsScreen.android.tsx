import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useModalKeyboardHeight } from '@src/hooks/useModalKeyboardHeight';
import { useScrollBottomPadding } from '@src/hooks/useScrollBottomPadding';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SegmentedControl } from '@src/components/SegmentedControl';
import { useFeatureAccess } from '@src/hooks/useFeatureAccess';
import { DemoAccessBanner } from '@src/components/DemoAccessBanner';
import { rulesRestrictionsDemo, rulesAutoRulesDemo } from '@src/shared/demo';
import { router } from 'expo-router';

// LayoutAnimation experimental: на Android в New Architecture (Fabric) даёт шумный warning — включаем только в legacy.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  typeof (global as any).__turboModuleProxy === 'undefined'
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {
  getRestrictions,
  getRestrictionRules,
  createRestriction,
  updateRestriction,
  deleteRestriction,
  createRestrictionRule,
  updateRestrictionRule,
  deleteRestrictionRule,
  type ClientRestrictionItem,
  type ClientRestrictionRule,
  type ClientRestrictionsList,
} from '@src/services/api/master';

import { CANCELLATION_REASONS } from '@src/utils/bookingOutcome';
import { MasterClientPhonePickerField } from '@src/components/master/MasterClientPhonePickerField';
import { normalizeClientPhoneForApi } from '@src/utils/clientPhone';

const PERIOD_OPTIONS = [
  { value: 30, label: '30 дней' },
  { value: 60, label: '60 дней' },
  { value: 90, label: '90 дней' },
  { value: 180, label: '180 дней' },
  { value: 365, label: '365 дней' },
  { value: null, label: 'Все время' },
];

const WINDOW_HEIGHT = Dimensions.get('window').height;
const MODAL_SHEET_MAX_HEIGHT = Math.round(WINDOW_HEIGHT * 0.88);

function getCancelPeriodHelpText(periodDays: number | null): string {
  if (periodDays == null) {
    return 'Система учитывает все отмены клиента за всё время.';
  }
  return 'Система проверяет отмены клиента за выбранный период.';
}

function formatPhone(phone: string): string {
  if (phone.startsWith('+7') && phone.length >= 12) {
    return `+7 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8, 10)}-${phone.slice(10, 12)}`;
  }
  return phone;
}

export default function ClientRestrictionsScreen() {
  const insets = useSafeAreaInsets();
  const scrollPaddingBottom = useScrollBottomPadding(24);
  const modalFooterPaddingBottom = Math.max(insets.bottom, 8) + 8;

  const { allowed, reasonText, cheapestPlanName } = useFeatureAccess('has_client_restrictions');
  const [segmentIndex, setSegmentIndex] = useState<number>(0); // 0 = Ограничения, 1 = Автоправила
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [restrictions, setRestrictions] = useState<ClientRestrictionsList | null>(null);
  const [rules, setRules] = useState<ClientRestrictionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRestriction, setEditingRestriction] = useState<ClientRestrictionItem | null>(null);
  const [editingRule, setEditingRule] = useState<ClientRestrictionRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [restrictionForm, setRestrictionForm] = useState({
    client_phone: '',
    restriction_type: 'blacklist' as 'blacklist' | 'advance_payment_only',
    reason: '',
  });
  const [ruleForm, setRuleForm] = useState({
    cancellation_reason: 'client_no_show',
    cancel_count: 2,
    period_days: 30 as number | null,
    restriction_type: 'blacklist' as 'blacklist' | 'advance_payment_only',
  });

  const restrictionKeyboardHeight = useModalKeyboardHeight(showRestrictionModal);
  const ruleKeyboardHeight = useModalKeyboardHeight(showRuleModal);

  const restrictionSheetMaxHeight = useMemo(() => {
    if (restrictionKeyboardHeight <= 0) return MODAL_SHEET_MAX_HEIGHT;
    const capped = WINDOW_HEIGHT - restrictionKeyboardHeight - insets.top - 12;
    return Math.min(MODAL_SHEET_MAX_HEIGHT, Math.max(220, capped));
  }, [restrictionKeyboardHeight, insets.top]);

  const ruleSheetMaxHeight = useMemo(() => {
    if (ruleKeyboardHeight <= 0) return MODAL_SHEET_MAX_HEIGHT;
    const capped = WINDOW_HEIGHT - ruleKeyboardHeight - insets.top - 12;
    return Math.min(MODAL_SHEET_MAX_HEIGHT, Math.max(280, capped));
  }, [ruleKeyboardHeight, insets.top]);

  const loadData = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [rest, rul] = await Promise.all([getRestrictions(), getRestrictionRules()]);
      setRestrictions(rest);
      setRules(rul);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetRestrictionForm = () => {
    setRestrictionForm({ client_phone: '', restriction_type: 'blacklist', reason: '' });
    setEditingRestriction(null);
    setShowRestrictionModal(false);
  };

  const resetRuleForm = () => {
    setRuleForm({
      cancellation_reason: 'client_no_show',
      cancel_count: 2,
      period_days: 30,
      restriction_type: 'blacklist',
    });
    setEditingRule(null);
    setShowRuleModal(false);
  };

  const handleSaveRestriction = async () => {
    const normalizedPhone = normalizeClientPhoneForApi(restrictionForm.client_phone);
    if (!normalizedPhone) {
      Alert.alert('Ошибка', 'Введите корректный номер телефона');
      return;
    }
    const payload = {
      client_phone: normalizedPhone,
      restriction_type: restrictionForm.restriction_type,
      reason: restrictionForm.reason || undefined,
    };
    setSaving(true);
    try {
      if (editingRestriction) {
        await updateRestriction(editingRestriction.id, payload);
      } else {
        await createRestriction(payload);
      }
      resetRestrictionForm();
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || e?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRestriction = (r: ClientRestrictionItem) => {
    Alert.alert('Удалить ограничение?', `Телефон: ${formatPhone(r.client_phone)}`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRestriction(r.id);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось удалить');
          }
        },
      },
    ]);
  };

  const handleSaveRule = async () => {
    setSaving(true);
    try {
      const payload = {
        cancellation_reason: ruleForm.cancellation_reason,
        cancel_count: ruleForm.cancel_count,
        period_days: ruleForm.period_days,
        restriction_type: ruleForm.restriction_type,
      };
      if (editingRule) {
        await updateRestrictionRule(editingRule.id, payload);
      } else {
        await createRestrictionRule(payload);
      }
      resetRuleForm();
      loadData();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || e?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = (r: ClientRestrictionRule) => {
    Alert.alert('Удалить правило?', `${CANCELLATION_REASONS[r.cancellation_reason]} → ${r.restriction_type === 'blacklist' ? 'Черный список' : 'Предоплата'}`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRestrictionRule(r.id);
            loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось удалить');
          }
        },
      },
    ]);
  };

  const handleAdd = () => {
    if (segmentIndex === 0) {
      setEditingRestriction(null);
      setRestrictionForm({ client_phone: '', restriction_type: 'blacklist', reason: '' });
      setShowRestrictionModal(true);
    } else {
      setEditingRule(null);
      setRuleForm({ cancellation_reason: 'client_no_show', cancel_count: 2, period_days: 30, restriction_type: 'blacklist' });
      setShowRuleModal(true);
    }
  };

  if (!allowed) {
    const description = cheapestPlanName
      ? `Раздел «Правила» доступен в тарифе ${cheapestPlanName}.`
      : 'Раздел «Правила» доступен в подписке.';

    const cancelLabels: Record<string, string> = { client_no_show: 'Не пришёл', client_requested: 'Отмена клиентом' };
    const reasonLabels: Record<string, string> = { blacklist: 'Черный список', advance_payment_only: 'Только предоплата' };

    return (
      <ScreenContainer
        scrollable
        scrollViewProps={{
          contentContainerStyle: { paddingBottom: scrollPaddingBottom },
        }}
      >
        <DemoAccessBanner
          description={description}
          ctaText="Перейти к тарифам"
          onCtaPress={() => router.push('/subscriptions')}
        />
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={styles.title}>Ограничения клиентов</Text>
          <View style={styles.demoBadge}><Text style={styles.demoBadgeText}>Демо</Text></View>
        </View>
        <View style={styles.content}>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Черный список</Text>
            {rulesRestrictionsDemo.blacklist.map((r: any) => (
              <View key={r.id} style={styles.demoRow}>
                <Text style={styles.demoLabel}>{r.client_phone}</Text>
                <Text style={styles.demoValue}>{r.reason}</Text>
              </View>
            ))}
          </Card>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Только предоплата</Text>
            {rulesRestrictionsDemo.advance_payment_only.map((r: any) => (
              <View key={r.id} style={styles.demoRow}>
                <Text style={styles.demoLabel}>{r.client_phone}</Text>
              </View>
            ))}
          </Card>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Автоправила</Text>
            {rulesAutoRulesDemo.map((r: any) => (
              <View key={r.id} style={styles.demoRow}>
                <Text style={styles.demoLabel}>{cancelLabels[r.cancellation_reason]} ≥{r.cancel_count} за {r.period_days} дн.</Text>
                <Text style={styles.demoValue}>{reasonLabels[r.restriction_type]}</Text>
              </View>
            ))}
          </Card>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scrollable
      scrollViewProps={{
        contentContainerStyle: { paddingBottom: scrollPaddingBottom },
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Ограничения клиентов</Text>
          <TouchableOpacity
            onPress={handleAdd}
            style={styles.primaryAction}
            activeOpacity={0.7}
            accessibilityLabel={segmentIndex === 0 ? 'Добавить ограничение' : 'Добавить правило'}
          >
            <Text style={styles.primaryActionText}>+ Добавить</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : error ? (
        <Card style={styles.card}>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton title="Повторить" onPress={loadData} />
        </Card>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContentInner} nestedScrollEnabled>
          <View style={styles.segmentWrap}>
            <SegmentedControl
              segments={[
                { key: 'restrictions', label: 'Ограничения' },
                { key: 'rules', label: 'Автоправила' },
              ]}
              selectedIndex={segmentIndex}
              onSegmentChange={setSegmentIndex}
            />
          </View>

          {segmentIndex === 0 ? (
            /* Ограничения */
            <Card style={styles.card} padding={16}>
              <Text style={styles.hint}>Всего: {restrictions?.total_restrictions ?? 0}</Text>
              <View style={styles.categoryCard}>
                <View style={[styles.categoryHeader, styles.categoryBlacklist]}>
                  <Ionicons name="ban" size={20} color="#c62828" />
                  <Text style={styles.categoryTitle}>Черный список</Text>
                  <View style={styles.badgeNeutral}><Text style={styles.badgeText}>{restrictions?.blacklist.length ?? 0}</Text></View>
                </View>
                {!restrictions?.blacklist.length ? (
                  <Text style={styles.empty}>Нет клиентов</Text>
                ) : (
                  restrictions.blacklist.map((r) => (
                    <View key={r.id} style={styles.restrictionRow}>
                      <Text style={styles.phone}>{formatPhone(r.client_phone)}</Text>
                      {r.reason ? <Text style={styles.reason}>{r.reason}</Text> : null}
                      <View style={styles.rowActions}>
                        <TouchableOpacity onPress={() => { setEditingRestriction(r); setRestrictionForm({ client_phone: r.client_phone, restriction_type: r.restriction_type, reason: r.reason || '' }); setShowRestrictionModal(true); }}>
                          <Ionicons name="pencil" size={18} color="#4CAF50" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteRestriction(r)}>
                          <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
              <View style={styles.categoryCard}>
                <View style={[styles.categoryHeader, styles.categoryAdvance]}>
                  <Ionicons name="card" size={20} color="#4CAF50" />
                  <Text style={styles.categoryTitle}>Только предоплата</Text>
                  <View style={styles.badgeNeutral}><Text style={styles.badgeText}>{restrictions?.advance_payment_only.length ?? 0}</Text></View>
                </View>
                {!restrictions?.advance_payment_only.length ? (
                  <Text style={styles.empty}>Нет клиентов</Text>
                ) : (
                  restrictions.advance_payment_only.map((r) => (
                    <View key={r.id} style={styles.restrictionRow}>
                      <Text style={styles.phone}>{formatPhone(r.client_phone)}</Text>
                      {r.reason ? <Text style={styles.reason}>{r.reason}</Text> : null}
                      <View style={styles.rowActions}>
                        <TouchableOpacity onPress={() => { setEditingRestriction(r); setRestrictionForm({ client_phone: r.client_phone, restriction_type: r.restriction_type, reason: r.reason || '' }); setShowRestrictionModal(true); }}>
                          <Ionicons name="pencil" size={18} color="#4CAF50" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteRestriction(r)}>
                          <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
              {/* Справка (аккордеон) */}
              <View style={styles.infoAccordion}>
                <Pressable
                  style={styles.infoHeader}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setInfoExpanded(!infoExpanded);
                  }}
                >
                  <Ionicons name="information-circle-outline" size={20} color="#666" />
                  <Text style={styles.infoHeaderText}>Как работают ограничения</Text>
                  <Ionicons name={infoExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
                </Pressable>
                {infoExpanded && (
                  <View style={styles.infoContent}>
                    <Text style={styles.infoBody}>• Черный список: клиент не сможет записаться</Text>
                    <Text style={styles.infoBody}>• Только предоплата: запись только с предоплатой</Text>
                    <Text style={styles.infoBody}>• Применяются по номеру телефона</Text>
                    <Text style={styles.infoBody}>• Автоматические правила создают ограничения по отменам</Text>
                  </View>
                )}
              </View>
            </Card>
          ) : (
            /* Автоправила */
            <Card style={styles.card} padding={16}>
              {rules.length === 0 ? (
                <>
                  <Text style={styles.empty}>Правила не созданы</Text>
                  <Text style={styles.emptyHint}>Создайте правило, чтобы ограничения выставлялись автоматически.</Text>
                </>
              ) : (
                rules.map((r) => (
                  <View key={r.id} style={styles.ruleRow}>
                    <View style={styles.ruleContent}>
                      <Text style={styles.ruleText}>{CANCELLATION_REASONS[r.cancellation_reason]}</Text>
                      <Text style={styles.ruleSub}>После {r.cancel_count} отмен за {r.period_days ? `${r.period_days} дн` : 'все время'} → {r.restriction_type === 'blacklist' ? 'Черный список' : 'Предоплата'}</Text>
                    </View>
                    <View style={styles.ruleActions}>
                      <TouchableOpacity onPress={() => { setEditingRule(r); setRuleForm({ cancellation_reason: r.cancellation_reason, cancel_count: r.cancel_count, period_days: r.period_days, restriction_type: r.restriction_type }); setShowRuleModal(true); }}>
                        <Ionicons name="pencil" size={20} color="#4CAF50" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteRule(r)}>
                        <Ionicons name="trash-outline" size={20} color="#d32f2f" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </Card>
          )}
        </ScrollView>
      )}

      {/* Модалка ограничения */}
      <Modal visible={showRestrictionModal} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.modalKeyboardHost,
              Platform.OS === 'android' && restrictionKeyboardHeight > 0
                ? { marginBottom: restrictionKeyboardHeight }
                : null,
            ]}
          >
            <View
              style={[
                styles.modalContent,
                { maxHeight: restrictionSheetMaxHeight },
                restrictionKeyboardHeight > 0 ? { height: restrictionSheetMaxHeight } : null,
              ]}
            >
              <Text style={styles.modalTitle}>
                {editingRestriction ? 'Редактировать' : 'Добавить ограничение'}
              </Text>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                <MasterClientPhonePickerField
                  value={restrictionForm.client_phone}
                  onChangeText={(t) => setRestrictionForm((f) => ({ ...f, client_phone: t }))}
                  editable={!editingRestriction}
                />
                <Text style={styles.label}>Тип ограничения</Text>
                <View style={styles.radioRow}>
                  {(['blacklist', 'advance_payment_only'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setRestrictionForm((f) => ({ ...f, restriction_type: t }))}
                      style={[styles.radio, restrictionForm.restriction_type === t && styles.radioActive]}
                    >
                      <Text>{t === 'blacklist' ? 'Черный список' : 'Предоплата'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Комментарий</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Например: работает только по предоплате"
                  value={restrictionForm.reason}
                  onChangeText={(t) => setRestrictionForm((f) => ({ ...f, reason: t }))}
                  multiline
                />
              </ScrollView>
              <View style={[styles.modalButtons, { paddingBottom: modalFooterPaddingBottom }]}>
                <TouchableOpacity onPress={resetRestrictionForm} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Отмена</Text>
                </TouchableOpacity>
                <PrimaryButton
                  title={saving ? '...' : 'Сохранить'}
                  onPress={handleSaveRestriction}
                  disabled={saving}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Модалка правила */}
      <Modal visible={showRuleModal} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.modalKeyboardHost,
              Platform.OS === 'android' && ruleKeyboardHeight > 0 ? { marginBottom: ruleKeyboardHeight } : null,
            ]}
          >
            <View
              style={[
                styles.modalContent,
                { maxHeight: ruleSheetMaxHeight },
                ruleKeyboardHeight > 0 ? { height: ruleSheetMaxHeight } : null,
              ]}
            >
              <Text style={styles.modalTitle}>
                {editingRule ? 'Редактировать правило' : 'Добавить правило'}
              </Text>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                <Text style={styles.label}>Причина отмены</Text>
                <View style={styles.verticalOptions}>
                  {Object.entries(CANCELLATION_REASONS).map(([val, lbl]) => (
                    <TouchableOpacity
                      key={val}
                      onPress={() => setRuleForm((f) => ({ ...f, cancellation_reason: val }))}
                      style={[styles.pickerOpt, ruleForm.cancellation_reason === val && styles.pickerOptActive]}
                    >
                      <Text style={styles.pickerText}>{lbl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Отмен за период</Text>
                <TextInput
                  style={styles.input}
                  value={String(ruleForm.cancel_count)}
                  onChangeText={(t) => setRuleForm((f) => ({ ...f, cancel_count: parseInt(t, 10) || 1 }))}
                  keyboardType="number-pad"
                />
                <Text style={styles.label}>Период проверки</Text>
                <View style={styles.pickerRow}>
                  {PERIOD_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={String(o.value)}
                      onPress={() => setRuleForm((f) => ({ ...f, period_days: o.value }))}
                      style={[styles.pickerOpt, ruleForm.period_days === o.value && styles.pickerOptActive]}
                    >
                      <Text style={styles.pickerText}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.helpText}>{getCancelPeriodHelpText(ruleForm.period_days)}</Text>
                <Text style={styles.label}>Тип ограничения</Text>
                <View style={styles.radioRow}>
                  {(['blacklist', 'advance_payment_only'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setRuleForm((f) => ({ ...f, restriction_type: t }))}
                      style={[styles.radio, ruleForm.restriction_type === t && styles.radioActive]}
                    >
                      <Text>{t === 'blacklist' ? 'Черный список' : 'Предоплата'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={[styles.modalButtons, { paddingBottom: modalFooterPaddingBottom }]}>
                <TouchableOpacity onPress={resetRuleForm} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Отмена</Text>
                </TouchableOpacity>
                <PrimaryButton title={saving ? '...' : 'Сохранить'} onPress={handleSaveRule} disabled={saving} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginHorizontal: -16,
    marginTop: -16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 12 },
  subtitle: { fontSize: 13, color: '#666' },
  primaryAction: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  primaryActionText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  card: { margin: 16, marginTop: 8 },
  content: { padding: 16 },
  demoBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  demoBadgeText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  demoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  demoLabel: { fontSize: 14, color: '#666' },
  demoValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#333' },
  center: { padding: 40, alignItems: 'center' },
  errorText: { color: '#d32f2f', marginBottom: 12 },
  scrollContentInner: { paddingBottom: 8 },
  segmentWrap: { marginBottom: 12 },
  hint: { fontSize: 12, color: '#666', marginBottom: 12 },
  empty: { fontSize: 13, color: '#999', fontStyle: 'italic', marginVertical: 8 },
  emptyHint: { fontSize: 12, color: '#999', marginTop: -4, marginBottom: 12 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8, marginBottom: 8 },
  ruleContent: { flex: 1 },
  ruleText: { fontWeight: '600', color: '#111' },
  ruleSub: { fontSize: 12, color: '#666', marginTop: 4 },
  ruleActions: { flexDirection: 'row', gap: 12 },
  categoryCard: { marginBottom: 16 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, gap: 8 },
  categoryBlacklist: { backgroundColor: '#fafafa', borderLeftWidth: 4, borderLeftColor: '#c62828' },
  categoryAdvance: { backgroundColor: '#fafafa', borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  categoryTitle: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1 },
  badgeNeutral: { backgroundColor: '#e0e0e0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#555' },
  restrictionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 8 },
  phone: { fontWeight: '600', flex: 1, minWidth: 140 },
  reason: { fontSize: 12, color: '#666', width: '100%' },
  rowActions: { flexDirection: 'row', gap: 12 },
  infoAccordion: { marginTop: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f8f9fa' },
  infoHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, gap: 8 },
  infoHeaderText: { flex: 1, fontSize: 14, color: '#555', fontWeight: '500' },
  infoContent: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#e8e8e8' },
  infoBody: { fontSize: 12, color: '#555', marginBottom: 4 },
  lockTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 8 },
  lockText: { fontSize: 13, color: '#444', marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalKeyboardHost: { width: '100%', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  modalScroll: { flexGrow: 0 },
  modalScrollContent: { paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 8 },
  helpText: { fontSize: 12, color: '#666', marginTop: -4, marginBottom: 12, lineHeight: 18 },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eee',
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  textArea: { minHeight: 60 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  radioRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  radio: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, alignItems: 'center' },
  radioActive: { borderColor: '#4CAF50', backgroundColor: '#e8f5e9' },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  verticalOptions: { gap: 8, marginBottom: 12 },
  pickerOpt: { padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  pickerOptActive: { borderColor: '#4CAF50', backgroundColor: '#e8f5e9' },
  pickerText: { fontSize: 14 },
});
