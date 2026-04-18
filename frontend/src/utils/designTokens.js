// Дизайн-токены для консистентного использования в приложении

export const colors = {
  // Основные цвета бренда
  primary: {
    50: '#DFF5EC',  // Cool Mint
    100: '#DFF5EC', // Cool Mint
    200: '#C8E8D8',
    300: '#B1DBC4',
    400: '#9ACEB0',
    500: '#4CAF50', // Vibrant Green - основной цвет
    600: '#45A049',
    700: '#3D8B42',
    800: '#35773B',
    900: '#2D6334',
    950: '#1A3A1F',
  },
  // Дополнительные цвета
  secondary: {
    50: '#F9F7F6',  // Светлый нейтральный
    100: '#F9F7F6',
    200: '#E7E2DF',  // Средний нейтральный
    300: '#D4CEC9',
    400: '#C1BAB3',
    500: '#6AA66A',  // Дополнительный зеленый
    600: '#5F955F',
    700: '#548454',
    800: '#497349',
    900: '#3E623E',
  },
  // Нейтральные цвета
  neutral: {
    50: '#F9F7F6',   // Светлый фон
    100: '#F9F7F6',
    200: '#E7E2DF',  // Средний фон
    300: '#D4CEC9',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#2D2D2D',  // Темный нейтральный
    900: '#171717',
  },
  // Цвета для статусов (обновленные)
  success: {
    50: '#DFF5EC',
    100: '#C8E8D8',
    200: '#B1DBC4',
    300: '#9ACEB0',
    400: '#4CAF50',
    500: '#4CAF50', // Используем Vibrant Green
    600: '#45A049',
    700: '#3D8B42',
    800: '#35773B',
    900: '#2D6334',
  },
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
}

export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    display: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
    '6xl': '3.75rem',
  },
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
}

export const spacing = {
  xs: '0.25rem',    // 4px
  sm: '0.5rem',     // 8px
  md: '1rem',       // 16px
  lg: '1.5rem',     // 24px
  xl: '2rem',       // 32px
  '2xl': '3rem',    // 48px
  '3xl': '4rem',    // 64px
  '4xl': '6rem',    // 96px
}

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  DEFAULT: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
}

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
}

export const zIndex = {
  modal: 1000,
  overlay: 999,
  dropdown: 100,
  header: 50,
  tooltip: 10,
}

// Готовые классы для часто используемых стилей
export const commonStyles = {
  // Кнопки
  button: {
    primary: 'bg-primary-500 hover:bg-primary-600 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200',
    secondary: 'bg-secondary-100 hover:bg-secondary-200 text-secondary-700 font-medium px-4 py-2 rounded-lg transition-colors duration-200',
    outline: 'border border-primary-500 text-primary-500 hover:bg-primary-50 font-medium px-4 py-2 rounded-lg transition-colors duration-200',
    danger: 'bg-error-500 hover:bg-error-600 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200',
    ghost: 'text-secondary-600 hover:bg-secondary-100 font-medium px-4 py-2 rounded-lg transition-colors duration-200',
  },
  // Карточки
  card: {
    default: 'bg-white rounded-lg shadow-md border border-neutral-200 p-6',
    elevated: 'bg-white rounded-lg shadow-lg border border-neutral-200 p-6',
    flat: 'bg-white rounded-lg border border-neutral-200 p-6',
  },
  // Инпуты
  input: {
    default: 'w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200',
    error: 'w-full px-3 py-2 border border-error-300 rounded-lg focus:ring-2 focus:ring-error-500 focus:border-error-500 transition-colors duration-200',
  },
  // Бейджи
  badge: {
    primary: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800',
    success: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800',
    warning: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800',
    error: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-error-100 text-error-800',
    neutral: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800',
  },
  // Алерты
  alert: {
    success: 'bg-success-50 border border-success-200 text-success-800 px-4 py-3 rounded-lg',
    warning: 'bg-warning-50 border border-warning-200 text-warning-800 px-4 py-3 rounded-lg',
    error: 'bg-error-50 border border-error-200 text-error-800 px-4 py-3 rounded-lg',
    info: 'bg-primary-50 border border-primary-200 text-primary-800 px-4 py-3 rounded-lg',
  },
}

// Утилиты для создания стилей
export const createButtonStyle = (variant = 'primary', size = 'md', disabled = false) => {
  const baseStyle = commonStyles.button[variant] || commonStyles.button.primary
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  }
  const disabledStyle = disabled ? 'opacity-50 cursor-not-allowed' : ''
  
  return `${baseStyle} ${sizeStyles[size]} ${disabledStyle}`.trim()
}

export const createInputStyle = (hasError = false) => {
  return hasError ? commonStyles.input.error : commonStyles.input.default
}

export const createCardStyle = (variant = 'default') => {
  return commonStyles.card[variant] || commonStyles.card.default
}

export const createBadgeStyle = (variant = 'neutral') => {
  return commonStyles.badge[variant] || commonStyles.badge.neutral
}

export const createAlertStyle = (variant = 'info') => {
  return commonStyles.alert[variant] || commonStyles.alert.info
} 