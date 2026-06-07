import { Alert, Linking } from 'react-native';

/** Полный адрес для карт: город + улица без дублирования. */
export function buildFullAddress(
  city: string | null | undefined,
  address: string | null | undefined
): string | null {
  const c = city?.trim() || '';
  const a = address?.trim() || '';
  if (!a && !c) return null;
  if (!c) return a;
  if (!a) return c;
  const aLower = a.toLowerCase();
  const cLower = c.toLowerCase();
  if (aLower.includes(cLower)) return a;
  return `${c}, ${a}`;
}

/** HTTPS-ссылка на поиск в Яндекс Картах (без custom scheme). */
export function buildYandexMapsUrl(
  city: string | null | undefined,
  address: string | null | undefined
): string | null {
  const full = buildFullAddress(city, address);
  if (!full) return null;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(full)}`;
}

/** Открыть карты в приложении/браузере. На Android canOpenURL часто false для https — открываем напрямую. */
export async function openYandexMapsSearch(
  city: string | null | undefined,
  address: string | null | undefined
): Promise<boolean> {
  const full = buildFullAddress(city, address);
  if (!full) return false;
  const url = buildYandexMapsUrl(city, address);
  if (!url) return false;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      /* ignore */
    }
    Alert.alert('Не удалось открыть карты', `Проверьте адрес вручную: ${full}`);
    return false;
  }
}

export type MasterAddressValidation = {
  error: string | null;
  warning: string | null;
};

/** Базовая валидация адреса мастера (город задаётся отдельно в профиле). */
export function validateMasterAddress(address: string): MasterAddressValidation {
  const trimmed = address.trim();
  if (!trimmed) {
    return { error: 'Укажите адрес', warning: null };
  }
  if (trimmed.length < 8) {
    return { error: 'Адрес слишком короткий (минимум 8 символов)', warning: null };
  }
  if (/^\d+$/.test(trimmed.replace(/\s/g, ''))) {
    return { error: 'Адрес не может состоять только из цифр', warning: null };
  }
  const parts = trimmed
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2 && words.length < 2) {
    return {
      error: 'Укажите улицу и дом, например: ул. Тверская, 10',
      warning: null,
    };
  }
  const hasHouseNumber = /\d/.test(trimmed);
  if (!hasHouseNumber) {
    return {
      error: 'Добавьте номер дома, чтобы клиенту было проще найти вас',
      warning: null,
    };
  }
  const cityOnly = /^(москва|санкт-петербург|спб|санкт петербург)$/i.test(trimmed);
  if (cityOnly) {
    return { error: 'Укажите улицу и дом, а не только город', warning: null };
  }
  return { error: null, warning: null };
}
