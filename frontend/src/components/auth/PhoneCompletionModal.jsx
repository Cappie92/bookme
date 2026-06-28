import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { normalizeRussianPhoneForApi } from '../../utils/normalizeRussianPhoneForApi'

function formatPhone(input) {
  let digits = String(input || '').replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) return '+7' + digits.slice(1)
  if (digits.startsWith('7') && digits.length === 11) return '+7' + digits.slice(1)
  if (digits.startsWith('7')) digits = digits.slice(1)
  if (digits.length > 10) digits = digits.slice(0, 10)
  return '+7' + digits
}

function needsPhoneCompletion(user) {
  if (!user) return false
  if (user.phone_required === true) return true
  if (!String(user.phone || '').trim()) return true
  return false
}

export default function PhoneCompletionModal() {
  const { isAuthenticated, user, getAuthHeaders, checkAuthStatus } = useAuth()
  const [phone, setPhone] = useState('+7')
  const [callId, setCallId] = useState('')
  const [digits, setDigits] = useState('')
  const [step, setStep] = useState('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stubDigits, setStubDigits] = useState('')

  const open = isAuthenticated && needsPhoneCompletion(user)

  useEffect(() => {
    if (!open) {
      setPhone('+7')
      setCallId('')
      setDigits('')
      setStep('phone')
      setLoading(false)
      setError('')
      setStubDigits('')
    }
  }, [open])

  if (!open) return null

  const requestCall = async (event) => {
    event.preventDefault()
    const normalized = normalizeRussianPhoneForApi(phone)
    if (!/^\+7\d{10}$/.test(normalized)) {
      setError('Введите номер телефона в формате +7XXXXXXXXXX')
      return
    }
    setLoading(true)
    setError('')
    setStubDigits('')
    try {
      const response = await fetch('/api/auth/request-phone-change', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: normalized }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success === false) {
        setError(data.message || data.detail || 'Не удалось отправить звонок для подтверждения')
        return
      }
      setPhone(normalized)
      setCallId(data.call_id || '')
      setStubDigits(data.verification_number || '')
      setStep('digits')
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const confirmPhone = async (event) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(digits)) {
      setError('Введите последние 4 цифры номера, с которого вам звонят')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth/confirm-phone-change', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone, call_id: callId, phone_digits: digits }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success === false) {
        setError(data.message || data.detail || 'Не удалось подтвердить номер')
        return
      }
      await checkAuthStatus()
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-completion-title"
        data-testid="phone-completion-modal"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6"
      >
        <h2 id="phone-completion-title" className="text-lg font-semibold text-gray-900">
          Укажите номер телефона
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Чтобы завершить вход через Яндекс, укажите номер телефона. Мы подтвердим его звонком.
        </p>

        {step === 'phone' ? (
          <form onSubmit={requestCall} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Номер телефона</label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(formatPhone(event.target.value))}
                placeholder="+7 (999) 999 99 99"
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-[15px] focus:border-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/25"
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-[#4CAF50] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#45A049] disabled:opacity-60"
            >
              {loading ? 'Отправляем звонок...' : 'Подтвердить звонком'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmPhone} className="mt-5 space-y-4">
            <p className="text-sm text-gray-600">
              На номер {phone} поступит звонок. Введите последние 4 цифры номера, с которого вам звонят.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">4 цифры</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={digits}
                onChange={(event) => setDigits(event.target.value.replace(/\D/g, '').slice(0, 4))}
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/25"
              />
            </div>
            {stubDigits ? <p className="text-xs text-gray-500">Тестовые цифры: {stubDigits}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStep('phone')
                  setDigits('')
                  setError('')
                }}
                className="flex-1 rounded border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded bg-[#4CAF50] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#45A049] disabled:opacity-60"
              >
                {loading ? 'Проверка...' : 'Подтвердить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
