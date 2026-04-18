import React, { useState, useEffect, useRef } from 'react'
import { apiGet, apiPut } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import MasterLoyaltyStats from './MasterLoyaltyStats'
import MasterLoyaltyHistory from './MasterLoyaltyHistory'
import MasterLoyaltyHistoryFiltersModal from './MasterLoyaltyHistoryFiltersModal'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

export default function MasterLoyalty() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [settings, setSettings] = useState(null)
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState('error') // 'error' | 'warning'
  const [success, setSuccess] = useState('')
  
  // История: фильтры и пагинация
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyErrorType, setHistoryErrorType] = useState('error')
  const [historySkip, setHistorySkip] = useState(0)
  const [historyLimit] = useState(50)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  
  // Applied filters (то, что реально влияет на запрос)
  const [appliedFilters, setAppliedFilters] = useState({
    clientId: '',
    transactionType: '',
    startDate: '',
    endDate: ''
  })
  
  // Модалка фильтров
  const [showFiltersModal, setShowFiltersModal] = useState(false)

  const [pointsAccrualSettingsExpanded, setPointsAccrualSettingsExpanded] = useState(true)
  const prevIsEnabledRef = useRef(undefined)

  useEffect(() => {
    // Auth gating: не делаем запросы до готовности auth
    if (authLoading || !isAuthenticated) {
      setLoading(false)
      return
    }
    
    // Загружаем settings и stats одновременно (историю грузим отдельно)
    loadSettingsAndStats()
  }, [authLoading, isAuthenticated])

  // Загрузка истории при изменении appliedFilters или skip (отдельно от settings/stats)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadHistory()
    }
  }, [appliedFilters, historySkip, authLoading, isAuthenticated])

  useEffect(() => {
    const cur = settings?.is_enabled ?? false
    const prev = prevIsEnabledRef.current
    prevIsEnabledRef.current = cur
    if (cur && prev === false) {
      setPointsAccrualSettingsExpanded(true)
    }
  }, [settings?.is_enabled])

  const loadSettingsAndStats = async () => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      setErrorType('error')
      
      // Загружаем settings и stats параллельно (историю грузим отдельно через useEffect)
      const [settingsData, statsData] = await Promise.all([
        apiGet('/api/master/loyalty/settings').catch(err => {
          handleSettingsError(err, token)
          return null
        }),
        apiGet('/api/master/loyalty/stats').catch(err => {
          handleStatsError(err, token)
          return null
        })
      ])
      
      if (settingsData) {
        setSettings(settingsData)
      }
      if (statsData) {
        setStats(statsData)
      }
    } catch (err) {
      console.error('Ошибка загрузки данных лояльности:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    await loadHistoryInternal()
  }

  const loadHistoryInternal = async () => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated) {
      return []
    }

    try {
      setHistoryLoading(true)
      setHistoryError('')
      setHistoryErrorType('error')
      
      let url = `/api/master/loyalty/history?skip=${historySkip}&limit=${historyLimit}`
      if (appliedFilters.clientId) url += `&client_id=${appliedFilters.clientId}`
      if (appliedFilters.transactionType) url += `&transaction_type=${appliedFilters.transactionType}`
      if (appliedFilters.startDate) url += `&start_date=${appliedFilters.startDate}`
      if (appliedFilters.endDate) url += `&end_date=${appliedFilters.endDate}`
      
      const data = await apiGet(url)
      const transactions = data || []
      setHistory(transactions)
      setHistoryHasMore(transactions.length === historyLimit)
      return transactions
    } catch (err) {
      handleHistoryError(err, token)
      return []
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleSettingsError = (err, token) => {
    console.error('Ошибка загрузки настроек лояльности:', err)
    
    const status = err.response?.status || (err.message?.match(/status: (\d+)/)?.[1] ? parseInt(err.message.match(/status: (\d+)/)[1]) : null)
    const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
    const errorData = err.response?.data || {}
    
    if (status === 401 && token) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_role')
      setError('Сессия истекла. Пожалуйста, войдите снова.')
      setErrorType('error')
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)
    } else if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
      const detail = errorData.detail || 'Схема базы данных устарела'
      const hint = errorData.hint || 'Run alembic upgrade head'
      setError(`${detail}. ${hint}`)
      setErrorType('warning')
    } else if (status === 404) {
      const detail = errorData.detail || 'Ресурс не найден'
      setError(detail)
      setErrorType('error')
    } else if (status === 403 || err.message?.includes('403') || err.message?.includes('status: 403')) {
      setError('Доступ к программе лояльности доступен на плане Pro и выше')
      setErrorType('error')
    } else {
      setError('Ошибка загрузки настроек')
      setErrorType('error')
    }
  }

  const handleStatsError = (err, token) => {
    console.error('Ошибка загрузки статистики:', err)
    // Ошибки статистики не критичны, просто не показываем статистику
  }

  const handleHistoryError = (err, token) => {
    console.error('Ошибка загрузки истории:', err)
    
    const status = err.response?.status || (err.message?.match(/status: (\d+)/)?.[1] ? parseInt(err.message.match(/status: (\d+)/)[1]) : null)
    const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
    const errorData = err.response?.data || {}
    
    if (status === 401 && token) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_role')
      setHistoryError('Сессия истекла. Пожалуйста, войдите снова.')
      setHistoryErrorType('error')
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)
    } else if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
      const detail = errorData.detail || 'Схема базы данных устарела'
      const hint = errorData.hint || 'Run alembic upgrade head'
      setHistoryError(`${detail}. ${hint}`)
      setHistoryErrorType('warning')
    } else if (status === 404) {
      const detail = errorData.detail || 'Ресурс не найден'
      setHistoryError(detail)
      setHistoryErrorType('error')
    } else if (status === 403 || err.message?.includes('403') || err.message?.includes('status: 403')) {
      setHistoryError('Доступ к программе лояльности доступен на плане Pro и выше')
      setHistoryErrorType('error')
    } else {
      setHistoryError('Ошибка загрузки истории операций')
      setHistoryErrorType('error')
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      
      // Валидация
      if (settings.is_enabled) {
        if (!settings.accrual_percent || settings.accrual_percent < 1 || settings.accrual_percent > 100) {
          setError('Процент начисления должен быть от 1 до 100')
          setSaving(false)
          return
        }
        if (!settings.max_payment_percent || settings.max_payment_percent < 1 || settings.max_payment_percent > 100) {
          setError('Процент оплаты баллами должен быть от 1 до 100')
          setSaving(false)
          return
        }
      }

      await apiPut('/api/master/loyalty/settings', settings)
      setSuccess('Настройки успешно сохранены')
      if (settings.is_enabled) {
        setPointsAccrualSettingsExpanded(false)
      }
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Ошибка сохранения настроек:', err)
      setError(err.response?.data?.detail || 'Ошибка сохранения настроек')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleApplyFilters = (draftFilters) => {
    setAppliedFilters(draftFilters)
    setHistorySkip(0) // Сбрасываем пагинацию при применении фильтров
  }

  const handleResetFilters = () => {
    const emptyFilters = {
      clientId: '',
      transactionType: '',
      startDate: '',
      endDate: ''
    }
    setAppliedFilters(emptyFilters)
    setHistorySkip(0) // Сбрасываем пагинацию при сбросе фильтров
  }

  const lifetimeOptions = [
    { value: 14, label: '14 дней' },
    { value: 30, label: '30 дней' },
    { value: 60, label: '60 дней' },
    { value: 90, label: '90 дней' },
    { value: 180, label: '180 дней' },
    { value: 365, label: '365 дней' },
    { value: null, label: 'Бесконечно (∞)' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#4CAF50]"></div>
      </div>
    )
  }

  if (!settings && !loading) {
    if (error && error.includes('Доступ к программе лояльности')) {
      return (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 sm:p-6">
          <p className="mb-2 break-words text-yellow-800">{error}</p>
          <a
            href="/master?tab=tariff"
            className="inline-flex min-h-10 items-center font-medium text-blue-600 underline"
          >
            Обновить подписку
          </a>
        </div>
      )
    }
    if (errorType === 'warning') {
      return (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 sm:p-6">
          <p className="break-words text-yellow-800">{error || 'Схема базы данных устарела'}</p>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 sm:p-6">
        <p className="break-words text-red-800">{error || 'Ошибка загрузки настроек'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div
          className={
            errorType === 'warning'
              ? 'rounded-lg border border-yellow-200 bg-yellow-50 p-4'
              : 'rounded-lg border border-red-200 bg-red-50 p-4'
          }
        >
          <p className={errorType === 'warning' ? 'break-words text-yellow-800' : 'break-words text-red-800'}>
            {error}
          </p>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="break-words text-green-800">{success}</p>
        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h2 className="mb-4 text-xl font-semibold sm:mb-6 sm:text-2xl">Настройки программы лояльности</h2>

        <div className="mb-6">
          <label className="flex min-h-10 cursor-pointer items-start gap-3 sm:items-center">
            <input
              type="checkbox"
              checked={settings?.is_enabled || false}
              onChange={(e) => handleChange('is_enabled', e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 rounded text-[#4CAF50] focus:ring-2 focus:ring-[#4CAF50] sm:mt-0"
            />
            <span className="text-base font-medium sm:text-lg">Включить программу лояльности</span>
          </label>
        </div>

        {settings?.is_enabled && (
          <button
            type="button"
            onClick={() => setPointsAccrualSettingsExpanded(v => !v)}
            className="mb-4 flex w-full min-h-11 items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left sm:px-4"
          >
            <span className="min-w-0 flex-1 text-[15px] font-semibold text-gray-900 sm:text-base">
              Настройки начисления баллов
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[#4CAF50]">
              {pointsAccrualSettingsExpanded ? 'Свернуть' : 'Развернуть'}
              {pointsAccrualSettingsExpanded ? (
                <ChevronUpIcon className="h-5 w-5 shrink-0 text-[#4CAF50]" aria-hidden />
              ) : (
                <ChevronDownIcon className="h-5 w-5 shrink-0 text-[#4CAF50]" aria-hidden />
              )}
            </span>
          </button>
        )}

        {/* Поля начисления (только при включённой программе) */}
        {settings?.is_enabled && pointsAccrualSettingsExpanded && (
          <div className="space-y-6">
            {/* Процент начисления */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Процент от стоимости услуги, который зачисляется на счет клиента (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.accrual_percent || ''}
                  onChange={(e) => handleChange('accrual_percent', e.target.value ? parseInt(e.target.value) : null)}
                  className="min-h-10 w-full rounded-lg border border-gray-300 px-4 py-2 pr-8 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
                  placeholder="Например, 5"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Целое число от 1 до 100</p>
            </div>

            {/* Срок жизни баллов */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Срок жизни баллов
              </label>
              <select
                value={settings.points_lifetime_days ?? 'null'}
                onChange={(e) => {
                  const value = e.target.value === 'null' ? null : parseInt(e.target.value)
                  handleChange('points_lifetime_days', value)
                }}
                className="min-h-10 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
              >
                {lifetimeOptions.map(option => (
                  <option key={option.value ?? 'null'} value={option.value ?? 'null'}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Процент оплаты баллами */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Процент стоимости услуги, который можно оплатить баллами (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.max_payment_percent || ''}
                  onChange={(e) => handleChange('max_payment_percent', e.target.value ? parseInt(e.target.value) : null)}
                  className="min-h-10 w-full rounded-lg border border-gray-300 px-4 py-2 pr-8 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
                  placeholder="Например, 50"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Целое число от 1 до 100</p>
            </div>
          </div>
        )}

        {/* Кнопка сохранения */}
        <div className="mt-6 sm:mt-8">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="min-h-11 w-full rounded-lg bg-[#4CAF50] px-6 py-3 font-medium text-white transition-colors hover:bg-[#45A049] disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
          >
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>
      </div>

      {/* Статистика */}
      <MasterLoyaltyStats stats={stats} />

      {/* История */}
      <MasterLoyaltyHistory
        transactions={history}
        loading={historyLoading}
        error={historyError}
        errorType={historyErrorType}
        skip={historySkip}
        limit={historyLimit}
        hasMore={historyHasMore}
        onSkipChange={setHistorySkip}
        onShowFilters={() => setShowFiltersModal(true)}
        appliedFilters={appliedFilters}
      />

      {/* Модалка фильтров */}
      <MasterLoyaltyHistoryFiltersModal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        filters={appliedFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />
    </div>
  )
}
