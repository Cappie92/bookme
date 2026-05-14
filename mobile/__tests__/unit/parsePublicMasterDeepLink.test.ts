import {
  parsePublicMasterSlugFromUrl,
  getTrustedUniversalLinkHosts,
} from '@src/utils/parsePublicMasterDeepLink';

jest.mock('@src/config/env', () => ({
  env: {
    WEB_URL: 'https://dedato.ru',
    EXTRA_UNIVERSAL_LINK_HOSTS: '',
    API_URL: '',
    DEBUG_HTTP: false,
    DEBUG_AUTH: false,
    DEBUG_FEATURES: false,
    DEBUG_MENU: false,
    DEBUG_DASHBOARD: false,
    DEBUG_LOGS: false,
  },
}));

describe('parsePublicMasterSlugFromUrl', () => {
  it('parses dedato scheme (path form and legacy)', () => {
    expect(parsePublicMasterSlugFromUrl('dedato:/m/qa-smoke-public')).toBe('qa-smoke-public');
    expect(parsePublicMasterSlugFromUrl('dedato:///m/qa-smoke-public')).toBe('qa-smoke-public');
    expect(parsePublicMasterSlugFromUrl('dedato://m/my-master')).toBe('my-master');
    expect(parsePublicMasterSlugFromUrl('dedato://m/foo-bar/')).toBe('foo-bar');
  });

  it('parses https for trusted host', () => {
    expect(parsePublicMasterSlugFromUrl('https://dedato.ru/m/slug1')).toBe('slug1');
    expect(parsePublicMasterSlugFromUrl('https://www.dedato.ru/m/slug2')).toBe('slug2');
  });

  it('rejects untrusted host', () => {
    expect(parsePublicMasterSlugFromUrl('https://evil.com/m/slug')).toBeNull();
  });

  it('rejects non /m/ paths', () => {
    expect(parsePublicMasterSlugFromUrl('https://dedato.ru/other/m/x')).toBeNull();
  });

  describe('dev hosts and exp', () => {
    const g = globalThis as typeof globalThis & { __DEV__?: boolean };
    const orig = g.__DEV__;
    beforeAll(() => {
      g.__DEV__ = true;
    });
    afterAll(() => {
      g.__DEV__ = orig;
    });

    it('parses http 10.0.2.2 /m/ in __DEV__', () => {
      expect(parsePublicMasterSlugFromUrl('http://10.0.2.2:5173/m/qa-smoke-public')).toBe('qa-smoke-public');
    });

    it('parses exp://.../--/m/ in __DEV__', () => {
      expect(parsePublicMasterSlugFromUrl('exp://10.0.2.2:8081/--/m/qa-smoke-public')).toBe('qa-smoke-public');
    });
  });
});

describe('getTrustedUniversalLinkHosts', () => {
  it('includes dedato pair when WEB_URL is dedato.ru', () => {
    const h = getTrustedUniversalLinkHosts();
    expect(h).toContain('dedato.ru');
    expect(h).toContain('www.dedato.ru');
  });
});
