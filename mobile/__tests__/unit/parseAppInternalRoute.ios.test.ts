import {
  appInternalRouteToPath,
  parseAppInternalRouteFromUrl,
} from '@src/utils/parseAppInternalRoute.ios';

describe('iOS retired commerce deep links', () => {
  it.each([
    'dedato://subscriptions',
    'dedato:///subscriptions',
    'dedato://subscriptions?refresh=1',
    'dedato://pricing',
    'dedato://tariff',
    'dedato://finance',
    'dedato://loyalty',
    'dedato://stats',
    'dedato://clients',
    'dedato://master/finance',
    'dedato://master/loyalty',
    'dedato://master/stats',
    'dedato://master/clients',
    'dedato://master/client-restrictions',
    'dedato://master/invitations',
    'dedato://payment',
    'dedato://payments',
    'dedato://web-handoff',
    'dedato://website',
    'dedato://domain',
    'dedato://purchase',
    'dedato://tariffs',
  ])('treats %s as a retired internal route', (url) => {
    expect(parseAppInternalRouteFromUrl(url)).toBe('subscriptions');
  });

  it('does not swallow public master booking links', () => {
    expect(parseAppInternalRouteFromUrl('dedato://m/my-master')).toBeNull();
    expect(parseAppInternalRouteFromUrl('https://dedato.ru/m/slug1')).toBeNull();
  });

  it('maps every retired internal route to the master dashboard', () => {
    expect(appInternalRouteToPath('subscriptions')).toBe('/');
  });
});
