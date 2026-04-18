import { Platform } from 'react-native';

/**
 * Визуальные метрики нижней навигации (master + client).
 * iOS — эталон (воздушнее, крупнее глифы); Android — прежние компактные значения.
 *
 * После замены emoji на Ionicons 24px бар визуально «сжался» относительно emoji:
 * векторная иконка легче по оптике, поэтому на iOS поднимаем размер и отступы.
 */
const IOS = {
  iconSize: 28,
  iconMarginBottom: 6,
  navItemPaddingVertical: 16,
  navItemPaddingHorizontal: 8,
  navItemMinHeight: 84,
  labelFontSize: 13,
  underlineHeight: 3,
  hitSlop: { top: 12, bottom: 12, left: 10, right: 10 } as const,
} as const;

/** Ближе к iOS: 24px иконки на Android давали «легковесный» вид и съедание текста из-за includeFontPadding. */
const ANDROID = {
  iconSize: 26,
  iconMarginBottom: 5,
  navItemPaddingVertical: 14,
  navItemPaddingHorizontal: 8,
  navItemMinHeight: 78,
  labelFontSize: 13,
  underlineHeight: 3,
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 } as const,
} as const;

export const bottomNavLayout = Platform.OS === 'ios' ? IOS : ANDROID;

/** До первого onLayout таб-бара — должен совпадать с navItemMinHeight платформы */
export const BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT = bottomNavLayout.navItemMinHeight;
