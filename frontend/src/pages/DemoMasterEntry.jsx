import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function DemoMasterEntry() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const response = await fetch('/api/auth/demo-master-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json()
        if (cancelled) return
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        localStorage.setItem('user_role', 'master')
        localStorage.setItem('demo_mode', '1')
        navigate('/master?tab=dashboard&demo=1', { replace: true })
      } catch (e) {
        if (cancelled) return
        setError('Не удалось открыть демо. Попробуйте ещё раз.')
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-neutral-200 bg-white p-6 text-center">
        {!error ? (
          <>
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-[#4CAF50]" />
            <p className="mt-4 text-neutral-700">Подготавливаем демо-кабинет…</p>
          </>
        ) : (
          <>
            <p className="text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center rounded-lg bg-[#4CAF50] px-4 py-2 text-white hover:bg-[#43a047]"
            >
              Повторить
            </button>
          </>
        )}
      </div>
    </div>
  )
}
