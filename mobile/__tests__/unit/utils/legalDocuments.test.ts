import {
  buildLegalDocumentUrl,
  openLegalDocument,
  PERSONAL_DATA_CONSENT_PATH,
  USER_AGREEMENT_PATH,
} from '@src/utils/legalDocuments';

describe('legalDocuments', () => {
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
