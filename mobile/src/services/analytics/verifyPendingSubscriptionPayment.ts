import { getPaymentPublicStatus } from '@src/services/api/payments';
import { analytics } from './Analytics';
import { AnalyticsEvent } from './events';
import { normalizeMoneyAmount } from './normalize';
import {
  claimRevenueAttempt,
  claimSuccessEventAttempt,
  clearPendingSubscriptionPayment,
  peekPendingSubscriptionPayment,
} from './pendingSubscriptionPayment';
import {
  isPaymentFullyConfirmed,
  resolvePaymentVerifyState,
  type PaymentVerifyState,
} from '@src/utils/paymentPublicStatus';

export type VerifyPendingPaymentResult = {
  state: PaymentVerifyState;
  publicId: string | null;
  reportedSuccess?: boolean;
  reportedRevenue?: boolean;
};

/** In-flight dedupe: параллельные verify одного paymentId ждут один Promise. */
const inflightByPaymentId = new Map<string, Promise<VerifyPendingPaymentResult>>();

/**
 * Delivery guarantee (client SDK path): **at-most-once best-effort**.
 * Не exactly-once и не at-least-once: crash/SDK drop может потерять событие.
 * Надёжная Revenue-доставка — отдельный backend Post API трек.
 *
 * Порядок:
 * 1) backend public-status confirm (paid+applied)
 * 2) claim success → track success
 * 3) claim revenue → reportRevenue (или skip при невалидной сумме)
 * 4) clear pending
 */
export async function verifyPendingSubscriptionPayment(options?: {
  skipWebReturned?: boolean;
  source?: string;
}): Promise<VerifyPendingPaymentResult> {
  const pending = await peekPendingSubscriptionPayment();
  if (!pending?.publicId) {
    return { state: 'not_found', publicId: null };
  }

  const publicId = pending.publicId;
  const existing = inflightByPaymentId.get(publicId);
  if (existing) {
    return existing;
  }

  const run = doVerify(pending, options).finally(() => {
    inflightByPaymentId.delete(publicId);
  });
  inflightByPaymentId.set(publicId, run);
  return run;
}

async function doVerify(
  pending: NonNullable<Awaited<ReturnType<typeof peekPendingSubscriptionPayment>>>,
  options?: { skipWebReturned?: boolean; source?: string }
): Promise<VerifyPendingPaymentResult> {
  const publicId = pending!.publicId;

  if (!options?.skipWebReturned) {
    analytics.track(AnalyticsEvent.SubscriptionPaymentWebReturned, {
      paymentId: publicId,
      screen: options?.source || 'subscriptions',
    });
  }

  try {
    const result = await getPaymentPublicStatus({ paymentPublicId: publicId });
    const state = resolvePaymentVerifyState(result);

    analytics.track(AnalyticsEvent.SubscriptionPaymentStatusChecked, {
      paymentId: publicId,
      paymentStatus: state,
      planMonths: pending!.planMonths,
      usedPoints: pending!.pointsUsed > 0,
      hasPromo: pending!.hasPromo,
    });

    if (isPaymentFullyConfirmed(state)) {
      let reportedSuccess = false;
      let reportedRevenue = false;

      const cash = normalizeMoneyAmount(pending!.cashPaidAmount);
      const full = normalizeMoneyAmount(pending!.planFullAmount);
      const pointsUsed =
        typeof pending!.pointsUsed === 'number' && Number.isFinite(pending!.pointsUsed)
          ? Math.max(0, Math.floor(pending!.pointsUsed))
          : 0;
      const currency = (pending!.currency || 'RUB').toUpperCase();

      // 2) success event — отдельный claim (не блокирует revenue)
      if (await claimSuccessEventAttempt(publicId)) {
        analytics.track(AnalyticsEvent.SubscriptionPaymentSuccess, {
          paymentId: publicId,
          planMonths: pending!.planMonths,
          paymentStatus: 'success',
          usedPoints: pointsUsed > 0,
          hasPromo: pending!.hasPromo,
          cashPaidAmount: cash ?? 0,
          planFullAmount: full ?? cash ?? 0,
          pointsUsed,
          currency,
        });
        reportedSuccess = true;
      }

      // 3) revenue — отдельный claim; skip тоже помечаем attempted (без бесконечных ретраев)
      // Только реальные деньги Robokassa (card). cash===0 / null → не reportRevenue.
      if (await claimRevenueAttempt(publicId)) {
        if (cash != null && cash > 0) {
          analytics.reportRevenue({
            price: cash,
            currency,
            productID: `subscription_${pending!.planMonths}m`,
            quantity: 1,
            payload: {
              paymentId: publicId,
              planMonths: pending!.planMonths,
              planFullAmount: full ?? cash,
              cashPaidAmount: cash,
              pointsUsed,
              currency,
            },
          });
          reportedRevenue = true;
        }
      }

      await clearPendingSubscriptionPayment();
      return { state, publicId, reportedSuccess, reportedRevenue };
    }

    if (state === 'expired') {
      analytics.track(AnalyticsEvent.SubscriptionPaymentExpired, {
        paymentId: publicId,
        paymentStatus: 'expired',
        planMonths: pending!.planMonths,
      });
      await clearPendingSubscriptionPayment();
      return { state, publicId };
    }

    if (state === 'failed') {
      analytics.track(AnalyticsEvent.SubscriptionPaymentFailed, {
        paymentId: publicId,
        paymentStatus: 'failed',
        planMonths: pending!.planMonths,
      });
      await clearPendingSubscriptionPayment();
      return { state, publicId };
    }

    // activating / pending — pending payment оставляем
    return { state, publicId };
  } catch {
    analytics.track(AnalyticsEvent.SubscriptionPaymentStatusChecked, {
      paymentId: publicId,
      paymentStatus: 'error',
      planMonths: pending!.planMonths,
    });
    return { state: 'error', publicId };
  }
}

/** Только для unit-тестов. */
export function resetVerifyInflightForTests(): void {
  inflightByPaymentId.clear();
}
