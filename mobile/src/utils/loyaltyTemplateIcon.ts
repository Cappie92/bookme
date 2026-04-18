import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Поле `icon` в шаблонах лояльности приходит с бэкенда как emoji (`backend/routers/loyalty.py`).
 * В `Text` на iOS часть emoji рендерится как «?» — используем Ionicons.
 */
const TEMPLATE_EMOJI_TO_IONICON: Record<string, IoniconName> = {
  '🎁': 'gift-outline',
  '⭐': 'star-outline',
  '🔄': 'refresh-outline',
  '🎂': 'calendar-outline',
  '⏰': 'time-outline',
  '✂️': 'cut-outline',
};

export function loyaltyTemplateIconName(icon: string | undefined | null): IoniconName {
  const key = (icon ?? '').trim();
  return TEMPLATE_EMOJI_TO_IONICON[key] ?? 'pricetag-outline';
}
