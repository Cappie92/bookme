import React, { type ComponentProps } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@src/auth/AuthContext';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAvailableSubscriptions, SubscriptionPlan, SubscriptionType } from '@src/services/api/subscriptions';
import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
import { getMasterSettings } from '@src/services/api/master';
import { isSalonFeaturesEnabled as getSalonFeaturesEnabled } from '@src/config/features';
import { logger } from '@src/utils/logger';
import { PLANS_PREFIX, SETTINGS_PREFIX } from '@src/utils/subscriptionCache';

const CACHE_TTL = 15 * 60 * 1000; // 15 минут

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const menuItems: MenuItem[] = [
  { id: 'schedule', label: 'Расписание', icon: 'calendar-outline', route: '/master/schedule', feature: null },
  { id: 'services', label: 'Услуги', icon: 'cut-outline', route: '/master/services', feature: null },
  { id: 'clients', label: 'Клиенты', icon: 'people-outline', route: '/master/clients', feature: null },
  { id: 'stats', label: 'Статистика', icon: 'bar-chart-outline', route: '/master/stats', feature: 'has_extended_stats' },
  { id: 'client_restrictions', label: 'Правила', icon: 'ban-outline', route: '/master/client-restrictions', feature: 'has_client_restrictions' },
  { id: 'loyalty', label: 'Лояльность', icon: 'gift-outline', route: '/master/loyalty', feature: 'has_loyalty_access' },
  { id: 'finance', label: 'Финансы', icon: 'wallet-outline', route: '/master/finance', feature: 'has_finance_access' },
  { id: 'invitations', label: 'Приглашения', icon: 'business-outline', route: '/master/invitations', feature: null, requiresSalon: true },
  { id: 'my_tariff', label: 'Мой тариф', icon: 'card-outline', route: '/subscriptions', feature: null },
];

interface MenuItem {
  id: string;
  label: string;
  icon: IoniconName;
  route: string;
  feature: string | null; // Ключ функции для проверки доступа
  requiresSalon?: boolean; // Пункт доступен только если включён салонный режим
}

interface MasterHamburgerMenuProps {
  visible: boolean;
  onClose: (reason?: string) => void;
}

