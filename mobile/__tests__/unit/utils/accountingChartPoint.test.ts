import {
  chartPointNetProfit,
  chartDateToYmd,
  enrichChartPoint,
  finalizeChartPoint,
  chartPointConfirmedIncome,
  findFirstNonZeroIncomeExpenseIndex,
  getChartConfirmedIncome,
  getChartExpectedIncome,
  getChartExpenseValue,
  getChartProfitValue,
  toIncomeExpenseChartPoint,
} from '@src/utils/accountingChartPoint';

describe('accountingChartPoint', () => {
  it('chartDateToYmd extracts calendar date', () => {
    expect(chartDateToYmd('2026-06-05')).toBe('2026-06-05');
    expect(chartDateToYmd('2026-06-05T12:00:00Z')).toBe('2026-06-05');
    expect(chartDateToYmd(null)).toBeNull();
  });

  it('chartPointConfirmedIncome reads aliases', () => {
    expect(chartPointConfirmedIncome({ date: 'x', income: 0, confirmed_income: 800, expense: 0, expected_income: 0, net_profit: 0 })).toBe(800);
  });

  it('chartPointNetProfit always uses income - expense', () => {
    const base = { date: '2026-06-01', expected_income: 0 };
    expect(chartPointNetProfit({ ...base, income: 1000, expense: 200, net_profit: 0 })).toBe(800);
    expect(chartPointNetProfit({ ...base, income: 500, expense: 100, net_profit: 400 })).toBe(400);
    expect(chartPointNetProfit({ ...base, income: 0, expense: 0, net_profit: 999 })).toBe(0);
  });

  it('finalizeChartPoint normalizes date and profit', () => {
    const p = finalizeChartPoint({
      date: '2026-06-05T00:00:00',
      income: 1500,
      expense: 0,
      expected_income: 0,
      net_profit: 0,
    });
    expect(p.date).toBe('2026-06-05');
    expect(p.net_profit).toBe(1500);
    expect(p.income).toBe(1500);
  });

  it('getChartProfitValue prefers profit field', () => {
    const base = { date: '2026-06-01', expected_income: 0, income: 0, expense: 0, net_profit: 0 };
    expect(getChartProfitValue({ ...base, profit: 24500 })).toBe(24500);
    expect(getChartProfitValue({ ...base, value: 12000 })).toBe(12000);
    expect(getChartProfitValue({ ...base, income: 800, expense: 100 })).toBe(700);
  });

  it('income/expense resolvers read field aliases', () => {
    const base = { date: '2026-05-25', expected_income: 0, net_profit: 0 };
    expect(getChartConfirmedIncome({ ...base, income: 16300, expense: 0 })).toBe(16300);
    expect(getChartConfirmedIncome({ ...base, income: 0, confirmed_income: 800, expense: 0 })).toBe(800);
    expect(getChartExpectedIncome({ ...base, income: 0, expense: 0, expected_income: 500 })).toBe(500);
    expect(
      getChartExpectedIncome({
        date: '2026-05-25',
        income: 0,
        expense: 0,
        net_profit: 0,
        pending_income: 300,
      } as Parameters<typeof getChartExpectedIncome>[0])
    ).toBe(300);
    expect(getChartExpenseValue({ ...base, income: 0, expense: 0, expenses: 120 })).toBe(120);
  });

  it('findFirstNonZeroIncomeExpenseIndex picks first day with activity', () => {
    const week = [
      { date: '2026-05-25', income: 16300, expected_income: 0, expense: 0, net_profit: 16300 },
      { date: '2026-05-26', income: 0, expected_income: 0, expense: 0, net_profit: 0 },
      { date: '2026-05-27', income: 0, expected_income: 0, expense: 0, net_profit: 0 },
    ];
    expect(findFirstNonZeroIncomeExpenseIndex(week)).toBe(0);
    expect(toIncomeExpenseChartPoint(week[0]).income).toBe(16300);
  });

  it('enrichChartPoint is alias of finalizeChartPoint', () => {
    const raw = {
      date: '2026-06-03',
      income: 7000,
      expense: 0,
      expected_income: 0,
      net_profit: 0,
    };
    expect(enrichChartPoint(raw).net_profit).toBe(7000);
  });
});
