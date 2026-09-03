import { openWebHandoffDestination } from '@src/services/auth/openWebHandoffDestination';

describe('openWebHandoffDestination', () => {
  const url = 'https://dedato.ru/auth/mobile-handoff?code=opaque-code';

  it.each(['schedule', 'services', 'settings'] as const)(
    'requests the server-mapped %s destination with ios_app origin',
    async (destination) => {
      const createWebHandoff = jest.fn().mockResolvedValue({ code: 'opaque-code', url, expires_in: 60 });
      const openURL = jest.fn().mockResolvedValue(undefined);
      const result = await openWebHandoffDestination(destination, {
        platformOS: 'ios', createWebHandoff, openURL, showError: jest.fn(),
      });
      expect(result).toBe('opened');
      expect(createWebHandoff).toHaveBeenCalledWith('ios_app', destination);
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
    expect(showError).toHaveBeenCalledWith('Ошибка', expect.any(String));
  });

  it('uses a neutral error on network failure', async () => {
    const showError = jest.fn();
    const result = await openWebHandoffDestination('settings', {
      platformOS: 'ios',
      createWebHandoff: jest.fn().mockRejectedValue(new Error('offline')),
      openURL: jest.fn(),
      showError,
    });
    expect(result).toBe('error');
    expect(showError).toHaveBeenCalledWith('Ошибка', 'offline');
  });
});
