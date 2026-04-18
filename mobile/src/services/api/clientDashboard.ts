/**
 * API методы для Client Dashboard
 */

import { apiClient } from './client'

/**
 * Интерфейс для баллов лояльности по мастеру
 */
export interface ClientLoyaltyMaster {
  master_id: number
  master_name: string
  master_domain?: string | null
  balance: number
  transactions?: LoyaltyTransaction[]
}

/**
 * Интерфейс для транзакции лояльности
 * Соответствует backend LoyaltyTransactionOut / контракту web
 */
export interface LoyaltyTransaction {
  id: number
  master_id: number
  client_id: number
  booking_id?: number | null
  transaction_type: 'earned' | 'spent'
  points: number
  earned_at: string
  expires_at?: string | null
  created_at: string
  service_id?: number | null
  service_name?: string | null
  client_name?: string | null
}

/**
 * Интерфейс для ответа loyalty points
 */
export interface ClientLoyaltyPointsResponse {
  masters: ClientLoyaltyMaster[]
  total_balance: number
}

/**
 * Получить баллы лояльности клиента (summary)
 */
export async function getClientLoyaltyPoints(): Promise<ClientLoyaltyPointsResponse> {
  try {
    const response = await apiClient.get<ClientLoyaltyPointsResponse>('/api/client/loyalty/points')
    return response.data
  } catch (_error: any) {
    // Graceful fallback при ошибке
    return {
      masters: [],
      total_balance: 0
    }
  }
}

/**
 * Получить историю транзакций лояльности для конкретного мастера
 */
export async function getLoyaltyHistory(masterId: number): Promise<LoyaltyTransaction[]> {
  try {
    const response = await apiClient.get<LoyaltyTransaction[]>(`/api/client/loyalty/history/${masterId}`)
    return response.data
  } catch (_error: any) {
    return []
  }
}

/**
 * Получить статистику dashboard клиента
 */
export interface ClientDashboardStats {
  future_bookings_count: number
  past_bookings_count: number
  favorites_count: number
  total_loyalty_points: number
  salons_enabled: boolean
}

export async function getClientDashboardStats(): Promise<ClientDashboardStats> {
  try {
    const response = await apiClient.get<ClientDashboardStats>('/api/client/dashboard/stats')
    return response.data
  } catch (_error: any) {
    // Fallback
    return {
      future_bookings_count: 0,
      past_bookings_count: 0,
      favorites_count: 0,
      total_loyalty_points: 0,
      salons_enabled: false
    }
  }
}
