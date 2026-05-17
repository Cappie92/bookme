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
  reserved_points?: number
  ledger_balance?: number
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
  total_reserved?: number
}

/**
 * Получить баллы лояльности клиента (summary)
 */
export async function getClientLoyaltyPoints(): Promise<ClientLoyaltyPointsResponse> {
  try {
    const response = await apiClient.get<ClientLoyaltyPointsResponse>('/api/client/loyalty/points')
    return response.data
  } catch (_error: any) {
    return {
      masters: [],
      total_balance: 0,
      total_reserved: 0,
    }
  }
}

function _mergeTransactionsFromPoints(data: ClientLoyaltyPointsResponse): LoyaltyTransaction[] {
  const out: LoyaltyTransaction[] = []
  for (const m of data.masters ?? []) {
    for (const t of m.transactions ?? []) {
      out.push({ ...t, master_id: t.master_id ?? m.master_id })
    }
  }
  out.sort((a, b) => {
    const ta = new Date(a.earned_at ?? a.created_at).getTime()
    const tb = new Date(b.earned_at ?? b.created_at).getTime()
    return tb - ta
  })
  return out
}

/**
 * История лояльности: по мастеру (backend GET .../history/{id}) или сводка из /points.
 */
export async function getLoyaltyHistory(masterId: number | null): Promise<LoyaltyTransaction[]> {
  if (masterId != null && !Number.isNaN(masterId)) {
    try {
      const response = await apiClient.get<LoyaltyTransaction[]>(`/api/client/loyalty/history/${masterId}`)
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data
      }
    } catch (_e: any) {
      /* fallback below */
    }
    const pts = await getClientLoyaltyPoints()
    const slice = pts.masters?.find((m) => m.master_id === masterId)?.transactions ?? []
    if (slice.length > 0) {
      return [...slice].sort(
        (a, b) =>
          new Date(b.earned_at ?? b.created_at).getTime() -
          new Date(a.earned_at ?? a.created_at).getTime()
      )
    }
    return []
  }

  const pts = await getClientLoyaltyPoints()
  return _mergeTransactionsFromPoints(pts)
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
    return {
      future_bookings_count: 0,
      past_bookings_count: 0,
      favorites_count: 0,
      total_loyalty_points: 0,
      salons_enabled: false,
    }
  }
}
