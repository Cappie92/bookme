jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(), canOpenURL: jest.fn() },
}));

import {
  buildFullAddress,
  buildYandexMapsUrl,
  validateMasterAddress,
} from '@src/utils/masterAddress';

describe('masterAddress', () => {
  it('buildYandexMapsUrl joins city and address', () => {
    const url = buildYandexMapsUrl('Москва', 'ул. Тверская, 10');
    expect(url).toContain('yandex.ru/maps');
    expect(url).toContain(encodeURIComponent('Москва, ул. Тверская, 10'));
  });

  it('buildFullAddress does not duplicate city in address', () => {
    expect(buildFullAddress('Москва', 'Москва, ул. Тверская, 10')).toBe(
      'Москва, ул. Тверская, 10'
    );
    expect(buildFullAddress('Москва', 'ул. Тверская, 10')).toBe('Москва, ул. Тверская, 10');
  });

  it('rejects short and city-only addresses', () => {
    expect(validateMasterAddress('').error).toBeTruthy();
    expect(validateMasterAddress('Москва').error).toBeTruthy();
    expect(validateMasterAddress('ул. Тверская').error).toMatch(/дом/i);
  });

  it('accepts full street address', () => {
    expect(validateMasterAddress('ул. Тверская, 10').error).toBeNull();
    expect(validateMasterAddress('Москва, ул. Тверская, 10').error).toBeNull();
  });
});
