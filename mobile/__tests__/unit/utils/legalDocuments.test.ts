jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
import { Platform } from 'react-native';
import {
  buildLegalDocumentUrl,
  openLegalDocument,
  PERSONAL_DATA_CONSENT_PATH,
  PRIVACY_POLICY_PATH,
  USER_AGREEMENT_PATH,
} from '@src/utils/legalDocuments';

describe('legalDocuments', () => {
  afterEach(() => { (Platform as { OS: string }).OS = 'android'; });

  it.each([USER_AGREEMENT_PATH, PERSONAL_DATA_CONSENT_PATH, PRIVACY_POLICY_PATH, '/account-deletion'])(
    'iOS legal %s carries only a non-sensitive UX context flag', (path) => {
      (Platform as { OS: string }).OS = 'ios';
      const url = new URL(buildLegalDocumentUrl(path, 'https://dedato.ru'));
      expect(url.pathname).toBe(path);
      expect(url.search).toBe('?context=ios_app');
    }
  );
  it('builds absolute user agreement URL from base', () => {
    expect(buildLegalDocumentUrl(USER_AGREEMENT_PATH, 'https://dedato.ru')).toBe(
      'https://dedato.ru/user-agreement'
    );
  });

  it('builds personal data consent URL and strips trailing slash on base', () => {
    expect(buildLegalDocumentUrl(PERSONAL_DATA_CONSENT_PATH, 'https://dedato.ru/')).toBe(
      'https://dedato.ru/personal-data-consent'
    );
  });

  it('builds the production privacy policy URL', () => {
    expect(buildLegalDocumentUrl(PRIVACY_POLICY_PATH, 'https://dedato.ru')).toBe(
      'https://dedato.ru/privacy-policy'
    );
  });

  it('builds the privacy policy URL for a custom/staging WEB_URL', () => {
    expect(buildLegalDocumentUrl(PRIVACY_POLICY_PATH, 'https://staging.dedato.example/')).toBe(
      'https://staging.dedato.example/privacy-policy'
    );
  });

  it('falls back to https://dedato.ru when base is empty', () => {
    expect(buildLegalDocumentUrl(USER_AGREEMENT_PATH, '   ')).toBe(
      'https://dedato.ru/user-agreement'
    );
  });

  it('openLegalDocument calls openURL with built URL', async () => {
    const openURL = jest.fn().mockResolvedValue(undefined);

    const url = await openLegalDocument(USER_AGREEMENT_PATH, openURL, 'https://www.dedato.ru');

    expect(url).toBe('https://www.dedato.ru/user-agreement');
    expect(openURL).toHaveBeenCalledWith('https://www.dedato.ru/user-agreement');
  });
});
