import React, { useRef, useEffect, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { bottomNavLayout } from '@src/constants/bottomNavLayout';
import { useSegments, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@src/auth/AuthContext';
import { useMasterMenu } from '@src/contexts/MasterMenuContext';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { getMasterBottomTabFromSegments, masterBottomTabToIndex } from '@src/config/masterBottomTabMap';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface NavigationItem {
  id: string;
  label: string;
  /** Ionicons вместо emoji: на iOS цветные emoji в Text часто дают «?», ☰ при этом мог выглядеть нормально */
  icon: IoniconName;
  route?: string;
  action?: 'menu'; // Специальное действие вместо навигации
}

// Меню для обычных пользователей
const clientNavigationItems: NavigationItem[] = [
  { id: 'profile', label: 'Мой профиль', icon: 'person-outline', route: '/client/dashboard' },
  { id: 'notes', label: 'Мои заметки', icon: 'document-text-outline', route: '/notes' },
  { id: 'settings', label: 'Настройки', icon: 'settings-outline', route: '/settings' },
];

// Меню для мастера
const masterNavigationItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'bar-chart-outline', route: '/', action: undefined },
  { id: 'menu', label: 'Меню', icon: 'menu-outline', action: 'menu', route: undefined },
  { id: 'settings', label: 'Настройки', icon: 'settings-outline', route: '/master/settings', action: undefined },
];

export function BottomNavigationCarousel() {
  const segments = useSegments();
  const router = useRouter();
  const { user } = useAuth();
  const { openMenu, closeMenu, isMenuVisible } = useMasterMenu();
  const { setTabBarHeight } = useTabBarHeight();
  const scrollViewRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  
  // Определяем, является ли пользователь мастером
  const isMaster = user?.role === 'MASTER' || user?.role === 'master' || segments[0] === 'master';
  
  // Выбираем нужное меню
  const navigationItems = isMaster ? masterNavigationItems : clientNavigationItems;
  const itemWidth = Dimensions.get('window').width / navigationItems.length;

  // Активный таб: единый mapping с web (см. masterBottomTabMap.ts)
  const getActiveIndex = (): number => {
    if (isMaster) {
      if (isMenuVisible) return 1;
      return masterBottomTabToIndex(getMasterBottomTabFromSegments(segments as string[]));
    } else {
      const firstSegment = segments[0];
      const secondSegment = (segments as string[]).length > 1 ? (segments as string[])[1] : undefined;
      if (!firstSegment || firstSegment === 'index') return 0;
      if (firstSegment === 'client' && secondSegment === 'dashboard') return 0;
      if (firstSegment === 'notes') return 1;
      if (firstSegment === 'settings') return 2;
      return 0;
    }
  };

  const activeIndex = getActiveIndex();

  // Прокручиваем к активному элементу при изменении сегментов
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: activeIndex * itemWidth,
        animated: true,
      });
    }
  }, [segments, activeIndex, itemWidth, isMenuVisible]);

  // Закрываем меню при переходе на другой экран (master или (master)/master/*)
  const prevRouteRef = useRef<string>('');
  useEffect(() => {
    const currentRoute = segments.join('/');
    const prevRoute = prevRouteRef.current;
    if (prevRoute && currentRoute !== prevRoute) {
      const segs = segments as string[];
      const inMasterStack = segs[0] === 'master' || segs[1] === 'master';
      if (inMasterStack) closeMenu('nav_change');
    }
    prevRouteRef.current = currentRoute;
  }, [segments, closeMenu]);

  const handleItemPress = (item: NavigationItem) => {
    try {
      if (item.action === 'menu') {
        openMenu();
      } else {
        closeMenu('nav_action');
        if (item.route) {
          const currentRoute = segments.join('/');
          const targetRoute = item.route.replace(/^\//, '');
          if (currentRoute !== targetRoute) {
            router.replace(item.route as any);
          }
        }
      }
    } catch (_error) {
      // Fallback silently
    }
  };

  // Измеряем высоту контента таббара (без safe area)
  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setTabBarHeight(height);
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View 
          ref={containerRef}
          style={styles.container}
          onLayout={handleContainerLayout}
        >
          <ScrollView
            ref={scrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            scrollEnabled={true}
            pagingEnabled={false}
            decelerationRate="normal"
            snapToInterval={itemWidth}
            snapToAlignment="start"
            bounces={false}
            scrollEventThrottle={16}
          >
            {navigationItems.map((item, index) => {
              const isActive = index === activeIndex;
              const activeGreen = isMaster ? '#2e7d32' : '#4CAF50';
              const inactiveGray = isMaster ? '#5f6368' : '#666';
              return (
                <TouchableOpacity
                  key={item.id}
                  testID={`bottom-nav-${item.id}`}
                  style={[
                    styles.navItem,
                    {
                      width: itemWidth,
                      paddingVertical: bottomNavLayout.navItemPaddingVertical,
                      paddingHorizontal: bottomNavLayout.navItemPaddingHorizontal,
                      minHeight: bottomNavLayout.navItemMinHeight,
                      borderBottomWidth: isActive ? 3 : 0,
                      borderBottomColor: isActive ? activeGreen : 'transparent',
                    },
                  ]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                  disabled={false}
                  hitSlop={bottomNavLayout.hitSlop}
                >
                  <Ionicons
                    name={item.icon}
                    size={bottomNavLayout.iconSize}
                    color={isActive ? activeGreen : inactiveGray}
                    style={{ marginBottom: bottomNavLayout.iconMarginBottom }}
                  />
                  <Text
                    style={[
                      styles.label,
                      { fontSize: bottomNavLayout.labelFontSize },
                      Platform.OS === 'android' && { includeFontPadding: false, textAlignVertical: 'center' as const },
                      isActive
                        ? { color: activeGreen, fontWeight: '600' as const }
                        : { color: inactiveGray, fontWeight: '500' as const },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#fff',
  },
  container: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android' ? { paddingBottom: 2 } : {}),
  },
  label: {
    textAlign: 'center',
  },
});

