import { buildAbsoluteApiUrl } from '@src/utils/buildAbsoluteApiUrl';
import { apiClient } from './client';

// Интерфейсы для мастера
export interface MasterSettings {
  user: {
    id: number;
    email: string | null;
    phone: string;
    full_name: string | null;
    birth_date?: string | null;
  };
  master: {
    id: number;
    bio: string | null;
    experience_years: number | null;
    can_work_independently: boolean;
    can_work_in_salon: boolean;
    website: string | null;
    domain: string | null;
    logo: string | null;
    photo: string | null;
    address: string | null;
    city: string | null;
    timezone: string | null;
    timezone_confirmed?: boolean;
    auto_confirm_bookings: boolean;
    pre_visit_confirmations_enabled?: boolean;
    pre_visit_confirmations_effective?: boolean;
    site_description?: string | null;
    background_color?: string | null;
    use_photo_as_logo?: boolean;
    payment_on_visit?: boolean;
    payment_advance?: boolean;
  };
}

export interface MasterService {
  id: number;
  name: string;
  description: string | null;
  duration: number;
  price: number;
  category_id: number | null;
  category_name: string | null;
}

export interface MasterServiceCategory {
  id: number;
  name: string;
  description: string | null;
}

export interface ServiceStats {
  service_id: number;
  service_name: string;
  booking_count?: number;
  total_earnings?: number;
}

export type StatsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface DashboardStatsPeriodPoint {
  period_label: string;
  period_start?: string;
  period_end?: string;
  /** New web contract (preferred): buckets by status + totals */
  bookings_confirmed?: number;
  bookings_pending?: number;
  bookings_total?: number;
  income_confirmed_rub?: number;
  income_pending_rub?: number;
  income_total_rub?: number;
  /** Legacy fields (compat): single value per point */
  bookings: number;
  income: number;
  is_current: boolean;
  is_past: boolean;
  is_future: boolean;
}

export interface DashboardStats {
  // KPI (как в web MasterStats.jsx)
  current_week_bookings: number;
  previous_week_bookings: number;
  current_week_income: number;
  previous_week_income: number;

  // Графики (period points, backend поле называется weeks_data)
  weeks_data: DashboardStatsPeriodPoint[];

  // Топы
  top_services_by_bookings?: ServiceStats[];
  top_services_by_earnings?: ServiceStats[];
  top_period_range?: string;

  // Day window mode (period=day + window_before/after)
  anchor_date?: string;
  range_start?: string;
  range_end?: string;
  selected_index?: number;

  // Прочие поля, которые backend может вернуть (нам не обязательны, но полезны для совместимости)
  is_indie_master?: boolean;
  subscription_info?: any;
  next_working_info?: any;
  next_bookings_list?: any[];
  income_dynamics?: number;
  current_week_bookings_raw?: number;
  future_week_bookings?: number;
  period?: string;
  offset?: number;
}


export interface ExtendedSummarySlice {
  revenue: number;
  bookings_count: number;
}

export interface MasterExtendedStats {
  period: string;
  offset?: number;
  current_period: {
    start_date: string;
    end_date: string;
    factual: ExtendedSummarySlice;
    /** Весь будущий объём окна (не только confirmed). */
    plan?: ExtendedSummarySlice;
    upcoming: ExtendedSummarySlice;
    period_total: ExtendedSummarySlice;
    /** Старые клиенты: только completed */
    revenue?: number;
    bookings_count?: number;
  };
  previous_period: {
    start_date: string | null;
    end_date: string | null;
    factual: ExtendedSummarySlice | null;
    plan?: ExtendedSummarySlice | null;
    upcoming: ExtendedSummarySlice | null;
    period_total: ExtendedSummarySlice | null;
    revenue?: number | null;
    bookings_count?: number | null;
  };
  comparison: {
    revenue_change_percent: number;
    bookings_change_percent: number;
    revenue_change_amount: number;
    bookings_change_amount: number;
  };
  trends?: any[];
  forecast?: {
    predicted_revenue: number;
    predicted_bookings: number;
    confidence?: string;
  };
  detailed_stats?: any[];
  day_window?: Record<string, unknown>;
}

