import { openWebHandoffMoreDetails } from '@src/services/auth/openWebHandoffMoreDetails';

describe('openWebHandoffMoreDetails platform contract', () => {
  const handoffUrl =
    'https://dedato.ru/auth/mobile-handoff?code=opaque-handoff-code-abc';

  it('blocks iOS pricing handoff before creating or opening a URL', async () => {
    const createWebHandoff = jest.fn().mockResolvedValue({
      code: 'opaque-handoff-code-abc',
      url: handoffUrl,
      expires_in: 60,
    });
    const openURL = jest.fn().mockResolvedValue(undefined);
    const showError = jest.fn();
    const logout = jest.fn();

    const result = await openWebHandoffMoreDetails({
      platformOS: 'ios',
      createWebHandoff,
      openURL,
      showError,
    });

    expect(result).toBe('error');
    expect(createWebHandoff).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('Ошибка', expect.stringContaining('iOS'));
    expect(logout).not.toHaveBeenCalled();
  });

  it('never opens a URL that contains access_token or refresh_token', async () => {
    const dirty =
      'https://dedato.ru/auth/mobile-handoff?code=x&access_token=SECRET&refresh_token=SECRET2';
    const createWebHandoff = jest.fn().mockResolvedValue({
      code: 'x',
      url: dirty,
      expires_in: 60,
    });
    const openURL = jest.fn().mockResolvedValue(undefined);
    const showError = jest.fn();
    const logout = jest.fn();

    const result = await openWebHandoffMoreDetails({
      platformOS: 'android',
      createWebHandoff,
      openURL,
      showError,
    });

    expect(result).toBe('error');
    expect(openURL).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('Ошибка', expect.any(String));
    expect(logout).not.toHaveBeenCalled();
  });

  it('on create/open failure shows error and does not logout', async () => {
    const createWebHandoff = jest.fn().mockRejectedValue({
      response: { data: { detail: 'handoff unavailable' } },
    });
    const openURL = jest.fn();
    const showError = jest.fn();
    const logout = jest.fn();

    const result = await openWebHandoffMoreDetails({
      platformOS: 'android',
      createWebHandoff,
      openURL,
      showError,
    });

    expect(result).toBe('error');
    expect(openURL).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('Ошибка', 'handoff unavailable');
    expect(logout).not.toHaveBeenCalled();
  });

  it('on Linking.openURL failure shows error and does not logout', async () => {
    const createWebHandoff = jest.fn().mockResolvedValue({
      code: 'c',
      url: handoffUrl,
      expires_in: 60,
    });
    const openURL = jest.fn().mockRejectedValue(new Error('cannot open'));
    const showError = jest.fn();
    const logout = jest.fn();

    const result = await openWebHandoffMoreDetails({
      platformOS: 'android',
      createWebHandoff,
      openURL,
      showError,
    });

    expect(result).toBe('error');
    expect(showError).toHaveBeenCalledWith('Ошибка', 'cannot open');
    expect(logout).not.toHaveBeenCalled();
  });

  it('happy-path opened URL never includes auth tokens', async () => {
    const createWebHandoff = jest.fn().mockResolvedValue({
      code: 'opaque',
      url: handoffUrl,
      expires_in: 60,
    });
    const openURL = jest.fn().mockResolvedValue(undefined);

    await openWebHandoffMoreDetails({
      platformOS: 'android',
      createWebHandoff,
      openURL,
      showError: jest.fn(),
    });

    const opened = openURL.mock.calls[0][0] as string;
    expect(opened).not.toMatch(/access_token/i);
    expect(opened).not.toMatch(/refresh_token/i);
    expect(createWebHandoff).toHaveBeenCalledWith('android_app');
  });
});
