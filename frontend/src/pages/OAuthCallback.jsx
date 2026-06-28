import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getTimezoneByCity } from '../utils/cities'
import { normalizeRussianPhoneForApi } from '../utils/normalizeRussianPhoneForApi'

const oauthExchangeRequests = new Map()
const oauthExchangeSuccesses = new Set()

function getRolePath(role) {
  const normalized = (role || '').toString().toLowerCase()
  if (normalized === 'admin' || normalized === 'moderator') return '/admin'
  if (normalized === 'master' || normalized === 'indie') return '/master'
  if (normalized === 'salon') return '/salon'
  return '/client'
}

function oauthTicketSuccessKey(ticket) {
  return `dedato_oauth_ticket_success_${ticket}`
}

function cleanOAuthCallbackUrl() {
  window.history.replaceState({}, '', '/auth/oauth/callback')
}

async function exchangeOAuthTicketOnce(ticket) {
  if (!oauthExchangeRequests.has(ticket)) {
    oauthExchangeRequests.set(
      ticket,
      fetch('/api/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('exchange failed')
          return response.json()
        })
        .then((authData) => {
          if (!authData.access_token) throw new Error('token missing')
          oauthExchangeSuccesses.add(ticket)
          sessionStorage.setItem(oauthTicketSuccessKey(ticket), '1')
          return authData
        })
    )
  }
  return oauthExchangeRequests.get(ticket)
}

function wasOAuthTicketCompleted(ticket) {
  return oauthExchangeSuccesses.has(ticket) || sessionStorage.getItem(oauthTicketSuccessKey(ticket)) === '1'
}

function formatPhone(input) {
  let digits = String(input || '').replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) return '+7' + digits.slice(1)
  if (digits.startsWith('7') && digits.length === 11) return '+7' + digits.slice(1)
  if (digits.startsWith('7')) digits = digits.slice(1)
  if (digits.length > 10) digits = digits.slice(0, 10)
  return '+7' + digits
}