export interface BookingsLimit {
  current_bookings: number;
  limit: number;
  is_unlimited: boolean;
}

export interface Balance {
  balance: number;
  available_balance: number;
  reserved_balance: number;
}

export interface SubscriptionStatus {
  status?: string; // "active" | "no_subscription" | "expired" | ...
  is_active?: boolean;
  has_subscription?: boolean;
  plan_name?: string | null;
  plan_display_name?: string | null;
  end_date?: string | null;
  days_remaining?: number | null;
  can_continue?: boolean;
  balance?: number;
  daily_rate?: number;
}

export interface MasterFeatures {
  has_booking_page: boolean;
  has_unlimited_bookings: boolean;
  has_extended_stats: boolean;
  has_loyalty_access: boolean;
  has_finance_access: boolean;
  has_client_restrictions: boolean;
  has_clients_access: boolean;
  can_customize_domain: boolean;
  max_page_modules: number;
  stats_retention_days: number;
  plan_name: string | null;
  plan_id: number | null;
  current_page_modules: number;
  can_add_more_modules: boolean;
}

export interface Invitation {
  id: number;
  salon_id: number;
  salon_name: string;
  branch_id: number | null;
  branch_name: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface ScheduleSlot {
  schedule_date: string; // Дата в формате YYYY-MM-DD
  hour: number; // Час (0-23)
  minute: number; // Минута (0 или 30)
  is_working: boolean; // Работает ли мастер в это время
  work_type?: string | null; // Тип работы: 'personal' или 'salon'
  has_conflict: boolean; // Есть ли конфликт
  conflict_type?: string | null; // Тип конфликта
  is_frozen?: boolean; // Заморожен ли день
  // Вычисляемые поля для удобства
  date?: string; // Алиас для schedule_date
  start_time?: string; // Форматированное время начала
  end_time?: string; // Форматированное время окончания
  is_available?: boolean; // Алиас для is_working
}

export interface ScheduleWeek {
  week_start: string;
  week_end: string;
  slots: ScheduleSlot[];
}

export interface Booking {
  id: number;
  client_id: number | null;
  client_name: string;
  service_id: number;
  service_name: string;
  service_duration: number;
  /** Цена услуги из каталога (как в GET /bookings/detailed); может отсутствовать в старых ответах */
  service_price?: number | null;
  master_id: number | null;
  indie_master_id: number | null;
  salon_id: number | null;
  branch_id: number | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  payment_method: string | null;
  payment_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ScheduleRule {
  id?: number;
  type: 'weekdays' | 'monthly' | 'shift';
  weekdays?: { [key: string]: { start: string; end: string } };
  valid_until: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Получить настройки мастера.
 */
export async function getMasterSettings(): Promise<MasterSettings> {
  const response = await apiClient.get<MasterSettings>('/api/master/settings');
  return response.data;
}

/**
 * PUT /api/master/profile (multipart). Тот же абсолютный URL, что и у axios после normalizeRelativeUrlForApiBase.
 * Не использовать «сырой» `${API_URL}/api/...` — при baseURL с суффиксом `/api` получится /api/api/...
 */
export async function putMasterProfileFormData(formData: FormData): Promise<void> {
  const { readToken } = await import('@src/auth/tokenStorage');
  const token = await readToken();
  const url = buildAbsoluteApiUrl('/api/master/profile');
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Ошибка сохранения профиля' }));
    const detail = errorData?.detail;
    const message =
      typeof detail === 'string' ? detail : Array.isArray(detail) ? JSON.stringify(detail) : 'Ошибка сохранения профиля';
    throw new Error(message);
  }
}

/**
 * Обновить настройки мастера
 */
export async function updateMasterSettings(data: Partial<MasterSettings['master']>): Promise<MasterSettings> {
  const formData = new FormData();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && 'uri' in value) {
        formData.append(key, value as any);
      } else {
        formData.append(key, String(value));
      }
    }
  });

  await putMasterProfileFormData(formData);
  return getMasterSettings();
}

/**
 * Получить услуги мастера
 */
export async function getMasterServices(): Promise<MasterService[]> {
  const response = await apiClient.get<MasterService[]>('/api/master/services');
  return response.data;
}

