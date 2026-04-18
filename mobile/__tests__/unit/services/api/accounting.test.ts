import {
  createTaxRate,
  exportAccounting,
  getAccountingOperations,
  getAccountingSummary,
  getMasterServices,
} from '@src/services/api/accounting';
import { apiClient } from '@src/services/api/client';

describe('Accounting API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds summary query with period/offset', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { chart_data: [] } });
    await getAccountingSummary({ period: 'week', offset: 2 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/master/accounting/summary?period=week&offset=2');
  });

  it('builds summary query with start/end', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { chart_data: [] } });
    await getAccountingSummary({ start_date: '2026-01-01', end_date: '2026-01-31' });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/master/accounting/summary?start_date=2026-01-01&end_date=2026-01-31'
    );
  });

  it('builds summary query for day with anchor + window (web parity)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { chart_data: [] } });
    await getAccountingSummary({
      period: 'day',
      offset: 0,
      anchor_date: '2026-04-10',
      window_before: 9,
      window_after: 9,
    });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/master/accounting/summary?period=day&offset=0&anchor_date=2026-04-10&window_before=9&window_after=9'
    );
  });

  it('builds operations query with period/offset and day anchor', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { operations: [], pages: 1 } });
    await getAccountingOperations({
      page: 1,
      limit: 20,
      period: 'day',
      offset: 0,
      anchor_date: '2026-04-10',
      window_before: 9,
      window_after: 9,
    });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/master/accounting/operations?page=1&limit=20&period=day&offset=0&anchor_date=2026-04-10&window_before=9&window_after=9'
    );
  });

  it('creates tax rate with trailing slash and query params', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { message: 'ok' } });
    await createTaxRate({
      rate: 6,
      effective_from_date: '2026-01-20',
      recalculate_existing: false,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/master/tax-rates/?rate=6&effective_from_date=2026-01-20&recalculate_existing=false'
    );
  });

  it('exports excel with .xlsx and correct URL', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: {},
    });
    const result = await exportAccounting('excel');
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/master/accounting/export?format=excel'),
      { responseType: 'arraybuffer' }
    );
    expect(result.filename.endsWith('.xlsx')).toBe(true);
  });

  it('exports csv with dates and .csv', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: {},
    });
    const result = await exportAccounting('csv', { start_date: '2026-01-01', end_date: '2026-01-31' });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/master/accounting/export?format=csv&start_date=2026-01-01&end_date=2026-01-31',
      { responseType: 'arraybuffer' }
    );
    expect(result.filename.endsWith('.csv')).toBe(true);
  });

  it('uses filename from Content-Disposition when provided', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: { 'content-disposition': 'attachment; filename="custom-report.xlsx"' },
    });
    const result = await exportAccounting('excel');
    expect(result.filename).toBe('custom-report.xlsx');
  });

  it('parses services response as array', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [{ id: 1, name: 'Service A' }] });
    const services = await getMasterServices();
    expect(services).toEqual([{ id: 1, name: 'Service A' }]);
  });

  it('parses services response from object', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { services: [{ id: 2, name: 'Service B' }] },
    });
    const services = await getMasterServices();
    expect(services).toEqual([{ id: 2, name: 'Service B' }]);
  });
});
