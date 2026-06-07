import { isMasterAppRole, normalizeAppRole } from '@src/utils/masterRole';

describe('masterRole', () => {
  it('normalizeAppRole lowercases and trims', () => {
    expect(normalizeAppRole(' MASTER ')).toBe('master');
    expect(normalizeAppRole('INDIE')).toBe('indie');
  });

  it('isMasterAppRole accepts master and indie', () => {
    expect(isMasterAppRole('MASTER')).toBe(true);
    expect(isMasterAppRole('master')).toBe(true);
    expect(isMasterAppRole('indie')).toBe(true);
    expect(isMasterAppRole('client')).toBe(false);
    expect(isMasterAppRole('salon')).toBe(false);
  });
});
