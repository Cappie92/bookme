import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function VerifyEmail() {
  const q = useQuery()
  const token = (q.get('token') || '').trim()
  const [status, setStatus] = useState('loading') // loading | success | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!token) {
        setStatus('error')
        setMessage('В ссылке нет токена подтверждения.')
        return
      }
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data?.success) {
          setStatus('success')
          setMessage(data?.message || 'Email подтверждён.')
        } else {
          setStatus('error')
          setMessage(data?.message || data?.detail || 'Не удалось подтвердить email.')
        }
      } catch {
        if (cancelled) return
        setStatus('error')
        setMessage('Ошибка сети при подтверждении email.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="min-h-screen bg-[#FAF8F6] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#E7E2DF] bg-white p-6 shadow-[0_10px_26px_-20px_rgba(45,45,45,0.14)]">
        <h1 className="text-xl font-semibold text-[#2D2D2D]">Подтверждение email</h1>
        <p className="mt-3 text-sm text-[#6B6B6B]">
          {status === 'loading' ? 'Проверяем ссылку…' : message}
        </p>
        {status === 'loading' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#6B6B6B]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF50] border-t-transparent" aria-hidden />
            <span>Ожидайте ответ сервера</span>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#4CAF50] px-4 py-2 text-sm font-semibold text-white"
          >
            На главную
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800"
          >
            В кабинет
          </Link>
        </div>
        {import.meta.env.DEV && (
          <details className="mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 text-left text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">Локальный smoke: откуда взять token</summary>
            <p className="mt-2">
              После смены email или регистрации токен лежит в таблице{' '}
              <code className="rounded bg-gray-100 px-1">email_verifications</code> (поле{' '}
              <code className="rounded bg-gray-100 px-1">token</code>
              ). В SQLite:{' '}
              <code className="mt-1 block whitespace-pre-wrap break-all rounded bg-gray-100 p-1">
                sqlite3 &lt;путь_к_БД&gt; &quot;SELECT token, purpose, expires_at FROM email_verifications ORDER BY id DESC LIMIT 5;&quot;
              </code>
              Затем откройте{' '}
              <code className="rounded bg-gray-100 px-1">/verify-email?token=…</code> в этом же origin, что и фронт
              (прокси на <code className="rounded bg-gray-100 px-1">/api</code>).
            </p>
          </details>
        )}
      </div>
    </div>
  )
}

