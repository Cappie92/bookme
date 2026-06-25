import { getPromoPreviewDisplay } from '@src/utils/promoEngine';
import {
  getPeriodStepSubscriptionPurchasePriceSnapshot,
  getPeriodStepSubscriptionPurchasePromoPreviewDisplay,
} from '@src/utils/subscriptionPurchasePromoPreview';

describe('SubscriptionPurchaseModal promo preview display', () => {
  it('shows eligible promo preview text', () => {
    const display = getPromoPreviewDisplay({
      eligible: true,
      points_amount: 450,
    });

    expect(display).toMatchObject({
      tone: 'positive',
      message: 'По промокоду: +450 бонусных баллов после оплаты',
    });
  });

  it('shows minimum period message for ineligible preview', () => {
    const display = getPromoPreviewDisplay({
      eligible: false,
      ineligible_reason: 'minimum_period_3_months',
    });

    expect(display).toMatchObject({
      tone: 'neutral',
      message: 'Бонус доступен при оплате от 3 месяцев.',
    });
  });

  it('returns no display when promo preview is absent', () => {
    expect(getPromoPreviewDisplay(null)).toBeNull();
    expect(getPromoPreviewDisplay(undefined)).toBeNull();
  });

  it('keeps promo preview informational only', () => {
    const display = getPromoPreviewDisplay({
      eligible: true,
      label: '+450 бонусных баллов после оплаты',
    });

    expect(display?.helper).toContain('Цена сейчас не уменьшается');
    expect(display).not.toHaveProperty('payment_payload');
    expect(display).not.toHaveProperty('discount');
  });

  it('shows amber promo preview on period selection step before checkout', () => {
    const display = getPeriodStepSubscriptionPurchasePromoPreviewDisplay({
      calculation_id: 1,
      plan_id: 2,
      duration_months: 1,
      total_price: 3000,
      final_price: 3000,
      savings_percent: 0,
      start_date: '2026-06-26',
      end_date: '2026-07-26',
      promo_preview: {
        eligible: false,
        ineligible_reason: 'minimum_period_3_months',
      },
    } as any);

    expect(display).toMatchObject({
      tone: 'neutral',
      message: 'Бонус доступен при оплате от 3 месяцев.',
    });
  });

  it.each([3, 6, 12])('shows green promo preview for %s months on period step', (months) => {
    const display = getPeriodStepSubscriptionPurchasePromoPreviewDisplay({
      calculation_id: 2,
      plan_id: 2,
      duration_months: months,
      total_price: 9000,
      final_price: 9000,
      savings_percent: 10,
      start_date: '2026-06-26',
      end_date: '2026-09-26',
      promo_preview: {
        eligible: true,
        points_amount: 450,
      },
    } as any);

    expect(display).toMatchObject({
      tone: 'positive',
      message: 'По промокоду: +450 бонусных баллов после оплаты',
    });
  });

  it('keeps period step price snapshot unchanged by promo preview', () => {
    const calculation = {
      calculation_id: 3,
      plan_id: 2,
      duration_months: 3,
      total_price: 9000,
      final_price: 9000,
      savings_percent: 10,
      start_date: '2026-06-26',
      end_date: '2026-09-26',
      promo_preview: {
        eligible: true,
        points_amount: 450,
      },
    } as any;

    expect(getPeriodStepSubscriptionPurchasePriceSnapshot(calculation)).toEqual({
      finalPrice: 9000,
      totalPrice: 9000,
      savingsPercent: 10,
    });
    expect(getPeriodStepSubscriptionPurchasePromoPreviewDisplay(calculation)?.helper).toBe(
      'Цена сейчас не уменьшается. Баллы можно будет использовать для оплаты подписки позже.'
    );
  });

  it('places promo preview on period selection step, not tariff selection step', () => {
    const fs = require('fs');
    const path = require('path');
    const modalSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/subscriptions/SubscriptionPurchaseModal.tsx'),
      'utf8'
    );
    const stepPlanSource = modalSource.slice(
      modalSource.indexOf('function StepPlan'),
      modalSource.indexOf('const BRAND_GREEN')
    );
    const stepPeriodSource = modalSource.slice(
      modalSource.indexOf('function StepPeriod'),
      modalSource.indexOf('function StepCheckout')
    );

    expect(stepPlanSource).not.toContain('subscription-period-promo-preview');
    expect(stepPeriodSource).toContain('subscription-period-promo-preview');
  });

  it('does not expose removed debug markers in active mobile files', () => {
    const fs = require('fs');
    const path = require('path');
    const root = process.cwd();
    const contents = [
      'src/components/subscriptions/SubscriptionPurchaseModal.tsx',
      'app/(master)/subscriptions/index.tsx',
    ]
      .map((relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'))
      .join('\n');

    [
      ['DEBUG SUBSCRIPTIONS', 'SCREEN v=PROMO_PATH_1'],
      ['DEBUG PURCHASE', 'MODAL v=PURCHASE_MODAL_1'],
      ['DEBUG CHECKOUT', 'AREA v=CHECKOUT_1'],
      ['[DEBUG SUBSCRIPTIONS', 'SCREEN MOUNT]'],
      ['[DEBUG OPEN', 'PURCHASE MODAL]'],
      ['[DEBUG PURCHASE', 'MODAL RENDER]'],
      ['[DEBUG CHECKOUT', 'AREA RENDER]'],
      ['[PROMO MODAL', 'OPEN]'],
      ['[PROMO CALC', 'REQUEST]'],
      ['[PROMO CALC', 'RESPONSE]'],
      ['[PROMO CALC', 'PREVIEW]'],
      ['[PROMO PREVIEW', 'RENDER]'],
      ['PROMO', 'DEBUG'],
      ['debug', '', 'Source'],
    ].forEach((marker) => {
      const separator = marker[1] === '' ? '' : ' ';
      expect(contents).not.toContain(marker.filter(Boolean).join(separator));
    });
  });
});
