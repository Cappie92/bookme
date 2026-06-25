import {
  getCityPickerListBottomPadding,
  getRegistrationFieldLabel,
  getRegistrationPromoCodeFromParams,
  isRegistrationFieldRequired,
  normalizeRegistrationPromoCode,
  shouldShowRegistrationPromoField,
} from '@src/utils/registrationPromo';

describe('registration promo helpers', () => {
  it('shows promo field only for master role', () => {
    expect(shouldShowRegistrationPromoField('master')).toBe(true);
    expect(shouldShowRegistrationPromoField('client')).toBe(false);
  });

  it('marks required registration fields but keeps promo optional', () => {
    expect(isRegistrationFieldRequired('fullName')).toBe(true);
    expect(isRegistrationFieldRequired('email')).toBe(false);
    expect(isRegistrationFieldRequired('phone')).toBe(true);
    expect(isRegistrationFieldRequired('password')).toBe(true);
    expect(isRegistrationFieldRequired('confirmPassword')).toBe(true);
    expect(isRegistrationFieldRequired('city')).toBe(true);
    expect(isRegistrationFieldRequired('promoCode')).toBe(false);
  });

  it('uses Имя as registration name label for client and master forms', () => {
    expect(getRegistrationFieldLabel('fullName')).toBe('Имя');
    expect(getRegistrationFieldLabel('fullName')).not.toBe('ФИО');
  });

  it('keeps registration labels aligned with web contract', () => {
    expect(getRegistrationFieldLabel('email')).toBe('Email');
    expect(getRegistrationFieldLabel('phone')).toBe('Номер телефона');
    expect(getRegistrationFieldLabel('city')).toBe('Город');
    expect(getRegistrationFieldLabel('password')).toBe('Пароль');
    expect(getRegistrationFieldLabel('confirmPassword')).toBe('Повторный ввод пароля');
    expect(getRegistrationFieldLabel('promoCode')).toBe('Промокод');
  });

  it('adds safe bottom padding for Android city picker list', () => {
    expect(getCityPickerListBottomPadding(0)).toBe(32);
    expect(getCityPickerListBottomPadding(24)).toBe(40);
  });

  it('normalizes promo code input', () => {
    expect(normalizeRegistrationPromoCode(' ref123 ')).toBe('REF123');
  });

  it('prefers promo_code query param over ref', () => {
    expect(getRegistrationPromoCodeFromParams({ promo_code: 'abc', ref: 'fallback' })).toBe('ABC');
  });

  it('uses ref query param when promo_code is empty', () => {
    expect(getRegistrationPromoCodeFromParams({ ref: 'ref456' })).toBe('REF456');
  });
});
