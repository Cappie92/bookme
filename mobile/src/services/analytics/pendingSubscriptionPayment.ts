import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingSubscriptionPayment } from './types';

const PENDING_KEY = '@dedato/pending_subscription_payment_v1';
const DELIVERY_STATE_KEY = '@dedato/payment_delivery_state_v1';

export type PaymentDeliveryState = {
  /** Backend paid+applied already observed and success event path taken or claimed. */
  successEventAttempted: boolean;
  /** Revenue report attempted (sent or intentionally skipped — e.g. invalid cash). */
  revenueAttempted: boolean;
};

type DeliveryStateMap = Record<string, PaymentDeliveryState>;

const memoryDelivery = new Map<string, PaymentDeliveryState>();

export async function savePendingSubscriptionPayment(
  payment: PendingSubscriptionPayment
): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(payment));
  } catch {
    /* ignore */
  }
}

export async function peekPendingSubscriptionPayment(): Promise<PendingSubscriptionPayment | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingSubscriptionPayment;
  } catch {
    return null;
  }
}

export async function clearPendingSubscriptionPayment(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

async function readDeliveryMap(): Promise<DeliveryStateMap> {
  try {
    const raw = await AsyncStorage.getItem(DELIVERY_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DeliveryStateMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDeliveryMap(map: DeliveryStateMap): Promise<void> {
  try {
    const entries = Object.entries(map).slice(-50);
    await AsyncStorage.setItem(DELIVERY_STATE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

function getMemoryState(publicId: string): PaymentDeliveryState {
  const existing = memoryDelivery.get(publicId);
  if (existing) return existing;
  const fresh = { successEventAttempted: false, revenueAttempted: false };
  memoryDelivery.set(publicId, fresh);
  return fresh;
}

async function hydrateMemory(publicId: string): Promise<PaymentDeliveryState> {
  const mem = getMemoryState(publicId);
  if (mem.successEventAttempted && mem.revenueAttempted) return mem;
  const map = await readDeliveryMap();
  const stored = map[publicId];
  if (stored) {
    mem.successEventAttempted = mem.successEventAttempted || !!stored.successEventAttempted;
    mem.revenueAttempted = mem.revenueAttempted || !!stored.revenueAttempted;
  }
  return mem;
}

async function persistMemory(publicId: string): Promise<void> {
  const mem = getMemoryState(publicId);
  const map = await readDeliveryMap();
  map[publicId] = {
    successEventAttempted: mem.successEventAttempted,
    revenueAttempted: mem.revenueAttempted,
  };
  await writeDeliveryMap(map);
}

/**
 * Claim на обычное success-событие (at-most-once attempt).
 * Не блокирует отдельный revenue claim.
 */
export async function claimSuccessEventAttempt(publicId: string): Promise<boolean> {
  if (!publicId) return false;
  const mem = getMemoryState(publicId);
  if (mem.successEventAttempted) return false;
  // sync claim до await — защита от параллельных Promise в одном runtime
  mem.successEventAttempted = true;
  try {
    const map = await readDeliveryMap();
    if (map[publicId]?.successEventAttempted) {
      return false;
    }
    map[publicId] = {
      successEventAttempted: true,
      revenueAttempted: !!map[publicId]?.revenueAttempted || mem.revenueAttempted,
    };
    mem.revenueAttempted = map[publicId].revenueAttempted;
    await writeDeliveryMap(map);
    return true;
  } catch {
    return true;
  }
}

/**
 * Claim на Revenue attempt (at-most-once attempt).
 * Вызывать и при skip (невалидная сумма), чтобы не крутить бесконечные ретраи.
 */
export async function claimRevenueAttempt(publicId: string): Promise<boolean> {
  if (!publicId) return false;
  const mem = getMemoryState(publicId);
  if (mem.revenueAttempted) return false;
  mem.revenueAttempted = true;
  try {
    const map = await readDeliveryMap();
    if (map[publicId]?.revenueAttempted) {
      return false;
    }
    map[publicId] = {
      successEventAttempted: !!map[publicId]?.successEventAttempted || mem.successEventAttempted,
      revenueAttempted: true,
    };
    mem.successEventAttempted = map[publicId].successEventAttempted;
    await writeDeliveryMap(map);
    return true;
  } catch {
    return true;
  }
}

export async function getPaymentDeliveryState(
  publicId: string
): Promise<PaymentDeliveryState> {
  return hydrateMemory(publicId);
}

/** @deprecated — use claimSuccessEventAttempt / claimRevenueAttempt */
export async function claimPaymentSuccessReport(publicId: string): Promise<boolean> {
  const ok = await claimSuccessEventAttempt(publicId);
  if (ok) {
    // legacy single-flag callers: also mark revenue claimed to preserve at-most-once
    await claimRevenueAttempt(publicId);
  }
  return ok;
}

export async function wasPaymentSuccessReported(publicId: string): Promise<boolean> {
  const s = await hydrateMemory(publicId);
  return s.successEventAttempted;
}

export async function markPaymentSuccessReported(publicId: string): Promise<void> {
  await claimPaymentSuccessReport(publicId);
}

/** Только для unit-тестов. */
export function resetPaymentSuccessClaimsForTests(): void {
  memoryDelivery.clear();
}
