import {
  getYandexMobileAuthPresentation,
  isYandexMobileAuthVisible,
  shouldRenderYandexMobileLoginButton,
  YANDEX_MOBILE_AUTH_BUTTON_LABEL,
  YANDEX_MOBILE_AUTH_REGISTER_BUTTON_LABEL,
  YANDEX_MOBILE_AUTH_REGISTER_HINT,
} from '@src/config/yandexMobileAuth';
import { env } from '@src/config/env';

describe('Yandex mobile auth visibility', () => {
  it('is visible in mobile UI even when legacy flag is false', () => {
    expect(env.YANDEX_MOBILE_AUTH_VISIBLE).toBe(false);
    expect(isYandexMobileAuthVisible()).toBe(true);
    expect(shouldRenderYandexMobileLoginButton()).toBe(true);
  });

  it('keeps rendering the login button regardless of the old flag value', () => {
    expect(shouldRenderYandexMobileLoginButton(false)).toBe(true);
    expect(shouldRenderYandexMobileLoginButton(true)).toBe(true);
  });

  it('shows login/register UI when flag is false', () => {
    expect(getYandexMobileAuthPresentation(false, 'login')).toMatchObject({
      visible: true,
      showRegisterHint: false,
      usesLogo: true,
    });
    expect(getYandexMobileAuthPresentation(false, 'register')).toMatchObject({
      visible: true,
      showRegisterHint: true,
      usesLogo: true,
    });
  });

  it('shows Yandex button on login when flag is true', () => {
    expect(getYandexMobileAuthPresentation(true, 'login')).toMatchObject({
      visible: true,
      buttonLabel: YANDEX_MOBILE_AUTH_BUTTON_LABEL,
      showRegisterHint: false,
      usesLogo: true,
    });
  });

  it('shows Yandex button, hint and logo on register when flag is true', () => {
    expect(getYandexMobileAuthPresentation(true, 'register')).toMatchObject({
      visible: true,
      buttonLabel: YANDEX_MOBILE_AUTH_REGISTER_BUTTON_LABEL,
      showRegisterHint: true,
      registerHint: YANDEX_MOBILE_AUTH_REGISTER_HINT,
      usesLogo: true,
    });
  });
});
