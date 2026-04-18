import { apiClient } from './client';

// ============================================================================
// ТИПЫ ДАННЫХ
// ============================================================================

/**
 * Тип транзакции лояльности
 */
export enum LoyaltyTransactionType {
  EARNED = 'earned',
  SPENT = 'spent',
}

/**
 * Настройки программы лояльности мастера
 * (используется только для отображения, не для редактирования в мобиле)
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
 * Транзакция начисления/списания баллов
 */
export interface LoyaltyTransaction {
  id: number;
  master_id: number;
  client_id: number;
  booking_id: number | null;
  service_id: number | null;
  transaction_type: LoyaltyTransactionType;
  points: number; // Положительное число
  earned_at: string; // ISO datetime
  expires_at: string | null; // ISO datetime (только для earned)
  created_at: string;
  
  // Дополнительные поля из API (join с другими таблицами)
  client_name?: string | null;
  service_name?: string | null;
}

/**
 * Баланс баллов клиента по конкретному мастеру
 */
export interface ClientLoyaltyPointsOut {
  master_id: number;
  master_name: string;
  total_points: number; // Текущий баланс (активные баллы)
  active_points: number; // Активные баллы (не истекшие)
  expired_points: number; // Истекшие баллы
  transactions: LoyaltyTransaction[]; // Последние 50 транзакций
}

/**
 * Сводка баллов клиента по всем мастерам
 */
export interface ClientLoyaltyPointsSummaryOut {
  masters: ClientLoyaltyPointsOut[];
  total_balance: number; // Общий баланс по всем мастерам
}

/**
 * Доступные баллы для списания при бронировании
 */
export interface AvailableLoyaltyPointsOut {
  master_id: number;
  available_points: number; // Количество доступных баллов
  max_payment_percent: number | null; // Максимальный % оплаты баллами
  is_loyalty_enabled: boolean; // Включена ли программа у мастера
  // TODO: Предложить добавить max_spendable в API (см. раздел 6)
  // max_spendable?: number; // Максимальная сумма в рублях, которую можно списать
}

/**
 * Статистика программы лояльности для мастера
 */
export interface LoyaltyStatsOut {
  total_earned: number; // Общее количество выданных баллов
  total_spent: number; // Общее количество списанных баллов
  current_balance: number; // Текущий баланс всех клиентов (начислено - списано)
  active_clients_count: number; // Количество активных клиентов с баллами
}

/**
 * Фильтры для истории транзакций мастера
 */
export interface LoyaltyHistoryFilters {
  client_id?: number;
  transaction_type?: LoyaltyTransactionType;
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
  skip?: number;
  limit?: number;
}

// ============================================================================
// API ФУНКЦИИ
// ============================================================================

/**
 * Получить баланс баллов клиента по всем мастерам
 * GET /api/client/loyalty/points
 * 
 * @returns Список балансов по каждому мастеру + последние 50 транзакций
 * @throws {AxiosError} 403 - Нет доступа к программе лояльности (нужен план Pro+)
 * @throws {AxiosError} 500 - Ошибка сервера
 * @throws {AxiosError} Network error - Проблемы с сетью
 */
export async function getClientLoyaltyPoints(): Promise<ClientLoyaltyPointsOut[]> {
  try {
    const response = await apiClient.get<ClientLoyaltyPointsOut[]>('/api/client/loyalty/points');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error('Доступ к программе лояльности доступен на плане Pro и выше');
    }
    if (error.response?.status >= 500) {
      throw new Error('Ошибка сервера при загрузке баллов');
    }
    if (error.code === 'NETWORK_ERROR' || !error.response) {
      throw new Error('Проблемы с подключением к серверу');
    }
    throw error;
  }
}

/**
 * Получить доступные баллы для списания при бронировании
 * GET /api/client/loyalty/points/{master_id}/available
 * 
 * @param masterId - ID мастера
 * @returns Доступные баллы и настройки программы
 * @throws {AxiosError} 404 - Мастер не найден
 * @throws {AxiosError} 500 - Ошибка сервера
 */
export async function getAvailablePoints(masterId: number): Promise<AvailableLoyaltyPointsOut> {
  try {
    const response = await apiClient.get<AvailableLoyaltyPointsOut>(
      `/api/client/loyalty/points/${masterId}/available`
    );
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error('Мастер не найден');
    }
    if (error.response?.status >= 500) {
      throw new Error('Ошибка сервера при загрузке доступных баллов');
    }
    if (error.code === 'NETWORK_ERROR' || !error.response) {
      throw new Error('Проблемы с подключением к серверу');
    }
    throw error;
  }
}

/**
 * Публичные настройки программы лояльности мастера (read-only для клиентов)
 */
export interface MasterLoyaltySettingsPublic {
  master_id: number;
  is_enabled: boolean;
  accrual_percent: number | null;
  max_payment_percent: number | null;
  points_lifetime_days: number | null;
}