/**
 * Создать услугу мастера
 */
export async function createMasterService(data: {
  name: string;
  description?: string;
  duration: number;
  price: number;
  category_id?: number | null;
}): Promise<MasterService> {
  const response = await apiClient.post<MasterService>('/api/master/services', data);
  return response.data;
}

/**
 * Обновить услугу мастера
 */
export async function updateMasterService(serviceId: number, data: Partial<MasterService>): Promise<MasterService> {
  const response = await apiClient.put<MasterService>(`/api/master/services/${serviceId}`, data);
  return response.data;
}

/**
 * Удалить услугу мастера
 */
export async function deleteMasterService(serviceId: number): Promise<void> {
  await apiClient.delete(`/api/master/services/${serviceId}`);
}

/**
 * Получить категории услуг мастера
 */
export async function getMasterServiceCategories(): Promise<MasterServiceCategory[]> {
  const response = await apiClient.get<MasterServiceCategory[]>('/api/master/categories');
  return response.data;
}

/**
 * Создать категорию услуг
 */
export async function createMasterServiceCategory(data: {
  name: string;
  description?: string;
}): Promise<MasterServiceCategory> {
  const response = await apiClient.post<MasterServiceCategory>('/api/master/categories', data);
  return response.data;
}

/**
 * Обновить категорию услуг
 */
export async function updateMasterServiceCategory(
  categoryId: number,
  data: Partial<MasterServiceCategory>
): Promise<MasterServiceCategory> {
  const response = await apiClient.put<MasterServiceCategory>(`/api/master/categories/${categoryId}`, data);
  return response.data;
}

/**
 * Удалить категорию услуг
 */
export async function deleteMasterServiceCategory(categoryId: number): Promise<void> {
  await apiClient.delete(`/api/master/categories/${categoryId}`);
}

/**
 * Получить статистику дашборда.
 * Для period=day можно передать anchor_date и window_before/window_after для окна 19 дней.
 */
export async function getDashboardStats(
  period: StatsPeriod = 'week',
  offset: number = 0,
  params?: { anchor_date?: string; window_before?: number; window_after?: number }
): Promise<DashboardStats> {
  const search = new URLSearchParams({ period, offset: String(offset) });
  if (params?.anchor_date) search.set('anchor_date', params.anchor_date);
  if (params?.window_before != null) search.set('window_before', String(params.window_before));
  if (params?.window_after != null) search.set('window_after', String(params.window_after));
  const response = await apiClient.get<DashboardStats>(`/api/master/dashboard/stats?${search.toString()}`);
  return response.data;
}

/**
 * Получить расширенную статистику мастера (Pro-only на backend)
 */
export async function getMasterExtendedStats(
  period: StatsPeriod = 'week',
  comparePeriod: boolean = true,
  params?: { offset?: number; anchor_date?: string; window_before?: number; window_after?: number }
): Promise<MasterExtendedStats> {
  const search = new URLSearchParams({
    period,
    compare_period: comparePeriod ? 'true' : 'false',
    offset: String(params?.offset ?? 0),
  });
  if (params?.anchor_date) search.set('anchor_date', params.anchor_date);
  if (params?.window_before != null) search.set('window_before', String(params.window_before));
  if (params?.window_after != null) search.set('window_after', String(params.window_after));
  const response = await apiClient.get<MasterExtendedStats>(
    `/api/master/stats/extended?${search.toString()}`
  );
  return response.data;
}

/**
 * Получить лимит бронирований
 */
export async function getBookingsLimit(): Promise<BookingsLimit> {
  const response = await apiClient.get<BookingsLimit>('/api/master/bookings/limit');
  return response.data;
}

/**
 * Получить баланс
 */
export async function getBalance(): Promise<Balance> {
  const response = await apiClient.get<Balance>('/api/balance/');
  return response.data;
}

/**
 * Получить статус подписки
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const response = await apiClient.get<SubscriptionStatus>('/api/balance/subscription-status');
  return response.data;
}

/**
 * Получить приглашения в салоны
 */
