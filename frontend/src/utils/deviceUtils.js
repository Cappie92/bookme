/**
 * Утилиты для определения типа устройства
 */

/**
 * Определяет, является ли устройство мобильным
 * @returns {boolean}
 */
export function isMobileDevice() {
  // Проверяем User Agent
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  // Регулярные выражения для мобильных устройств
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  
  // Проверяем размер экрана
  const isSmallScreen = window.innerWidth <= 768;
  
  // Проверяем поддержку touch событий
  const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return mobileRegex.test(userAgent) || (isSmallScreen && hasTouchSupport);
}

/**
 * Определяет, является ли устройство планшетом
 * @returns {boolean}
 */
export function isTabletDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const tabletRegex = /ipad|android(?=.*\bMobile\b)(?=.*\bSafari\b)/i;
  
  return tabletRegex.test(userAgent);
}

/**
 * Определяет, является ли устройство смартфоном
 * @returns {boolean}
 */
export function isSmartphoneDevice() {
  return isMobileDevice() && !isTabletDevice();
}

/**
 * Получает тип устройства для верификации
 * @returns {'mobile' | 'desktop'}
 */
export function getVerificationDeviceType() {
  if (isSmartphoneDevice()) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Проверяет, поддерживает ли устройство обратный FlashCall
 * @returns {boolean}
 */
export function supportsReverseFlashCall() {
  return isSmartphoneDevice();
} 