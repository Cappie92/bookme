import { invalidateSubscriptionCaches } from '@src/utils/subscriptionCache';

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeMasterFeaturesRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyMasterFeaturesRefresh(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

/** Инвалидирует subscription-кэш и перезагружает features во всех подписчиках useMasterFeatures. */
export async function refreshMasterFeaturesGlobally(userId?: number | null): Promise<void> {
  await invalidateSubscriptionCaches(userId);
  notifyMasterFeaturesRefresh();
}