export async function getInvitations(): Promise<Invitation[]> {
  const response = await apiClient.get<Invitation[]>('/api/master/invitations');
  return response.data;
}

/**
 * Ответить на приглашение
 */
export async function respondToInvitation(
  invitationId: number,
  response: 'accepted' | 'rejected'
): Promise<Invitation> {
  const apiResponse = await apiClient.post<Invitation>(
    `/api/master/invitations/${invitationId}/respond`,
    { response }
  );
  return apiResponse.data;
}

/**
 * Получить расписание на неделю
 */
export async function getWeeklySchedule(
  weekOffset: number = 0,
  weeksAhead: number = 3
): Promise<ScheduleWeek> {
  const response = await apiClient.get<{
    slots: Array<{
      schedule_date: string;
      hour: number;
      minute: number;
      is_working: boolean;
      work_type?: string | null;
      has_conflict: boolean;
      conflict_type?: string | null;
      is_frozen?: boolean;
    }>;
  }>(
    `/api/master/schedule/weekly?week_offset=${weekOffset}&weeks_ahead=${weeksAhead}`
  );
  
  // Преобразуем данные для удобства использования
  const transformedSlots: ScheduleSlot[] = response.data.slots.map((slot) => {
    // Форматируем время начала
    const startHour = slot.hour.toString().padStart(2, '0');
    const startMinute = slot.minute.toString().padStart(2, '0');
    const startTime = `${startHour}:${startMinute}`;
    
    // Вычисляем время окончания (слот длится 30 минут)
    let endHour = slot.hour;
    let endMinute = slot.minute + 30;
    if (endMinute >= 60) {
      endHour += 1;
      endMinute -= 60;
    }
    if (endHour >= 24) {
      endHour = 23;
      endMinute = 59;
    }
    const endHourStr = endHour.toString().padStart(2, '0');
    const endMinuteStr = endMinute.toString().padStart(2, '0');
    const endTime = `${endHourStr}:${endMinuteStr}`;
    
    return {
      ...slot,
      date: slot.schedule_date,
      start_time: startTime,
      end_time: endTime,
      is_available: slot.is_working,
    };
  });
  
  // Вычисляем week_start и week_end из слотов
  const dates = transformedSlots
    .map((slot) => slot.date || slot.schedule_date)
    .filter((date, index, self) => self.indexOf(date) === index)
    .sort();
  
  const week_start = dates[0] || '';
  const week_end = dates[dates.length - 1] || '';
  
  return {
    week_start,
    week_end,
    slots: transformedSlots,
  };
}

/**
 * Локально обновить открытые слоты только на одну дату (не трогает recurring rule в settings).
 * Только POST — как в backend (`@router.post("/schedule/day")`). Fallback PUT убран: при 405 на POST
 * повторный PUT давал тот же 405 и в логах казалось, что «уходит PUT»; типичный root cause 405 —
 * запущен старый backend без этих маршрутов: путь матчится на GET catch-all `/{full_path:path}`.
 */
export async function updateMasterDaySchedule(
  scheduleDate: string,
  openSlots: Array<{ hour: number; minute: number }>
): Promise<{ message: string; schedule_date: string; open_slots_count: number }> {
  const response = await apiClient.post<{
    message: string;
    schedule_date: string;
    open_slots_count: number;
  }>('/api/master/schedule/day', {
    schedule_date: scheduleDate,
    open_slots: openSlots,
  });
  return response.data;
}

/**
 * Получить количество неподтвержденных бронирований
 */
export async function getPendingConfirmations(): Promise<{ count: number }> {
  const response = await apiClient.get<{ count: number }>('/api/master/accounting/pending-confirmations');
  return response.data;
}

/**
 * Подтвердить завершение услуги (post-visit: услуга состоялась).
 */
export async function confirmBooking(bookingId: number): Promise<{ message: string; booking_id: number }> {
  const response = await apiClient.post<{ message: string; booking_id: number }>(
    `/api/master/accounting/confirm-booking/${bookingId}`
  );
  return response.data;
}

/**
 * Принять запись (pre-visit: мастер подтверждает будущую запись).
 */
