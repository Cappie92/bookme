import { env } from './env';

export const YANDEX_MOBILE_AUTH_BUTTON_LABEL = 'Войти через Яндекс';
export const YANDEX_MOBILE_AUTH_REGISTER_HINT =
  'Можно не заполнять форму — войдите через Яндекс, и мы создадим аккаунт автоматически.';

export function isYandexMobileAuthVisible(flag = env.YANDEX_MOBILE_AUTH_VISIBLE): boolean {
  return flag === true;
}

export const shouldRenderYandexMobileLoginButton = isYandexMobileAuthVisible;

export function getYandexMobileAuthPresentation(
  flag = env.YANDEX_MOBILE_AUTH_VISIBLE,
  tab: 'login' | 'register' = 'login'
) {
  const visible = isYandexMobileAuthVisible(flag);
  return {
    visible,
    buttonLabel: YANDEX_MOBILE_AUTH_BUTTON_LABEL,
    showRegisterHint: visible && tab === 'register',
    registerHint: YANDEX_MOBILE_AUTH_REGISTER_HINT,
    usesLogo: visible,
  };
}
