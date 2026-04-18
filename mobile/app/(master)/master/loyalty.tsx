import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import { useAuth } from '@src/auth/AuthContext';
import { fetchAvailableSubscriptions, SubscriptionType } from '@src/services/api/subscriptions';
import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
import { router } from 'expo-router';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
  getLoyaltyStats,
  getLoyaltyHistory,
  getMasterSettings,
  LoyaltySettings,
  LoyaltyStats,
  LoyaltyTransaction,
  MasterSettings,
} from '@src/services/api/master';
import {
  getLoyaltyTemplates,
  getLoyaltyStatus,
  createQuickDiscount,
  updateQuickDiscount,
  bulkDeactivateQuickDiscountsByType,
  createComplexDiscount,
  updateComplexDiscount,
  createPersonalDiscount,
  updatePersonalDiscount,
  LoyaltyDiscount,
  PersonalDiscount,
  QuickDiscountTemplate,
  LoyaltySystemStatus,
  LoyaltyDiscountType,
} from '@src/services/api/loyalty_discounts';
import { DemoAccessBanner } from '@src/components/DemoAccessBanner';
import { loyaltyQuickDiscountsDemo, loyaltyStatsDemo, loyaltyHistoryDemo } from '@src/shared/demo';
import { DiscountsQuickTab } from '@src/components/loyalty/DiscountsQuickTab';
import { DiscountsComplexTab } from '@src/components/loyalty/DiscountsComplexTab';
import { DiscountsPersonalTab } from '@src/components/loyalty/DiscountsPersonalTab';
import { HistoryFiltersModal } from '@src/components/loyalty/HistoryFiltersModal';
import type {
  ComplexDiscountForm,
  PersonalDiscountForm,
  LoyaltyDiscountCreate,
  LoyaltyDiscountUpdate,
} from '@src/types/loyalty_discounts';
import { getQuickConditionType, isBinaryQuickConditionType } from '@src/utils/loyaltyConditions';

const LIFETIME_OPTIONS = [
  { value: 14, label: '14 дней' },
  { value: 30, label: '30 дней' },
  { value: 60, label: '60 дней' },
  { value: 90, label: '90 дней' },
  { value: 180, label: '180 дней' },
  { value: 365, label: '365 дней' },
  { value: null, label: 'Бесконечно (∞)' },
];

// Типы для верхних табов
type MainTabType = 'discounts' | 'points';
// Типы для подтабов в "Скидки"
type DiscountTabType = 'quick' | 'complex' | 'personal';

