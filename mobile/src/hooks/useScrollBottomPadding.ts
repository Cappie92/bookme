import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';

/** Нижний padding для ScrollView внутри master bottom tab (system nav + tab bar). */
export function useScrollBottomPadding(extraBottom = 40): number {
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useTabBarHeight();
  const measuredTabBarHeight =
    tabBarHeight > 0 ? tabBarHeight : BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT;
  return useMemo(
    () => Math.max(insets.bottom, 8) + measuredTabBarHeight + extraBottom,
    [insets.bottom, measuredTabBarHeight, extraBottom]
  );
}
