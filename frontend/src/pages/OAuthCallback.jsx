import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

function getRolePath(role) {
  const normalized = (role || '').toString().toLowerCase()
  if (normalized === 'admin' || normalized === 'moderator') return '/admin'
  if (normalized === 'master' || normalized === 'indie') return '/master'
  if (normalized === 'salon') return '/salon'
  return '/client'
}

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const { showToast } = useToast()
  const [error, setError] = useState('')

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

      try {
        const exchangeResponse = await fetch('/api/auth/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
        })
        if (!exchangeResponse.ok) throw new Error('exchange failed')
        const authData = await exchangeResponse.json()
        if (!authData.access_token) throw new Error('token missing')
        const oauth = authData.oauth || {}

        localStorage.setItem('access_token', authData.access_token)
        if (authData.refresh_token) localStorage.setItem('refresh_token', authData.refresh_token)
        window.history.replaceState({}, '', '/auth/oauth/callback')

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
        if (oauth.purpose === 'oauth_link') {
          showToast(oauth.message || 'Яндекс аккаунт привязан', 'success')
          navigate(oauth.return_to || returnTo, { replace: true })
        } else {
          navigate(getRolePath(user.role), { replace: true })
        }
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        setError('Не удалось войти через Яндекс. Попробуйте ещё раз или войдите по телефону.')
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
