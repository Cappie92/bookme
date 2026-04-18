/**
 * Безопасный "Назад": если в истории есть экран — router.back(), иначе — replace на fallbackPath.
 * Убирает warning "GO_BACK was not handled..." при cold start / deeplink / replace (нет истории).
 */
import { router } from 'expo-router';

export function safeBack(fallbackPath: string): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackPath as any);
  }
}
