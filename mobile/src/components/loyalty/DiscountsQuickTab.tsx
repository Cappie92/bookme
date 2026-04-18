import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  FlatList,
  ViewStyle,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loyaltyTemplateIconName } from '@src/utils/loyaltyTemplateIcon';

const SCREEN_PADDING = 16;
const TEMPLATE_LIST_PADDING_H = 6;

import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import type { LoyaltyDiscount, QuickDiscountTemplate, LoyaltyDiscountCreate, LoyaltyDiscountUpdate } from '@src/types/loyalty_discounts';
import { LoyaltyDiscountType } from '@src/types/loyalty_discounts';
import {
  quickDiscountsByConditionType,
  isBinaryQuickConditionType,
  canonicalFirstVisitQuickRule,
} from '@src/utils/loyaltyConditions';
import { getMasterServices, type MasterService } from '@src/services/api/master';

function getCompactName(name: string): string {
  const mapping: Record<string, string> = {
    'Регулярные визиты': 'Повторные визиты',
    'Возвращение клиента': 'Возврат клиента',
    'Скидка за первую запись': 'На первую запись',
    'Скидка за регулярные посещения': 'За повторные визиты',
    'Скидка для клиентов, которые давно не были': 'Если давно не были',
    'Скидка в день рождения клиента': 'В день рождения',
  };
  return mapping[name] || name;
}

const WEEKDAY_OPTIONS: { v: number; l: string }[] = [
  { v: 1, l: 'Пн' },
  { v: 2, l: 'Вт' },
  { v: 3, l: 'Ср' },
  { v: 4, l: 'Чт' },
  { v: 5, l: 'Пт' },
  { v: 6, l: 'Сб' },
  { v: 7, l: 'Вс' },
];

function formatRuleSummary(discount: LoyaltyDiscount): string {
  const ct = (discount.conditions as any)?.condition_type;
  const p = (discount.conditions as any)?.parameters || {};
  const pct = discount.discount_percent;
  if (ct === 'first_visit') return `${pct}%`;
  if (ct === 'regular_visits') return `${p.visits_count ?? '—'} виз. / ${p.period_days ?? '—'} дн. → ${pct}%`;
  if (ct === 'returning_client') return `≥${p.min_days_since_last_visit ?? '—'} дн. без визитов → ${pct}%`;
  if (ct === 'birthday') return `−${p.days_before ?? 0}/+${p.days_after ?? 0} дн. ДР → ${pct}%`;
  if (ct === 'happy_hours') {
    const d0 = (p.days || [])[0];
    const iv = (p.intervals || [])[0] || {};
    const wd = WEEKDAY_OPTIONS.find((x) => x.v === d0)?.l || '?';
    return `${wd} ${iv.start || '—'}-${iv.end || '—'} → ${pct}%`;
  }
  if (ct === 'service_discount') return `Услуга #${p.service_id ?? '—'} → ${pct}%`;
  return `${pct}%`;
}

function padTime(t: string): string {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '09:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export interface DiscountsQuickTabProps {
  templates: QuickDiscountTemplate[];
  discounts: LoyaltyDiscount[];
  onSubmitQuickCreate: (body: LoyaltyDiscountCreate) => Promise<void>;
  onSubmitQuickUpdate: (id: number, body: LoyaltyDiscountUpdate) => Promise<void>;
  onQuickDeactivateOrRemove: (discount: LoyaltyDiscount) => void;
  onBulkDeactivateQuick: (conditionType: string) => void;
  onActivateBinaryQuick: (discount: LoyaltyDiscount) => Promise<void>;
  createDisabled?: boolean;
}

type ModalState =
  | null
  | { mode: 'create' | 'edit'; template: QuickDiscountTemplate; discount: LoyaltyDiscount | null };

