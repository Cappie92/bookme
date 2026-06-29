import { openYandexMobileAuthUrl } from '@src/utils/yandexMobileAuthLink';

describe('yandexMobileAuthLink', () => {
  it('opens Yandex OAuth login URL through the provided external opener', async () => {
    const openURL = jest.fn().mockResolvedValue(undefined);

    const url = await openYandexMobileAuthUrl(openURL);

    expect(url).toBe('http://localhost:5173/api/auth/yandex/login');
    expect(openURL).toHaveBeenCalledWith('http://localhost:5173/api/auth/yandex/login');
  });
});
