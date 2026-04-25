import { useEffect, useState } from 'react'
import { getApiUrl } from '../utils/config'

/**
 * Публичный каталог тарифов: планы + service_functions (подписи из админки).
 * GET /api/subscription-plans/pricing-catalog?subscription_type=master|salon
 */
export function usePricingCatalog(subscriptionType) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const url = getApiUrl(
          `/api/subscription-plans/pricing-catalog?subscription_type=${encodeURIComponent(subscriptionType)}`
        )
        const res = await fetch(url)
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
    }
  }, [subscriptionType])

  return {
    data,
    loading,
    error,
    plans: data?.plans ?? [],
    serviceFunctions: data?.service_functions ?? [],
  }
}
