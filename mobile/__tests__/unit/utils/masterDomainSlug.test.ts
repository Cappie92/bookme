import {
  normalizeMasterDomainSlug,
  validateMasterDomainSlug,
} from '@src/utils/masterDomainSlug';

describe('masterDomainSlug', () => {
  it('normalizes to lowercase slug', () => {
    expect(normalizeMasterDomainSlug(' Stats-Smoke-Master ')).toBe('stats-smoke-master');
  });

  it('validates allowed characters', () => {
    expect(validateMasterDomainSlug('stats-smoke-master')).toBeNull();
    expect(validateMasterDomainSlug('bad_slug')).toMatch(/латиница/);
    expect(validateMasterDomainSlug('-bad')).toMatch(/дефис/);
  });
});
