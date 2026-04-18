/**
 * Semantic color contract (DeDato design system).
 * Source of truth for P0 migration — consumed by web (Tailwind) and mobile (theme/colors).
 *
 * Design reference: https://dedato.ru/design-system
 * Registry: docs/design/color-migration-registry.json
 */

export const semanticColors = {
  text: {
    /** Charcoal Text (DS) */
    primary: '#2D2D2D',
    /** Warm Grey (DS) — body secondary */
    secondary: '#909090',
    /** Legacy screens often use #666 — mapped to one muted step */
    muted: '#666666',
    placeholder: '#999999',
    onPrimary: '#FFFFFF',
  },
  surface: {
    /** Pastel Base (DS) */
    page: '#F9F7F6',
    card: '#FFFFFF',
    subtle: '#F3F4F6',
    /** Selected row / soft positive tint */
    highlight: '#F0F9F0',
    muted: '#F5F5F5',
    /** UI kit “hover” button / soft mint control */
    controlMuted: '#E8F5E9',
    controlMutedHover: '#C8E6C9',
  },
  border: {
    /** Mild Taupe family (DS neutral-200) */
    default: '#E7E2DF',
    subtle: '#DDDDDD',
    muted: '#EEEEEE',
    /** Soft green outline (badges / note chips) */
    mint: '#A5D6A7',
  },
  action: {
    /** Vibrant Green (DS) */
    primary: '#4CAF50',
    primaryHover: '#45A049',
    secondary: '#FFFFFF',
  },
  status: {
    success: '#4CAF50',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#DFF5EC',
  },
  link: {
    /** DS does not define link blue; kept for migrating text-blue-* later */
    default: '#2563EB',
    hover: '#1D4ED8',
  },
  focus: {
    ring: '#4CAF50',
  },
  metric: {
    positive: '#4CAF50',
    negative: '#EF4444',
  },
  /** Finance domain — keep distinct from generic status.error where product requires */
  finance: {
    incomeExpected: '#81C784',
    expense: '#F44336',
    loss: '#C62828',
    incomeChipBg: '#E8F5E9', // same hue as surface.controlMuted
    incomeChipText: '#1B5E20',
    expenseChipBg: '#FFEBEE',
    expenseChipText: '#B71C1C',
    periodNavHoverBg: '#E8F5E9',
    periodSurfaceBg: '#F6FBF7',
  },
  feedback: {
    errorBg: '#FEE2E2',
    errorFg: '#DC2626',
  },
};

/**
 * Role paths matching migration registry vocabulary (dot notation).
 * Values mirror semanticColors — use for tooling / docs.
 */
export const semanticColorRoles = {
  'color.text.primary': semanticColors.text.primary,
  'color.text.secondary': semanticColors.text.secondary,
  'color.text.muted': semanticColors.text.muted,
  'color.surface.page': semanticColors.surface.page,
  'color.surface.card': semanticColors.surface.card,
  'color.border.default': semanticColors.border.default,
  'color.action.primary': semanticColors.action.primary,
  'color.action.primaryHover': semanticColors.action.primaryHover,
  'color.status.success': semanticColors.status.success,
  'color.status.warning': semanticColors.status.warning,
  'color.status.error': semanticColors.status.error,
  'color.link.default': semanticColors.link.default,
  'color.link.hover': semanticColors.link.hover,
  'color.border.focus': semanticColors.focus.ring,
  'color.metric.positive': semanticColors.metric.positive,
  'color.metric.negative': semanticColors.metric.negative,
  'color.finance.income.confirmed': semanticColors.action.primary,
  'color.finance.income.expected': semanticColors.finance.incomeExpected,
  'color.finance.expense': semanticColors.finance.expense,
  'color.finance.profit.negative': semanticColors.finance.loss,
};
