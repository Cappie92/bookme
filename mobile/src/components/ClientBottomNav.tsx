/**
 * Нижняя навигация для client-ветки. Без MasterMenuContext — client никогда не монтирует master-хуки.
 */
import React, { useRef, useEffect, type ComponentProps } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, LayoutChangeEvent } from 'react-native';
import { bottomNavLayout } from '@src/constants/bottomNavLayout';
import { useSegments, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface NavigationItem {
  id: string;
  label: string;
  icon: IoniconName;
  route: string;
}

const clientNavigationItems: NavigationItem[] = [
  { id: 'profile', label: 'Мой профиль', icon: 'person-outline', route: '/client/dashboard' },
  { id: 'notes', label: 'Мои заметки', icon: 'document-text-outline', route: '/notes' },
  { id: 'settings', label: 'Настройки', icon: 'settings-outline', route: '/settings' },
];

export function ClientBottomNav() {
  const segments = useSegments();
  const router = useRouter();
  const { setTabBarHeight } = useTabBarHeight();
  const scrollViewRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);

  const itemWidth = Dimensions.get('window').width / clientNavigationItems.length;

  // segments может быть ['(client)', 'client', 'dashboard'] или ['client', 'dashboard']
  const getActiveIndex = (): number => {
    const segs = segments as string[];
    const first = segs[0];
    const second = segs[1];
    const third = segs[2];
    if (first === 'client' && second === 'dashboard') return 0;
    if (first === '(client)' && second === 'client' && third === 'dashboard') return 0;
    if (first === 'notes' || second === 'notes') return 1;
    if (first === 'settings' || second === 'settings') return 2;
    return 0;
  };

  const activeIndex = getActiveIndex();

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: activeIndex * itemWidth,
        animated: true,
      });
    }
  }, [segments, activeIndex, itemWidth]);

  const handleItemPress = (item: NavigationItem) => {
    try {
      const effectivePath = (segments as string[]).filter((s) => s !== '(client)').join('/');
      const targetRoute = item.route.replace(/^\//, '');
      const isAlreadyThere =
        effectivePath === targetRoute || effectivePath.startsWith(targetRoute + '/');
      if (!isAlreadyThere) {
        router.replace(item.route as any);
      }
    } catch (_error) {
      // Fallback silently
    }
  };

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setTabBarHeight(height);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View ref={containerRef} style={styles.container} onLayout={handleContainerLayout}>
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
          {clientNavigationItems.map((item, index) => {
            const isActive = index === activeIndex;
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
                  color={isActive ? '#4CAF50' : '#666'}
                  style={{ marginBottom: bottomNavLayout.iconMarginBottom }}
                />
                <Text
                  style={[
                    styles.label,
                    { fontSize: bottomNavLayout.labelFontSize },
                    isActive && styles.labelActive,
                  ]}
                >
                  {item.label}
                </Text>
                {isActive && (
                  <View
                    style={[
                      styles.underline,
                      { height: bottomNavLayout.underlineHeight },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
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
    shadowOffset: { width: 0, height: -2 },
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
  },
  label: {
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  labelActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
});