function OAuthOnboardingForm({ ticket, onComplete }) {
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('+7')
  const [city, setCity] = useState('')
  const [callId, setCallId] = useState('')
  const [digits, setDigits] = useState('')
  const [step, setStep] = useState('phone')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedPersonalData, setAcceptedPersonalData] = useState(false)
  const [acceptedMarketing, setAcceptedMarketing] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const requestPhone = async (event) => {
    event.preventDefault()
    const normalized = normalizeRussianPhoneForApi(phone)
    if (!role) {
      setError('Выберите роль')
      return
    }
    if (role === 'master' && !city.trim()) {
      setError('Для мастера укажите город')
      return
    }
    if (!/^\+7\d{10}$/.test(normalized)) {
      setError('Введите номер телефона в формате +7XXXXXXXXXX')
      return
    }
    if (!acceptedTerms || !acceptedPersonalData) {
      setError('Примите обязательные согласия')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth/oauth/onboarding-phone-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, phone: normalized }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success === false) {
        setError(data.message || data.detail || 'Не удалось отправить звонок для подтверждения')
        return
      }
      setPhone(normalized)
      setCallId(data.call_id || '')
      setStep('digits')
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const completeOnboarding = async (event) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(digits)) {
      setError('Введите последние 4 цифры номера, с которого вам звонят')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = {
        ticket,
        role,
        phone,
        city: role === 'master' ? city.trim() : null,
        timezone: role === 'master' ? getTimezoneByCity(city.trim()) : null,
        call_id: callId,
        phone_verification_code: digits,
        accepted_terms: acceptedTerms,
        accepted_personal_data: acceptedPersonalData,
        accepted_marketing: acceptedMarketing,
      }
      const response = await fetch('/api/auth/oauth/onboarding-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.detail || 'Не удалось завершить регистрацию')
        return
      }
      onComplete(data)
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
      <h1 className="text-lg font-semibold text-gray-900">Завершите регистрацию через Яндекс</h1>
      <p className="mt-2 text-sm text-gray-600">Выберите роль и подтвердите телефон звонком.</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="oauth-onboarding-client-role"
          onClick={() => setRole('client')}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${role === 'client' ? 'border-[#4CAF50] bg-[#F1F8E9] text-[#2E7D32]' : 'border-gray-200 text-gray-700'}`}
        >
          Я клиент
        </button>
        <button
          type="button"
          data-testid="oauth-onboarding-master-role"
          onClick={() => setRole('master')}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${role === 'master' ? 'border-[#4CAF50] bg-[#F1F8E9] text-[#2E7D32]' : 'border-gray-200 text-gray-700'}`}
        >
          Я мастер
        </button>
      </div>

      <form onSubmit={step === 'phone' ? requestPhone : completeOnboarding} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Телефон</label>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            placeholder="+7 (999) 999 99 99"
            className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-[15px] focus:border-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/25"
          />
        </div>

        {role === 'master' ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Город</label>
            <input
              data-testid="oauth-onboarding-city"
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Москва"
              className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-[15px] focus:border-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/25"
            />
          </div>
        ) : null}

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1" />
            <span>
              Я принимаю <a href="/user-agreement" target="_blank" rel="noopener noreferrer" className="text-[#4CAF50] underline">пользовательское соглашение</a> <span className="text-red-500">*</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={acceptedPersonalData} onChange={(event) => setAcceptedPersonalData(event.target.checked)} className="mt-1" />
            <span>
              Я даю <a href="/personal-data-consent" target="_blank" rel="noopener noreferrer" className="text-[#4CAF50] underline">согласие на обработку персональных данных</a> <span className="text-red-500">*</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={acceptedMarketing} onChange={(event) => setAcceptedMarketing(event.target.checked)} className="mt-1" />
            <span>
              Я даю <a href="/marketing-consent" target="_blank" rel="noopener noreferrer" className="text-[#4CAF50] underline">согласие на получение рекламных и информационных рассылок</a> (опционально)
            </span>
          </label>
        </div>

        {step === 'digits' ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">4 цифры</label>
            <input
              data-testid="oauth-onboarding-digits"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={digits}
              onChange={(event) => setDigits(event.target.value.replace(/\D/g, '').slice(0, 4))}
              className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/25"
            />
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          data-testid={step === 'phone' ? 'oauth-onboarding-request-phone' : 'oauth-onboarding-complete'}
          disabled={loading || !role || !acceptedTerms || !acceptedPersonalData}
          className="w-full rounded bg-[#4CAF50] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#45A049] disabled:opacity-60"
        >
          {loading ? 'Подождите...' : step === 'phone' ? 'Подтвердить телефон звонком' : 'Завершить регистрацию'}
        </button>
      </form>
    </div>
  )
}

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const { showToast } = useToast()
  const [error, setError] = useState('')
  const processedTicketRef = useRef(null)
  const exchangeInFlightRef = useRef(false)
  const onboardingTicket = searchParams.get('onboarding_ticket')

  const completeAuth = (authData) => {
    if (!authData?.access_token) throw new Error('token missing')
    localStorage.setItem('access_token', authData.access_token)
    if (authData.refresh_token) localStorage.setItem('refresh_token', authData.refresh_token)
    const user = authData.user
    if (!user) throw new Error('profile missing')
    if (user.role) localStorage.setItem('user_role', user.role)
    login(user)
    cleanOAuthCallbackUrl()
    navigate(getRolePath(user.role), { replace: true })
  }

  useEffect(() => {
    const completeLogin = async () => {
      if (onboardingTicket) return
      const ticket = searchParams.get('ticket')
      const oauthError = searchParams.get('error')
      const mode = searchParams.get('mode') || 'login'
      const returnTo = searchParams.get('return_to') || '/client/profile'

      if (oauthError || !ticket) {
        if (mode === 'link') {
          showToast(oauthError || 'Не удалось привязать Яндекс', 'error')
          navigate(returnTo, { replace: true })
          return
        }
        setError('Не удалось войти через Яндекс. Попробуйте ещё раз или войдите по телефону.')
        return
      }

      if (processedTicketRef.current === ticket || exchangeInFlightRef.current) {
        return
      }

      processedTicketRef.current = ticket
      exchangeInFlightRef.current = true

      try {
        const authData = await exchangeOAuthTicketOnce(ticket)
        const oauth = authData.oauth || {}

        localStorage.setItem('access_token', authData.access_token)
        if (authData.refresh_token) localStorage.setItem('refresh_token', authData.refresh_token)

        let user = authData.user || null
        try {
          const response = await fetch('/api/auth/users/me', {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authData.access_token}`,
            },
          })
          if (response.ok) {
            user = await response.json()
          }
        } catch {
          // OAuth уже успешен и токены сохранены; профиль подтянется в AuthProvider/кабинете.
        }
        if (!user) throw new Error('profile missing')
        if (user.role) localStorage.setItem('user_role', user.role)
        login(user)
        cleanOAuthCallbackUrl()
        if (oauth.purpose === 'oauth_link') {
          showToast(oauth.message || 'Яндекс аккаунт привязан', 'success')
          navigate(oauth.return_to || returnTo, { replace: true })
        } else {
          navigate(getRolePath(user.role), { replace: true })
        }
      } catch {
        if (wasOAuthTicketCompleted(ticket) && localStorage.getItem('access_token')) {
          cleanOAuthCallbackUrl()
          navigate(getRolePath(localStorage.getItem('user_role')), { replace: true })
          return
        }
        setError('Не удалось войти через Яндекс. Попробуйте ещё раз или войдите по телефону.')
      } finally {
        exchangeInFlightRef.current = false
      }
    }

    completeLogin()
  }, [login, navigate, searchParams, showToast])

  if (onboardingTicket) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
        <OAuthOnboardingForm ticket={onboardingTicket} onComplete={completeAuth} />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900">Ошибка входа</h1>
            <p className="mt-3 text-sm text-gray-600">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="mt-5 rounded bg-[#4CAF50] px-4 py-2 text-sm font-medium text-white hover:bg-[#45A049]"
            >
              На главную
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-[#4CAF50]" />
            <p className="mt-4 text-sm text-gray-600">Завершаем вход через Яндекс...</p>
          </>
        )}
      </div>
    </div>
  )
}
