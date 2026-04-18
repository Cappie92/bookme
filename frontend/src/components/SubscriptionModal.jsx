import React, { useState, useEffect } from 'react'
import { API_BASE_URL } from '../utils/config'
import { apiGet } from '../utils/api'
import { getPlanFeatures } from '../utils/subscriptionFeatures'
import { getPlanDisplayName } from '../utils/subscriptionPlanNames'
import { useModal } from '../hooks/useModal'

export default function SubscriptionModal({ isOpen, onClose, isFreePlan, currentPlanDisplayOrder }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [serviceFunctions, setServiceFunctions] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedDuration, setSelectedDuration] = useState(null)
  const [calculation, setCalculation] = useState(null)
  const [loadingCalculation, setLoadingCalculation] = useState(false)
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [upgradeType, setUpgradeType] = useState('immediate')
  const [calculationId, setCalculationId] = useState(null)
  const [enableAutoRenewal, setEnableAutoRenewal] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadPlans()
      loadServiceFunctions()
    } else {
      // При закрытии модального окна удаляем snapshot
      if (calculationId) {
        const deleteSnapshot = async () => {
          try {
            const token = localStorage.getItem('access_token')
            await fetch(`${API_BASE_URL}/api/subscriptions/calculate/${calculationId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })
          } catch (error) {
            console.error('Ошибка удаления snapshot:', error)
          }
        }
        deleteSnapshot()
        setCalculationId(null)
      }
      // Сбрасываем состояние
      setSelectedPlan(null)
      setSelectedDuration(null)
      setCalculation(null)
      setEnableAutoRenewal(false)
      setLoadingPayment(false)
    }
  }, [isOpen])

  const loadServiceFunctions = async () => {
    try {
      const data = await apiGet('/api/master/service-functions?is_active=true')
      setServiceFunctions(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Ошибка загрузки функций сервиса:', error)
      setServiceFunctions([])
    }
  }

  const loadPlans = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/subscription-plans/available?subscription_type=master`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        // Фильтруем Free план и AlwaysFree план (скрытый план для is_always_free пользователей)
        const filteredPlans = data.filter(plan => plan.name !== 'Free' && plan.name !== 'AlwaysFree')
        // Сортируем по display_order
        filteredPlans.sort((a, b) => a.display_order - b.display_order)
        setPlans(filteredPlans)
      }
    } catch (error) {
      console.error('Ошибка загрузки тарифов:', error)
    } finally {
      setLoading(false)
    }
  }

  const getMonthlyPrice = (plan, durationMonths) => {
    // Получаем цену за месяц для выбранного периода
    if (durationMonths === 1) {
      return plan.price_1month || 0
    } else if (durationMonths === 3) {
      return plan.price_3months || 0
    } else if (durationMonths === 6) {
      return plan.price_6months || 0
    } else if (durationMonths === 12) {
      return plan.price_12months || 0
    }
    return 0
  }

  const getMinMonthlyPrice = (plan) => {
    // Берем минимальную месячную цену из всех периодов
    return Math.min(
      plan.price_1month || Infinity,
      plan.price_3months || Infinity,
      plan.price_6months || Infinity,
      plan.price_12months || Infinity
    )
  }

  const deleteCalculationSnapshot = async (id) => {
    try {
      const token = localStorage.getItem('access_token')
      await fetch(`${API_BASE_URL}/api/subscriptions/calculate/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
    } catch (error) {
      console.error('Ошибка удаления snapshot:', error)
    }
  }

  const handlePlanSelect = (plan) => {
    // Если выбран другой план, сбрасываем только расчет, но сохраняем период если он был выбран
    if (selectedPlan && selectedPlan.id !== plan.id) {
      setCalculation(null)
      if (calculationId) {
        deleteCalculationSnapshot(calculationId)
        setCalculationId(null)
      }
    }
    setSelectedPlan(plan)
    
    // Определяем upgradeType автоматически
    if (isFreePlan) {
      // Для бесплатного тарифа всегда немедленно
      setUpgradeType('immediate')
    } else if (currentPlanDisplayOrder && plan.display_order < currentPlanDisplayOrder) {
      // Тариф ниже текущего - после окончания
      setUpgradeType('after_expiry')
    } else if (currentPlanDisplayOrder && plan.display_order === currentPlanDisplayOrder) {
      // Тот же тариф - после окончания (продление)
      setUpgradeType('after_expiry')
    } else if (currentPlanDisplayOrder && plan.display_order > currentPlanDisplayOrder) {
      // Тариф выше текущего - по умолчанию немедленно, но можно выбрать
      setUpgradeType('immediate')
    } else {
      // Нет текущей подписки - немедленно
      setUpgradeType('immediate')
    }
    
    // Если был выбран период, пересчитываем для нового плана
    if (selectedDuration) {
      // Используем setTimeout чтобы дать время состоянию обновиться
      setTimeout(() => {
        handleDurationSelect(selectedDuration)
      }, 0)
    }
  }

  const handleDurationSelect = async (durationMonths, opts = {}) => {
    if (!selectedPlan) return
    
    const upgradeTypeToUse = opts.upgradeTypeOverride || upgradeType
    setSelectedDuration(durationMonths)
    setLoadingCalculation(true)
    
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/subscriptions/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: selectedPlan.id,
          duration_months: durationMonths,
          upgrade_type: upgradeTypeToUse
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setCalculation(data)
        if (data?.forced_upgrade_type) {
          setUpgradeType(data.forced_upgrade_type)
        }
        // Сохраняем calculation_id для последующего удаления snapshot
        if (data.calculation_id) {
          setCalculationId(data.calculation_id)
        }
      } else {
        console.error('Ошибка расчета стоимости')
      }
    } catch (error) {
      console.error('Ошибка расчета стоимости:', error)
    } finally {
      setLoadingCalculation(false)
    }
  }

  const handleUpgradeTypeChange = async (newType) => {
    setUpgradeType(newType)
    if (selectedDuration) {
      // Пересчитываем при изменении типа апгрейда
      await handleDurationSelect(selectedDuration, { upgradeTypeOverride: newType })
    }
  }

  const getPlanHighlights = (plan) => {
    const features = getPlanFeatures(plan, serviceFunctions)
    return features
      .filter((f) => f && f.available)
      .slice(0, 5)
      .map((f) => f.text)
      .filter(Boolean)
  }

  const handleSecondaryAction = () => {
    if (selectedPlan || selectedDuration || calculation) {
      handleBack()
      return
    }
    onClose()
  }

  const handlePaymentInit = async () => {
    if (!selectedPlan || !selectedDuration || !calculation) {
      return
    }
    if (Number(calculation.final_price) <= 0) {
      const ok = window.confirm('Доплата не требуется. Применить тариф сейчас?')
      if (!ok) return
      try {
        const token = localStorage.getItem('access_token')
        const resp = await fetch(`${API_BASE_URL}/api/subscriptions/apply-upgrade-free`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ calculation_id: calculationId })
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          alert(err?.detail || 'Не удалось применить тариф')
          return
        }
        alert('Тариф применён. Обновите страницу, если изменения не появились сразу.')
        onClose()
        return
      } catch (e) {
        alert('Не удалось применить тариф. Попробуйте позже.')
        return
      }
    }

    setLoadingPayment(true)
    try {
      const token = localStorage.getItem('access_token')
      
      // Сохраняем состояние модального окна в localStorage для восстановления при ошибке
      const paymentState = {
        planId: selectedPlan.id,
        durationMonths: selectedDuration,
        upgradeType: upgradeType,
        calculationId: calculationId,
        enableAutoRenewal: enableAutoRenewal
      }
      
      // Инициализируем платеж
      const response = await fetch(`${API_BASE_URL}/api/payments/subscription/init`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: selectedPlan.id,
          duration_months: selectedDuration,
          payment_period: 'month', // TODO: Определить период из расчета
          upgrade_type: upgradeType,
          calculation_id: calculationId,
          enable_auto_renewal: enableAutoRenewal
        })
      })

      if (response.ok) {
        const data = await response.json()

        if (data?.requires_payment === false) {
          const ok = window.confirm((data?.message || 'Доплата не требуется') + '\\n\\nПрименить тариф сейчас?')
          if (!ok) return
          const resp = await fetch(`${API_BASE_URL}/api/subscriptions/apply-upgrade-free`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calculation_id: calculationId })
          })
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            alert(err?.detail || 'Не удалось применить тариф')
            return
          }
          alert('Тариф применён. Обновите страницу, если изменения не появились сразу.')
          onClose()
          return
        }
        if (!data?.payment_id || !data?.payment_url) {
          alert('Ошибка инициализации платежа: не получены данные оплаты')
          return
        }
        
        // Сохраняем состояние для восстановления при ошибке
        localStorage.setItem(`payment_state_${data.payment_id}`, JSON.stringify(paymentState))
        
        // Открываем URL оплаты в новом окне
        window.location.href = data.payment_url
      } else {
        const errorData = await response.json()
        alert(`Ошибка инициализации платежа: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch (error) {
      console.error('Ошибка инициализации платежа:', error)
      alert('Произошла ошибка при инициализации платежа. Попробуйте позже.')
    } finally {
      setLoadingPayment(false)
    }
  }


  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = String(date.getFullYear()).slice(-2)
    return `${day}-${month}-${year}`
  }

  const handleBack = () => {
    if (calculation) {
      // Если есть расчет, очищаем только расчет
      setCalculation(null)
      if (calculationId) {
        deleteCalculationSnapshot(calculationId)
        setCalculationId(null)
      }
    } else if (selectedDuration) {
      // Если выбрана продолжительность, очищаем только её
      setSelectedDuration(null)
    } else if (selectedPlan) {
      // Если выбран план, очищаем план и все что после него
      setSelectedPlan(null)
      setSelectedDuration(null)
      setCalculation(null)
      if (calculationId) {
        deleteCalculationSnapshot(calculationId)
        setCalculationId(null)
      }
    }
  }

  // Используем централизованную утилиту для названий планов

  // Функция для форматирования цены с пробелами для тысяч
  const formatPrice = (price) => {
    return Math.round(price).toLocaleString('ru-RU')
  }


  if (!isOpen) return null

  const isUpgrade = currentPlanDisplayOrder && selectedPlan && selectedPlan.display_order > currentPlanDisplayOrder
  const isDowngrade = currentPlanDisplayOrder && selectedPlan && selectedPlan.display_order < currentPlanDisplayOrder
  const isSamePlan = currentPlanDisplayOrder && selectedPlan && selectedPlan.display_order === currentPlanDisplayOrder

  const { handleBackdropClick, handleMouseDown } = useModal(onClose)

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-xl w-full max-w-5xl mx-4 h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900">Управление тарифом</div>
            {selectedPlan ? (
              <div className="text-xs text-gray-500 truncate">{getPlanDisplayName(selectedPlan)}</div>
            ) : (
              <div className="text-xs text-gray-500">Выберите тариф и период</div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-3"></div>
              <p className="text-gray-600">Загрузка тарифов…</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
            {/* Left: plans */}
            <div className="border-b md:border-b-0 md:border-r overflow-y-auto p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Тарифы</div>
              <div className="space-y-2">
                {plans.map((plan) => {
                  const minPrice = getMinMonthlyPrice(plan)
                  const isSelected = selectedPlan && selectedPlan.id === plan.id
                  const isCurrent = !isFreePlan && currentPlanDisplayOrder && plan.display_order === currentPlanDisplayOrder
                  const highlights = getPlanHighlights(plan)
                  return (
                    <button
                      type="button"
                      key={plan.id}
                      onClick={() => handlePlanSelect(plan)}
                      data-testid={`tariff-plan-${plan.name.toLowerCase()}`}
                      className={`w-full text-left border rounded-lg px-3 py-2 transition-colors ${
                        isSelected ? 'border-[#4CAF50] bg-green-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{getPlanDisplayName(plan)}</div>
                            {isCurrent ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700 font-semibold">
                                Текущий
                              </span>
                            ) : null}
                            {isSelected ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 border border-green-200 text-green-800 font-semibold">
                                Выбран
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">от {formatPrice(minPrice)} ₽/мес</div>
                        </div>
                        <div
                          className={`mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'bg-[#4CAF50] border-[#4CAF50]' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isSelected ? <span className="text-white text-xs font-bold">✓</span> : null}
                        </div>
                      </div>
                      {highlights.length > 0 ? (
                        <ul className="mt-2 text-xs text-gray-700 space-y-1">
                          {highlights.slice(0, 5).map((t, idx) => (
                            <li key={idx} className="truncate">
                              • {t}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: period + apply mode + summary */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900 mb-2">Период</div>
                  <div className="inline-flex w-full border rounded-lg overflow-hidden">
                    {[1, 3, 6, 12].map((m) => {
                      const active = selectedDuration === m
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={!selectedPlan}
                          onClick={() => handleDurationSelect(m)}
                          className={`flex-1 px-2 py-2 text-sm font-semibold transition-colors ${
                            !selectedPlan
                              ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                              : active
                              ? 'bg-green-50 text-green-800'
                              : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {m} мес
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">Цена зависит от выбранного периода</div>
                </div>

                {isUpgrade && !isFreePlan ? (
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="text-sm font-semibold text-gray-900 mb-2">Когда применить новый тариф?</div>
                    <div className="inline-flex w-full border rounded-lg overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => handleUpgradeTypeChange('immediate')}
                        className={`flex-1 px-2 py-2 text-sm font-semibold transition-colors ${
                          upgradeType === 'immediate' ? 'bg-green-50 text-green-800' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Немедленно
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpgradeTypeChange('after_expiry')}
                        className={`flex-1 px-2 py-2 text-sm font-semibold transition-colors ${
                          upgradeType === 'after_expiry' ? 'bg-green-50 text-green-800' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        После окончания
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">Можно изменить до оплаты</div>
                  </div>
                ) : null}

                {calculation?.is_downgrade ? (
                  <div className="text-xs text-gray-600 border rounded-lg p-3 bg-gray-50">
                    Тариф будет применён после окончания текущей подписки
                  </div>
                ) : null}

                <div className="border rounded-lg p-3">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Расчет</div>
                  {loadingCalculation ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      Считаем…
                    </div>
                  ) : calculation ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-600">К оплате</span>
                        <span className="font-semibold text-gray-900">{formatPrice(calculation.final_price)} ₽</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-600">Стоимость</span>
                        <span className="font-semibold text-gray-900">{formatPrice(calculation.total_price)} ₽</span>
                      </div>
                      {calculation.savings_percent ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Экономия</span>
                          <span className="font-semibold text-gray-900">{Math.round(calculation.savings_percent)}%</span>
                        </div>
                      ) : null}
                      {(calculation.start_date || calculation.end_date) ? (
                        <div className="text-xs text-gray-500 pt-2 border-t">
                          Период: {formatDate(calculation.start_date)} — {formatDate(calculation.end_date)}
                        </div>
                      ) : null}
                      {calculation.breakdown_text ? (
                        <div className="text-xs text-gray-600">{calculation.breakdown_text}</div>
                      ) : null}
                      {import.meta.env.DEV ? (
                        <details className="pt-2 border-t">
                          <summary className="text-xs text-gray-500 cursor-pointer select-none">Debug preview breakdown</summary>
                          <pre className="mt-2 text-xs bg-gray-50 border rounded p-2 overflow-auto max-h-40">
                            {JSON.stringify(
                              {
                                upgrade_type: calculation.upgrade_type,
                                total_price: calculation.total_price,
                                final_price: calculation.final_price,
                                current_plan_credit: calculation.current_plan_credit,
                                current_plan_accrued: calculation.current_plan_accrued,
                                current_plan_reserved_remaining: calculation.current_plan_reserved_remaining,
                                credit_source: calculation.credit_source,
                                start_date: calculation.start_date,
                                end_date: calculation.end_date
                              },
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Выберите тариф и период</div>
                  )}
                </div>

                <label className={`flex items-center justify-between gap-3 border rounded-lg p-3 ${!calculation ? 'opacity-60' : ''}`}>
                  <span className="text-sm font-semibold text-gray-900">Автопродление</span>
                  <input
                    type="checkbox"
                    checked={enableAutoRenewal}
                    onChange={(e) => setEnableAutoRenewal(e.target.checked)}
                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    disabled={!calculation}
                  />
                </label>
              </div>

              {/* Sticky footer */}
              <div className="border-t p-4 bg-white">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSecondaryAction}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
                  >
                    {selectedPlan || selectedDuration || calculation ? 'Назад' : 'Закрыть'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePaymentInit}
                    data-testid="tariff-payment-button"
                    disabled={!calculation || loadingCalculation || loadingPayment || Number(calculation.final_price) <= 0}
                    className="flex-1 px-4 py-2 rounded-lg bg-[#4CAF50] text-white font-semibold hover:bg-[#45A049] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {Number(calculation?.final_price) <= 0 ? 'Оплата не требуется' : (loadingPayment ? 'Переход…' : 'Перейти к оплате')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

