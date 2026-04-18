import { apiClient } from './client';

// Типы статусов бронирования (соответствуют backend BookingStatus)
export enum BookingStatus {
  CREATED = 'created',
  CONFIRMED = 'confirmed',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  CANCELLED_BY_CLIENT_EARLY = 'cancelled_by_client_early',
  CANCELLED_BY_CLIENT_LATE = 'cancelled_by_client_late',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAYMENT_EXPIRED = 'payment_expired',
}

// Интерфейс бронирования (соответствует backend Booking schema и detailed response)
export interface Booking {
  id: number;
  /** Публичный код для клиента (не sequential DB id) */
  public_reference?: string | null;
  client_id: number | null;
  service_id: number;
  master_id: number | null;
  /** От API, не используется для favorites (master-only) */
  indie_master_id: number | null;
  salon_id: number | null;
  branch_id: number | null;
  start_time: string; // ISO datetime string
  end_time: string; // ISO datetime string
  status: BookingStatus;
  notes: string | null;
  
  // Информация об оплате
  payment_method: string | null; // 'on_visit' или 'advance'
  payment_amount: number | null;
  is_paid: boolean | null;
  
  created_at: string | null; // ISO datetime string (может быть null в detailed)
  updated_at: string | null; // ISO datetime string (может быть null в detailed)
  edit_requests?: any[]; // Упрощённая версия для списка
  
  // Дополнительные поля для отображения (из detailed endpoint)
  salon_name?: string | null;
  master_name?: string | null;
  service_name?: string | null;
  branch_name?: string | null;
  branch_address?: string | null;
  
  // Поля из /api/master/bookings/detailed
  client_name?: string | null; // Имя клиента (из detailed)
  client_display_name?: string | null; // То же, что client_name
  client_master_alias?: string | null; // Алиас, заданный мастером (приоритет при отображении)
  client_account_name?: string | null; // Имя из аккаунта пользователя
  client_phone?: string | null; // Телефон клиента (из detailed)
  has_client_note?: boolean; // Есть заметка по клиенту
  client_note?: string | null; // Текст заметки
  service_duration?: number | null; // Длительность услуги в минутах (из detailed)
  service_price?: number | null; // Цена услуги (из detailed)
  duration?: number | null; // Длительность услуги в минутах (альтернативное поле)
  master_domain?: string | null; // Домен мастера для ссылки на профиль
  master_timezone?: string | null; // IANA таймзона мастера (для Add to Calendar)
}

// Параметры для получения списка бронирований
export interface GetBookingsParams {
  status?: BookingStatus;
  start_date?: string; // ISO datetime string
  end_date?: string; // ISO datetime string
}

/**
 * Получить список бронирований текущего авторизованного пользователя
 * Автоматически определяет правильный эндпоинт на основе роли пользователя
 */
export async function getUserBookings(params?: GetBookingsParams, userRole?: string): Promise<Booking[]> {
  // Определяем правильный эндпоинт на основе роли
  // Роль может быть в разных регистрах (CLIENT, client, Client)
  const normalizedRole = userRole?.toLowerCase();
  let baseUrl = '/api/bookings';
  
  if (normalizedRole === 'master' || normalizedRole === 'indie') {
    // Для мастера используем детальный эндпоинт (как в веб-версии)
    baseUrl = '/api/master/bookings/detailed';
  } else if (normalizedRole === 'client') {
    // Для клиента используем эндпоинт клиента для будущих бронирований
    baseUrl = '/api/client/bookings/';
  }
  // Для salon и других ролей используем общий /api/bookings
  
  const queryParams = new URLSearchParams();
  
  if (params?.status) {
    queryParams.append('status', params.status);
  }
  if (params?.start_date) {
    queryParams.append('start_date', params.start_date);
  }
  if (params?.end_date) {
    queryParams.append('end_date', params.end_date);
  }
  
  const queryString = queryParams.toString();
  const url = `${baseUrl}${queryString ? `?${queryString}` : ''}`;
  const response = await apiClient.get<Booking[]>(url);
  return response.data;
}

