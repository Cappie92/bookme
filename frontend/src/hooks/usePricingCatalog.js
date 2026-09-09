import { useEffect, useState } from 'react'
import { getApiUrl } from '../utils/config'
import { useAuth } from '../contexts/AuthContext'

/**
 * Публичный каталог тарифов: планы + service_functions (подписи из админки).
 * GET /api/subscription-plans/pricing-catalog?subscription_type=master|salon
 */
export function usePricingCatalog(subscriptionType, { enabled = true } = {}) {
  const { commerceAllowed } = useAuth()
  const allowed = enabled && commerceAllowed === true
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!allowed) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const url = getApiUrl(
          `/api/subscription-plans/pricing-catalog?subscription_type=${encodeURIComponent(subscriptionType)}`
        )
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`)
        }
        const json = await res.json()
        if (!cancelled) {
          setData({
            plans: Array.isArray(json.plans) ? json.plans : [],
            service_functions: Array.isArray(json.service_functions) ? json.service_functions : [],
          })
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error('Load failed'))
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [subscriptionType, allowed])

  return {
    data: allowed ? data : null,
    loading: allowed && loading,
    error: allowed ? error : null,
    plans: allowed ? data?.plans ?? [] : [],
    serviceFunctions: allowed ? data?.service_functions ?? [] : [],
  }
}
