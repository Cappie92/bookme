import {
  parseMaxDiscountAmountForApi,
  hasMaxDiscountAmountLimit,
} from '@src/utils/personalDiscountAmount';

describe('parseMaxDiscountAmountForApi', () => {
  it('returns null for empty input (no limit)', () => {
    expect(parseMaxDiscountAmountForApi('')).toBeNull();
    expect(parseMaxDiscountAmountForApi('   ')).toBeNull();
  });

  it('returns 0 for zero (no limit on backend)', () => {
    expect(parseMaxDiscountAmountForApi('0')).toBe(0);
    expect(parseMaxDiscountAmountForApi('0.0')).toBe(0);
  });

  it('parses positive amounts', () => {
    expect(parseMaxDiscountAmountForApi('1500')).toBe(1500);
  });

  it('returns null for invalid input', () => {
    expect(parseMaxDiscountAmountForApi('abc')).toBeNull();
  });
});

describe('hasMaxDiscountAmountLimit', () => {
  it('treats null and 0 as no limit', () => {
    expect(hasMaxDiscountAmountLimit(null)).toBe(false);
    expect(hasMaxDiscountAmountLimit(0)).toBe(false);
  });

  it('treats positive values as limit', () => {
    expect(hasMaxDiscountAmountLimit(100)).toBe(true);
  });
});