/**
 * Получить будущие бронирования для клиента
 */
export async function getFutureBookings(userRole?: string): Promise<Booking[]> {
  const normalizedRole = userRole?.toLowerCase();
  
  if (normalizedRole === 'client') {
    const response = await apiClient.get<Booking[]>('/api/client/bookings/');
    return response.data;
  }
  
  // Для других ролей фильтруем из общего списка
  const now = new Date().toISOString();
  const bookings = await getUserBookings({ start_date: now }, userRole);
  return bookings.filter(b => new Date(b.start_time) > new Date());
}

/**
 * Получить прошедшие бронирования для клиента
 */
export async function getPastBookings(userRole?: string): Promise<Booking[]> {
  const normalizedRole = userRole?.toLowerCase();
  
  if (normalizedRole === 'client') {
    const response = await apiClient.get<Booking[]>('/api/client/bookings/past');
    return response.data;
  }
  
  // Для других ролей фильтруем из общего списка
  const now = new Date().toISOString();
  const bookings = await getUserBookings({ end_date: now }, userRole);
  return bookings.filter(b => new Date(b.start_time) <= new Date());
}

/**
 * Получить детали конкретного бронирования
 */
export async function getBookingById(bookingId: number): Promise<Booking> {
  const response = await apiClient.get<Booking>(`/api/bookings/${bookingId}`);
  return response.data;
}

/**
 * Получить детали конкретного бронирования (алиас для совместимости)
 */
export async function fetchBookingById(id: number | string): Promise<Booking> {
  const response = await apiClient.get<Booking>(`/api/bookings/${id}`);
  return response.data;
}

/**
 * Интерфейс для доступного слота времени
 */
export interface AvailableSlot {
  start_time: string;
  end_time: string;
  formatted_time: string;
}

/**
 * Интерфейс для ответа с доступными слотами
 */
export interface AvailableSlotsResponse {
  booking_id: number;
  service_name: string;
  service_duration: number;
  current_start_time: string;
  available_slots: AvailableSlot[];
}

/**
 * Получить доступные слоты времени для изменения бронирования
 */
export async function getAvailableSlots(bookingId: number, date: string): Promise<AvailableSlotsResponse> {
  const response = await apiClient.get<AvailableSlotsResponse>(
    `/api/client/bookings/${bookingId}/available-slots?date=${date}`
  );
  return response.data;
}

/**
 * Интерфейс для обновления бронирования
 */
export interface BookingUpdate {
  start_time?: string;
  end_time?: string;
  notes?: string;
}

/**
 * Обновить бронирование
 */
export async function updateBooking(bookingId: number, update: BookingUpdate): Promise<Booking> {
  const response = await apiClient.put<Booking>(`/api/client/bookings/${bookingId}`, update);
  return response.data;
}

/**
 * Отменить бронирование
 */
export async function cancelBooking(bookingId: number): Promise<Booking> {
  const response = await apiClient.delete<Booking>(`/api/client/bookings/${bookingId}`);
  return response.data;
}

export type BookingCalendarTarget =
  | number
  | { id: number; public_reference?: string | null };

function bookingCalendarPathSegment(target: BookingCalendarTarget): string {
  if (typeof target === 'number') return String(target);
  const ref = target.public_reference?.trim();
  if (ref) return `ref/${encodeURIComponent(ref)}`;
  return String(target.id);
}

/**
 * Получить ссылку Google Calendar для добавления записи
 */
export async function getCalendarGoogleLink(
  target: BookingCalendarTarget,
  alarmMinutes = 60
): Promise<{ url: string }> {
  const seg = bookingCalendarPathSegment(target);
  const response = await apiClient.get<{ url: string }>(
    `/api/client/bookings/${seg}/calendar/google-link?alarm_minutes=${alarmMinutes}`
  );
  return response.data;
}

