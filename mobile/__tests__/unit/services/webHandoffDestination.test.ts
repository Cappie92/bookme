import { openWebHandoffDestination } from '@src/services/auth/openWebHandoffDestination';
import type { WebHandoffDestination } from '@src/services/api/auth';
import { logger } from '@src/utils/logger';

jest.mock('@src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('openWebHandoffDestination', () => {
  const url = 'https://dedato.ru/auth/mobile-handoff?code=opaque-code';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['schedule', 'services', 'settings'] as const)(
    'requests the server-mapped %s destination with ios_app origin',
    async (destination) => {
      const createWebHandoff = jest.fn().mockResolvedValue({ code: 'opaque-code', url, expires_in: 60 });
      const openURL = jest.fn().mockResolvedValue(undefined);
      const result = await openWebHandoffDestination(destination, {
        platformOS: 'ios', createWebHandoff, openURL, showError: jest.fn(),
      });
      expect(result).toBe('opened');
      expect(createWebHandoff).toHaveBeenCalledTimes(1);
      expect(createWebHandoff).toHaveBeenCalledWith('ios_app', destination);
      expect(openURL).toHaveBeenCalledTimes(1);
      expect(openURL).toHaveBeenCalledWith(url);
    }
  );

  it('fails closed when a returned URL contains credentials', async () => {
    const openURL = jest.fn();
    const showError = jest.fn();
    const result = await openWebHandoffDestination('schedule', {
      platformOS: 'ios',
      createWebHandoff: jest.fn().mockResolvedValue({
        code: 'opaque', url: `${url}&access_token=secret`, expires_in: 60,
      }),
      openURL,
      showError,
    });
    expect(result).toBe('error');
    expect(openURL).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      'Ошибка',
      'Не удалось открыть браузер. Попробуйте ещё раз.'
    );
  });

  it('uses a neutral error and does not leak API error details', async () => {
    const showError = jest.fn();
    const openURL = jest.fn();
    const apiError = Object.assign(
      new Error('Bearer secret-jwt code=opaque-secret email=user@example.com'),
      { code: 'opaque-secret' }
    );
    const result = await openWebHandoffDestination('settings', {
      platformOS: 'ios',
      createWebHandoff: jest.fn().mockRejectedValue(apiError),
      openURL,
      showError,
    });
    expect(result).toBe('error');
    expect(openURL).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      'Ошибка',
      'Не удалось открыть браузер. Попробуйте ещё раз.'
    );
    const logged = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logged).not.toContain('secret-jwt');
    expect(logged).not.toContain('opaque-secret');
    expect(logged).not.toContain('user@example.com');
    expect(logged).toContain('request');
  });

  it('uses a neutral error if the system browser rejects the URL', async () => {
    const showError = jest.fn();
    const result = await openWebHandoffDestination('services', {
      platformOS: 'ios',
      createWebHandoff: jest.fn().mockResolvedValue({
        code: 'opaque', url, expires_in: 60,
      }),
      openURL: jest.fn().mockRejectedValue(new Error('native open failed with code=opaque-secret')),
      showError,
    });
    expect(result).toBe('error');
    expect(showError).toHaveBeenCalledWith(
      'Ошибка',
      'Не удалось открыть браузер. Попробуйте ещё раз.'
    );
    const logged = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logged).toContain('browser_open');
    expect(logged).not.toContain('opaque-secret');
  });

  it('rejects an invalid destination before the API request', async () => {
    const createWebHandoff = jest.fn();
    const openURL = jest.fn();
    const showError = jest.fn();
    const result = await openWebHandoffDestination('billing' as WebHandoffDestination, {
      platformOS: 'ios',
      createWebHandoff,
      openURL,
      showError,
    });
    expect(result).toBe('error');
    expect(createWebHandoff).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      'Ошибка',
      'Не удалось открыть браузер. Попробуйте ещё раз.'
    );
  });
});
