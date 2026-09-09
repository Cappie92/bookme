import { env } from '@src/config/env';
import { Platform } from 'react-native';

export const USER_AGREEMENT_PATH = '/user-agreement';
export const PERSONAL_DATA_CONSENT_PATH = '/personal-data-consent';
export const PRIVACY_POLICY_PATH = '/privacy-policy';

const DEFAULT_LEGAL_ORIGIN = 'https://dedato.ru';

export function buildLegalDocumentUrl(path: string, baseUrl?: string): string {
  const raw = (baseUrl ?? env.WEB_URL ?? DEFAULT_LEGAL_ORIGIN).trim().replace(/\/+$/, '');
  const origin = raw || DEFAULT_LEGAL_ORIGIN;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${origin}${normalizedPath}`;
  // Public UX context only: no identity, JWT or one-time handoff code.
  return Platform.OS === 'ios' ? `${url}${url.includes('?') ? '&' : '?'}context=ios_app` : url;
}

export async function openLegalDocument(
  path: string,
  openURL: (url: string) => Promise<unknown>,
  baseUrl?: string
): Promise<string> {
  const url = buildLegalDocumentUrl(path, baseUrl);
  await openURL(url);
  return url;
}
