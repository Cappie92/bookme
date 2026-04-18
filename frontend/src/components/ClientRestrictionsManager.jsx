import React, { useState, useEffect } from 'react'
import { masterZClass } from '../config/masterOverlayZIndex'
import { lockMasterBodyScroll, unlockMasterBodyScroll } from '../utils/masterBodyScrollLock'
import { 
  UserPlusIcon, 
  UserMinusIcon, 
  ExclamationTriangleIcon, 
  CreditCardIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const ClientRestrictionsManager = ({ 
  salonId, 
  indieMasterId, 
  apiEndpoint,
  onRestrictionsChange,
  hasAccess = true,
  onOpenSubscriptionModal
}) => {
  const isMaster = apiEndpoint && apiEndpoint.includes('/master/restrictions')
  
  const [restrictions, setRestrictions] = useState({
    blacklist: [],
    advance_payment_only: [],
    total_restrictions: 0
  })
  const [rules, setRules] = useState([]) // Автоматические правила (только для мастеров)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRestriction, setEditingRestriction] = useState(null)
  const [showAddRuleForm, setShowAddRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  
  // Форма добавления/редактирования ограничения
  const [formData, setFormData] = useState({
    client_phone: '',
    restriction_type: 'blacklist',
    reason: ''
  })
  
  // Форма добавления/редактирования правила
  const [ruleFormData, setRuleFormData] = useState({
    cancellation_reason: 'client_no_show',
    cancel_count: 2,
    period_days: 30,
    restriction_type: 'blacklist'
  })
  
  // Причины отмены
  const cancellationReasons = {
    'client_requested': 'Клиент попросил отменить',
    'client_no_show': 'Клиент не пришел на запись',
    'mutual_agreement': 'Обоюдное согласие',
    'master_unavailable': 'Мастер не может оказать услугу'
  }
  
  const periodOptions = [
    { value: 30, label: '30 дней' },
    { value: 60, label: '60 дней' },
    { value: 90, label: '90 дней' },
    { value: 180, label: '180 дней' },
    { value: 365, label: '365 дней' },
    { value: null, label: 'Все время (∞)' }
  ]

  useEffect(() => {
    loadRestrictions()
    if (isMaster) {
      loadRules()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRestrictions = async () => {
    try {
      setLoading(true)
      const baseUrl = apiEndpoint.startsWith('/') ? '' : '/api'
      const response = await fetch(`${baseUrl}${apiEndpoint}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setRestrictions(data)
      } else {
        setError('Ошибка загрузки ограничений')
      }
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }
  
  const loadRules = async () => {
    try {
      const baseUrl = '/api'
      const response = await fetch(`${baseUrl}/master/restriction-rules`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setRules(data)
      }
    } catch (error) {
      console.error('Ошибка загрузки правил:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
      try {
        const baseUrl = apiEndpoint.startsWith('/') ? '' : '/api'
        const url = editingRestriction 
          ? `${baseUrl}${apiEndpoint}/${editingRestriction.id}`
          : `${baseUrl}${apiEndpoint}`
      
      const method = editingRestriction ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        await loadRestrictions()
        resetForm()
        onRestrictionsChange?.()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка сохранения')
      }
    } catch {
      setError('Ошибка сети')
    }
  }

  const handleDelete = async (restrictionId) => {
    if (!confirm('Вы уверены, что хотите удалить это ограничение?')) return
    
    try {
      const baseUrl = apiEndpoint.startsWith('/') ? '' : '/api'
      const response = await fetch(`${baseUrl}${apiEndpoint}/${restrictionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        await loadRestrictions()
        onRestrictionsChange?.()
      } else {
        setError('Ошибка удаления')
      }
    } catch {
      setError('Ошибка сети')
    }
  }

  const handleEdit = (restriction) => {
    resetRuleForm()
    setEditingRestriction(restriction)
    setFormData({
      client_phone: restriction.client_phone,
      restriction_type: restriction.restriction_type,
      reason: restriction.reason || ''
    })
    setShowAddForm(true)
  }

  const resetForm = () => {
    setFormData({
      client_phone: '',
      restriction_type: 'blacklist',
      reason: ''
    })
    setEditingRestriction(null)
    setShowAddForm(false)
    setError('')
  }
  
  const handleRuleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const baseUrl = '/api'
      const url = editingRule
        ? `${baseUrl}/master/restriction-rules/${editingRule.id}`
        : `${baseUrl}/master/restriction-rules`
      
      const method = editingRule ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(ruleFormData)
      })
      
      if (response.ok) {
        await loadRules()
        resetRuleForm()
        onRestrictionsChange?.()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка сохранения правила')
      }
    } catch {
      setError('Ошибка сети')
    }
  }
  
  const handleRuleDelete = async (ruleId) => {
    if (!confirm('Вы уверены, что хотите удалить это правило?')) return
    
    try {
      const baseUrl = '/api'
      const response = await fetch(`${baseUrl}/master/restriction-rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        await loadRules()
        onRestrictionsChange?.()
      } else {
        setError('Ошибка удаления правила')
      }
    } catch {
      setError('Ошибка сети')
    }
  }
  
  const handleRuleEdit = (rule) => {
    resetForm()
    setEditingRule(rule)
    setRuleFormData({
      cancellation_reason: rule.cancellation_reason,
      cancel_count: rule.cancel_count,
      period_days: rule.period_days,
      restriction_type: rule.restriction_type
    })
    setShowAddRuleForm(true)
  }
  
  const resetRuleForm = () => {
    setRuleFormData({
      cancellation_reason: 'client_no_show',
      cancel_count: 2,
      period_days: 30,
      restriction_type: 'blacklist'
    })
    setEditingRule(null)
    setShowAddRuleForm(false)
    setError('')
  }

  const formatPhone = (phone) => {
    // Форматируем телефон для отображения
    if (phone.startsWith('+7')) {
      return `+7 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8, 10)}-${phone.slice(10, 12)}`
    }
    return phone
  }

  const restrictionSheetsOpen = hasAccess && (showAddForm || showAddRuleForm)

  useEffect(() => {
    if (!restrictionSheetsOpen) return undefined
    const mq = window.matchMedia('(max-width: 1023px)')
    let locked = false
    const sync = () => {
      if (mq.matches) {
        if (!locked) {
          lockMasterBodyScroll()
          locked = true
        }
      } else if (locked) {
        unlockMasterBodyScroll()
        locked = false
      }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      if (locked) unlockMasterBodyScroll()
    }
  }, [restrictionSheetsOpen])

  useEffect(() => {
    if (!hasAccess || (!showAddForm && !showAddRuleForm)) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (showAddRuleForm) resetRuleForm()
      else if (showAddForm) resetForm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasAccess, showAddForm, showAddRuleForm])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 relative">
      {/* Автоматические правила (только для мастеров) */}
      {isMaster && (
        <div className="rounded-lg border bg-white p-4 lg:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-medium text-gray-900">Автоматические правила</h3>
              <p className="text-sm text-gray-600">
                Правила для автоматического создания ограничений на основе причин отмены
              </p>
            </div>
            {hasAccess && (
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setShowAddRuleForm(true)
                }}
                className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#4CAF50] px-4 py-2 text-white transition-colors hover:bg-[#43a047] sm:w-auto"
              >
                <UserPlusIcon className="h-4 w-4" />
                <span>Добавить правило</span>
              </button>
            )}
          </div>

          {/* Форма добавления/редактирования правила */}
          {hasAccess && showAddRuleForm && (
            <>
              <div
                className={`fixed inset-0 ${masterZClass('bookingDetail')} bg-black/50 lg:hidden`}
                aria-hidden
                onClick={resetRuleForm}
              />
              <div className={`fixed inset-x-0 bottom-0 ${masterZClass('bookingCancel')} max-h-[min(92dvh,900px)] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-gray-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] lg:relative lg:inset-auto lg:bottom-auto lg:z-auto lg:mb-4 lg:max-h-none lg:rounded-lg lg:border lg:p-6 lg:pb-6 lg:shadow-none`}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h4 className="text-lg font-medium">
                  {editingRule ? 'Редактировать правило' : 'Добавить правило'}
                </h4>
                <button
                  type="button"
                  onClick={resetRuleForm}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                  aria-label="Закрыть"
                >
                  <XMarkIcon className="h-6 w-6" strokeWidth={2} />
                </button>
              </div>

              <form onSubmit={handleRuleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Причина отмены <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={ruleFormData.cancellation_reason}
                    onChange={(e) => setRuleFormData({...ruleFormData, cancellation_reason: e.target.value})}
                    className="min-h-10 w-full rounded border px-3 py-2"
                    required
                  >
                    {Object.entries(cancellationReasons).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Количество отмен <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={ruleFormData.cancel_count}
                      onChange={(e) => setRuleFormData({...ruleFormData, cancel_count: parseInt(e.target.value)})}
                      className="min-h-10 w-full rounded border px-3 py-2"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Период проверки <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={ruleFormData.period_days === null ? 'null' : ruleFormData.period_days}
                      onChange={(e) => setRuleFormData({...ruleFormData, period_days: e.target.value === 'null' ? null : parseInt(e.target.value)})}
                      className="min-h-10 w-full rounded border px-3 py-2"
                      required
                    >
                      {periodOptions.map((option) => (
                        <option key={option.value === null ? 'null' : option.value} value={option.value === null ? 'null' : option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Тип ограничения <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={ruleFormData.restriction_type}
                    onChange={(e) => setRuleFormData({...ruleFormData, restriction_type: e.target.value})}
                    className="min-h-10 w-full rounded border px-3 py-2"
                    required
                  >
                    <option value="blacklist">Черный список</option>
                    <option value="advance_payment_only">Только предоплата</option>
                  </select>
                </div>

                {error && (
                  <div className="text-sm text-red-600">{error}</div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="submit"
                    className="min-h-11 rounded bg-[#4CAF50] px-4 py-3 text-white transition-colors hover:bg-[#43a047] sm:min-h-0 sm:py-2"
                  >
                    {editingRule ? 'Сохранить' : 'Добавить'}
                  </button>
                  <button
                    type="button"
                    onClick={resetRuleForm}
                    className="min-h-11 rounded bg-gray-200 px-4 py-3 text-gray-700 transition-colors hover:bg-gray-300 sm:min-h-0 sm:py-2"
                  >
                    Отмена
                  </button>
                </div>
              </form>
              </div>
            </>
          )}

          {/* Список правил */}
          {rules.length === 0 ? (
            <p className="text-gray-500 text-sm">Правила не созданы</p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">
                      {cancellationReasons[rule.cancellation_reason]}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      После {rule.cancel_count} {rule.cancel_count === 1 ? 'отмены' : 'отмен'} за {rule.period_days ? `${rule.period_days} дней` : 'все время'} применяется:{' '}
                      <span className={rule.restriction_type === 'blacklist' ? 'font-semibold text-red-600' : 'font-semibold text-green-700'}>
                        {rule.restriction_type === 'blacklist' ? 'Черный список' : 'Только предоплата'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Создано: {new Date(rule.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1 sm:space-x-2">
                    <button
                      type="button"
                      onClick={() => handleRuleEdit(rule)}
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[#4CAF50] hover:bg-green-50 hover:text-[#388e3c]"
                      title="Редактировать"
                      aria-label="Редактировать правило"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRuleDelete(rule.id)}
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                      title="Удалить"
                      aria-label="Удалить правило"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="border-t my-6"></div>
      {/* Серая плашка для плана без доступа */}
      {!hasAccess && (
        <div 
          className="absolute inset-0 bg-gray-800 bg-opacity-70 rounded-lg z-10 flex items-center justify-center cursor-pointer hover:[&_p]:no-underline"
          onClick={() => {
            if (onOpenSubscriptionModal) {
              onOpenSubscriptionModal();
            } else {
              window.location.href = '/master?tab=tariff';
            }
          }}
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <div className="max-w-md px-4 py-8 text-center sm:px-8">
            <p className="text-white text-xl font-semibold mb-2 underline">
              Доступно в подписке Pro
            </p>
            <p className="text-gray-200 text-sm underline">
              Обновите подписку для доступа к ограничениям клиентов
            </p>
          </div>
        </div>
      )}
      
      {/* Заголовок и статистика */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-medium text-gray-900">Ограничения клиентов</h3>
          <p className="text-sm text-gray-600">
            Всего ограничений: {restrictions.total_restrictions}
          </p>
        </div>
        {hasAccess && (
          <button
            type="button"
            onClick={() => {
              resetRuleForm()
              setShowAddForm(true)
            }}
            className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#4CAF50] px-4 py-2 text-white transition-colors hover:bg-[#43a047] sm:w-auto"
          >
            <UserPlusIcon className="h-4 w-4" />
            <span>Добавить ограничение</span>
          </button>
        )}
      </div>

      {/* Форма добавления/редактирования */}
      {hasAccess && showAddForm && (
        <>
          <div
            className={`fixed inset-0 ${masterZClass('bookingDetail')} bg-black/50 lg:hidden`}
            aria-hidden
            onClick={resetForm}
          />
          <div className={`fixed inset-x-0 bottom-0 ${masterZClass('bookingCancel')} max-h-[min(92dvh,900px)] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] lg:relative lg:inset-auto lg:bottom-auto lg:z-auto lg:max-h-none lg:rounded-lg lg:border lg:p-6 lg:pb-6 lg:shadow-none`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h4 className="text-lg font-medium">
              {editingRestriction ? 'Редактировать ограничение' : 'Добавить ограничение'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Закрыть"
            >
              <XMarkIcon className="h-6 w-6" strokeWidth={2} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Номер телефона клиента <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.client_phone}
                onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                placeholder="+7XXXXXXXXXX"
                className="min-h-10 w-full rounded border px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Тип ограничения <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.restriction_type}
                onChange={(e) => setFormData({...formData, restriction_type: e.target.value})}
                className="min-h-10 w-full rounded border px-3 py-2"
                required
              >
                <option value="blacklist">Черный список</option>
                <option value="advance_payment_only">Только предоплата</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Причина (необязательно)
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                placeholder="Укажите причину ограничения..."
                className="h-24 w-full rounded border px-3 py-2"
                maxLength={500}
              />
              <p className="mt-1 text-xs text-gray-500">
                {formData.reason.length}/500 символов
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="submit"
                className="min-h-11 rounded bg-[#4CAF50] px-4 py-3 text-white transition-colors hover:bg-[#43a047] sm:min-h-0 sm:py-2"
              >
                {editingRestriction ? 'Сохранить' : 'Добавить'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-11 rounded bg-gray-200 px-4 py-3 text-gray-700 transition-colors hover:bg-gray-300 sm:min-h-0 sm:py-2"
              >
                Отмена
              </button>
            </div>
          </form>
          </div>
        </>
      )}

      {/* Черный список */}
      <div className="rounded-lg border bg-white p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <UserMinusIcon className="h-5 w-5 shrink-0 text-red-600" />
          <h4 className="text-lg font-medium text-gray-900">Черный список</h4>
          <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">
            {restrictions.blacklist.length}
          </span>
        </div>
        
        {restrictions.blacklist.length === 0 ? (
          <p className="text-gray-500 text-sm">Черный список пуст</p>
        ) : (
          <div className="space-y-3">
            {restrictions.blacklist.map((restriction) => (
              <div key={restriction.id} className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="break-all font-medium text-gray-900">
                    {formatPhone(restriction.client_phone)}
                  </div>
                  {restriction.reason && (
                    <div className="mt-1 text-sm text-gray-600">
                      Причина: {restriction.reason}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">
                    Добавлено: {new Date(restriction.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(restriction)}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[#4CAF50] hover:bg-white/80 hover:text-[#388e3c]"
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(restriction.id)}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-red-600 hover:bg-white/80 hover:text-red-700"
                    title="Удалить"
                    aria-label="Удалить"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Только предоплата */}
      <div className="rounded-lg border bg-white p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CreditCardIcon className="h-5 w-5 shrink-0 text-[#4CAF50]" />
          <h4 className="text-lg font-medium text-gray-900">Только предоплата</h4>
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-800">
            {restrictions.advance_payment_only.length}
          </span>
        </div>
        
        {restrictions.advance_payment_only.length === 0 ? (
          <p className="text-gray-500 text-sm">Список пуст</p>
        ) : (
          <div className="space-y-3">
            {restrictions.advance_payment_only.map((restriction) => (
              <div key={restriction.id} className="flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="break-all font-medium text-gray-900">
                    {formatPhone(restriction.client_phone)}
                  </div>
                  {restriction.reason && (
                    <div className="mt-1 text-sm text-gray-600">
                      Причина: {restriction.reason}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">
                    Добавлено: {new Date(restriction.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(restriction)}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[#4CAF50] hover:bg-white/80 hover:text-[#388e3c]"
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(restriction.id)}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-red-600 hover:bg-white/80 hover:text-red-700"
                    title="Удалить"
                    aria-label="Удалить"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Информация */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#4CAF50]" />
          <div className="min-w-0 text-sm text-green-800">
            <p className="font-medium mb-2">Как работают ограничения:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>Черный список:</strong> Клиент не сможет забронировать время</li>
              <li><strong>Только предоплата:</strong> Клиент сможет забронировать только с предоплатой</li>
              <li>Ограничения применяются по номеру телефона</li>
              {isMaster && (
                <li><strong>Автоматические правила:</strong> Ограничения создаются автоматически на основе причин отмены записей</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClientRestrictionsManager
