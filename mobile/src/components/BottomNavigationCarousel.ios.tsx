import React, { type ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { bottomNavLayout } from '@src/constants/bottomNavLayout';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import {
  getIosMasterBottomTabFromSegments,
  IOS_MASTER_BOTTOM_NAV_ITEMS,
} from '@src/config/iosMasterBottomNav';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** iOS master navigation is a fixed four-destination operational surface. */
export function BottomNavigationCarousel() {
  const segments = useSegments();
  const router = useRouter();
  const { setTabBarHeight } = useTabBarHeight();
  const activeTab = getIosMasterBottomTabFromSegments(segments as string[]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    setTabBarHeight(event.nativeEvent.layout.height);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.container} onLayout={handleContainerLayout}>
        <View style={styles.items}>
          {IOS_MASTER_BOTTOM_NAV_ITEMS.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <TouchableOpacity
                key={item.id}
                testID={`bottom-nav-${item.id}`}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isActive }}
                style={[
                  styles.navItem,
                  {
                    paddingVertical: bottomNavLayout.navItemPaddingVertical,
                    paddingHorizontal: bottomNavLayout.navItemPaddingHorizontal,
                    minHeight: bottomNavLayout.navItemMinHeight,
                    borderBottomWidth: isActive ? 3 : 0,
                    borderBottomColor: isActive ? '#2e7d32' : 'transparent',
                  },
                ]}
                onPress={() => {
                  if (!isActive) router.replace(item.route);
                }}
                activeOpacity={0.7}
                hitSlop={bottomNavLayout.hitSlop}
              >
                <Ionicons
                  name={item.icon as IoniconName}
                  size={bottomNavLayout.iconSize}
                  color={isActive ? '#2e7d32' : '#5f6368'}
                  style={{ marginBottom: bottomNavLayout.iconMarginBottom }}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  style={[
                    styles.label,
                    { fontSize: bottomNavLayout.labelFontSize },
                    isActive ? styles.activeLabel : styles.inactiveLabel,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  },
  items: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    width: '100%',
    textAlign: 'center',
  },
  activeLabel: {
    color: '#2e7d32',
    fontWeight: '600',
  },
  inactiveLabel: {
    color: '#5f6368',
    fontWeight: '500',
  },
});