export function MasterHamburgerMenu({ visible, onClose }: MasterHamburgerMenuProps) {
  const { user } = useAuth();
  const { features, loading } = useMasterFeatures();
  const [plans, setPlans] = React.useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(false);
  const [canWorkInSalon, setCanWorkInSalon] = React.useState<boolean | null>(null);
  const [settingsLoading, setSettingsLoading] = React.useState(false);
  const [salonFeaturesEnabled, setSalonFeaturesEnabled] = React.useState<boolean>(false);
  const userId = user?.id ?? null;

  const loadPlans = React.useCallback(async () => {
    if (userId == null) return;
    const role = (user as { role?: string })?.role;
    if (role !== 'master' && role !== 'MASTER' && role !== 'indie') return;
    const plansKey = `${PLANS_PREFIX}:${userId}`;
    try {
      setPlansLoading(true);
      const cached = await AsyncStorage.getItem(plansKey);
      if (cached) {
        const parsed: CachedData<SubscriptionPlan[]> = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          setPlans(parsed.data);
          return;
        }
      }
      const data = await fetchAvailableSubscriptions(SubscriptionType.MASTER);
      setPlans(data);
      await AsyncStorage.setItem(plansKey, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      logger.warn('menu', 'Failed to load subscription plans for menu:', e);
    } finally {
      setPlansLoading(false);
    }
  }, [userId, user]);

  const loadMasterSettings = React.useCallback(async () => {
    if (userId == null) return;
    const role = (user as { role?: string })?.role;
    if (role !== 'master' && role !== 'MASTER' && role !== 'indie') return;
    const settingsKey = `${SETTINGS_PREFIX}:${userId}`;
    try {
      setSettingsLoading(true);
      const cached = await AsyncStorage.getItem(settingsKey);
      if (cached) {
        const parsed: CachedData<{ master?: { can_work_in_salon?: boolean } }> = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          const v = parsed?.data?.master?.can_work_in_salon;
          setCanWorkInSalon(typeof v === 'boolean' ? v : false);
          return;
        }
      }
      const data = await getMasterSettings();
      const v = data?.master?.can_work_in_salon;
      setCanWorkInSalon(typeof v === 'boolean' ? v : false);
      await AsyncStorage.setItem(settingsKey, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      logger.warn('menu', 'Failed to load master settings for menu:', e);
      setCanWorkInSalon(false);
    } finally {
      setSettingsLoading(false);
    }
  }, [userId, user]);

  // Подгружаем планы при открытии меню (один раз/по TTL) — только когда features уже есть
  React.useEffect(() => {
    if (!visible) return;
    if (loading || !features) return;
    if (plansLoading) return;
    if (plans.length > 0) return;
    loadPlans();
  }, [visible, loading, features, plansLoading, plans.length, loadPlans]);

  // Подгружаем настройки мастера (can_work_in_salon) при открытии меню
  React.useEffect(() => {
    if (!visible) return;
    if (settingsLoading) return;
    if (canWorkInSalon !== null) return;
    loadMasterSettings();
  }, [visible, settingsLoading, canWorkInSalon, loadMasterSettings]);

  // Глобальная настройка: включены ли салонные функции (по аналогии с web featureSettings)
  React.useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        setSalonFeaturesEnabled(await getSalonFeaturesEnabled());
      } catch (e) {
        setSalonFeaturesEnabled(false);
      }
    })();
  }, [visible]);

  const isItemDisabled = (item: MenuItem): boolean => {
    if (!item.feature) return false;
    if (loading || !features) return true;
    return (features as any)[item.feature] !== true;
  };

  const handleItemPress = (item: MenuItem, disabled: boolean) => {
    if (disabled) return;
    onClose('nav_action');
    router.push(item.route as any);
  };

  const handleChipPress = () => {
    onClose('chip_press');
    router.push('/subscriptions');
  };

  const PlanAccessChip = ({ text }: { text: string }) => {
    return (
      <TouchableOpacity onPress={handleChipPress} activeOpacity={0.8} style={styles.planChip}>
        <Text style={styles.planChipText} numberOfLines={1}>
          {text}
        </Text>
      </TouchableOpacity>
    );
  };

  const visibleMenuItems = React.useMemo(() => {
    // Пока настройки не загрузились — салонные пункты не показываем (чтобы не светить выключенный функционал)
    const salonEnabled = salonFeaturesEnabled === true && canWorkInSalon === true;
    return menuItems.filter((item) => !item.requiresSalon || salonEnabled);
  }, [canWorkInSalon, salonFeaturesEnabled]);

  // DEV: сводный лог по гейтам — только при DEBUG_MENU
  const lastDebugKeyRef = React.useRef<string>('');
  React.useEffect(() => {
    if (!visible) return;
    const summary = (visibleMenuItems || []).map((item) => {
      const disabledByFeature = isItemDisabled(item);
      const hasFeature = !!item.feature;
      const isLoadingAccessState = hasFeature && (loading || !features);
      const isDenied = hasFeature && !isLoadingAccessState && disabledByFeature;
      const cheapestPlanName = isDenied && !plansLoading && plans.length > 0 && item.feature
        ? getCheapestPlanForFeature(plans, item.feature)
        : null;
      return {
        id: item.id,
        featureKey: item.feature,
        featureValue: item.feature ? (features as any)?.[item.feature] : null,
        loading,
        hasFeatures: !!features,
        isDenied,
        requiredPlanLabel: cheapestPlanName ? `Тариф ${cheapestPlanName}` : null,
      };
    });
    const key = JSON.stringify(summary);
    if (key !== lastDebugKeyRef.current) {
      lastDebugKeyRef.current = key;
      logger.debug('menu', '🧩 [MENU DEBUG]', summary);
    }
  }, [visible, visibleMenuItems, loading, features, plansLoading, plans]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => onClose('hardware_back')}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={() => onClose('overlay_press')}
        />
        <View style={styles.sheet}>
          {/* Заголовок */}
          <View style={styles.header}>
            <Text style={styles.title}>Меню</Text>
            <TouchableOpacity onPress={() => onClose('close_button')} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Список пунктов меню */}
          <ScrollView
            style={styles.menuList}
            contentContainerStyle={styles.menuListContent}
            showsVerticalScrollIndicator={false}
          >
            {visibleMenuItems.map((item) => {
              const disabledByFeature = isItemDisabled(item);
              const hasFeature = !!item.feature;
              const isLoadingAccessState = hasFeature && (loading || !features);
              const isDenied = hasFeature && !isLoadingAccessState && disabledByFeature;

              const showChip = isDenied && !plansLoading && plans.length > 0;
              const cheapestPlanName =
                showChip && item.feature ? getCheapestPlanForFeature(plans, item.feature) : null;

              const onPress =
                isLoadingAccessState ? undefined :
                isDenied ? handleChipPress :
                () => handleItemPress(item, false);

              const visuallyDisabled = isLoadingAccessState || isDenied;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.menuItem, visuallyDisabled && styles.menuItemDisabled]}
                  activeOpacity={onPress ? 0.7 : 1}
                  onPress={onPress}
                  disabled={!onPress}
                >
                  <View style={styles.menuRow}>
                    <View style={styles.menuIconWrap}>
                      <Ionicons name={item.icon} size={22} color={visuallyDisabled ? '#bbb' : '#333'} />
                    </View>
                    <Text
                      style={[styles.menuLabel, visuallyDisabled && styles.menuLabelDisabled]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>

                    {showChip && cheapestPlanName ? (
                      <View style={styles.planChipInline} pointerEvents="none">
                        <Text style={styles.planChipText} numberOfLines={1}>
                          {`Тариф ${cheapestPlanName}`}
                        </Text>
                      </View>
                    ) : null}

                    {plansLoading && isDenied && !cheapestPlanName ? (
                      <View style={styles.planChipInline} pointerEvents="none">
                        <ActivityIndicator size="small" color="#999" />
                      </View>
                    ) : null}

                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={visuallyDisabled ? '#ccc' : '#999'}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '82%',
    width: '100%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuList: {
    flexGrow: 1,
  },
  menuListContent: {
    paddingBottom: 12,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    minHeight: 52,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIconWrap: {
    width: 28,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuLabelDisabled: {
    color: '#999',
  },
  planChipInline: {
    marginRight: 10,
    maxWidth: 150,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#eef3ff',
    borderWidth: 1,
    borderColor: '#d7e3ff',
  },
  planChipText: {
    fontSize: 11,
    color: '#2f5bea',
    fontWeight: '600',
  },
});

