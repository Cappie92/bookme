import {
  normalizeRelativeUrlForApiBase,
  isMasterExclusiveApiPath,
} from '@src/utils/normalizeApiUrl';

describe('normalizeRelativeUrlForApiBase', () => {
  it('убирает дублирующий /api, если baseURL заканчивается на /api (root cause 405 / неверный путь)', () => {
    expect(normalizeRelativeUrlForApiBase('https://dedato.ru/api', '/api/master/schedule/day')).toBe(
      '/master/schedule/day'
    );
    expect(normalizeRelativeUrlForApiBase('https://dedato.ru/api/', '/api/master/schedule/day')).toBe(
      '/master/schedule/day'
    );
  });

  it('не трогает путь, если base без суффикса /api', () => {
    expect(normalizeRelativeUrlForApiBase('https://api.dedato.ru', '/api/master/schedule/day')).toBe(
      '/api/master/schedule/day'
    );
  });

  it('не трогает base с /api в середине хоста', () => {
    expect(normalizeRelativeUrlForApiBase('https://api.example.com', '/api/foo')).toBe('/api/foo');
  });
});

describe('isMasterExclusiveApiPath', () => {
  it('мастер-пути после нормализации', () => {
    expect(isMasterExclusiveApiPath('/master/schedule/day')).toBe(true);
    expect(isMasterExclusiveApiPath('/api/master/schedule/day')).toBe(true);
  });

  it('не цепляет client loyalty с сегментом /master/', () => {
    expect(isMasterExclusiveApiPath('/client/loyalty/master/12/foo')).toBe(false);
  });
});
