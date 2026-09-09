import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { safeHandoffRedirect } from '../utils/webHandoffRedirect'
import { IsolatedSessionError } from '../components/AuthSafetyBoundary'

export default function MobileHandoff() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { beginHandoff } = useAuth()
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const attempt = beginHandoff()
    const code = (searchParams.get('code') || '').trim()
    // Consume the existing one-time ticket without retaining it in links/referrers.
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (!code) {
      attempt.fail()
      setError('Отсутствует код входа')
      return
    }

    ;(async () => {
      try {
        const response = await fetch('/api/auth/web-handoff/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        if (!response.ok) {
          throw new Error('Не удалось выполнить вход')
        }
        const data = await response.json()
        if (window.location.pathname !== '/auth/mobile-handoff') return
        if (!attempt.complete(data)) throw new Error('Сессия изменилась')

        navigate(safeHandoffRedirect(data), { replace: true })
      } catch {
        attempt.fail()
        setError('Не удалось выполнить вход')
      }
    })()
  }, [searchParams, beginHandoff, navigate])

  if (error) {
    return <IsolatedSessionError />
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
