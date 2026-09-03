import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { safeHandoffRedirect } from '../utils/webHandoffRedirect'

const SESSION_ORIGIN_KEY = 'dedato_web_session_origin'
export default function MobileHandoff() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    const code = (searchParams.get('code') || '').trim()
    if (!code) {
      setError('Отсутствует код входа')
      return
    }
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      try {
        const response = await fetch('/api/auth/web-handoff/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.detail || 'Не удалось выполнить вход')
        }
        const data = await response.json()
        if (!data.access_token) throw new Error('Токен не получен')

        localStorage.setItem('access_token', data.access_token)
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
        const role = data.user?.role
        if (role) localStorage.setItem('user_role', role)

        if (data.web_session_origin) {
          sessionStorage.setItem(SESSION_ORIGIN_KEY, data.web_session_origin)
        } else {
          sessionStorage.removeItem(SESSION_ORIGIN_KEY)
        }

        login({
          ...(data.user || {}),
          web_session_origin: data.web_session_origin || null,
        })

        navigate(safeHandoffRedirect(data), { replace: true })
      } catch (e) {
        setError(e?.message || 'Не удалось выполнить вход')
      }
    })()
  }, [searchParams, login, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-[#FAFAF9]">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-[#1C1917]">Не удалось открыть сессию</h1>
          <p className="text-sm text-neutral-600">{error}</p>
          <Link to="/master" className="inline-block text-[#4CAF50] font-medium hover:underline">
            Перейти в кабинет
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-[#FAFAF9]">
      <div className="text-center space-y-2">
        <p className="text-base font-medium text-[#1C1917]">Открываем кабинет…</p>
        <p className="text-sm text-neutral-500">Подождите несколько секунд</p>
      </div>
    </div>
  )
}
