import React, { useState, useEffect } from 'react'
import { API_BASE_URL } from '../utils/config'
import { getPlanFeatures } from '../utils/subscriptionFeatures'
import { getPlanDisplayName } from '../utils/subscriptionPlanNames'

export default function SubscriptionModal({ isOpen, onClose, isFreePlan, currentPlanDisplayOrder }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedDuration, setSelectedDuration] = useState(null)
  const [calculation, setCalculation] = useState(null)
  const [loadingCalculation, setLoadingCalculation] = useState(false)
  const [upgradeType, setUpgradeType] = useState('immediate')
  const [calculationId, setCalculationId] = useState(null)
  const [enableAutoRenewal, setEnableAutoRenewal] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadPlans()
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
    }
  }, [isOpen])

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

  const handleDurationSelect = async (durationMonths) => {
    if (!selectedPlan) return
    
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
          upgrade_type: upgradeType
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setCalculation(data)
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
      await handleDurationSelect(selectedDuration)
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

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            {(selectedPlan || calculation) && (
              <button
                onClick={handleBack}
                className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Назад</span>
              </button>
            )}
            <h2 className="text-2xl font-semibold text-gray-900">
              {isFreePlan ? 'Купить подписку' : 'Продлить/повысить подписку'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка тарифов...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Шаг 1: Список тарифов (всегда показываем, но выделяем выбранный) */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedPlan ? 'Выбранный тариф' : 'Выберите тарифный план'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const minPrice = getMinMonthlyPrice(plan)
                  const isSelected = selectedPlan && selectedPlan.id === plan.id
                  const features = getPlanFeatures(plan)
                  return (
                    <div
                      key={plan.id}
                      onClick={() => handlePlanSelect(plan)}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-colors flex flex-col ${
                        isSelected 
                          ? 'border-[#4CAF50] bg-green-50' 
                          : 'border-gray-200 hover:border-blue-500'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {getPlanDisplayName(plan)}
                            {isSelected && <span className="ml-2 text-[#4CAF50]">✓</span>}
                          </h3>
                        </div>
                        {/* Список функций справа */}
                        <div className="ml-4 flex-shrink-0">
                          <div className="space-y-1 text-xs">
                            {features.map((feature, index) => (
                              <div key={index} className="flex items-center">
                                <span className={feature.available ? 'text-green-600' : 'text-gray-400'}>
                                  {feature.available ? '✅' : '❌'}
                                </span>
                                <span className={`ml-1 ${feature.available ? 'text-gray-700' : 'text-gray-400'}`}>
                                  {feature.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Цена внизу на всю ширину */}
                      <div className="mt-auto pt-3 border-t border-gray-200">
                        <p className="text-gray-900 text-lg font-semibold text-center">
                          от {formatPrice(minPrice)} руб./мес
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Шаг 2: Выбор продолжительности (показываем если выбран план) */}
            {selectedPlan && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {getPlanDisplayName(selectedPlan)} — выберите период
                </h3>

                {/* Выбор типа апгрейда для тарифов выше текущего (только для апгрейда, не для бесплатного) */}
                {isUpgrade && !isFreePlan && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-700 mb-3">
                      Вы выбрали тариф выше текущего. Когда начать действие нового тарифа?
                    </p>
                    <div className="flex gap-4">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="upgradeType"
                          value="immediate"
                          checked={upgradeType === 'immediate'}
                          onChange={(e) => handleUpgradeTypeChange(e.target.value)}
                          className="mr-2"
                        />
                        <span className="text-sm">Немедленно</span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="upgradeType"
                          value="after_expiry"
                          checked={upgradeType === 'after_expiry'}
                          onChange={(e) => handleUpgradeTypeChange(e.target.value)}
                          className="mr-2"
                        />
                        <span className="text-sm">После окончания текущего</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 3, 6, 12].map((months) => {
                    const monthlyPrice = getMonthlyPrice(selectedPlan, months)
                    const totalPrice = monthlyPrice * months
                    const savings = months > 1 && selectedPlan.price_1month ? ((selectedPlan.price_1month - monthlyPrice) / selectedPlan.price_1month * 100) : 0
                    const isSelected = selectedDuration === months
                    
                    return (
                      <div
                        key={months}
                        onClick={() => handleDurationSelect(months)}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-[#4CAF50] bg-green-50' 
                            : 'border-gray-200 hover:border-blue-500'
                        }`}
                      >
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-900 mb-1">
                            {months} {months === 1 ? 'мес' : months < 5 ? 'мес' : 'мес'}
                            {isSelected && <span className="ml-2 text-[#4CAF50]">✓</span>}
                          </div>
                          <div className="text-lg font-semibold text-gray-700 mb-1">
                            {formatPrice(totalPrice)} ₽
                          </div>
                          <div className="text-sm text-gray-600 mb-1">
                            {formatPrice(monthlyPrice)} ₽/мес
                          </div>
                          {savings > 0 && (
                            <div className="text-xs text-green-600 font-medium">
                              Экономия {Math.round(savings)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Шаг 3: Расчет стоимости (показываем если выбран период) */}
            {selectedPlan && selectedDuration && (
              <div className="border-t pt-6">
                {loadingCalculation ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Расчет стоимости...</p>
                  </div>
                ) : calculation ? (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Расчет стоимости
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h4 className="text-xl font-semibold text-gray-900 mb-4">
                        {getPlanDisplayName({ name: calculation.plan_name })} — {calculation.duration_months} {calculation.duration_months === 1 ? 'месяц' : calculation.duration_months < 5 ? 'месяца' : 'месяцев'}
                      </h4>

                      <div className="space-y-3 mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Общая стоимость:</span>
                          <span className="font-semibold">{formatPrice(calculation.total_price)} ₽</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Стоимость за месяц:</span>
                          <span className="font-semibold">{formatPrice(calculation.monthly_price)} ₽/мес</span>
                        </div>
                        {calculation.savings_percent && calculation.savings_percent > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Экономия:</span>
                            <span className="font-semibold">{Math.round(calculation.savings_percent)}%</span>
                          </div>
                        )}
                        {calculation.reserved_balance > 0 && calculation.upgrade_type === 'immediate' && (
                          <div className="flex justify-between text-blue-600">
                            <span>Учтено из резерва:</span>
                            <span className="font-semibold">-{formatPrice(calculation.reserved_balance)} ₽</span>
                          </div>
                        )}
                        
                        {/* Чекбокс автопродления */}
                        <div className="pt-3 mt-3 border-t">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enableAutoRenewal}
                              onChange={(e) => setEnableAutoRenewal(e.target.checked)}
                              className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                            />
                            <span className="ml-3 text-gray-700">
                              Включить автопродление
                            </span>
                          </label>
                        </div>
                        
                        <div className="border-t pt-3 mt-3">
                          <div className="flex justify-between text-lg">
                            <span className="font-semibold">Итого к оплате:</span>
                            <span className="font-bold text-blue-600">{formatPrice(calculation.final_price)} ₽</span>
                          </div>
                        </div>
                      </div>

                      {(calculation.start_date || calculation.end_date) && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="text-sm text-gray-600">
                            <div>Период действия: {formatDate(calculation.start_date)} — {formatDate(calculation.end_date)}</div>
                          </div>
                        </div>
                      )}

                      {isUpgrade && calculation.upgrade_type === 'immediate' && (
                        <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                          <p className="text-sm text-yellow-800">
                            При немедленном апгрейде текущая подписка будет заменена новой, а зарезервированные средства будут учтены при расчете.
                          </p>
                        </div>
                      )}

                      {isDowngrade && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-800">
                            Новый тариф начнет действовать после окончания текущей подписки. Оплата будет списана с активного баланса.
                          </p>
                        </div>
                      )}

                      {isSamePlan && (
                        <div className="mt-4 p-3 bg-green-50 rounded-lg">
                          <p className="text-sm text-green-800">
                            Ваша подписка будет продлена на выбранный период.
                          </p>
                        </div>
                      )}

                      <div className="mt-6">
                        <button
                          className="w-full py-3 px-4 bg-[#4CAF50] text-white rounded-lg font-medium hover:bg-[#45A049] transition-colors"
                          onClick={() => {
                            // Заглушка для оплаты
                            alert('Функция оплаты будет реализована позже')
                          }}
                        >
                          Перейти к оплате
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

