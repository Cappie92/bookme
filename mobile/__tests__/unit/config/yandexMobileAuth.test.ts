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
  it('is disabled by default when env flag is absent/false', () => {
    expect(env.YANDEX_MOBILE_AUTH_VISIBLE).toBe(false);
    expect(isYandexMobileAuthVisible()).toBe(false);
    expect(shouldRenderYandexMobileLoginButton()).toBe(false);
  });

  it('can render the login button only when flag is true', () => {
    expect(shouldRenderYandexMobileLoginButton(false)).toBe(false);
    expect(shouldRenderYandexMobileLoginButton(true)).toBe(true);
  });

  it('keeps login/register UI hidden when flag is false', () => {
    expect(getYandexMobileAuthPresentation(false, 'login')).toMatchObject({
      visible: false,
      showRegisterHint: false,
      usesLogo: false,
    });
    expect(getYandexMobileAuthPresentation(false, 'register')).toMatchObject({
      visible: false,
      showRegisterHint: false,
      usesLogo: false,
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
