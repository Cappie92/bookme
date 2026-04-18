import { apiClient } from './client';
import type { AxiosError } from 'axios';

export type AccountingPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface ChartPoint {
  date: string;
  expected_income: number;
  income: number;
  expense: number;
  net_profit: number;
}

export interface AccountingSummary {
  total_income: number;
  total_expected_income: number;
  total_expense: number;
  net_profit: number;
  total_points_spent: number;
  chart_data: ChartPoint[];
  /** Согласовано с GET /accounting/summary: шаг точек графика после rollup на backend */
  chart_axis_granularity?: 'day' | 'week' | 'month';
  period?: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface AccountingOperation {
  id: string;
  date: string;
  name?: string | null;
  operation_type?: 'income' | 'expense' | string;
  type?: string | null;
  amount: number;
  gross_amount?: number | null;
  tax_rate?: number | null;
  net_amount?: number | null;
}

export interface OperationsResponse {
  operations: AccountingOperation[];
  pages: number;
  total?: number;
  page?: number;
  limit?: number;
}

export interface Service {
  id: number;
  name: string;
  [key: string]: any;
}

type SummaryByPeriod = {
  period: AccountingPeriod;
  offset: number;
  /** period=day: как у web /api/master/accounting/summary */
  anchor_date?: string;
  window_before?: number;
  window_after?: number;
};
type SummaryByDates = { start_date: string; end_date: string };
export type SummaryParams = SummaryByPeriod | SummaryByDates;

export interface OperationsParams {
  page: number;
  limit: number;
  start_date?: string;
  end_date?: string;
  /** Если нет start/end — фильтр по календарному периоду (как web MasterAccounting.jsx) */
  period?: AccountingPeriod;
  offset?: number;
  anchor_date?: string;
  window_before?: number;
  window_after?: number;
  operation_type?: 'income' | 'expense';
}

function logDevRequest(name: string, url: string, params?: object) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (params) {
    // eslint-disable-next-line no-console
    console.log('🧾 [FINANCE API]', name, url, params);
  } else {
    // eslint-disable-next-line no-console
    console.log('🧾 [FINANCE API]', name, url);
  }
}

