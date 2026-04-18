import React, { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api'
import { Button, Tabs } from './ui'
import { useAuth } from '../contexts/AuthContext'
import {
  normalizeConditionsForApi,
  isConditionTypeSupported,
} from '../utils/loyaltyConditions'
import MasterLoyalty from './MasterLoyalty'
import { QuickDiscountsHub } from './loyalty/QuickDiscountsHub'

export default function LoyaltySystem({ hasLoyaltyAccess = false, masterSettings = null, onOpenSettings = null }) {
  const onboardingCompleted = Boolean(masterSettings?.timezone_confirmed)
  const createDisabled = hasLoyaltyAccess && !onboardingCompleted
  const { isAuthenticated, loading: authLoading } = useAuth()
  // Верхние табы: Скидки / Баллы
  const [mainTab, setMainTab] = useState('discounts') // 'discounts' | 'points'
  // Подтабы для Скидок
  const [activeTab, setActiveTab] = useState('quick')
  const [templates, setTemplates] = useState([])
  const [quickDiscounts, setQuickDiscounts] = useState([])
  const [complexDiscounts, setComplexDiscounts] = useState([])
  const [personalDiscounts, setPersonalDiscounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState('error') // 'error' | 'warning' | 'info'
  const [subscriptionRequired, setSubscriptionRequired] = useState(false) // 403 + X-Error-Code: SUBSCRIPTION_REQUIRED
  const [showComplexForm, setShowComplexForm] = useState(false)
  const [complexForm, setComplexForm] = useState({
    name: '',
    description: '',
    discount_percent: '',
    conditions: []
  })

  useEffect(() => {
    if (activeTab === 'complex') setActiveTab('quick')
  }, [activeTab])

  useEffect(() => {
    // Auth gating: не делаем запросы до готовности auth
    if (authLoading) {
      return
    }

    // Не делаем запросы, если нет доступа к лояльности
    if (hasLoyaltyAccess === false) {
      setLoading(false)
      setTemplates([])
      setQuickDiscounts([])
      setComplexDiscounts([])
      setPersonalDiscounts([])
      return
    }

    // Проверяем токен и авторизацию
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated) {
      setLoading(false)
      setTemplates([])
      setQuickDiscounts([])
      setComplexDiscounts([])
      setPersonalDiscounts([])
      return
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoyaltyAccess, authLoading, isAuthenticated])

  const loadData = async () => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setErrorType('error')
    setSubscriptionRequired(false)
    
    try {
      // Загружаем шаблоны быстрых скидок
      try {
        const templatesData = await apiGet('/api/loyalty/templates')
        setTemplates(templatesData)
      } catch (err) {
        // Игнорируем ошибки загрузки шаблонов (эндпоинт может не существовать)
        // Эндпоинт может не существовать - это нормально
        const status = err.response?.status
        if (status === 404 || status === 403) {
          setTemplates([])
        } else if (status === 401) {
          // 401 обрабатывается ниже в основном блоке
          throw err
        } else {
          if (__DEV__) {
            console.warn('Эндпоинт /api/loyalty/templates недоступен (может быть не реализован):', err)
          }
          setTemplates([])
        }
      }

      // Загружаем статус системы лояльности
      try {
        const statusData = await apiGet('/api/loyalty/status')
        setQuickDiscounts(statusData.quick_discounts || [])
        setComplexDiscounts(statusData.complex_discounts || [])
        setPersonalDiscounts(statusData.personal_discounts || [])
        setError('')
        setErrorType('error')
        setSubscriptionRequired(false)
      } catch (err) {
        const status = err.response?.status
        const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
        const errorData = err.response?.data || {}
        
        if (status === 409) {
          // Обработка ошибки схемы БД (SCHEMA_OUTDATED)
          if (errorCode === 'SCHEMA_OUTDATED') {
            // Плоский JSON: errorData.detail, errorData.hint напрямую
            const errorMessage = errorData.detail || 'Схема базы данных устарела'
            const hint = errorData.hint || 'Run alembic upgrade head'
            setError(`${errorMessage}. ${hint}`)
            setErrorType('warning')
            setSubscriptionRequired(false)
          } else {
            // Другая 409 ошибка
            const errorMessage = typeof errorData.detail === 'string' 
              ? errorData.detail 
              : errorData.detail?.detail || JSON.stringify(errorData.detail) || 'Ошибка конфликта'
            setError(errorMessage)
            setErrorType('error')
            setSubscriptionRequired(false)
          }
        } else if (status === 404) {
          // Профиль мастера не найден - показываем явное сообщение
          const errorMessage = errorData.detail || 'Профиль мастера не найден'
          setError(`${errorMessage}. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку.`)
          setErrorType('error')
          setSubscriptionRequired(false)
          setQuickDiscounts([])
          setComplexDiscounts([])
          setPersonalDiscounts([])
        } else if (status === 401) {
          // 401 при наличии токена - очищаем токен и редиректим
          const token = localStorage.getItem('access_token')
          if (token) {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            localStorage.removeItem('user_role')
            setError('Сессия истекла. Пожалуйста, войдите снова.')
            setErrorType('error')
            setSubscriptionRequired(false)
            setQuickDiscounts([])
            setComplexDiscounts([])
            setPersonalDiscounts([])
            setTimeout(() => {
              window.location.href = '/login'
            }, 2000)
          }
        } else if (status === 403) {
          const detail = typeof errorData.detail === 'string' ? errorData.detail : errorData.detail?.detail || ''

          setQuickDiscounts([])
          setComplexDiscounts([])
          setPersonalDiscounts([])

          if (errorCode === 'SUBSCRIPTION_REQUIRED') {
            setSubscriptionRequired(true)
            setError('')
            setErrorType('error')
          } else {
            setSubscriptionRequired(false)
            setError(detail || 'Доступ запрещён. Проверьте права доступа.')
            setErrorType('error')
          }
        } else {
          // Сетевая ошибка или другая непредвиденная ошибка
          setSubscriptionRequired(false)
          const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.detail?.detail || JSON.stringify(errorData.detail) || 'Ошибка загрузки данных'
          setError(errorMessage || 'Ошибка подключения к серверу')
          setErrorType('error')
          setQuickDiscounts([])
          setComplexDiscounts([])
          setPersonalDiscounts([])
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки данных лояльности:', err)
      setError('Ошибка загрузки данных')
      setErrorType('error')
      setSubscriptionRequired(false)
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePersonalDiscount = async (formData) => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) {
      setError('Необходима авторизация')
      return false
    }

    try {
      await apiPost('/api/loyalty/personal-discounts', formData)
      await loadData()
      return true
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        // 401 - очищаем токен и редиректим
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        setError('Сессия истекла. Пожалуйста, войдите снова.')
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
        return false
      } else {
        const errorData = err.response?.data || {}
        setError(errorData.detail || 'Ошибка создания персональной скидки')
        return false
      }
    }
  }

  const handleCreateComplexDiscount = async (formData) => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) {
      setError('Необходима авторизация')
      return false
    }

    // Нормализуем conditions перед отправкой
    const normalizedConditions = normalizeConditionsForApi(formData.conditions)
    
    // Проверяем, что после нормализации есть condition_type
    if (!normalizedConditions.condition_type || Object.keys(normalizedConditions.parameters || {}).length === 0) {
      setError('Необходимо добавить хотя бы одно условие для сложной скидки')
      return false
    }

    // Валидация: проверяем, что condition_type поддерживается
    if (!isConditionTypeSupported(normalizedConditions.condition_type)) {
      setError(
        `Неподдерживаемый тип условия: ${normalizedConditions.condition_type}. ` +
        `Поддерживаемые типы: первая запись, возвращение клиента, регулярные визиты, счастливые часы, скидка на услуги`
      )
      return false
    }

    // Логирование для отладки
    if (__DEV__) {
      console.log('[LoyaltySystem] Creating complex discount:', {
        condition_type: normalizedConditions.condition_type,
        parameters: normalizedConditions.parameters,
        discount_name: formData.name,
      })
    }

    try {
      await apiPost('/api/loyalty/complex-discounts', {
        discount_type: 'complex',
        name: formData.name,
        description: formData.description,
        discount_percent: parseFloat(formData.discount_percent),
        max_discount_amount: null,
        conditions: normalizedConditions,
        is_active: true,
        priority: 1
      })
      await loadData()
      setShowComplexForm(false)
      setComplexForm({
        name: '',
        description: '',
        discount_percent: '',
        conditions: []
      })
      return true
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        // 401 - очищаем токен и редиректим
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        setError('Сессия истекла. Пожалуйста, войдите снова.')
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
        return false
      } else {
        const errorData = err.response?.data || {}
        setError(errorData.detail || 'Ошибка создания сложной скидки')
        return false
      }
    }
  }

  const handleDeleteComplexDiscount = async (discountId) => {
    if (!confirm('Деактивировать скидку? Она перестанет применяться к новым записям. Уже оформленные записи не изменятся.')) return

    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) {
      setError('Необходима авторизация')
      return
    }

    try {
      await apiPut(`/api/loyalty/complex-discounts/${discountId}`, { is_active: false })
      await loadData()
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        // 401 - очищаем токен и редиректим
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        setError('Сессия истекла. Пожалуйста, войдите снова.')
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      } else {
        const errorData = err.response?.data || {}
        setError(errorData.detail || 'Ошибка деактивации скидки')
      }
    }
  }

  const handleDeletePersonalDiscount = async (discountId) => {
    if (!confirm('Деактивировать скидку? Она перестанет применяться к новым записям. Уже оформленные записи не изменятся.')) return

    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) {
      setError('Необходима авторизация')
      return
    }

    try {
      await apiPut(`/api/loyalty/personal-discounts/${discountId}`, { is_active: false })
      await loadData()
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        setError('Сессия истекла. Пожалуйста, войдите снова.')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else {
        const errorData = err.response?.data || {}
        setError(errorData.detail || 'Ошибка деактивации скидки')
      }
    }
  }

  // Показываем loading только для таба "Скидки"
  if (loading && mainTab === 'discounts') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="pt-0.5">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Лояльность</h1>
      </div>

      {/* Главный уровень: Скидки / Баллы — сегмент как во вложенных табах */}
      <div className="flex w-full max-w-full rounded-xl border border-gray-200/90 bg-gray-50/90 p-0.5 sm:inline-flex sm:w-auto">
        <button
          type="button"
          onClick={() => setMainTab('discounts')}
          className={`min-h-10 flex-1 rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors sm:min-h-9 sm:flex-none sm:px-4 sm:py-1.5 ${
            mainTab === 'discounts'
              ? 'bg-white text-[#4CAF50] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Скидки
        </button>
        <button
          type="button"
          onClick={() => setMainTab('points')}
          className={`min-h-10 flex-1 rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors sm:min-h-9 sm:flex-none sm:px-4 sm:py-1.5 ${
            mainTab === 'points'
              ? 'bg-white text-[#4CAF50] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Баллы
        </button>
      </div>

      {/* Контент для таба "Скидки" */}
      {mainTab === 'discounts' && (
        <>
          {subscriptionRequired && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 sm:p-6">
              <p className="mb-2 text-sm text-yellow-800 sm:text-base">
                Доступ к разделу «Лояльность» доступен в подписке. Обновите тариф, чтобы пользоваться скидками.
              </p>
              <a href="/master?tab=tariff" className="inline-flex min-h-10 items-center font-medium text-blue-600 underline">
                Обновить подписку
              </a>
            </div>
          )}

          {createDisabled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-amber-800 mb-2">
                Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно до завершения.
              </p>
              {typeof onOpenSettings === 'function' && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-amber-900 font-medium underline hover:no-underline"
                >
                  Перейти в настройки
                </button>
              )}
            </div>
          )}

          {error && (
            <div className={
              errorType === 'warning'
                ? "bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded"
                : "bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
            }>
              {error}
            </div>
          )}

          {/* Вложенный уровень только для «Скидки»: отделён от главного переключателя */}
          <div className="mt-2 space-y-3 border-t border-gray-200/90 pt-3 sm:pt-4">
            <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-2.5 py-2 sm:px-3 sm:py-2.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Тип скидок
              </p>
              <Tabs
                variant="segmented"
                segmentedCompact
                tabs={[
                  { value: 'quick', label: 'Правила' },
                  { value: 'personal', label: 'Персональные' },
                ]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>

          {/* Контент подтабов */}
          {activeTab === 'quick' && (
            <QuickDiscountsHub
              templates={templates}
              discounts={quickDiscounts}
              createDisabled={createDisabled}
              loadData={loadData}
              setError={setError}
              isAuthenticated={isAuthenticated}
              authLoading={authLoading}
            />
          )}

          {activeTab === 'personal' && (
            <PersonalDiscountsTab
              discounts={personalDiscounts}
              onCreateDiscount={handleCreatePersonalDiscount}
              onDeleteDiscount={handleDeletePersonalDiscount}
              createDisabled={createDisabled}
            />
          )}
          </div>
        </>
      )}

      {/* Контент для таба "Баллы" */}
      {mainTab === 'points' && (
        <MasterLoyalty />
      )}
    </div>
  )
}