/**
 * Скачать ICS-файл записи (с авторизацией). Возвращает содержимое для сохранения/шаринга.
 */
export async function fetchCalendarIcs(target: BookingCalendarTarget, alarmMinutes = 60): Promise<string> {
  const seg = bookingCalendarPathSegment(target);
  const path = `/api/client/bookings/${seg}/calendar.ics?alarm_minutes=${alarmMinutes}`;
  const url = (apiClient.defaults.baseURL || '') + path;
  if (__DEV__) {
    console.warn('[ICS] fetchCalendarIcs start', { seg, alarmMinutes, url });
  }
  const response = await apiClient.get<string>(path, {
    responseType: 'text',
    transformResponse: [(data: unknown) => (typeof data === 'string' ? data : (data != null ? String(data) : ''))],
  });
  const data = response.data;
  const contentType = response.headers?.['content-type'] ?? response.headers?.['Content-Type'];
  if (__DEV__) {
    console.warn('[ICS] fetchCalendarIcs response', {
      status: response.status,
      contentType,
      dataType: typeof data,
      dataLength: typeof data === 'string' ? data.length : 0,
      dataPreview: typeof data === 'string' ? data.slice(0, 120) : String(data).slice(0, 120),
    });
  }
  if (typeof data !== 'string') {
    throw new Error(`ICS response is not string (got ${typeof data})`);
  }
  return data;
}

/**
 * Отправить ICS на email
 */
export async function sendCalendarEmail(
  target: BookingCalendarTarget,
  params: { email?: string; alarm_minutes?: number }
): Promise<{ ok: boolean }> {
  const seg = bookingCalendarPathSegment(target);
  const response = await apiClient.post<{ ok: boolean }>(
    `/api/client/bookings/${seg}/calendar/email`,
    params
  );
  return response.data;
}

/**
 * Получить человекочитаемое название статуса
 */
export function getStatusLabel(status: BookingStatus): string {
  const statusLabels: Record<BookingStatus, string> = {
    [BookingStatus.CREATED]: 'Создано',
    [BookingStatus.CONFIRMED]: 'Подтверждено',
    [BookingStatus.AWAITING_CONFIRMATION]: 'На подтверждении',
    [BookingStatus.COMPLETED]: 'Завершено',
    [BookingStatus.CANCELLED]: 'Отменено',
    [BookingStatus.CANCELLED_BY_CLIENT_EARLY]: 'Отменено клиентом',
    [BookingStatus.CANCELLED_BY_CLIENT_LATE]: 'Отменено клиентом',
    [BookingStatus.AWAITING_PAYMENT]: 'Ожидает оплаты',
    [BookingStatus.PAYMENT_EXPIRED]: 'Оплата просрочена',
  };
  
  return statusLabels[status] || status;
}

/**
 * Получить цвет статуса для UI
 */
export function getStatusColor(status: BookingStatus): string {
  const statusColors: Record<BookingStatus, string> = {
    [BookingStatus.CREATED]: '#757575', // Нейтральный серый
    [BookingStatus.CONFIRMED]: '#4CAF50', // Зелёный
    [BookingStatus.AWAITING_CONFIRMATION]: '#757575', // Нейтральный серый
    [BookingStatus.COMPLETED]: '#4CAF50', // Зелёный
    [BookingStatus.CANCELLED]: '#F44336', // Красный
    [BookingStatus.CANCELLED_BY_CLIENT_EARLY]: '#9E9E9E', // Серый
    [BookingStatus.CANCELLED_BY_CLIENT_LATE]: '#9E9E9E', // Серый
    [BookingStatus.AWAITING_PAYMENT]: '#FFC107', // Жёлтый
    [BookingStatus.PAYMENT_EXPIRED]: '#F44336', // Красный
  };
  
  return statusColors[status] || '#757575';
}

