import { env } from './env';

export const YANDEX_MOBILE_AUTH_BUTTON_LABEL = 'Войти через Яндекс';
export const YANDEX_MOBILE_AUTH_REGISTER_BUTTON_LABEL = 'Зарегистрироваться через Яндекс';
export const YANDEX_MOBILE_AUTH_REGISTER_HINT =
  'Можно продолжить через Яндекс — регистрация и выбор роли завершатся в браузере.';

export function isYandexMobileAuthVisible(flag = env.YANDEX_MOBILE_AUTH_VISIBLE): boolean {
  return flag === true;
}

export const shouldRenderYandexMobileLoginButton = isYandexMobileAuthVisible;

export function getYandexMobileAuthPresentation(
  flag = env.YANDEX_MOBILE_AUTH_VISIBLE,
  tab: 'login' | 'register' = 'login'
) {
  const visible = isYandexMobileAuthVisible(flag);
  const buttonLabel =
    tab === 'register' ? YANDEX_MOBILE_AUTH_REGISTER_BUTTON_LABEL : YANDEX_MOBILE_AUTH_BUTTON_LABEL;
  return {
    visible,
    buttonLabel,
    showRegisterHint: visible && tab === 'register',
    registerHint: YANDEX_MOBILE_AUTH_REGISTER_HINT,
    usesLogo: visible,
  };
}