export function DiscountsQuickTab({
  templates,
  discounts,
  onSubmitQuickCreate,
  onSubmitQuickUpdate,
  onQuickDeactivateOrRemove,
  onBulkDeactivateQuick,
  onActivateBinaryQuick,
  createDisabled = false,
}: DiscountsQuickTabProps) {
  const [masterServices, setMasterServices] = useState<MasterService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const [pct, setPct] = useState('10');
  const [visitsCount, setVisitsCount] = useState('3');
  const [periodDays, setPeriodDays] = useState('60');
  const [minDaysAway, setMinDaysAway] = useState('30');
  const [daysBefore, setDaysBefore] = useState('7');
  const [daysAfter, setDaysAfter] = useState('7');
  const [weekday, setWeekday] = useState('1');
  const [tStart, setTStart] = useState('09:00');
  const [tEnd, setTEnd] = useState('12:00');
  const [serviceId, setServiceId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    getMasterServices()
      .then((s) => {
        if (!cancelled) setMasterServices(Array.isArray(s) ? s : []);
      })
      .catch(() => {
        if (!cancelled) setMasterServices([]);
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetFormFromModal = useCallback((m: ModalState) => {
    if (!m?.template) return;
    const template = m.template;
    const ct = template.conditions?.condition_type as string;
    const defaults = (template.conditions as any)?.parameters || {};
    if (m.mode === 'edit' && m.discount) {
      const p = (m.discount.conditions as any)?.parameters || {};
      setPct(String(m.discount.discount_percent ?? template.default_discount));
      if (ct === 'regular_visits') {
        setVisitsCount(String(p.visits_count ?? 3));
        setPeriodDays(String(p.period_days ?? 60));
      }
      if (ct === 'returning_client') setMinDaysAway(String(p.min_days_since_last_visit ?? 30));
      if (ct === 'birthday') {
        setDaysBefore(String(p.days_before ?? 7));
        setDaysAfter(String(p.days_after ?? 7));
      }
      if (ct === 'happy_hours') {
        const days = p.days || [1];
        setWeekday(String(days[0] || 1));
        const iv = (p.intervals || [])[0] || {};
        setTStart(String(iv.start || '09:00').slice(0, 5));
        setTEnd(String(iv.end || '12:00').slice(0, 5));
      }
      if (ct === 'service_discount') setServiceId(p.service_id != null ? String(p.service_id) : '');
    } else {
      setPct(String(template.default_discount ?? 10));
      setVisitsCount(String(defaults.visits_count ?? 3));
      setPeriodDays(String(defaults.period_days ?? 60));
      setMinDaysAway(String(defaults.min_days_since_last_visit ?? 30));
      setDaysBefore(String(defaults.days_before ?? 7));
      setDaysAfter(String(defaults.days_after ?? 7));
      setWeekday(String((defaults.days && defaults.days[0]) || 1));
      setTStart(((defaults.intervals && defaults.intervals[0]?.start) || '09:00').slice(0, 5));
      setTEnd(((defaults.intervals && defaults.intervals[0]?.end) || '12:00').slice(0, 5));
      setServiceId('');
    }
  }, []);

  useEffect(() => {
    if (modal) resetFormFromModal(modal);
  }, [modal, resetFormFromModal]);

  const submitModal = async () => {
    if (!modal?.template) return;
    const template = modal.template;
    const ct = template.conditions?.condition_type as string;
    const dPct = parseFloat(pct.replace(',', '.'));
    if (Number.isNaN(dPct) || dPct < 0 || dPct > 100) {
      Alert.alert('Ошибка', 'Укажите процент 0–100');
      return;
    }
    let parameters: Record<string, unknown> = {};
    if (ct === 'first_visit') parameters = {};
    if (ct === 'regular_visits') {
      const vc = parseInt(visitsCount, 10);
      const pd = parseInt(periodDays, 10);
      if (Number.isNaN(vc) || vc < 1 || Number.isNaN(pd) || pd < 1) {
        Alert.alert('Ошибка', 'Визиты и период должны быть ≥ 1');
        return;
      }
      parameters = { visits_count: vc, period_days: pd };
    }
    if (ct === 'returning_client') {
      const md = parseInt(minDaysAway, 10);
      if (Number.isNaN(md) || md < 0) {
        Alert.alert('Ошибка', 'Укажите дни без визитов');
        return;
      }
      parameters = { min_days_since_last_visit: md, max_days_since_last_visit: null };
    }
    if (ct === 'birthday') {
      const b = parseInt(daysBefore, 10);
      const a = parseInt(daysAfter, 10);
      if (Number.isNaN(b) || b < 0 || Number.isNaN(a) || a < 0) {
        Alert.alert('Ошибка', 'Дни до/после ДР ≥ 0');
        return;
      }
      parameters = { days_before: b, days_after: a };
    }
    if (ct === 'happy_hours') {
      const d = parseInt(weekday, 10);
      if (Number.isNaN(d) || d < 1 || d > 7) {
        Alert.alert('Ошибка', 'День недели');
        return;
      }
      const s = padTime(tStart);
      const en = padTime(tEnd);
      if (s >= en) {
        Alert.alert('Ошибка', 'Время начала < окончания');
        return;
      }
      parameters = { days: [d], intervals: [{ start: s, end: en }] };
    }
    if (ct === 'service_discount') {
      const sid = parseInt(serviceId, 10);
      if (Number.isNaN(sid) || sid < 1) {
        Alert.alert('Ошибка', 'Выберите услугу');
        return;
      }
      parameters = { service_id: sid };
    }

    const conditions = { condition_type: ct, parameters };
    try {
      if (modal.mode === 'create') {
        const body: LoyaltyDiscountCreate = {
          discount_type: LoyaltyDiscountType.QUICK,
          name: template.name,
          description: template.description || '',
          discount_percent: dPct,
          max_discount_amount: null,
          conditions,
          is_active: true,
          priority: 1,
        };
        await onSubmitQuickCreate(body);
      } else if (modal.discount) {
        await onSubmitQuickUpdate(modal.discount.id, {
          discount_percent: dPct,
          conditions,
        });
      }
      setModal(null);
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data?.detail || e.message || 'Сохранение');
    }
  };

  const ROW_GAP = 12;

  const cards = useMemo(() => {
    return templates.map((template) => {
      const ct = template.conditions?.condition_type as string;
      const rules = quickDiscountsByConditionType(discounts, ct).sort(
        (a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)
      );
      const isBin = isBinaryQuickConditionType(ct);
      const isFirstVisit = ct === 'first_visit';
      const canonFv = isFirstVisit ? canonicalFirstVisitQuickRule(discounts) : null;
      const displayRules = isFirstVisit ? (canonFv ? [canonFv] : []) : rules;
      const activeCount = isFirstVisit
        ? (displayRules[0]?.is_active ? 1 : 0)
        : rules.filter((r) => r.is_active).length;
      const canCreate = isFirstVisit
        ? quickDiscountsByConditionType(discounts, 'first_visit').length === 0
        : !isBin || rules.length === 0;
      return { template, ct, rules, displayRules, isBin, activeCount, canCreate, isFirstVisit };
    });
  }, [templates, discounts]);

  const renderModalFields = () => {
    if (!modal) return null;
    const ct = modal.template.conditions?.condition_type as string;
    return (
      <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
        {ct === 'first_visit' && (
          <Text style={styles.modalHint}>Скидка при первой записи клиента к вам.</Text>
        )}
        {ct === 'regular_visits' && (
          <>
            <Text style={styles.label}>Визитов (не меньше)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={visitsCount} onChangeText={setVisitsCount} />
            <Text style={styles.label}>За период, дней</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={periodDays} onChangeText={setPeriodDays} />
          </>
        )}
        {ct === 'returning_client' && (
          <>
            <Text style={styles.label}>Дней без визитов (не меньше)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={minDaysAway} onChangeText={setMinDaysAway} />
          </>
        )}
        {ct === 'birthday' && (
          <>
            <Text style={styles.label}>Дней до дня рождения</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={daysBefore} onChangeText={setDaysBefore} />
            <Text style={styles.label}>Дней после</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={daysAfter} onChangeText={setDaysAfter} />
          </>
        )}
        {ct === 'happy_hours' && (
          <>
            <Text style={styles.label}>День недели</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
              {WEEKDAY_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.v}
                  style={[styles.dayChip, weekday === String(o.v) && styles.dayChipOn]}
                  onPress={() => setWeekday(String(o.v))}
                >
                  <Text style={[styles.dayChipText, weekday === String(o.v) && styles.dayChipTextOn]}>{o.l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>С (ЧЧ:ММ)</Text>
            <TextInput style={styles.input} value={tStart} onChangeText={setTStart} placeholder="09:00" />
            <Text style={styles.label}>До</Text>
            <TextInput style={styles.input} value={tEnd} onChangeText={setTEnd} placeholder="12:00" />
          </>
        )}
        {ct === 'service_discount' && (
          <>
            {servicesLoading ? (
              <ActivityIndicator color="#4CAF50" />
            ) : masterServices.length === 0 ? (
              <Text style={styles.warn}>Нет услуг в профиле. Добавьте услуги мастера.</Text>
            ) : (
              <>
                <Text style={styles.label}>Услуга</Text>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {masterServices.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.svcRow, serviceId === String(s.id) && styles.svcRowOn]}
                      onPress={() => setServiceId(String(s.id))}
                    >
                      <Text style={styles.svcName}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
        <Text style={styles.label}>Скидка, %</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={pct} onChangeText={setPct} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Правила скидок</Text>
        <Text style={styles.description}>Создание и управление по типам. У каждого типа своя форма.</Text>
      </View>

      <Modal visible={!!modal} animationType="slide" transparent onRequestClose={() => setModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {modal?.mode === 'create' ? 'Новое правило' : 'Изменить'}
              {modal ? `: ${getCompactName(modal.template.name)}` : ''}
            </Text>
            {renderModalFields()}
            <View style={styles.modalActions}>
              <PrimaryButton title="Сохранить" onPress={submitModal} disabled={createDisabled} />
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(null)}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {templates.length > 0 && (
        <View
          style={[
            styles.templatesContainer,
            { marginHorizontal: -SCREEN_PADDING, paddingHorizontal: TEMPLATE_LIST_PADDING_H },
          ]}
        >
          <FlatList
            scrollEnabled={false}
            removeClippedSubviews={false}
            nestedScrollEnabled
            data={cards}
            keyExtractor={(item) => item.template.id}
            contentContainerStyle={[styles.templatesGrid, { paddingBottom: ROW_GAP }]}
            renderItem={({ item }) => {
                const { template, ct, displayRules, isBin, activeCount, canCreate } = item;
                const anyActive = activeCount > 0;
                const showBulk = !isBin && anyActive;
                const cardStyle: ViewStyle[] = [
                  styles.templateCard,
                  { width: '100%', marginBottom: ROW_GAP },
                  anyActive ? styles.templateCardActive : null,
                ];
                return (
                  <Card key={template.id} style={cardStyle}>
                    <View style={styles.templateHeader}>
                      <Ionicons
                        name={loyaltyTemplateIconName(template.icon)}
                        size={22}
                        color={anyActive ? '#4CAF50' : '#666'}
                      />
                      <Text style={styles.templateName} numberOfLines={2}>
                        {getCompactName(template.name)}
                      </Text>
                    </View>
                    <Text style={styles.templateDesc} numberOfLines={3}>
                      {template.description}
                    </Text>
                    {displayRules.length > 0 && (
                      <View style={styles.rulesBlock}>
                        {displayRules.map((r) => (
                          <View key={r.id} style={styles.ruleRow}>
                            <Text style={styles.ruleText} numberOfLines={2}>
                              {formatRuleSummary(r)}
                              {!r.is_active ? ' · выкл' : ''}
                            </Text>
                            <View style={styles.ruleActions}>
                              {!r.is_active && isBin ? (
                                <TouchableOpacity
                                  onPress={() => !createDisabled && onActivateBinaryQuick(r)}
                                  style={styles.miniOn}
                                >
                                  <Text style={styles.miniOnText}>Вкл</Text>
                                </TouchableOpacity>
                              ) : null}
                              <TouchableOpacity
                                onPress={() => !createDisabled && setModal({ mode: 'edit', template, discount: r })}
                              >
                                <Ionicons name="create-outline" size={20} color="#4CAF50" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => !createDisabled && onQuickDeactivateOrRemove(r)}>
                                <Ionicons name="trash-outline" size={20} color="#c62828" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    {canCreate && (
                      <TouchableOpacity
                        style={[styles.createBtn, createDisabled && styles.disabled]}
                        disabled={createDisabled}
                        onPress={() => setModal({ mode: 'create', template, discount: null })}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.createBtnText}>Создать правило</Text>
                      </TouchableOpacity>
                    )}
                    {showBulk && (
                      <TouchableOpacity
                        style={[styles.bulkBtn, createDisabled && styles.disabled]}
                        disabled={createDisabled}
                        onPress={() => onBulkDeactivateQuick(ct)}
                      >
                        <Text style={styles.bulkBtnText}>Удалить все правила</Text>
                      </TouchableOpacity>
                    )}
                  </Card>
                );
              }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  description: { marginTop: 4, fontSize: 13, color: '#666' },
  templatesContainer: {},
  templatesGrid: {},
  templateCard: { padding: 10 },
  templateCardActive: { borderColor: '#4CAF50', borderWidth: 1 },
  templateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  templateName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111' },
  templateDesc: { marginTop: 4, fontSize: 11, color: '#666' },
  rulesBlock: { marginTop: 8, gap: 6 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 6,
  },
  ruleText: { flex: 1, fontSize: 11, color: '#333', marginRight: 6 },
  ruleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniOn: { backgroundColor: '#4CAF50', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  miniOnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  createBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 10,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bulkBtn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    alignItems: 'center',
  },
  bulkBtnText: { color: '#c62828', fontWeight: '600', fontSize: 12 },
  disabled: { opacity: 0.45 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: '#111' },
  modalScroll: { maxHeight: 420 },
  modalHint: { fontSize: 12, color: '#666', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#444', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    fontSize: 15,
  },
  dayRow: { flexDirection: 'row', marginTop: 6, marginBottom: 4 },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 6,
  },
  dayChipOn: { borderColor: '#4CAF50', backgroundColor: '#e8f5e9' },
  dayChipText: { fontSize: 12, color: '#333' },
  dayChipTextOn: { color: '#2e7d32', fontWeight: '700' },
  svcRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  svcRowOn: { backgroundColor: '#e8f5e9' },
  svcName: { fontSize: 14, color: '#111' },
  warn: { color: '#b45309', fontSize: 13, marginVertical: 8 },
  modalActions: { marginTop: 12, gap: 10 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#666' },
});
