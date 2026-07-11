import {
  appInternalRouteToPath,
  parseAppInternalRouteFromUrl,
} from '@src/utils/parseAppInternalRoute';

describe('parseAppInternalRouteFromUrl', () => {
  it('parses dedato subscriptions deep links', () => {
    expect(parseAppInternalRouteFromUrl('dedato://subscriptions')).toBe('subscriptions');
    expect(parseAppInternalRouteFromUrl('dedato:///subscriptions')).toBe('subscriptions');
    expect(parseAppInternalRouteFromUrl('dedato:/subscriptions')).toBe('subscriptions');
    expect(parseAppInternalRouteFromUrl('dedato://subscriptions?refresh=1')).toBe('subscriptions');
  });

  it('does not match public master links', () => {
    expect(parseAppInternalRouteFromUrl('dedato://m/my-master')).toBeNull();
    expect(parseAppInternalRouteFromUrl('dedato:///m/my-master')).toBeNull();
    expect(parseAppInternalRouteFromUrl('https://dedato.ru/m/slug1')).toBeNull();
  });

  it('maps subscriptions route to app path', () => {
    expect(appInternalRouteToPath('subscriptions')).toBe('/subscriptions');
  });
});

describe('parseAppInternalRouteFromUrl dev exp', () => {
  const g = globalThis as typeof globalThis & { __DEV__?: boolean };
  const orig = g.__DEV__;
  beforeAll(() => {
    g.__DEV__ = true;
  });
  afterAll(() => {
    g.__DEV__ = orig;
  });

  it('parses exp://.../subscriptions in __DEV__', () => {
    expect(parseAppInternalRouteFromUrl('exp://10.0.2.2:8081/--/subscriptions')).toBe('subscriptions');
  });
});
