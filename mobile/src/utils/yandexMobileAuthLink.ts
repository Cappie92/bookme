import { getYandexLoginUrl } from '@src/services/api/auth';

export async function openYandexMobileAuthUrl(openURL: (url: string) => Promise<unknown>): Promise<string> {
  const url = getYandexLoginUrl();
  await openURL(url);
  return url;
}
