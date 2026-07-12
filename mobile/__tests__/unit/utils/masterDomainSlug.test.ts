import {
  masterDomainSlugFromStored,
  normalizeMasterDomainSlug,
  validateMasterDomainSlug,
} from '@src/utils/masterDomainSlug';
import { buildMasterPublicBookingUrl, buildMasterPublicRoutePath } from '@src/utils/masterPublicBooking';
import {
  DEFAULT_PUBLIC_APP_LINK_ORIGIN,
  getPublicAppLinkOrigin,
} from '@src/config/publicAppLinkOrigin';

jest.mock('@env', () => ({
  PUBLIC_APP_LINK_ORIGIN: 'https://www.dedato.ru',
  WEB_URL: 'https://dedato.ru',
  EXTRA_UNIVERSAL_LINK_HOSTS: '',
}));

describe('masterDomainSlug', () => {
  it('normalizes user input to lowercase slug', () => {
    expect(normalizeMasterDomainSlug(' Stats-Smoke-Master ')).toBe('stats-smoke-master');
  });

  it('preserves stored domain casing', () => {
    expect(masterDomainSlugFromStored(' m-5haJFCMx ')).toBe('m-5haJFCMx');
  });

  it('validates allowed characters', () => {
    expect(validateMasterDomainSlug('stats-smoke-master')).toBeNull();
    expect(validateMasterDomainSlug('bad_slug')).toMatch(/латиница/);
    expect(validateMasterDomainSlug('-bad')).toMatch(/дефис/);
  });
});

describe('publicAppLinkOrigin', () => {
  it('uses PUBLIC_APP_LINK_ORIGIN from env', () => {
    expect(getPublicAppLinkOrigin()).toBe('https://www.dedato.ru');
  });
});

describe('masterPublicBooking', () => {
  it('builds share URL on verified www host with preserved slug case', () => {
    expect(buildMasterPublicBookingUrl('m-5haJFCMx')).toBe(
      `${DEFAULT_PUBLIC_APP_LINK_ORIGIN}/m/m-5haJFCMx`
    );
    expect(buildMasterPublicBookingUrl('m-5haJFCMx')).toMatch(
      /^https:\/\/www\.dedato\.ru\/m\//
    );
  });

  it('builds in-app route without lowercasing slug', () => {
    expect(buildMasterPublicRoutePath('m-5haJFCMx')).toBe('/m/m-5haJFCMx');
  });

  it('allows explicit baseUrl override in tests', () => {
    expect(buildMasterPublicBookingUrl('test-slug', 'http://localhost:5173')).toBe(
      'http://localhost:5173/m/test-slug'
    );
  });
});
