import {
  formatBirthDateInput,
  parseBirthDateForApi,
  validateBirthDateDisplay,
} from '@src/utils/birthDateInput';

describe('birthDateInput', () => {
  it('formatBirthDateInput("11111991") -> "11.11.1991"', () => {
    expect(formatBirthDateInput('11111991')).toBe('11.11.1991');
  });

  it('parseBirthDateForApi("11.11.1991") -> "1991-11-11"', () => {
    expect(parseBirthDateForApi('11.11.1991')).toBe('1991-11-11');
  });

  it('supports paste with dots and ISO', () => {
    expect(formatBirthDateInput('11.11.1991')).toBe('11.11.1991');
    expect(formatBirthDateInput('1991-11-11')).toBe('11.11.1991');
  });

  it('rejects invalid dates', () => {
    expect(validateBirthDateDisplay('32.13.2030')).toMatch(/ДД\.ММ\.ГГГГ|корректн/i);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const d = String(tomorrow.getDate()).padStart(2, '0');
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const y = String(tomorrow.getFullYear());
    expect(validateBirthDateDisplay(`${d}.${m}.${y}`)).toMatch(/будущ/i);
  });

  it('accepts valid past date', () => {
    expect(validateBirthDateDisplay('11.11.1991')).toBeNull();
  });
});
