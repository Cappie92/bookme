import { readFileSync } from 'node:fs';
import path from 'node:path';
import { router } from 'expo-router';
import { safeBack } from '@src/utils/safeBack';

const mobileRoot = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('iOS welcome auth UX', () => {
  const welcome = source('src/screens/WelcomeScreen.ios.tsx');
  const topBar = source('src/components/welcome/WelcomeIosTopBar.tsx');
  const registrationModal = source('src/components/welcome/WelcomeRegistrationRoleModal.tsx');
  const androidWelcome = source('src/screens/WelcomeScreen.android.tsx');
  const sharedNav = source('src/components/welcome/WelcomeTopNav.tsx');
  const sharedSheet = source('src/components/welcome/WelcomeAuthSheet.tsx');

  it('shows a compact companion badge and separate register and login actions', () => {
    expect(topBar).toContain('Бесплатный компаньон');
    expect(topBar).toContain('Регистрация');
    expect(topBar).toContain('Вход');
    expect(topBar).not.toContain('Главная');
    expect(welcome).not.toContain('Главная');
    expect(welcome).not.toContain('IosFreeCompanionNotice');
    expect(welcome).not.toContain('Базовые функции записи, расписания и услуг доступны бесплатно.');
    expect(welcome).not.toContain('реальным услугам специалистов');
  });

  it('opens a centered role modal for registration and the existing login screen directly', () => {
    expect(welcome).toContain('WelcomeRegistrationRoleModal');
    expect(welcome).not.toContain('WelcomeAuthSheet');
    expect(welcome).toContain("router.push('/login?tab=login')");
    expect(welcome).toContain('`/login?tab=register&role=${nextRole}`');
    expect(registrationModal).toContain('Создать аккаунт');
    expect(registrationModal).toContain('Я мастер');
    expect(registrationModal).toContain('Я клиент');
    expect(registrationModal).toContain("justifyContent: 'center'");
    expect(registrationModal).not.toContain("justifyContent: 'flex-end'");
    expect(registrationModal).not.toContain('Войти');
    expect(registrationModal).not.toContain('tab=login');
  });

  it('sizes the logo asset for its opaque bounds and keeps full-width actions', () => {
    const previousFrame = 44;
    const canvas = 6250;
    const opaqueHeight = 2782;
    const rendered = Math.round((previousFrame * canvas) / opaqueHeight);
    expect(rendered).toBe(99);
    expect(topBar).toContain('dedato_trnsp.png');
    expect(topBar).toContain('resizeMode="contain"');
    expect(topBar).toContain(`width: ${rendered}`);
    expect(topBar).toContain(`height: ${rendered}`);
    expect(topBar).not.toContain('>DeDato<');
    expect(topBar).not.toMatch(/<Text[^>]*>\s*DeDato\s*<\/Text>/);
    expect(topBar).toContain('fontSize: 13');
    expect(topBar).not.toContain('maxWidth');
    expect(topBar).toContain("width: '100%'");
    expect(topBar).toContain('flex: 1');
    expect(topBar).toContain('gap: 8');
  });

  it('opens login forward and returns home with back, or replaces welcome without history', () => {
    const login = source('app/login.tsx');
    expect(welcome).toContain("router.push('/login?tab=login')");
    expect(login).toContain("safeBack('/welcome')");
    expect(login).toContain('На главную');
    expect(login).not.toContain("router.push('/welcome')");

    const routerMock = router as typeof router & {
      canGoBack: jest.Mock;
      back: jest.Mock;
      replace: jest.Mock;
      push: jest.Mock;
    };
    const previous = {
      canGoBack: routerMock.canGoBack,
      back: routerMock.back,
      replace: routerMock.replace,
      push: routerMock.push,
    };

    try {
      routerMock.canGoBack = jest.fn(() => true);
      routerMock.back = jest.fn();
      routerMock.replace = jest.fn();
      routerMock.push = jest.fn();
      safeBack('/welcome');
      expect(routerMock.back).toHaveBeenCalledTimes(1);
      expect(routerMock.replace).not.toHaveBeenCalled();
      expect(routerMock.push).not.toHaveBeenCalled();

      routerMock.canGoBack = jest.fn(() => false);
      routerMock.back = jest.fn();
      routerMock.replace = jest.fn();
      routerMock.push = jest.fn();
      safeBack('/welcome');
      expect(routerMock.replace).toHaveBeenCalledWith('/welcome');
      expect(routerMock.back).not.toHaveBeenCalled();
      expect(routerMock.push).not.toHaveBeenCalled();
    } finally {
      routerMock.back = previous.back;
      routerMock.replace = previous.replace;
      routerMock.push = previous.push;
      if (previous.canGoBack) {
        routerMock.canGoBack = previous.canGoBack;
      } else {
        delete (routerMock as { canGoBack?: jest.Mock }).canGoBack;
      }
    }
  });

  it('keeps the Android welcome action menu unchanged', () => {
    expect(androidWelcome).toContain('WelcomeTopNav');
    expect(androidWelcome).toContain('WelcomeAuthSheet');
    expect(androidWelcome).not.toContain('WelcomeIosTopBar');
    expect(androidWelcome).not.toContain('WelcomeRegistrationRoleModal');
    expect(sharedNav).toContain('Главная');
    expect(sharedSheet).toContain('Войти');
    expect(sharedSheet).toContain('Регистрация мастера');
    expect(sharedSheet).toContain('Регистрация клиента');
    expect(sharedSheet).toContain("justifyContent: 'flex-end'");
  });
});
