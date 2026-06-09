import { getWelcomeSlidesForRole } from '@src/data/welcomeSlidesData';

describe('welcomeSlidesData', () => {
  it('returns 7 master slides including pricing and registration dashboard preview', () => {
    const slides = getWelcomeSlidesForRole('master');
    expect(slides).toHaveLength(7);
    expect(slides.some((s) => s.type === 'pricing')).toBe(true);
    expect(slides.find((s) => s.type === 'registration')?.illustration).toBe('master-dashboard');
  });

  it('returns 4 client slides with client dashboard registration preview', () => {
    const slides = getWelcomeSlidesForRole('client');
    expect(slides).toHaveLength(4);
    expect(slides.find((s) => s.type === 'registration')?.illustration).toBe('client-dashboard');
  });

  it('does not use mock-form illustration types', () => {
    const all = [...getWelcomeSlidesForRole('master'), ...getWelcomeSlidesForRole('client')];
    const types = all.map((s) => s.illustration);
    expect(types).not.toContain('registration');
    expect(types).not.toContain('client-registration');
  });
});
