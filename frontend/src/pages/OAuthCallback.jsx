import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

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

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const { showToast } = useToast()
  const [error, setError] = useState('')
  const processedTicketRef = useRef(null)
  const exchangeInFlightRef = useRef(false)

  useEffect(() => {
    const completeLogin = async () => {
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