/**
 * Получить публичные настройки программы лояльности мастера
 * GET /api/client/loyalty/master/{master_id}/loyalty-settings
 * 
 * @param masterId - ID мастера
 * @returns Публичные настройки лояльности (read-only)
 */
export async function getMasterLoyaltySettingsPublic(masterId: number): Promise<MasterLoyaltySettingsPublic> {
  try {
    const response = await apiClient.get<MasterLoyaltySettingsPublic>(
      `/api/client/loyalty/master/${masterId}/loyalty-settings`
    );
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error('Мастер не найден');
    }
    if (error.response?.status >= 500) {
      throw new Error('Ошибка сервера при загрузке настроек лояльности');
    }
    if (error.code === 'NETWORK_ERROR' || !error.response) {
      throw new Error('Проблемы с подключением к серверу');
    }
    throw error;
  }
}

/**
 * Получить статистику программы лояльности для мастера
 * GET /api/master/loyalty/stats
 * 
 * @returns Статистика: выдано/списано/баланс/активные клиенты
 * @throws {AxiosError} 403 - Нет доступа (нужен план Pro+)
 * @throws {AxiosError} 500 - Ошибка сервера
 */
export async function getMasterLoyaltyStats(): Promise<LoyaltyStatsOut> {
  try {
    const response = await apiClient.get<LoyaltyStatsOut>('/api/master/loyalty/stats');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error('Доступ к программе лояльности доступен на плане Pro и выше');
    }
    if (error.response?.status >= 500) {
      throw new Error('Ошибка сервера при загрузке статистики');
    }
    if (error.code === 'NETWORK_ERROR' || !error.response) {
      throw new Error('Проблемы с подключением к серверу');
    }
    throw error;
  }
}

/**
 * Получить историю транзакций лояльности для мастера
 * GET /api/master/loyalty/history
 * 
 * @param filters - Фильтры: client_id, transaction_type, start_date, end_date, skip, limit
 * @returns Список транзакций
 * @throws {AxiosError} 403 - Нет доступа (нужен план Pro+)
 * @throws {AxiosError} 500 - Ошибка сервера
 */
export async function getMasterLoyaltyHistory(
  filters?: LoyaltyHistoryFilters
): Promise<LoyaltyTransaction[]> {
  try {
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
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error('Доступ к программе лояльности доступен на плане Pro и выше');
    }
    if (error.response?.status >= 500) {
      throw new Error('Ошибка сервера при загрузке истории');
    }
    if (error.code === 'NETWORK_ERROR' || !error.response) {
      throw new Error('Проблемы с подключением к серверу');
    }
    throw error;
  }
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Вычислить максимальную сумму списания баллов
 * ДУБЛИРУЕТ логику backend/utils/loyalty.py:calculate_points_to_spend()
 * 
 * ⚠️ ВАЖНО: Это временное решение. Идеально - добавить max_spendable в API
 * 
 * @param availablePoints - Доступное количество баллов
 * @param servicePrice - Стоимость услуги в рублях
 * @param maxPaymentPercent - Максимальный % оплаты баллами (1-100 или null)
 * @returns Максимальная сумма в рублях, которую можно списать
 */
export function calculateMaxSpendable(
  availablePoints: number,
  servicePrice: number,
  maxPaymentPercent: number | null
): number {
  const maxByPoints = availablePoints; // 1 балл = 1 рубль
  const maxByPrice = servicePrice;
  
  if (maxPaymentPercent && maxPaymentPercent > 0) {
    const maxByPercent = servicePrice * (maxPaymentPercent / 100);
    return Math.min(maxByPoints, maxByPercent, maxByPrice);
  }
  
  return Math.min(maxByPoints, maxByPrice);
}

/**
 * Форматировать количество баллов для отображения
 * @param points - Количество баллов
 * @returns Строка вида "42 балла" / "1 балл" / "5 баллов"
 */
export function formatLoyaltyPoints(points: number): string {
  const lastDigit = points % 10;
  const lastTwoDigits = points % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${points} баллов`;
  }
  
  if (lastDigit === 1) {
    return `${points} балл`;
  }
  
  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${points} балла`;
  }
  
  return `${points} баллов`;
}

/**
 * Форматировать дату истечения баллов
 * @param expiresAt - Дата истечения (ISO string или null)
 * @returns Строка вида "Истекает: 25.01.2026" или "Бесконечно"
 */
export function formatExpiresDate(expiresAt: string | null): string {
  if (!expiresAt) {
    return 'Бесконечно';
  }
  
  const date = new Date(expiresAt);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `Истекает: ${day}.${month}.${year}`;
}

/**
 * Получить цвет для типа транзакции
 */
export function getTransactionTypeColor(type: LoyaltyTransactionType): string {
  return type === LoyaltyTransactionType.EARNED ? '#4CAF50' : '#F44336'; // Зелёный / Красный
}

/**
 * Получить текст для типа транзакции
 */
export function getTransactionTypeLabel(type: LoyaltyTransactionType): string {
  return type === LoyaltyTransactionType.EARNED ? 'Начислено' : 'Списано';
}
