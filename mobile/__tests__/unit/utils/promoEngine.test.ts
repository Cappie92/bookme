import {
  PROMO_ALREADY_APPLIED_FALLBACK_MESSAGE,
  PROMO_ALREADY_APPLIED_INLINE_MESSAGE,
  PROMO_FIRST_PAYMENT_ONLY_MESSAGE,
  formatSubscriptionPointsAmount,
  getCurrentPromoCodeValue,
  getCurrentPromoStatusValue,
  getPromoAlreadyAppliedInlineMessage,
  getCurrentPromoStatusLabel,
  getPromoErrorCode,
  getPromoErrorMessage,
  getPromoPreviewDisplay,
  getPromoPreviewMessage,
  getSubscriptionPointsHistoryTitle,
  isPromoAlreadyAppliedError,
} from '@src/utils/promoEngine';

describe('promoEngine utils', () => {
  describe('getPromoErrorMessage', () => {
    it.each([
      ['first_payment_already_done', PROMO_FIRST_PAYMENT_ONLY_MESSAGE],
      ['acquisition_promo_already_used', 'Промокод уже применён.'],
      ['self_referral', 'Нельзя применить собственный промокод.'],
      ['not_eligible', 'Этот промокод недоступен для выбранных условий.'],
      ['promo_not_eligible', 'Этот промокод недоступен для выбранных условий.'],
      ['invalid_code', 'Промокод не найден. Проверьте код и попробуйте ещё раз.'],
      ['code_not_found', 'Промокод не найден. Проверьте код и попробуйте ещё раз.'],
      ['minimum_period_3_months', 'Бонус доступен при оплате от 3 месяцев.'],
    ])('maps %s', (code, expected) => {
      expect(getPromoErrorMessage({ response: { data: { detail: { code } } } })).toBe(expected);
    });

    it('uses backend message when code is unknown', () => {
      expect(getPromoErrorMessage({ code: 'unknown', message: 'Backend message' })).toBe('Backend message');
    });

    it('parses nested detail code and message from axios response', () => {
      const error = {
        response: {
          data: {
            detail: {
              code: 'acquisition_promo_already_used',
              message: 'Промокод уже применён',
            },
          },
        },
      };

      expect(getPromoErrorMessage(error)).toBe('Промокод уже применён.');
      expect(isPromoAlreadyAppliedError(error)).toBe(true);
    });

    it('uses fallback when detail is empty', () => {
      expect(getPromoErrorMessage({})).toBe('Не удалось применить промокод. Попробуйте ещё раз.');
    });
  });

  describe('getPromoPreviewMessage', () => {
    it('returns null for empty preview', () => {
      expect(getPromoPreviewMessage(null)).toBeNull();
    });

    it('uses label for eligible preview', () => {
      expect(getPromoPreviewMessage({ eligible: true, label: '+500 бонусов' })).toBe('+500 бонусов');
    });

    it('prefers points amount over label for eligible preview', () => {
      expect(getPromoPreviewMessage({ eligible: true, label: '+500 бонусов', points_amount: 500 })).toBe(
        'По промокоду: +500 бонусных баллов после оплаты'
      );
    });

    it('formats points amount for eligible preview', () => {
      expect(getPromoPreviewMessage({ eligible: true, points_amount: 2500 })).toBe(
        'По промокоду: +2 500 бонусных баллов после оплаты'
      );
    });

    it('maps minimum period reason', () => {
      expect(getPromoPreviewMessage({ eligible: false, ineligible_reason: 'minimum_period_3_months' })).toBe(
        'Бонус доступен при оплате от 3 месяцев.'
      );
    });

    it('prioritizes minimum period reason over backend label', () => {
      expect(
        getPromoPreviewMessage({
          eligible: false,
          ineligible_reason: 'minimum_period_3_months',
          label: 'Custom backend label',
        })
      ).toBe('Бонус доступен при оплате от 3 месяцев.');
    });

    it('maps first payment reason', () => {
      expect(getPromoPreviewMessage({ eligible: false, ineligible_reason: 'first_payment_already_done' })).toBe(
        PROMO_FIRST_PAYMENT_ONLY_MESSAGE
      );
    });

    it('uses ineligible fallback', () => {
      expect(getPromoPreviewMessage({ eligible: false })).toBe('Промокод не применим к выбранному тарифу.');
    });
  });

  describe('getPromoPreviewDisplay', () => {
    it('returns null when promo preview is absent', () => {
      expect(getPromoPreviewDisplay(null)).toBeNull();
    });

    it('builds positive display for eligible preview', () => {
      expect(getPromoPreviewDisplay({ eligible: true, points_amount: 450 })).toEqual({
        message: 'По промокоду: +450 бонусных баллов после оплаты',
        tone: 'positive',
        helper: 'Цена сейчас не уменьшается. Баллы можно будет использовать для оплаты подписки позже.',
      });
    });

    it('builds positive display when backend sends points without boolean eligible', () => {
      expect(getPromoPreviewDisplay({ points_amount: 450 })).toMatchObject({
        message: 'По промокоду: +450 бонусных баллов после оплаты',
        tone: 'positive',
      });
    });

    it('builds neutral display for minimum period preview', () => {
      expect(getPromoPreviewDisplay({ eligible: false, ineligible_reason: 'minimum_period_3_months' })).toEqual({
        message: 'Бонус доступен при оплате от 3 месяцев.',
        tone: 'neutral',
        helper: 'Цена сейчас не уменьшается. Баллы можно будет использовать для оплаты подписки позже.',
      });
    });

    it('uses first payment only message for paid masters', () => {
      expect(getPromoPreviewDisplay({ eligible: false, ineligible_reason: 'first_payment_already_done' })?.message).toBe(
        PROMO_FIRST_PAYMENT_ONLY_MESSAGE
      );
    });
  });

  describe('formatSubscriptionPointsAmount', () => {
    it('formats numeric amount', () => {
      expect(formatSubscriptionPointsAmount(1234.4)).toBe('1 234');
    });

    it('formats string amount', () => {
      expect(formatSubscriptionPointsAmount('2500')).toBe('2 500');
    });

    it('falls back to zero for invalid amount', () => {
      expect(formatSubscriptionPointsAmount('not-a-number')).toBe('0');
      expect(formatSubscriptionPointsAmount(null)).toBe('0');
    });
  });

  describe('getSubscriptionPointsHistoryTitle', () => {
    it('uses known source labels', () => {
      expect(getSubscriptionPointsHistoryTitle({ source: 'referrer_reward' })).toBe(
        'Бонус за приглашённого мастера'
      );
      expect(getSubscriptionPointsHistoryTitle({ source: 'beneficiary_reward' })).toBe(
        'Бонус по применённому промокоду'
      );
    });

    it('uses description fallback', () => {
      expect(getSubscriptionPointsHistoryTitle({ description: 'Custom history title' })).toBe(
        'Custom history title'
      );
    });
  });

  describe('current promo helpers', () => {
    it('extracts promo error code from axios-style error', () => {
      expect(getPromoErrorCode({ response: { data: { detail: { code: 'acquisition_promo_already_used' } } } })).toBe(
        'acquisition_promo_already_used'
      );
    });

    it('detects already applied promo by code or backend message', () => {
      expect(isPromoAlreadyAppliedError({ response: { data: { detail: { code: 'acquisition_promo_already_used' } } } })).toBe(true);
      expect(isPromoAlreadyAppliedError({ response: { data: { detail: { message: 'Промокод уже применён' } } } })).toBe(true);
    });

    it('provides non-crashing inline messages for already applied promo state', () => {
      expect(getPromoAlreadyAppliedInlineMessage('REF123')).toBe(PROMO_ALREADY_APPLIED_INLINE_MESSAGE);
      expect(getPromoAlreadyAppliedInlineMessage(null)).toBe(PROMO_ALREADY_APPLIED_FALLBACK_MESSAGE);
      expect(PROMO_ALREADY_APPLIED_INLINE_MESSAGE).not.toContain('Acquisition');
    });

    it('extracts current promo code and status from nested backend shapes', () => {
      expect(getCurrentPromoCodeValue({ promo_code: { code: 'REF123', status: 'pending' } })).toBe('REF123');
      expect(getCurrentPromoStatusValue({ current_promo: { promo_code: 'REF456', status: 'applied' } })).toBe(
        'applied'
      );
    });

    it('maps current promo statuses', () => {
      expect(getCurrentPromoStatusLabel('pending')).toBe('Ожидает первой оплаты');
      expect(getCurrentPromoStatusLabel('pending_first_payment')).toBe('Ожидает первой оплаты');
      expect(getCurrentPromoStatusLabel('applied')).toBe('Применён');
      expect(getCurrentPromoStatusLabel('redeemed')).toBe('Применён');
      expect(getCurrentPromoStatusLabel('backend_raw_status')).toBeNull();
      expect(getCurrentPromoStatusLabel(null)).toBeNull();
    });
  });
});
