import type { SubscriptionAccessSummary } from '@src/services/api/subscriptions';

export type IosAccessState =
  | { kind: 'LOADING' }
  | { kind: 'READY_FREE'; summary: SubscriptionAccessSummary }
  | { kind: 'READY_PAID'; summary: SubscriptionAccessSummary }
  | { kind: 'READY_ALWAYS_FREE'; summary: SubscriptionAccessSummary }
  | { kind: 'ERROR'; message: string };

export const IOS_ACCESS_LOADING: IosAccessState = { kind: 'LOADING' };

export function resolveIosAccessState(summary: SubscriptionAccessSummary): IosAccessState {
  if (summary.access_level === 'free') return { kind: 'READY_FREE', summary };
  if (summary.access_level === 'paid') return { kind: 'READY_PAID', summary };
  if (summary.access_level === 'always_free' && summary.is_always_free) {
    return { kind: 'READY_ALWAYS_FREE', summary };
  }
  return { kind: 'ERROR', message: 'Не удалось определить текущий уровень доступа' };
}

export async function loadIosAccessState(
  loadSummary: () => Promise<SubscriptionAccessSummary>
): Promise<IosAccessState> {
  try {
    return resolveIosAccessState(await loadSummary());
  } catch {
    return { kind: 'ERROR', message: 'Не удалось загрузить сведения о доступе' };
  }
}