export default function MasterLoyaltyScreen() {
  const { features, loading: featuresLoading } = useMasterFeatures();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  
  // Верхние табы: Скидки / Баллы
  const [mainTab, setMainTab] = useState<MainTabType>('discounts');
  
  // Подтабы для Скидок
  const [discountTab, setDiscountTab] = useState<DiscountTabType>('quick');
  
  // Модалка фильтров истории
  const [showHistoryFiltersModal, setShowHistoryFiltersModal] = useState(false);
  
  // ============================================================================
  // СОСТОЯНИЕ ДЛЯ СКИДОК
  // ============================================================================
  const [loyaltyStatus, setLoyaltyStatus] = useState<LoyaltySystemStatus | null>(null);
  const [templates, setTemplates] = useState<QuickDiscountTemplate[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountsError, setDiscountsError] = useState<string | null>(null);
  const [discountsErrorType, setDiscountsErrorType] = useState<'error' | 'warning'>('error');
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [showComplexForm, setShowComplexForm] = useState(false);
  const [complexForm, setComplexForm] = useState<ComplexDiscountForm>({
    name: '',
    description: '',
    discount_percent: '',
    conditions: [],
  });
  const [showPersonalForm, setShowPersonalForm] = useState(false);
  const [personalForm, setPersonalForm] = useState<PersonalDiscountForm>({
    client_phone: '',
    discount_percent: '',
    max_discount_amount: '',
    description: '',
  });
  const [masterSettings, setMasterSettings] = useState<MasterSettings | null>(null);
  
  // ============================================================================
  // СОСТОЯНИЕ ДЛЯ БАЛЛОВ (старая логика)
  // ============================================================================
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<LoyaltySettings | null>(null);
  /** Форма начисления/срока/оплаты баллами (только при включённой программе) */
  const [pointsAccrualSettingsExpanded, setPointsAccrualSettingsExpanded] = useState(true);
  const prevIsEnabledRef = useRef<boolean | undefined>(undefined);

  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  
  const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  // Фильтры и пагинация для истории
  // Applied filters (то, что реально влияет на запрос)
  const [appliedHistoryFilters, setAppliedHistoryFilters] = useState<{
    clientId: string;
    transactionType: 'earned' | 'spent' | '';
    startDate: string;
    endDate: string;
  }>({
    clientId: '',
    transactionType: '',
    startDate: '',
    endDate: '',
  });
  const [historySkip, setHistorySkip] = useState(0);
  const [historyLimit] = useState(50);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  const hasLoyaltyAccess = features?.has_loyalty_access === true;
  const onboardingCompleted = Boolean(masterSettings?.master?.timezone_confirmed);
  const createDisabled = hasLoyaltyAccess && !onboardingCompleted;

  // Загружаем планы для получения названий тарифов
  useEffect(() => {
    if (features) {
      fetchAvailableSubscriptions(SubscriptionType.MASTER)
        .then(setPlans)
        .catch(err => {
          if (__DEV__) console.error('[LOYALTY] Error loading plans:', err);
        });
    }
  }, [features]);

  // ============================================================================
  // ЗАГРУЗКА СКИДОК (только если есть токен и доступ)
  // ============================================================================
  const loadDiscounts = async () => {
    // Auth gating: не делаем запросы до готовности auth
    if (!hasLoyaltyAccess || authLoading || !token || !isAuthenticated) {
      setDiscountsLoading(false);
      return;
    }

    try {
      setDiscountsError(null);
      setDiscountsErrorType('error');
      setSubscriptionRequired(false);
      setDiscountsLoading(true);
      
      // Загружаем статус (все скидки)
      const status = await getLoyaltyStatus();
      setLoyaltyStatus(status);
      setDiscountsError(null);
      setDiscountsErrorType('error');
      setSubscriptionRequired(false);
      
      // Загружаем шаблоны (опционально, может быть 404)
      try {
        const templatesData = await getLoyaltyTemplates();
        setTemplates(templatesData);
      } catch (err: any) {
        // 404 - нормально, шаблоны могут быть не реализованы
        if (err.response?.status !== 404) {
          throw err;
        }
        setTemplates([]);
      }
      
      if (__DEV__) {
        console.log('[LOYALTY DISCOUNTS] Loaded:', status);
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errorCode = err.response?.headers?.['x-error-code'];
      const errorData = err.response?.data;
      
      // 409 SCHEMA_OUTDATED
      if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
        const detail = errorData?.detail || 'Схема базы данных устарела';
        const hint = errorData?.hint || 'Run alembic upgrade head';
        setDiscountsError(`${detail}. ${hint}`);
        setDiscountsErrorType('warning');
        setSubscriptionRequired(false);
      }
      // 404 Master not found
      else if (status === 404) {
        const detail = errorData?.detail || 'Профиль мастера не найден';
        setDiscountsError(`${detail}. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку.`);
        setDiscountsErrorType('error');
        setSubscriptionRequired(false);
        setLoyaltyStatus(null);
        setTemplates([]);
      }
      // 403 Forbidden
      else if (status === 403) {
        if (errorCode === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setDiscountsError(null);
          setDiscountsErrorType('error');
        } else {
          const detail = errorData?.detail || 'Доступ запрещён. Проверьте права доступа.';
          setDiscountsError(detail);
          setDiscountsErrorType('error');
          setSubscriptionRequired(false);
        }
        setLoyaltyStatus(null);
        setTemplates([]);
      }
      // Другие ошибки
      else {
        const errorMessage = errorData?.detail || err.message || 'Ошибка загрузки скидок';
        setDiscountsError(errorMessage);
        setDiscountsErrorType('error');
        setSubscriptionRequired(false);
        setLoyaltyStatus(null);
        setTemplates([]);
      }
      
      if (__DEV__) {
        console.error('[LOYALTY DISCOUNTS] Error:', err);
      }
    } finally {
      setDiscountsLoading(false);
    }
  };

  // Загружаем скидки при переключении на таб "Скидки" и если есть токен (и auth готов)
  useEffect(() => {
    if (mainTab === 'discounts' && hasLoyaltyAccess && !authLoading && token && isAuthenticated && !loyaltyStatus) {
      loadDiscounts();
    }
  }, [mainTab, hasLoyaltyAccess, authLoading, token, isAuthenticated]);

  // Настройки мастера (город, timezone) для блокировки создания скидок при отсутствии timezone
  useEffect(() => {
    if (!hasLoyaltyAccess || !token || !isAuthenticated) return;
    getMasterSettings()
      .then((data) => setMasterSettings(data))
      .catch(() => setMasterSettings(null));
  }, [hasLoyaltyAccess, token, isAuthenticated]);

  useEffect(() => {
    if (discountTab === 'complex') setDiscountTab('quick');
  }, [discountTab]);

  // ============================================================================
  // ЗАГРУЗКА БАЛЛОВ (старая логика, только если есть токен)
  // ============================================================================
  const loadSettings = async () => {
    if (!hasLoyaltyAccess || !token || !isAuthenticated) {
      setSettingsLoading(false);
      return;
    }

    try {
      setSettingsError(null);
      setSettingsLoading(true);
      const data = await getLoyaltySettings();
      setSettings(data);
      setOriginalSettings(JSON.parse(JSON.stringify(data))); // Deep copy
      setHasChanges(false);
      
      if (__DEV__) {
        console.log('[LOYALTY] Settings loaded:', data);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки настроек';
      setSettingsError(errorMessage);
      
      if (err.response?.status === 403) {
        setSettingsError(null);
      }
      
      if (__DEV__) {
        console.error('[LOYALTY] Error loading settings:', err);
      }
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadStats = async () => {
    if (!hasLoyaltyAccess || !token || !isAuthenticated) return;

    try {
      setStatsError(null);
      setStatsLoading(true);
      const data = await getLoyaltyStats();
      setStats(data);
      
      if (__DEV__) {
        console.log('[LOYALTY] Stats loaded:', data);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки статистики';
      setStatsError(errorMessage);
      
      if (__DEV__) {
        console.error('[LOYALTY] Error loading stats:', err);
      }
    } finally {
      setStatsLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!hasLoyaltyAccess || !token || !isAuthenticated) return;

    try {
      setHistoryError(null);
      setHistoryLoading(true);
      
      const filters: any = {
        skip: historySkip,
        limit: historyLimit,
      };
      
      if (appliedHistoryFilters.clientId) {
        filters.client_id = parseInt(appliedHistoryFilters.clientId, 10);
      }
      if (appliedHistoryFilters.transactionType) {
        filters.transaction_type = appliedHistoryFilters.transactionType;
      }
      if (appliedHistoryFilters.startDate) {
        filters.start_date = appliedHistoryFilters.startDate;
      }
      if (appliedHistoryFilters.endDate) {
        filters.end_date = appliedHistoryFilters.endDate;
      }
      
      const data = await getLoyaltyHistory(filters);
      setHistory(data);
      setHistoryHasMore(data.length === historyLimit);
      
      if (__DEV__) {
        console.log('[LOYALTY] History loaded:', data.length, 'transactions');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки истории';
      setHistoryError(errorMessage);
      
      if (__DEV__) {
        console.error('[LOYALTY] Error loading history:', err);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleApplyHistoryFilters = (draftFilters: {
    clientId: string;
    transactionType: 'earned' | 'spent' | '';
    startDate: string;
    endDate: string;
  }) => {
    setAppliedHistoryFilters(draftFilters);
    setHistorySkip(0); // Сбрасываем пагинацию при применении фильтров
  };

  const handleResetHistoryFilters = () => {
    const emptyFilters = {
      clientId: '',
      transactionType: '' as 'earned' | 'spent' | '',
      startDate: '',
      endDate: '',
    };
    setAppliedHistoryFilters(emptyFilters);
    setHistorySkip(0); // Сбрасываем пагинацию при сбросе фильтров
  };

  // Загружаем settings и stats при монтировании mainTab === 'points' и после auth-gating
  useEffect(() => {
    if (!featuresLoading && features && token && isAuthenticated) {
      if (!hasLoyaltyAccess) {
        setSettingsLoading(false);
        return;
      }
      if (mainTab === 'points') {
        // Загружаем settings и stats одновременно (историю грузим отдельно через useEffect)
        loadSettings();
        loadStats();
      }
    }
  }, [featuresLoading, hasLoyaltyAccess, mainTab, token, isAuthenticated]);

  // Загружаем историю при изменении appliedFilters или skip (отдельно от settings/stats)
  useEffect(() => {
    if (mainTab === 'points' && hasLoyaltyAccess && token && isAuthenticated) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedHistoryFilters, historySkip, mainTab, hasLoyaltyAccess, token, isAuthenticated]);

  useEffect(() => {
    if (settings && originalSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasChanges(changed);
    }
  }, [settings, originalSettings]);

  useEffect(() => {
    const cur = settings?.is_enabled ?? false;
    const prev = prevIsEnabledRef.current;
    prevIsEnabledRef.current = cur;
    if (cur && prev === false) {
      setPointsAccrualSettingsExpanded(true);
    }
  }, [settings?.is_enabled]);

  // ============================================================================
  // ОБРАБОТЧИКИ ДЛЯ СКИДОК
  // ============================================================================
  const handleSubmitQuickCreate = async (body: LoyaltyDiscountCreate) => {
    if (authLoading || !token || !isAuthenticated) {
      Alert.alert('Ошибка', 'Необходима авторизация');
      return;
    }
    try {
      await createQuickDiscount(body);
      await loadDiscounts();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка создания скидки';
      Alert.alert('Ошибка', typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      throw err;
    }
  };

  const handleSubmitQuickUpdate = async (discountId: number, body: LoyaltyDiscountUpdate) => {
    if (authLoading || !token || !isAuthenticated) {
      Alert.alert('Ошибка', 'Необходима авторизация');
      return;
    }
    try {
      await updateQuickDiscount(discountId, body);
      await loadDiscounts();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка обновления скидки';
      Alert.alert('Ошибка', typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      throw err;
    }
  };

  const handleQuickDeactivateOrRemove = (discount: LoyaltyDiscount) => {
    const ct = getQuickConditionType(discount);
    const bin = isBinaryQuickConditionType(ct);
    Alert.alert(
      'Отключить правило?',
      bin
        ? 'Правило перестанет действовать для новых записей. Запись сохранится (в т.ч. для истории применений); включить или изменить снова можно в карточке типа.'
        : 'Оно перестанет применяться к новым записям.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отключить',
          style: 'destructive',
          onPress: async () => {
            try {
              if (authLoading || !token || !isAuthenticated) return;
              await updateQuickDiscount(discount.id, { is_active: false });
              await loadDiscounts();
            } catch (err: any) {
              const errorMessage = err.response?.data?.detail || err.message || 'Ошибка';
              Alert.alert('Ошибка', typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
            }
          },
        },
      ]
    );
  };

  const handleBulkDeactivateQuick = (conditionType: string) => {
    Alert.alert(
      'Отключить все правила типа?',
      'Будут деактивированы все активные правила этого типа.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отключить все',
          style: 'destructive',
          onPress: async () => {
            try {
              if (authLoading || !token || !isAuthenticated) return;
              await bulkDeactivateQuickDiscountsByType(conditionType);
              await loadDiscounts();
            } catch (err: any) {
              const errorMessage = err.response?.data?.detail || err.message || 'Ошибка';
              Alert.alert('Ошибка', typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
            }
          },
        },
      ]
    );
  };

  const handleActivateBinaryQuick = async (discount: LoyaltyDiscount) => {
    if (authLoading || !token || !isAuthenticated) {
      Alert.alert('Ошибка', 'Необходима авторизация');
      return;
    }
    try {
      await updateQuickDiscount(discount.id, { is_active: true });
      await loadDiscounts();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка';
      Alert.alert('Ошибка', typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  const handleDeleteDiscount = async (discountId: number, type: 'quick' | 'complex' | 'personal') => {
    if (authLoading || !token || !isAuthenticated) {
      Alert.alert('Ошибка', 'Необходима авторизация');
      return;
    }

    Alert.alert(
      'Деактивировать скидку?',
      'Она перестанет применяться к новым записям. Уже оформленные записи не изменятся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Деактивировать',
          style: 'destructive',
          onPress: async () => {
            try {
              if (type === 'quick') {
                await updateQuickDiscount(discountId, { is_active: false });
              } else if (type === 'complex') {
                await updateComplexDiscount(discountId, { is_active: false });
              } else {
                await updatePersonalDiscount(discountId, { is_active: false });
              }
              await loadDiscounts();
            } catch (err: any) {
              const errorMessage = err.response?.data?.detail || err.message || 'Ошибка деактивации скидки';
              Alert.alert('Ошибка', errorMessage);
            }
          },
        },
      ]
    );
  };

  const handleCreateComplexDiscount = async (form: ComplexDiscountForm): Promise<boolean> => {
    if (authLoading || !token || !isAuthenticated) {
      Alert.alert('Ошибка', 'Необходима авторизация');
      return false;
    }

    // Проверяем, что есть хотя бы одно условие
    if (form.conditions.length === 0) {
      Alert.alert('Ошибка', 'Необходимо добавить хотя бы одно условие для сложной скидки');
      return false;
    }

    try {
      // Нормализация conditions выполняется в API слое (loyalty_discounts.ts)
      await createComplexDiscount({
        discount_type: LoyaltyDiscountType.COMPLEX,
        name: form.name,
        description: form.description,
        discount_percent: parseFloat(form.discount_percent),
        max_discount_amount: null,
        conditions: form.conditions,  // Передаём как есть, нормализация в API слое
        is_active: true,
        priority: 1,
      });
      await loadDiscounts();
      setShowComplexForm(false);
      setComplexForm({ name: '', description: '', discount_percent: '', conditions: [] });
      return true;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка создания сложной скидки';
      Alert.alert('Ошибка', errorMessage);
      return false;
    }
  };

  const handleCreatePersonalDiscount = async (form: PersonalDiscountForm): Promise<boolean> => {
    if (authLoading || !token || !isAuthenticated) {
      Alert.alert('Ошибка', 'Необходима авторизация');
      return false;
    }

    try {
      await createPersonalDiscount({
        client_phone: form.client_phone,
        discount_percent: parseFloat(form.discount_percent),
        max_discount_amount: form.max_discount_amount ? parseFloat(form.max_discount_amount) : null,
        description: form.description || null,
        is_active: true,
      });
      await loadDiscounts();
      setShowPersonalForm(false);
      setPersonalForm({ client_phone: '', discount_percent: '', max_discount_amount: '', description: '' });
      return true;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка создания персональной скидки';
      Alert.alert('Ошибка', errorMessage);
      return false;
    }
  };

  // ============================================================================
  // ОБРАБОТЧИКИ ДЛЯ БАЛЛОВ (старая логика)
  // ============================================================================
  const handleChange = (field: keyof LoyaltySettings, value: any) => {
    if (!settings) return;
    
    setSettings({
      ...settings,
      [field]: value,
    });
  };

  const handleSave = async () => {
    if (!settings || !token || !isAuthenticated) return;

    if (settings.is_enabled) {
      if (!settings.accrual_percent || settings.accrual_percent < 1 || settings.accrual_percent > 100) {
        Alert.alert('Ошибка', 'Процент начисления должен быть от 1 до 100');
        return;
      }
      if (!settings.max_payment_percent || settings.max_payment_percent < 1 || settings.max_payment_percent > 100) {
        Alert.alert('Ошибка', 'Процент оплаты баллами должен быть от 1 до 100');
        return;
      }
    }

    try {
      setSaving(true);
      setSettingsError(null);
      setSettingsSuccess(null);

      const updateData: any = {
        is_enabled: settings.is_enabled,
        accrual_percent: settings.is_enabled ? settings.accrual_percent : null,
        max_payment_percent: settings.is_enabled ? settings.max_payment_percent : null,
        points_lifetime_days: settings.is_enabled ? settings.points_lifetime_days : null,
      };

      const updated = await updateLoyaltySettings(updateData);
      setSettings(updated);
      setOriginalSettings(JSON.parse(JSON.stringify(updated)));
      setHasChanges(false);
      setSettingsSuccess('Настройки успешно сохранены');

      if (updated.is_enabled) {
        setPointsAccrualSettingsExpanded(false);
      }

      setTimeout(() => setSettingsSuccess(null), 3000);
      
      if (__DEV__) {
        console.log('[LOYALTY] Settings saved:', updated);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка сохранения настроек';
      setSettingsError(errorMessage);
      Alert.alert('Ошибка', errorMessage);
      
      if (__DEV__) {
        console.error('[LOYALTY] Error saving settings:', err);
      }
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // РЕНДЕРИНГ
  // ============================================================================
  if (featuresLoading || (mainTab === 'points' && settingsLoading)) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // Демо-режим при отсутствии доступа
  if (!hasLoyaltyAccess) {
    const cheapestPlanName = getCheapestPlanForFeature(plans, 'has_loyalty_access');
    const description = cheapestPlanName
      ? `Раздел «Лояльность» доступен в тарифе ${cheapestPlanName}.`
      : 'Раздел «Лояльность» доступен в подписке.';

    return (
      <ScreenContainer scrollable>
        <DemoAccessBanner
          description={description}
          ctaText="Перейти к тарифам"
          onCtaPress={() => router.push('/subscriptions')}
        />
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={styles.title}>Система лояльности</Text>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Демо</Text>
          </View>
        </View>
        <View style={styles.content}>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Быстрые скидки</Text>
            {loyaltyQuickDiscountsDemo.map((d: any) => (
              <View key={d.id} style={styles.demoRow}>
                <Text style={styles.demoLabel}>{d.name}</Text>
                <Text style={styles.demoValue}>{d.discount_percent}%</Text>
              </View>
            ))}
          </Card>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Баллы</Text>
            <View style={styles.demoStatsRow}>
              <View><Text style={styles.demoLabel}>Начислено</Text><Text style={styles.demoValue}>{loyaltyStatsDemo.total_earned}</Text></View>
              <View><Text style={styles.demoLabel}>Списано</Text><Text style={styles.demoValue}>{loyaltyStatsDemo.total_spent}</Text></View>
            </View>
          </Card>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>История</Text>
            {loyaltyHistoryDemo.slice(0, 5).map((h: any) => (
              <View key={h.id} style={styles.demoHistoryRow}>
                <Text style={styles.demoDate}>{h.created_at}</Text>
                <Text style={[styles.demoValue, h.points > 0 ? styles.pos : styles.neg]}>{h.points > 0 ? '+' : ''}{h.points}</Text>
              </View>
            ))}
          </Card>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <Text style={styles.title}>Система лояльности</Text>
      </View>

      {/* Верхние табы: Скидки / Баллы */}
      <View style={styles.mainTabsContainer}>
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'discounts' && styles.mainTabActive]}
          onPress={() => setMainTab('discounts')}
        >
          <Text style={[styles.mainTabText, mainTab === 'discounts' && styles.mainTabTextActive]}>
            Скидки
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'points' && styles.mainTabActive]}
          onPress={() => setMainTab('points')}
        >
          <Text style={[styles.mainTabText, mainTab === 'points' && styles.mainTabTextActive]}>
            Баллы
          </Text>
        </TouchableOpacity>
      </View>

      {/* Контент для таба "Скидки" */}
      {mainTab === 'discounts' && (
        <>
          {/* Подтабы для скидок (Сложные скрыты для MVP) */}
          <View style={styles.subTabsContainer}>
            <TouchableOpacity
              style={[styles.subTab, discountTab === 'quick' && styles.subTabActive]}
              onPress={() => setDiscountTab('quick')}
            >
              <Text style={[styles.subTabText, discountTab === 'quick' && styles.subTabTextActive]}>
                Правила
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, discountTab === 'personal' && styles.subTabActive]}
              onPress={() => setDiscountTab('personal')}
            >
              <Text style={[styles.subTabText, discountTab === 'personal' && styles.subTabTextActive]}>
                Персональные
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {subscriptionRequired && (
              <Card style={styles.warningCard}>
                <Text style={styles.warningText}>
                  Доступ к разделу «Лояльность» доступен в подписке. Обновите тариф, чтобы пользоваться скидками.
                </Text>
                <PrimaryButton
                  title="Управление подпиской"
                  onPress={() => router.push('/subscriptions')}
                  style={styles.subscriptionButton}
                />
              </Card>
            )}

            {createDisabled && (
              <Card style={styles.warningCard}>
                <Text style={styles.warningText}>
                  Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно до завершения.
                </Text>
                <PrimaryButton
                  title="Настройки"
                  onPress={() => router.push('/master/settings')}
                  style={styles.subscriptionButton}
                />
              </Card>
            )}

            {discountsError && (
              <Card style={discountsErrorType === 'warning' ? styles.warningCard : styles.errorCard}>
                <Text style={discountsErrorType === 'warning' ? styles.warningText : styles.errorText}>
                  {discountsError}
                </Text>
              </Card>
            )}

            {discountsLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.loadingText}>Загрузка скидок...</Text>
              </View>
            ) : (
              <>
                {discountTab === 'quick' && (
                  <DiscountsQuickTab
                    templates={templates}
                    discounts={loyaltyStatus?.quick_discounts || []}
                    onSubmitQuickCreate={handleSubmitQuickCreate}
                    onSubmitQuickUpdate={handleSubmitQuickUpdate}
                    onQuickDeactivateOrRemove={handleQuickDeactivateOrRemove}
                    onBulkDeactivateQuick={handleBulkDeactivateQuick}
                    onActivateBinaryQuick={handleActivateBinaryQuick}
                    createDisabled={createDisabled}
                  />
                )}

                {discountTab === 'personal' && (
                  <DiscountsPersonalTab
                    discounts={loyaltyStatus?.personal_discounts || []}
                    onCreateDiscount={handleCreatePersonalDiscount}
                    onDeleteDiscount={(id) => handleDeleteDiscount(id, 'personal')}
                    createDisabled={createDisabled}
                  />
                )}
              </>
            )}
          </View>
        </>
      )}

      {/* Контент для таба "Баллы" (одна страница) */}
      {mainTab === 'points' && settings && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Сообщения об ошибках и успехе */}
          {settingsError && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{settingsError}</Text>
            </Card>
          )}
          {settingsSuccess && (
            <Card style={styles.successCard}>
              <Text style={styles.successText}>{settingsSuccess}</Text>
            </Card>
          )}

          {/* Настройки */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Настройки программы лояльности</Text>

            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Включить программу лояльности</Text>
              <Switch
                value={settings.is_enabled || false}
                onValueChange={(value) => handleChange('is_enabled', value)}
                trackColor={{ false: '#E0E0E0', true: '#4CAF50' }}
                thumbColor="#FFF"
              />
            </View>

            {settings.is_enabled && (
              <TouchableOpacity
                style={styles.pointsAccrualToggleRow}
                onPress={() => setPointsAccrualSettingsExpanded((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  pointsAccrualSettingsExpanded
                    ? 'Свернуть настройки начисления баллов'
                    : 'Развернуть настройки начисления баллов'
                }
              >
                <Text style={styles.pointsAccrualToggleTitle}>Настройки начисления баллов</Text>
                <View style={styles.pointsAccrualToggleRight}>
                  <Text style={styles.pointsAccrualToggleAction}>
                    {pointsAccrualSettingsExpanded ? 'Свернуть' : 'Развернуть'}
                  </Text>
                  <Ionicons
                    name={pointsAccrualSettingsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#4CAF50"
                  />
                </View>
              </TouchableOpacity>
            )}

            {settings.is_enabled && pointsAccrualSettingsExpanded && (
              <View style={styles.settingsContainer}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    Процент от стоимости услуги, который зачисляется на счет клиента (%)
                  </Text>
                  <View style={styles.inputWithSuffix}>
                    <TextInput
                      style={[styles.input, styles.inputWithSuffixInput]}
                      value={settings.accrual_percent?.toString() || ''}
                      onChangeText={(text) => {
                        const value = text === '' ? null : parseInt(text, 10);
                        handleChange('accrual_percent', isNaN(value as number) ? null : value);
                      }}
                      placeholder="Например, 5"
                      keyboardType="numeric"
                    />
                    <Text style={styles.inputSuffix}>%</Text>
                  </View>
                  <Text style={styles.inputHint}>Целое число от 1 до 100</Text>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Срок жизни баллов</Text>
                  <View style={styles.dropdownContainer}>
                    <ScrollView style={styles.pickerContainer} nestedScrollEnabled>
                      {LIFETIME_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.value ?? 'null'}
                          style={[
                            styles.pickerOption,
                            settings.points_lifetime_days === option.value && styles.pickerOptionSelected,
                          ]}
                          onPress={() => handleChange('points_lifetime_days', option.value)}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              settings.points_lifetime_days === option.value && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    Процент стоимости услуги, который можно оплатить баллами (%)
                  </Text>
                  <View style={styles.inputWithSuffix}>
                    <TextInput
                      style={[styles.input, styles.inputWithSuffixInput]}
                      value={settings.max_payment_percent?.toString() || ''}
                      onChangeText={(text) => {
                        const value = text === '' ? null : parseInt(text, 10);
                        handleChange('max_payment_percent', isNaN(value as number) ? null : value);
                      }}
                      placeholder="Например, 50"
                      keyboardType="numeric"
                    />
                    <Text style={styles.inputSuffix}>%</Text>
                  </View>
                  <Text style={styles.inputHint}>Целое число от 1 до 100</Text>
                </View>
              </View>
            )}

            <View style={styles.saveButtonContainer}>
              <PrimaryButton
                title={saving ? 'Сохранение...' : 'Сохранить настройки'}
                onPress={handleSave}
                disabled={saving || !hasChanges}
                style={styles.saveButton}
              />
            </View>
          </Card>

          {/* Статистика */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Статистика</Text>
            {statsLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.loadingText}>Загрузка статистики...</Text>
              </View>
            ) : statsError ? (
              <Card style={styles.errorCard}>
                <Text style={styles.errorText}>{statsError}</Text>
              </Card>
            ) : stats ? (
              <View style={styles.statsGrid}>
                <Card style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name="gift-outline" size={32} color="#4CAF50" />
                  </View>
                  <Text style={styles.statLabel}>Выдано баллов</Text>
                  <Text style={styles.statValue}>{stats.total_earned.toLocaleString()}</Text>
                </Card>
                <Card style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name="trending-down-outline" size={32} color="#f97316" />
                  </View>
                  <Text style={styles.statLabel}>Списано баллов</Text>
                  <Text style={styles.statValue}>{stats.total_spent.toLocaleString()}</Text>
                </Card>
                <Card style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name="wallet-outline" size={32} color="#2563eb" />
                  </View>
                  <Text style={styles.statLabel}>Текущий баланс</Text>
                  <Text style={styles.statValue}>{stats.current_balance.toLocaleString()}</Text>
                </Card>
                <Card style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name="people-outline" size={32} color="#7c3aed" />
                  </View>
                  <Text style={styles.statLabel}>Активных клиентов</Text>
                  <Text style={styles.statValue}>{stats.active_clients_count}</Text>
                </Card>
              </View>
            ) : null}
          </View>

          {/* История */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>История операций</Text>
              <TouchableOpacity
                style={styles.filtersButton}
                onPress={() => setShowHistoryFiltersModal(true)}
              >
                <Text style={styles.filtersButtonText}>Фильтры</Text>
              </TouchableOpacity>
            </View>

            {/* Активные фильтры (chips) */}
            {(appliedHistoryFilters.clientId || appliedHistoryFilters.transactionType || appliedHistoryFilters.startDate || appliedHistoryFilters.endDate) && (
              <View style={styles.activeFiltersContainer}>
                {appliedHistoryFilters.clientId && (
                  <View style={styles.filterChip}>
                    <Text style={styles.filterChipText}>Клиент: {appliedHistoryFilters.clientId}</Text>
                  </View>
                )}
                {appliedHistoryFilters.transactionType && (
                  <View style={styles.filterChip}>
                    <Text style={styles.filterChipText}>
                      Тип: {appliedHistoryFilters.transactionType === 'earned' ? 'Начисление' : 'Списание'}
                    </Text>
                  </View>
                )}
                {appliedHistoryFilters.startDate && (
                  <View style={styles.filterChip}>
                    <Text style={styles.filterChipText}>С: {appliedHistoryFilters.startDate}</Text>
                  </View>
                )}
                {appliedHistoryFilters.endDate && (
                  <View style={styles.filterChip}>
                    <Text style={styles.filterChipText}>По: {appliedHistoryFilters.endDate}</Text>
                  </View>
                )}
              </View>
            )}

            {historyError && (
              <Card style={styles.errorCard}>
                <Text style={styles.errorText}>{historyError}</Text>
              </Card>
            )}

            {historyLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.loadingText}>Загрузка истории...</Text>
              </View>
            ) : history.length === 0 ? (
              <Card style={styles.card}>
                <Text style={styles.emptyText}>Нет транзакций</Text>
              </Card>
            ) : (
              <>
                <View>
                  {history.map((transaction) => (
                    <Card key={transaction.id} style={styles.historyCard}>
                      <View style={styles.historyHeader}>
                        <View
                          style={[
                            styles.historyBadge,
                            transaction.transaction_type === 'earned'
                              ? styles.historyBadgeEarned
                              : styles.historyBadgeSpent,
                          ]}
                        >
                          <Text style={styles.historyBadgeText}>
                            {transaction.transaction_type === 'earned' ? 'Начислено' : 'Списано'}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.historyPoints,
                            transaction.transaction_type === 'earned'
                              ? styles.historyPointsEarned
                              : styles.historyPointsSpent,
                          ]}
                        >
                          {transaction.transaction_type === 'earned' ? '+' : '-'}
                          {transaction.points}
                        </Text>
                      </View>
                      {transaction.client_name && (
                        <Text style={styles.historyClient}>Клиент: {transaction.client_name}</Text>
                      )}
                      {transaction.service_name && (
                        <Text style={styles.historyService}>Услуга: {transaction.service_name}</Text>
                      )}
                      <Text style={styles.historyDate}>
                        {new Date(transaction.earned_at).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </Card>
                  ))}
                </View>

                {/* Пагинация */}
                {history.length > 0 && (
                  <View style={styles.paginationContainer}>
                    <Text style={styles.paginationText}>
                      Показано {historySkip + 1} - {historySkip + history.length} операций
                    </Text>
                    <View style={styles.paginationButtons}>
                      <TouchableOpacity
                        style={[styles.paginationButton, historySkip === 0 && styles.paginationButtonDisabled]}
                        onPress={() => setHistorySkip(Math.max(0, historySkip - historyLimit))}
                        disabled={historySkip === 0}
                      >
                        <Text style={[styles.paginationButtonText, historySkip === 0 && styles.paginationButtonTextDisabled]}>
                          Назад
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.paginationButton, !historyHasMore && styles.paginationButtonDisabled]}
                        onPress={() => setHistorySkip(historySkip + historyLimit)}
                        disabled={!historyHasMore}
                      >
                        <Text style={[styles.paginationButtonText, !historyHasMore && styles.paginationButtonTextDisabled]}>
                          Вперед
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* Модалка фильтров истории */}
      <HistoryFiltersModal
        visible={showHistoryFiltersModal}
        onClose={() => setShowHistoryFiltersModal(false)}
        filters={appliedHistoryFilters}
        onApply={handleApplyHistoryFilters}
        onReset={handleResetHistoryFilters}
      />
    </ScreenContainer>
  );
}

// Старые компоненты DiscountsList и PersonalDiscountsList удалены - заменены на новые компоненты в @src/components/loyalty/

// ============================================================================
// СТИЛИ
// ============================================================================

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginLeft: -16,
    marginRight: -16,
    marginTop: -16,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  mainTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginLeft: -16,
    marginRight: -16,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mainTab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  mainTabActive: {
    borderBottomColor: '#4CAF50',
  },
  mainTabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  mainTabTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  subTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginLeft: -16,
    marginRight: -16,
    paddingLeft: 16,
    paddingRight: 16,
  },
  subTab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActive: {
    borderBottomColor: '#4CAF50',
  },
  subTabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  subTabTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  lockedCard: {
    padding: 32,
    alignItems: 'center',
    marginTop: 32,
  },
  lockedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  lockedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  lockedButton: {
    minWidth: 200,
  },
  demoBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  demoBadgeText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  demoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  demoLabel: { fontSize: 14, color: '#666' },
  demoValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  demoStatsRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  demoHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  demoDate: { fontSize: 13, color: '#666' },
  pos: { color: '#4CAF50' },
  neg: { color: '#f44336' },
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
  },
  warningCard: {
    backgroundColor: '#FFF9C4',
    borderColor: '#FBC02D',
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  warningText: {
    color: '#F57F17',
    fontSize: 14,
    marginBottom: 12,
  },
  subscriptionButton: {
    marginTop: 8,
  },
  successCard: {
    backgroundColor: '#E8F5E9',
    marginBottom: 16,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 14,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  pointsAccrualToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 4,
    gap: 12,
  },
  pointsAccrualToggleTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  pointsAccrualToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pointsAccrualToggleAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  settingsContainer: {
    gap: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingRight: 12,
  },
  inputWithSuffixInput: {
    flex: 1,
    borderWidth: 0,
    paddingRight: 8,
  },
  inputSuffix: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    maxHeight: 200,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  pickerContainer: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  pickerOptionSelected: {
    backgroundColor: '#E8F5E9',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#333',
  },
  pickerOptionTextSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  saveButtonContainer: {
    marginTop: 24,
  },
  saveButton: {
    width: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 16,
    alignItems: 'center',
  },
  statIconWrap: {
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  historyCard: {
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  historyBadgeEarned: {
    backgroundColor: '#4CAF50',
  },
  historyBadgeSpent: {
    backgroundColor: '#F44336',
  },
  historyBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  historyPoints: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyPointsEarned: {
    color: '#4CAF50',
  },
  historyPointsSpent: {
    color: '#F44336',
  },
  historyClient: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  historyService: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 16,
  },
  // Стили для скидок
  templatesContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  templateCard: {
    width: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  templateCardActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  templateIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  templateName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  templateDiscount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  templateActiveBadge: {
    fontSize: 10,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '600',
  },
  discountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  discountInfo: {
    flex: 1,
    marginRight: 12,
  },
  discountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  discountDescription: {
    fontSize: 14,
    color: '#666',
  },
  discountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discountPercent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  actionButton: {
    padding: 8,
  },
  actionButtonText: {
    fontSize: 18,
  },
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 4,
    padding: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  editButton: {
    padding: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  discountMaxAmount: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  filtersContainer: {
    gap: 16,
  },
  filterRow: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  filterSelectContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterSelectOption: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  filterSelectOptionActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  filterSelectText: {
    fontSize: 14,
    color: '#666',
  },
  filterSelectTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  resetFiltersButton: {
    marginTop: 8,
    paddingVertical: 8,
  },
  resetFiltersText: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
  paginationContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paginationText: {
    fontSize: 14,
    color: '#666',
  },
  paginationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  paginationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonText: {
    fontSize: 14,
    color: '#333',
  },
  paginationButtonTextDisabled: {
    color: '#999',
  },
  section: {
    marginTop: 24,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  filtersButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
  },
  filtersButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  activeFiltersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
});