// Компонент для сложных скидок
function ComplexDiscountsTab({
  discounts,
  onDeleteDiscount,
  onCreateDiscount,
  showForm,
  setShowForm,
  form,
  setForm,
  createDisabled = false,
}) {
  const [newCondition, setNewCondition] = useState({
    type: 'first_visit',  // Первый поддерживаемый тип по умолчанию
    operator: '>=',
    value: '',
    description: ''
  })

  const addCondition = () => {
    if (newCondition.value && newCondition.description) {
      setForm({
        ...form,
        conditions: [...form.conditions, { ...newCondition }]
      })
      setNewCondition({
        type: 'visits_count',
        operator: '>=',
        value: '',
        description: ''
      })
    }
  }

  const removeCondition = (index) => {
    setForm({
      ...form,
      conditions: form.conditions.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (form.name && form.description && form.discount_percent && form.conditions.length > 0) {
      onCreateDiscount(form)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Сложные скидки</h2>
        <p className="text-gray-600 mb-6">
          Настройка скидок с несколькими условиями
        </p>
      </div>

      {/* Форма создания сложной скидки */}
      {showForm ? (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Создать сложную скидку</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Название скидки
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Например: VIP клиенты"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Описание
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Описание условий скидки"
                rows="3"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Размер скидки (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
            </div>

            {/* Условия */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Условия скидки
              </label>
              
              {/* Список существующих условий */}
              {form.conditions.length > 0 && (
                <div className="space-y-2 mb-4">
                  {form.conditions.map((condition, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-white border rounded">
                      <span className="text-sm text-gray-600 flex-1">
                        {condition.description}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Добавление нового условия */}
              <div className="border border-gray-300 rounded-md p-4 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                  <select
                    value={newCondition.type}
                    onChange={(e) => setNewCondition({ ...newCondition, type: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="first_visit">Первая запись</option>
                    <option value="returning_client">Возвращение клиента</option>
                    <option value="regular_visits">Регулярные визиты</option>
                    <option value="happy_hours">Счастливые часы</option>
                    <option value="service_discount">Скидка на услуги</option>
                  </select>
                  
                  <select
                    value={newCondition.operator}
                    onChange={(e) => setNewCondition({ ...newCondition, operator: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value=">=">≥</option>
                    <option value=">">&gt;</option>
                    <option value="=">=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">≤</option>
                  </select>
                  
                  <input
                    type="number"
                    value={newCondition.value}
                    onChange={(e) => setNewCondition({ ...newCondition, value: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                    placeholder="Значение"
                  />
                  
                  <button
                    type="button"
                    onClick={addCondition}
                    className="px-3 py-1 bg-[#4CAF50] text-white rounded text-sm hover:bg-[#45A049]"
                  >
                    Добавить
                  </button>
                </div>
                
                <input
                  type="text"
                  value={newCondition.description}
                  onChange={(e) => setNewCondition({ ...newCondition, description: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder="Описание условия (например: 'Более 5 визитов')"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049]"
              >
                Создать скидку
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : (
        <Button
          onClick={() => setShowForm(true)}
          disabled={createDisabled}
          className={`flex items-center gap-2 ${createDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <PlusIcon className="h-5 w-5" />
          Создать сложную скидку
        </Button>
      )}

      {/* Список существующих сложных скидок (только is_active) */}
      {(() => {
        const activeList = discounts.filter((d) => d.is_active)
        return activeList.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Активные сложные скидки</h3>
          <div className="space-y-4">
            {activeList.map((discount) => (
              <div
                key={discount.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{discount.name}</h4>
                  <button
                    onClick={() => onDeleteDiscount(discount.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-2">{discount.description}</p>
                <p className="text-sm text-gray-800 mb-2">Скидка: {discount.discount_percent}%</p>
                
                {discount.conditions && discount.conditions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Условия:</p>
                    <div className="space-y-1">
                      {discount.conditions.map((condition, index) => (
                        <div key={index} className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                          {condition.description}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )
      })()}
    </div>
  )
}

// Компонент для персональных скидок
function PersonalDiscountsTab({ discounts, onCreateDiscount, onDeleteDiscount, createDisabled = false }) {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    client_phone: '',
    discount_percent: '',
    max_discount_amount: '',
    description: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const success = await onCreateDiscount({
      client_phone: formData.client_phone,
      discount_percent: parseFloat(formData.discount_percent),
      max_discount_amount: formData.max_discount_amount ? parseFloat(formData.max_discount_amount) : null,
      description: formData.description || null,
      is_active: true
    })

    if (success) {
      setShowForm(false)
      setFormData({
        client_phone: '',
        discount_percent: '',
        max_discount_amount: '',
        description: ''
      })
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="mb-1 text-lg font-semibold text-gray-900 sm:text-xl">Персональные скидки</h2>
          <p className="text-sm text-gray-600">
            Скидки для конкретных клиентов по номеру телефона
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          disabled={createDisabled}
          className={`flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto ${createDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <PlusIcon className="h-5 w-5" />
          Добавить пользователя
        </Button>
      </div>

      {/* Форма добавления */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold">Добавить персональную скидку</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Номер телефона клиента *
              </label>
              <input
                type="tel"
                required
                value={formData.client_phone}
                onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                placeholder="+7 (999) 123-45-67"
                className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Размер скидки (%) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.discount_percent}
                  onChange={(e) => setFormData({...formData, discount_percent: e.target.value})}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Максимальная сумма скидки (руб.)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.max_discount_amount}
                onChange={(e) => setFormData({...formData, max_discount_amount: e.target.value})}
                placeholder="Оставьте пустым для неограниченной скидки"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Описание
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Описание скидки (необязательно)"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Создать скидку
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Список персональных скидок (только is_active) */}
      {(() => {
        const activeList = discounts.filter((d) => d.is_active)
        return (
        <div className="space-y-2">
          {activeList.map((discount) => (
          <div
            key={discount.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/90 bg-white p-3 shadow-sm"
          >
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-gray-900">{discount.client_phone}</h4>
              {discount.description ? (
                <p className="mt-0.5 text-xs text-gray-600 line-clamp-2">{discount.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-gray-800 sm:text-sm">
                Скидка: <span className="font-medium">{discount.discount_percent}%</span>
                {discount.max_discount_amount && ` (макс. ${discount.max_discount_amount} руб.)`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDeleteDiscount(discount.id)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-red-600 shadow-sm hover:bg-red-50"
              aria-label="Деактивировать персональную скидку"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
          ))}
        </div>
        )
      })()}

      {discounts.filter((d) => d.is_active).length === 0 && !showForm && (
        <div className="text-center py-8 text-gray-500">
          Персональные скидки не настроены
        </div>
      )}
    </div>
  )
} 