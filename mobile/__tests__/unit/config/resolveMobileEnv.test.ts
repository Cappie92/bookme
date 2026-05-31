import {
  assertProductionApiUrl,
  buildMobileEnvUrls,
  InvalidProductionApiUrlError,
  resolveEffectiveApiUrl,
  resolveRawApiUrl,
} from '@src/config/resolveMobileEnv';

const baseInput = {
  isDev: true,
  platform: 'ios' as const,
  dotenvApiUrl: 'http://localhost:8000',
  dotenvApiUrlAndroid: 'http://10.0.2.2:8000',
  dotenvWebUrl: 'http://localhost:5173',
};

describe('resolveRawApiUrl', () => {
  it('prefers extra over dotenv (EAS / app.config)', () => {
    expect(
      resolveRawApiUrl({
        ...baseInput,
        extraApiUrl: 'https://dedato.ru',
        dotenvApiUrl: 'http://localhost:8000',
      })
    ).toBe('https://dedato.ru');
  });

  it('falls back to dotenv when extra and process env are empty', () => {
    expect(
      resolveRawApiUrl({
        ...baseInput,
        extraApiUrl: undefined,
        processEnv: {},
      })
    ).toBe('http://localhost:8000');
  });

  it('uses EXPO_PUBLIC_API_URL when extra is empty', () => {
    expect(
      resolveRawApiUrl({
        ...baseInput,
        processEnv: { EXPO_PUBLIC_API_URL: 'https://dedato.ru' },
        dotenvApiUrl: '',
      })
    ).toBe('https://dedato.ru');
  });
});

describe('resolveEffectiveApiUrl', () => {
  it('applies Android override only in dev on android', () => {
    expect(
      resolveEffectiveApiUrl('http://localhost:8000', 'http://10.0.2.2:8000', true, 'android')
    ).toBe('http://10.0.2.2:8000');
  });

  it('ignores Android override in production', () => {
    expect(
      resolveEffectiveApiUrl('https://dedato.ru', 'http://10.0.2.2:8000', false, 'android')
    ).toBe('https://dedato.ru');
  });

  it('ignores Android override on iOS dev', () => {
    expect(
      resolveEffectiveApiUrl('http://localhost:8000', 'http://10.0.2.2:8000', true, 'ios')
    ).toBe('http://localhost:8000');
  });
});

describe('assertProductionApiUrl', () => {
  it('allows https://dedato.ru', () => {
    expect(() => assertProductionApiUrl('https://dedato.ru', false)).not.toThrow();
  });

  it('rejects empty API_URL in production', () => {
    expect(() => assertProductionApiUrl('', false)).toThrow(InvalidProductionApiUrlError);
  });

  it('rejects localhost in production', () => {
    expect(() => assertProductionApiUrl('http://localhost:8000', false)).toThrow(
      InvalidProductionApiUrlError
    );
  });

  it('rejects 127.0.0.1 in production', () => {
    expect(() => assertProductionApiUrl('http://127.0.0.1:8000', false)).toThrow(
      InvalidProductionApiUrlError
    );
  });

  it('does not validate in dev', () => {
    expect(() => assertProductionApiUrl('', true)).not.toThrow();
    expect(() => assertProductionApiUrl('http://localhost:8000', true)).not.toThrow();
  });
});

describe('buildMobileEnvUrls', () => {
  it('production EAS extra resolves to dedato.ru', () => {
    const { API_URL, WEB_URL } = buildMobileEnvUrls({
      isDev: false,
      platform: 'android',
      extraApiUrl: 'https://dedato.ru',
      extraWebUrl: 'https://dedato.ru',
      dotenvApiUrl: 'http://localhost:8000',
    });
    expect(API_URL).toBe('https://dedato.ru');
    expect(WEB_URL).toBe('https://dedato.ru');
  });

  it('local dev uses dotenv fallback when extra is empty', () => {
    const { API_URL } = buildMobileEnvUrls({
      isDev: true,
      platform: 'ios',
      dotenvApiUrl: 'http://localhost:8000',
    });
    expect(API_URL).toBe('http://localhost:8000');
  });
});