export async function confirmPreVisitBooking(bookingId: number): Promise<{ message: string; booking_id: number }> {
  const response = await apiClient.post<{ message: string; booking_id: number }>(
    `/api/master/accounting/update-booking-status/${bookingId}?new_status=confirmed`
  );
  return response.data;
}

/**
 * Отменить/отклонить услугу (проблема/не состоялась)
 */
export async function cancelBookingConfirmation(
  bookingId: number,
  cancellationReason: 'client_requested' | 'client_no_show' | 'mutual_agreement' | 'master_unavailable'
): Promise<{ message: string; booking_id: number }> {
  const response = await apiClient.post<{ message: string; booking_id: number }>(
    `/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${cancellationReason}`
  );
  return response.data;
}

/**
 * Получить детальные бронирования мастера
 */
export async function getDetailedBookings(): Promise<Booking[]> {
  const response = await apiClient.get<Booking[]>('/api/master/bookings/detailed');
  return response.data;
}

/** Элемент из future endpoint */
export interface FutureBookingItem {
  id: number;
  start_time: string;
  end_time?: string | null;
  date?: string;
  time?: string;
  status: string;
  service_name: string;
  client_display_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  client_master_alias?: string | null;
  client_account_name?: string | null;
  has_client_note?: boolean;
  client_note?: string | null;
}

/** Элемент из past-appointments endpoint */
export interface PastAppointmentItem {
  id: number;
  start_time: string;
  end_time?: string | null;
  date?: string;
  time?: string;
  status: string;
  service_name: string;
  client_display_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  client_master_alias?: string | null;
  client_account_name?: string | null;
  has_client_note?: boolean;
  client_note?: string | null;
}

