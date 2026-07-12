import React, { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../utils/config'
import { apiGet } from '../utils/api'
import { getPromoPreviewMessage } from '../utils/promoEngineApi'
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
  const [calculationMeta, setCalculationMeta] = useState(null)
  const [enableAutoRenewal, setEnableAutoRenewal] = useState(false)
  const [useSubscriptionPoints, setUseSubscriptionPoints] = useState(false)
  const [subscriptionPointsToUse, setSubscriptionPointsToUse] = useState(0)
  const calculationRequestIdRef = useRef(0)
  const calculationIdRef = useRef(null)

  useEffect(() => {
    calculationIdRef.current = calculationId
  }, [calculationId])

  useEffect(() => {
    if (isOpen) {
      loadPlans()
      loadServiceFunctions()
    } else {
      calculationRequestIdRef.current += 1
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
      setCalculationMeta(null)
      setCalculationId(null)
      calculationIdRef.current = null
      setLoadingCalculation(false)
      setEnableAutoRenewal(false)
      setUseSubscriptionPoints(false)
      setSubscriptionPointsToUse(0)
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
    setSelectedPlan(plan)
    
    // Определяем upgradeType автоматически
    let nextUpgradeType = 'immediate'
    if (isFreePlan) {
      // Для бесплатного тарифа всегда немедленно
      nextUpgradeType = 'immediate'
    } else if (currentPlanDisplayOrder && plan.display_order < currentPlanDisplayOrder) {
      // Тариф ниже текущего - после окончания
      nextUpgradeType = 'after_expiry'
    } else if (currentPlanDisplayOrder && plan.display_order === currentPlanDisplayOrder) {
      // Тот же тариф - после окончания (продление)
      nextUpgradeType = 'after_expiry'
    } else if (currentPlanDisplayOrder && plan.display_order > currentPlanDisplayOrder) {
      // Тариф выше текущего - по умолчанию немедленно, но можно выбрать
      nextUpgradeType = 'immediate'
    } else {
      // Нет текущей подписки - немедленно
      nextUpgradeType = 'immediate'
    }
    setUpgradeType(nextUpgradeType)
  }

  const calculateSubscription = async (plan, durationMonths, upgradeTypeToUse, pointsToUse = 0) => {
    if (!plan || !durationMonths) return
    
    const requestId = calculationRequestIdRef.current + 1
    calculationRequestIdRef.current = requestId

    const previousCalculationId = calculationIdRef.current
    if (previousCalculationId) {
      deleteCalculationSnapshot(previousCalculationId)
      calculationIdRef.current = null
      setCalculationId(null)
    }

    setCalculation(null)
    setCalculationMeta(null)
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
          plan_id: plan.id,
          duration_months: durationMonths,
          upgrade_type: upgradeTypeToUse,
          subscription_points_to_use: Math.max(0, Number(pointsToUse) || 0),
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        if (requestId !== calculationRequestIdRef.current) {
          if (data?.calculation_id) deleteCalculationSnapshot(data.calculation_id)
          return
        }
        setCalculation(data)
        setCalculationMeta({
          planId: plan.id,
          durationMonths,
          upgradeType: upgradeTypeToUse,
          requestId,
        })
        if (data?.forced_upgrade_type) {
          setUpgradeType(data.forced_upgrade_type)
        }
        // Сохраняем calculation_id для последующего удаления snapshot
        if (data.calculation_id) {
          calculationIdRef.current = data.calculation_id
          setCalculationId(data.calculation_id)
        }
      } else {
        if (requestId === calculationRequestIdRef.current) {
          console.error('Ошибка расчета стоимости')
        }
      }
    } catch (error) {
      if (requestId === calculationRequestIdRef.current) {
        console.error('Ошибка расчета стоимости:', error)
      }
    } finally {
      if (requestId === calculationRequestIdRef.current) {
        setLoadingCalculation(false)
      }
    }
  }

  const handleDurationSelect = async (durationMonths) => {
    if (!selectedPlan) return
    setSelectedDuration(durationMonths)
  }

  const handleUpgradeTypeChange = async (newType) => {
    setUpgradeType(newType)
  }

  useEffect(() => {
    if (!isOpen || !selectedPlan || !selectedDuration) return
    calculateSubscription(
      selectedPlan,
      selectedDuration,
      upgradeType,
      useSubscriptionPoints ? subscriptionPointsToUse : 0
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedPlan?.id, selectedDuration, upgradeType, useSubscriptionPoints, subscriptionPointsToUse])

  const getPlanHighlights = (plan) => {
    const features = getPlanFeatures(plan, serviceFunctions)
    return features
      .filter((f) => f && f.available)
      .map((f) => f.text)
      .filter(Boolean)
  }

  const hasCurrentCalculation = () => (
    Boolean(
      calculation &&
      calculationMeta &&
      selectedPlan &&
      selectedDuration &&
      calculationMeta.planId === selectedPlan.id &&
      calculationMeta.durationMonths === selectedDuration &&
      calculationMeta.upgradeType === upgradeType
    )
  )

  const handlePaymentInit = async () => {
    if (!selectedPlan || !selectedDuration || !hasCurrentCalculation()) {
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
        if (!data?.payment || !data?.payment_url) {
          alert('Ошибка инициализации платежа: не получены данные оплаты')
          return
        }
        
        // Сохраняем состояние для восстановления при ошибке
        localStorage.setItem(`payment_state_${data.payment}`, JSON.stringify(paymentState))
        
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

  // Используем централизованную утилиту для названий планов

  // Функция для форматирования цены с пробелами для тысяч
  const formatPrice = (price) => {
    return Math.round(price).toLocaleString('ru-RU')
  }


  if (!isOpen) return null

  const isUpgrade = currentPlanDisplayOrder && selectedPlan && selectedPlan.display_order > currentPlanDisplayOrder
  const isDowngrade = currentPlanDisplayOrder && selectedPlan && selectedPlan.display_order < currentPlanDisplayOrder
  const isSamePlan = currentPlanDisplayOrder && selectedPlan && selectedPlan.display_order === currentPlanDisplayOrder
  const currentCalculation = hasCurrentCalculation() ? calculation : null
  const isCalculationPending = Boolean(selectedPlan && selectedDuration && !currentCalculation)

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
                          {highlights.map((t, idx) => (
                            <li key={idx} className="break-words">
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
                          data-testid={`tariff-duration-${m}`}
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

                {currentCalculation?.is_downgrade ? (
                  <div className="text-xs text-gray-600 border rounded-lg p-3 bg-gray-50">
                    Тариф будет применён после окончания текущей подписки
                  </div>
                ) : null}

                <div className="border rounded-lg p-3">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Расчет</div>
                  {loadingCalculation || isCalculationPending ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      Считаем…
                    </div>
                  ) : currentCalculation ? (
                    <div className="space-y-2 text-sm">
                      {typeof currentCalculation.subscription_points_available === 'number' &&
                      currentCalculation.upgrade_type === 'immediate' ? (
                        <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-600">Баллы</span>
                            <span className="font-semibold text-gray-900" data-testid="tariff-points-available">
                              {currentCalculation.subscription_points_available}
                            </span>
                          </div>
                          <label className="flex items-center justify-between gap-3">
                            <span className="text-gray-700">Использовать баллы</span>
                            <input
                              type="checkbox"
                              checked={useSubscriptionPoints}
                              onChange={(e) => {
                                const enabled = e.target.checked
                                setUseSubscriptionPoints(enabled)
                                if (enabled) {
                                  const priceBefore = Number(
                                    currentCalculation.price_before_points ?? currentCalculation.total_price ?? 0
                                  )
                                  const available = Number(currentCalculation.subscription_points_available ?? 0)
                                  setSubscriptionPointsToUse(Math.min(available, Math.floor(priceBefore)))
                                } else {
                                  setSubscriptionPointsToUse(0)
                                }
                              }}
                              className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                              data-testid="tariff-use-points-toggle"
                            />
                          </label>
                          {useSubscriptionPoints ? (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Списать баллов (1 балл = 1 ₽)</label>
                              <input
                                type="number"
                                min={0}
                                max={Math.min(
                                  Number(currentCalculation.subscription_points_available ?? 0),
                                  Math.floor(Number(currentCalculation.price_before_points ?? currentCalculation.total_price ?? 0))
                                )}
                                value={subscriptionPointsToUse}
                                onChange={(e) => {
                                  const raw = Number(e.target.value)
                                  if (Number.isNaN(raw)) return
                                  setSubscriptionPointsToUse(Math.max(0, Math.floor(raw)))
                                }}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                data-testid="tariff-points-input"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {Number(currentCalculation.subscription_points_used) > 0 ? (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-600">Цена до баллов</span>
                            <span className="font-semibold text-gray-900" data-testid="tariff-price-before-points">
                              {formatPrice(currentCalculation.price_before_points ?? currentCalculation.total_price)} ₽
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-600">Списать баллов</span>
                            <span className="font-semibold text-gray-900" data-testid="tariff-points-used">
                              −{currentCalculation.subscription_points_used}
                            </span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-600">К оплате</span>
                        <span className="font-semibold text-gray-900" data-testid="tariff-final-price">{formatPrice(currentCalculation.final_price)} ₽</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-600">Стоимость</span>
                        <span className="font-semibold text-gray-900" data-testid="tariff-total-price">{formatPrice(currentCalculation.total_price)} ₽</span>
                      </div>
                      {currentCalculation.savings_percent ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Экономия</span>
                          <span className="font-semibold text-gray-900">{Math.round(currentCalculation.savings_percent)}%</span>
                        </div>
                      ) : null}
                      {(currentCalculation.start_date || currentCalculation.end_date) ? (
                        <div className="text-xs text-gray-500 pt-2 border-t">
                          Период: {formatDate(currentCalculation.start_date)} — {formatDate(currentCalculation.end_date)}
                        </div>
                      ) : null}
                      {currentCalculation.breakdown_text ? (
                        <div className="text-xs text-gray-600">{currentCalculation.breakdown_text}</div>
                      ) : null}
                      {currentCalculation.promo_preview ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm" data-testid="subscription-promo-preview">
                          <div className="font-semibold text-green-900">Промокод {currentCalculation.promo_preview.code}</div>
                          <div className="text-green-800 mt-1">{getPromoPreviewMessage(currentCalculation.promo_preview)}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Выберите тариф и период</div>
                  )}
                </div>

                <label className={`flex items-center justify-between gap-3 border rounded-lg p-3 ${!currentCalculation ? 'opacity-60' : ''}`}>
                  <span className="text-sm font-semibold text-gray-900">Автопродление</span>
                  <input
                    type="checkbox"
                    checked={enableAutoRenewal}
                    onChange={(e) => setEnableAutoRenewal(e.target.checked)}
                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    disabled={!currentCalculation}
                  />
                </label>
              </div>

              {/* Sticky footer */}
              <div className="border-t p-4 bg-white">
                <button
                  type="button"
                  onClick={handlePaymentInit}
                  data-testid="tariff-payment-button"
                  disabled={!currentCalculation || loadingCalculation || loadingPayment}
                  className="w-full px-4 py-3 rounded-lg bg-[#4CAF50] text-white font-semibold hover:bg-[#45A049] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {Number(currentCalculation?.final_price) <= 0
                    ? (loadingPayment ? 'Применяем…' : 'Применить тариф')
                    : (loadingPayment ? 'Переход…' : 'Перейти к оплате')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

