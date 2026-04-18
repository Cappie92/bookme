/**
 * Mobile semantic colors — same contract as web `sem-*` Tailwind tokens
 * (source: shared/theme/semanticColors.js).
 *
 * Prefer importing `semanticColors` from `shared/theme/semanticColors` in app code,
 * or use this module for convenience re-exports and future RN-specific aliases.
 */
import { semanticColors } from 'shared/theme/semanticColors';

export { semanticColors } from 'shared/theme/semanticColors';

export type SemanticColors = typeof semanticColors;

/** Dot-notation roles aligned with docs/design/color-migration-registry.json */
export const semanticRoles = {
  textPrimary: semanticColors.text.primary,
  textSecondary: semanticColors.text.secondary,
  textMuted: semanticColors.text.muted,
  textPlaceholder: semanticColors.text.placeholder,
  textOnPrimary: semanticColors.text.onPrimary,
  surfacePage: semanticColors.surface.page,
  surfaceCard: semanticColors.surface.card,
  surfaceSubtle: semanticColors.surface.subtle,
  borderDefault: semanticColors.border.default,
  borderSubtle: semanticColors.border.subtle,
  actionPrimary: semanticColors.action.primary,
  actionPrimaryHover: semanticColors.action.primaryHover,
  statusSuccess: semanticColors.status.success,
  statusWarning: semanticColors.status.warning,
  statusError: semanticColors.status.error,
  linkDefault: semanticColors.link.default,
  linkHover: semanticColors.link.hover,
  focus: semanticColors.focus.ring,
  metricPositive: semanticColors.metric.positive,
  metricNegative: semanticColors.metric.negative,
} as const;
