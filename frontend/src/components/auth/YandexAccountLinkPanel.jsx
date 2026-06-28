import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const YANDEX_LOGO_SRC = '/YaLogo.webp'

export default function YandexAccountLinkPanel({ className = '' }) {
  const location = useLocation()
  const { getAuthHeaders, isAuthenticated } = useAuth()
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [account, setAccount] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!isAuthenticated) {
      setLoading(false)
      setAccount(null)
      return () => {
        cancelled = true
      }
    }
    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/auth/oauth/accounts', { headers: getAuthHeaders() })
        if (!response.ok) throw new Error('accounts failed')
        const data = await response.json()
        const yandex = (data.items || []).find((item) => item.provider === 'yandex') || null
        if (!cancelled) setAccount(yandex)
      } catch {
        if (!cancelled) setAccount(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getAuthHeaders, isAuthenticated])

  const startLink = async () => {
    const returnTo = `${location.pathname}${location.search || ''}` || '/client/profile'
    setLinking(true)
    try {
      const response = await fetch(
        `/api/auth/yandex/link?as_json=true&return_to=${encodeURIComponent(returnTo)}`,
        { headers: getAuthHeaders() }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.redirect_url) throw new Error('link start failed')
      window.location.href = data.redirect_url
    } catch {
      setLinking(false)
    }
  }

  return (
    <section className={`rounded-[11px] border border-[#E8E2DD] bg-white p-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <img src={YANDEX_LOGO_SRC} alt="" aria-hidden="true" className="h-5 w-5 flex-shrink-0 object-contain" />
            <h3 className="text-sm font-semibold text-gray-900">Яндекс аккаунт</h3>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {account
              ? `Привязан${account.email ? `: ${account.email}` : ''}`
              : 'Привяжите Яндекс, чтобы входить быстрее.'}
          </p>
        </div>
        {account ? (
          <span className="inline-flex w-fit rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            Привязан
          </span>
        ) : (
          <button
            type="button"
            disabled={loading || linking}
            onClick={startLink}
            data-testid="link-yandex-account"
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[#E0D8CF] bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-[#FFFDFB] disabled:opacity-60"
          >
            {loading || linking ? 'Проверяем...' : 'Привязать Яндекс'}
          </button>
        )}
      </div>
    </section>
  )
}
