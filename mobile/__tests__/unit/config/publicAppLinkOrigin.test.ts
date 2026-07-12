import {
  DEFAULT_PUBLIC_APP_LINK_ORIGIN,
  getPublicAppLinkOrigin,
} from '@src/config/publicAppLinkOrigin';

jest.mock('@env', () => ({
  PUBLIC_APP_LINK_ORIGIN: undefined,
  WEB_URL: 'https://dedato.ru',
  EXTRA_UNIVERSAL_LINK_HOSTS: '',
}));

describe('getPublicAppLinkOrigin', () => {
  it('prefers www host from trusted universal link hosts', () => {
    expect(getPublicAppLinkOrigin()).toBe('https://www.dedato.ru');
  });

  it('falls back to default verified origin', () => {
    expect(DEFAULT_PUBLIC_APP_LINK_ORIGIN).toBe('https://www.dedato.ru');
  });
});

describe('getPublicAppLinkOrigin with explicit env', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('uses PUBLIC_APP_LINK_ORIGIN when set', async () => {
    jest.doMock('@env', () => ({
      PUBLIC_APP_LINK_ORIGIN: 'https://www.dedato.ru',
      WEB_URL: 'https://dedato.ru',
      EXTRA_UNIVERSAL_LINK_HOSTS: '',
    }));
    const { getPublicAppLinkOrigin: resolve } = await import('@src/config/publicAppLinkOrigin');
    expect(resolve()).toBe('https://www.dedato.ru');
  });
});