export interface FutureBookingsPagedResponse {
  bookings: FutureBookingItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface PastAppointmentsPagedResponse {
  appointments: PastAppointmentItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Получить будущие записи мастера с пагинацией (20/стр).
 * Унифицирован с WEB: /api/master/bookings/future
 */
export async function getFutureBookingsPaged(
  page = 1,
  limit = 20
): Promise<FutureBookingsPagedResponse> {
  const response = await apiClient.get<FutureBookingsPagedResponse>(
    `/api/master/bookings/future?page=${page}&limit=${limit}`
  );
  return response.data;
}

export interface PastAppointmentsFilters {
  start_date?: string;
  end_date?: string;
  status?: string;
}

/**
 * Получить прошедшие записи мастера с пагинацией (20/стр).
 * Включает cancelled. Унифицирован с WEB: /api/master/past-appointments
 */
export async function getPastAppointmentsPaged(
  page = 1,
  limit = 20,
  filters?: PastAppointmentsFilters
): Promise<PastAppointmentsPagedResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (filters?.start_date) params.set('start_date', filters.start_date);
  if (filters?.end_date) params.set('end_date', filters.end_date);
  if (filters?.status) params.set('status', filters.status);
  const response = await apiClient.get<PastAppointmentsPagedResponse>(
    `/api/master/past-appointments?${params.toString()}`
  );
  return response.data;
}

/**
 * Получить доступные функции подписки мастера
 */
export async function getMasterFeatures(): Promise<MasterFeatures> {
  const response = await apiClient.get<MasterFeatures>('/api/master/subscription/features');
  return response.data;
}

// ============================================================================
// ОГРАНИЧЕНИЯ КЛИЕНТОВ (Правила)
// ============================================================================

export interface ClientRestrictionItem {
  id: number;
  client_phone: string;
  restriction_type: 'blacklist' | 'advance_payment_only';
  reason?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientRestrictionsList {
  blacklist: ClientRestrictionItem[];
  advance_payment_only: ClientRestrictionItem[];
  total_restrictions: number;
}

export interface ClientRestrictionRule {
  id: number;
  master_id: number;
  cancellation_reason: string;
  cancel_count: number;
  period_days: number | null;
  restriction_type: 'blacklist' | 'advance_payment_only';
  created_at: string;
  updated_at: string;
}

export async function getRestrictions(): Promise<ClientRestrictionsList> {
  const response = await apiClient.get<ClientRestrictionsList>('/api/master/restrictions');
  return response.data;
}

export async function createRestriction(data: {
  client_phone: string;
  restriction_type: 'blacklist' | 'advance_payment_only';
  reason?: string;
}): Promise<ClientRestrictionItem> {
  const response = await apiClient.post<ClientRestrictionItem>('/api/master/restrictions', data);
  return response.data;
}

export async function updateRestriction(
  id: number,
  data: { restriction_type?: string; reason?: string; is_active?: boolean }
): Promise<ClientRestrictionItem> {
  const response = await apiClient.put<ClientRestrictionItem>(`/api/master/restrictions/${id}`, data);
  return response.data;
}

export async function deleteRestriction(id: number): Promise<void> {
  await apiClient.delete(`/api/master/restrictions/${id}`);
}

export async function getRestrictionRules(): Promise<ClientRestrictionRule[]> {
  const response = await apiClient.get<ClientRestrictionRule[]>('/api/master/restriction-rules');
  return response.data;
}

export async function createRestrictionRule(data: {
  cancellation_reason: string;
  cancel_count: number;
  period_days: number | null;
  restriction_type: 'blacklist' | 'advance_payment_only';
}): Promise<ClientRestrictionRule> {
  const response = await apiClient.post<ClientRestrictionRule>('/api/master/restriction-rules', data);
  return response.data;
}

export async function updateRestrictionRule(
  id: number,
  data: Partial<{ cancellation_reason: string; cancel_count: number; period_days: number | null; restriction_type: string }>
): Promise<ClientRestrictionRule> {
  const response = await apiClient.put<ClientRestrictionRule>(`/api/master/restriction-rules/${id}`, data);
  return response.data;
}

export async function deleteRestrictionRule(id: number): Promise<void> {
  await apiClient.delete(`/api/master/restriction-rules/${id}`);
}

// ============================================================================

/**
 * Получить правила расписания
 */
export async function getScheduleRules(): Promise<{
  has_settings: boolean;
  fixed_schedule?: any;
  created_at?: string;
  updated_at?: string;
}> {
  const response = await apiClient.get('/api/master/schedule/rules');
  return response.data;
}

/**
 * Создать правило расписания
 */
export async function createScheduleRule(rule: ScheduleRule | any): Promise<{ message: string; slots_created?: number; conflicts?: any[] }> {
  const response = await apiClient.post('/api/master/schedule/rules', rule);
  return response.data;
}

// ============================================================================
// ЛОЯЛЬНОСТЬ
// ============================================================================

/**
 * Настройки программы лояльности мастера
 */
export interface LoyaltySettings {
  id: number;
  master_id: number;
  is_enabled: boolean;
  accrual_percent: number | null; // 1-100
  max_payment_percent: number | null; // 1-100
  points_lifetime_days: number | null; // 14, 30, 60, 90, 180, 365 или null
  created_at: string;
  updated_at: string;
}

/**
 * Обновление настроек лояльности
 */
export interface LoyaltySettingsUpdate {
  is_enabled?: boolean;
  accrual_percent?: number | null;
  max_payment_percent?: number | null;
  points_lifetime_days?: number | null;
}

/**
 * Статистика программы лояльности
 */
export interface LoyaltyStats {
  total_earned: number;
  total_spent: number;
  current_balance: number;
  active_clients_count: number;
}

/**
 * Транзакция лояльности
 */
export interface LoyaltyTransaction {
  id: number;
  master_id: number;
  client_id: number;
  booking_id: number | null;
  transaction_type: 'earned' | 'spent';
  points: number;
  earned_at: string;
  expires_at: string | null;
  service_id: number | null;
  created_at: string;
  client_name?: string | null;
  service_name?: string | null;
}

/**
 * Получить настройки программы лояльности мастера
 */
export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const response = await apiClient.get<LoyaltySettings>('/api/master/loyalty/settings');
  return response.data;
}

/**
 * Обновить настройки программы лояльности мастера
 */
export async function updateLoyaltySettings(settings: LoyaltySettingsUpdate): Promise<LoyaltySettings> {
  const response = await apiClient.put<LoyaltySettings>('/api/master/loyalty/settings', settings);
  return response.data;
}

/**
 * Получить статистику программы лояльности
 */
export async function getLoyaltyStats(): Promise<LoyaltyStats> {
  const response = await apiClient.get<LoyaltyStats>('/api/master/loyalty/stats');
  return response.data;
}

/**
 * Получить историю транзакций лояльности
 */
export interface LoyaltyHistoryFilters {
  client_id?: number;
  transaction_type?: 'earned' | 'spent';
  start_date?: string;
  end_date?: string;
  skip?: number;
  limit?: number;
}

export async function getLoyaltyHistory(filters?: LoyaltyHistoryFilters): Promise<LoyaltyTransaction[]> {
  const queryParams = new URLSearchParams();
  if (filters?.client_id) queryParams.append('client_id', filters.client_id.toString());
  if (filters?.transaction_type) queryParams.append('transaction_type', filters.transaction_type);
  if (filters?.start_date) queryParams.append('start_date', filters.start_date);
  if (filters?.end_date) queryParams.append('end_date', filters.end_date);
  if (filters?.skip) queryParams.append('skip', filters.skip.toString());
  if (filters?.limit) queryParams.append('limit', filters.limit.toString());
  
  const url = `/api/master/loyalty/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const response = await apiClient.get<LoyaltyTransaction[]>(url);
  return response.data;
}

// ============================================================================
// КЛИЕНТЫ МАСТЕРА
// ============================================================================

export interface MasterClientListItem {
  client_key: string;
  client_id?: number | null;
  client_phone: string;
  master_client_name?: string | null;
  completed_count: number;
  cancelled_count: number;
  last_visit_at: string | null;
  total_revenue: number;
  has_note: boolean;
}

export interface MasterClientDetail extends MasterClientListItem {
  top_services: { service_id: number; service_name: string; count: number }[];
  cancellations_breakdown: { reason: string; reason_label: string; count: number }[];
  restrictions: { id: number; type: string; reason?: string | null }[];
  applicable_discounts: { rule_id: number; rule_type: string; name: string; discount_percent: number; max_discount_amount?: number | null }[];
  note?: string | null;
}

export async function getMasterClients(params?: {
  q?: string;
  sort_by?: string;
  sort_dir?: string;
}): Promise<MasterClientListItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.q?.trim()) searchParams.set('q', params.q.trim());
  if (params?.sort_by) searchParams.set('sort_by', params.sort_by);
  if (params?.sort_dir) searchParams.set('sort_dir', params.sort_dir);
  const query = searchParams.toString();
  const url = query ? `/api/master/clients?${query}` : '/api/master/clients';
  const response = await apiClient.get<MasterClientListItem[]>(url);
  return response.data;
}

export async function getMasterClientDetail(clientKey: string): Promise<MasterClientDetail> {
  const response = await apiClient.get<MasterClientDetail>(
    `/api/master/clients/${encodeURIComponent(clientKey)}`
  );
  return response.data;
}export async function updateMasterClientMetadata(
  clientKey: string,
  data: { alias_name?: string | null; note?: string | null }
): Promise<{ alias_name?: string | null; note?: string | null }> {
  const response = await apiClient.patch<{ alias_name?: string | null; note?: string | null }>(
    `/api/master/clients/${encodeURIComponent(clientKey)}`,
    data
  );
  return response.data;
}

export async function addClientRestriction(
  clientKey: string,
  body: { restriction_type: 'blacklist' | 'advance_payment_only'; reason?: string | null }
): Promise<{ id: number; type: string; reason?: string | null }> {
  const response = await apiClient.post<{ id: number; type: string; reason?: string | null }>(
    `/api/master/clients/${encodeURIComponent(clientKey)}/restrictions`,
    body
  );
  return response.data;
}

export async function removeClientRestriction(
  clientKey: string,
  restrictionId: number
): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(
    `/api/master/clients/${encodeURIComponent(clientKey)}/restrictions/${restrictionId}`
  );
  return response.data;
}

export async function createPersonalDiscount(data: {
  client_phone: string;
  discount_percent: number;
  max_discount_amount?: number | null;
  description?: string | null;
}): Promise<unknown> {
  const response = await apiClient.post('/api/loyalty/personal-discounts', data);
  return response.data;
}