export async function getAccountingSummary(params: SummaryParams): Promise<AccountingSummary> {
  const search = new URLSearchParams();
  if ('period' in params) {
    search.set('period', params.period);
    search.set('offset', String(params.offset ?? 0));
    if (params.anchor_date) search.set('anchor_date', params.anchor_date);
    if (params.window_before != null) search.set('window_before', String(params.window_before));
    if (params.window_after != null) search.set('window_after', String(params.window_after));
  } else {
    search.set('start_date', params.start_date);
    search.set('end_date', params.end_date);
  }
  const url = `/api/master/accounting/summary?${search.toString()}`;
  logDevRequest('summary', url, params);
  try {
    const response = await apiClient.get<AccountingSummary>(url);
    return response.data;
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function getAccountingOperations(params: OperationsParams): Promise<OperationsResponse> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('limit', String(params.limit));
  if (params.start_date && params.end_date) {
    search.set('start_date', params.start_date);
    search.set('end_date', params.end_date);
  } else {
    const period = params.period ?? 'week';
    const offset = params.offset ?? 0;
    search.set('period', period);
    search.set('offset', String(offset));
    if (period === 'day' && params.anchor_date) {
      search.set('anchor_date', params.anchor_date);
      search.set('window_before', String(params.window_before ?? 9));
      search.set('window_after', String(params.window_after ?? 9));
    }
  }
  if (params.operation_type) {
    search.set('operation_type', params.operation_type);
  }
  const url = `/api/master/accounting/operations?${search.toString()}`;
  logDevRequest('operations', url, params);
  try {
    const response = await apiClient.get<OperationsResponse>(url);
    return response.data;
  } catch (err) {
    throw buildApiError(err);
  }
}

export interface TaxRateResponse {
  rate: number;
  effective_from_date: string | null;
  has_rate: boolean;
}

export interface CreateTaxRateParams {
  rate: number;
  effective_from_date: string;
  recalculate_existing: boolean;
}

export interface CreateExpenseParams {
  name: string;
  expense_type: 'one_time' | 'recurring' | 'service_based';
  amount: number;
  recurrence_type?: string;
  condition_type?: string;
  service_id?: number;
  expense_date?: string;
}

export interface UpdateExpenseParams {
  name?: string;
  expense_type?: 'one_time' | 'recurring' | 'service_based';
  amount?: number;
  recurrence_type?: string;
  condition_type?: string;
  service_id?: number;
  expense_date?: string;
}

export async function getCurrentTaxRate(): Promise<TaxRateResponse> {
  try {
    logDevRequest('tax.current', '/api/master/tax-rates/current');
    const response = await apiClient.get<TaxRateResponse>('/api/master/tax-rates/current');
    return response.data;
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function createTaxRate(params: CreateTaxRateParams): Promise<void> {
  const search = new URLSearchParams();
  search.set('rate', String(params.rate));
  search.set('effective_from_date', params.effective_from_date);
  search.set('recalculate_existing', String(params.recalculate_existing));
  const url = `/api/master/tax-rates/?${search.toString()}`;
  logDevRequest('tax.create', url, params);
  try {
    await apiClient.post(url);
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function getMasterServices(): Promise<Service[]> {
  try {
    logDevRequest('services', '/api/master/services');
    const response = await apiClient.get<any>('/api/master/services');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.services)) return data.services;
    return [];
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function createExpense(params: CreateExpenseParams): Promise<number> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || Number.isNaN(value)) return;
    search.set(key, String(value));
  });
  const url = `/api/master/accounting/expenses?${search.toString()}`;
  logDevRequest('expenses.create', url, params);
  try {
    const response = await apiClient.post(url);
    return response.status || 200;
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function updateExpense(expenseId: number, params: UpdateExpenseParams): Promise<number> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || Number.isNaN(value)) return;
    search.set(key, String(value));
  });
  const url = `/api/master/accounting/expenses/${expenseId}?${search.toString()}`;
  logDevRequest('expenses.update', url, { expenseId, ...params });
  try {
    const response = await apiClient.put(url);
    return response.status || 200;
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function deleteExpense(expenseId: number): Promise<void> {
  try {
    logDevRequest('expenses.delete', `/api/master/accounting/expenses/${expenseId}`, { expenseId });
    await apiClient.delete(`/api/master/accounting/expenses/${expenseId}`);
  } catch (err) {
    throw buildApiError(err);
  }
}

export async function exportAccounting(
  format: 'excel' | 'csv',
  params?: { start_date?: string; end_date?: string }
): Promise<{ data: ArrayBuffer; filename: string; mime: string }> {
  const search = new URLSearchParams();
  search.set('format', format);
  if (params?.start_date && params?.end_date) {
    search.set('start_date', params.start_date);
    search.set('end_date', params.end_date);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const ext = format === 'excel' ? 'xlsx' : 'csv';
  const fallbackFilename = `accounting_${dateStr}.${ext}`;
  const mime =
    format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

  try {
    const url = `/api/master/accounting/export?${search.toString()}`;
    logDevRequest('export', url, params);
    const response = await apiClient.get<ArrayBuffer>(
      url,
      { responseType: 'arraybuffer' }
    );
    const disposition = response.headers?.['content-disposition'] || response.headers?.['Content-Disposition'];
    const headerFilename = disposition ? parseFilenameFromDisposition(disposition) : null;
    const finalFilename = ensureExtension(headerFilename || fallbackFilename, ext);
    return { data: response.data, filename: finalFilename, mime };
  } catch (err) {
    throw buildApiError(err);
  }
}

function parseFilenameFromDisposition(value: string): string | null {
  const utfMatch = value.match(/filename\*=\s*UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/["']/g, ''));
    } catch {
      return utfMatch[1].replace(/["']/g, '');
    }
  }
  const asciiMatch = value.match(/filename=\s*("?)([^";]+)\1/i);
  if (asciiMatch && asciiMatch[2]) {
    return asciiMatch[2];
  }
  return null;
}

function ensureExtension(filename: string, ext: string): string {
  if (filename.toLowerCase().endsWith(`.${ext}`)) return filename;
  return `${filename}.${ext}`;
}

function buildApiError(err: unknown): Error {
  const error = err as AxiosError<any>;
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail || error?.response?.data?.message;
  const message = detail || (status ? `HTTP ${status}` : 'Ошибка запроса');
  const next = new Error(message);
  (next as any).status = status;
  return next;
}
