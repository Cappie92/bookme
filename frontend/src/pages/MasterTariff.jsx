import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../utils/config'
import { Button } from '../components/ui'
import { useMasterSubscription } from '../hooks/useMasterSubscription'
import SubscriptionModal from '../components/SubscriptionModal'
import Tooltip from '../components/Tooltip'
import { getPlanFeatures } from '../utils/subscriptionFeatures'
import { getPlanDisplayName } from '../utils/subscriptionPlanNames'

// Импортируем MasterSidebar из MasterDashboard
function MasterSidebar({ activeTab, setActiveTab, refreshKey, masterSettings, scheduleConflicts, hasFinanceAccess, hasExtendedStats }) {
  const [pendingInvitations, setPendingInvitations] = useState(0)
  const [unconfirmedBookings, setUnconfirmedBookings] = useState(0)

  useEffect(() => {
    loadPendingInvitations()
    loadUnconfirmedBookings()
  }, [refreshKey])

  const loadPendingInvitations = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/invitations`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        const pendingCount = data.filter(inv => inv.status === 'pending').length
        setPendingInvitations(pendingCount)
      } else if (res.status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
      }
    } catch (err) {
      console.error('Ошибка загрузки приглашений:', err)
    }
  }

  const loadUnconfirmedBookings = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/accounting/pending-confirmations`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setUnconfirmedBookings(data.length || 0)
      }
    } catch (err) {
      console.error('Ошибка загрузки неподтвержденных записей:', err)
    }
  }

  const navigate = useNavigate()

  return (
    <div className="fixed left-0 top-0 w-64 h-full bg-[#F5F5F5] border-r border-gray-200">
      <nav className="space-y-2 p-4 pt-[160px]">
        {/* Логотип и заголовок */}
        <div className="mb-6 px-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#4CAF50] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">d.</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">DeDato</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/master?tab=dashboard')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          📊 Дашборд
          {unconfirmedBookings > 0 && (
            <span className="ml-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
              {unconfirmedBookings}
            </span>
          )}
        </button>
        
        <button
          onClick={() => navigate('/master?tab=schedule')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'schedule'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          📅 Расписание
          {scheduleConflicts > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {scheduleConflicts}
            </span>
          )}
        </button>
        
        <button
          onClick={() => navigate('/master?tab=services')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'services'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          ✂️ Услуги
        </button>
        
        <button
          onClick={() => navigate('/master?tab=stats')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'stats'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          📈 Статистика
        </button>
        
        <button
          onClick={() => navigate('/master?tab=tariff')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'tariff'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          💳 Мой тариф
        </button>
        
        {hasFinanceAccess && (
          <button
            onClick={() => navigate('/master?tab=accounting')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'accounting'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            💰 Финансы
          </button>
        )}
        
        <button
          onClick={() => navigate('/master?tab=settings')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'settings'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          ⚙️ Настройки
        </button>
        
        {pendingInvitations > 0 && (
          <button
            onClick={() => navigate('/master?tab=salon-work')}
            className="w-full text-left px-4 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100 relative"
          >
            📨 Приглашения
            <span className="ml-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
              {pendingInvitations}
            </span>
          </button>
        )}
      </nav>
    </div>
  )
}

export default function MasterTariff() {
  const [activeSection, setActiveSection] = useState('subscription')
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [subscriptionData, setSubscriptionData] = useState(null)
  const [freezeInfo, setFreezeInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [freezeLoading, setFreezeLoading] = useState(false)
  const [freezeStartDate, setFreezeStartDate] = useState('')
  const [freezeEndDate, setFreezeEndDate] = useState('')
  const [freezeMessage, setFreezeMessage] = useState('')
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [subscriptionPlans, setSubscriptionPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedDuration, setSelectedDuration] = useState(null)
  const [calculationData, setCalculationData] = useState(null)
  const [upgradeType, setUpgradeType] = useState('immediate')
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [loadingCalculation, setLoadingCalculation] = useState(false)
  const [scheduleConflicts, setScheduleConflicts] = useState(0)
  const [paymentBalance, setPaymentBalance] = useState(null)
  const [paymentTransactions, setPaymentTransactions] = useState([])
  const [autoRenewal, setAutoRenewal] = useState(false)
  const [autoRenewalPeriod, setAutoRenewalPeriod] = useState('1')
  const [autoRenewalPlan, setAutoRenewalPlan] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('card') // Общий способ оплаты для всех платежей
  const [serviceFunctions, setServiceFunctions] = useState([])
  
  // Все хуки должны быть вызваны в начале компонента
  const { hasFinanceAccess, hasExtendedStats, canCustomizeDomain, planName: hookPlanName } = useMasterSubscription()

  useEffect(() => {
    loadSubscriptionData()
    loadFreezeInfo()
    loadPaymentData()
    loadServiceFunctions()
  }, [])

  useEffect(() => {
    if (activeSection === 'payment') {
      loadPaymentData()
    }
  }, [activeSection])

  const loadPaymentData = async () => {
    try {
      const token = localStorage.getItem('access_token')
      
      // Загружаем баланс
      const balanceResponse = await fetch(`/api/balance/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json()
        setPaymentBalance(balanceData)
      }
      
      // Загружаем транзакции
      const transactionsResponse = await fetch(`/api/balance/transactions?limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json()
        setPaymentTransactions(transactionsData)
      }
    } catch (error) {
      console.error('Ошибка загрузки данных об оплате:', error)
    }
  }

  // Загружаем конфликты расписания
  useEffect(() => {
    const loadScheduleConflicts = async () => {
      try {
        const token = localStorage.getItem('access_token')
        const res = await fetch(`${API_BASE_URL}/api/master/schedule/weekly?weeks_ahead=4`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        if (res.ok) {
          const data = await res.json()
          const conflictsByDate = new Set()
          data.slots.forEach(slot => {
            if (slot.is_working && slot.has_conflict) {
              conflictsByDate.add(slot.schedule_date)
            }
          })
          setScheduleConflicts(conflictsByDate.size)
        }
      } catch (err) {
        console.error('Ошибка загрузки конфликтов расписания:', err)
      }
    }
    loadScheduleConflicts()
  }, [])

  const loadSubscriptionData = async () => {
    try {
      const token = localStorage.getItem('access_token')
      
      // Загружаем статус подписки
      const statusResponse = await fetch(`/api/balance/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        setSubscriptionStatus(statusData)
      }
      
      // Загружаем данные подписки
      const response = await fetch(`/api/subscriptions/my`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setSubscriptionData(data)
        // Устанавливаем состояние автопродления из данных подписки
        if (data.auto_renewal !== undefined) {
          setAutoRenewal(data.auto_renewal)
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки данных подписки:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFreezeInfo = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/subscriptions/freeze`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setFreezeInfo(data)
      }
    } catch (error) {
      console.error('Ошибка загрузки информации о заморозке:', error)
    }
  }

  const loadServiceFunctions = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/master/service-functions?function_type=subscription&is_active=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setServiceFunctions(data)
      } else if (response.status === 403) {
        console.warn('Нет доступа к service_functions, используем пустой список')
        setServiceFunctions([])
      }
    } catch (error) {
      console.error('Ошибка загрузки service_functions:', error)
      setServiceFunctions([])
    }
  }

  const loadSubscriptionPlans = async () => {
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
        // Фильтруем Free план и сортируем по display_order
        const filteredPlans = data.filter(plan => plan.name !== 'Free')
        filteredPlans.sort((a, b) => a.display_order - b.display_order)
        setSubscriptionPlans(filteredPlans)
        // Устанавливаем текущий план по умолчанию, если он не выбран
          const currentPlanName = subscriptionStatus?.plan_name || subscriptionData?.plan_name || 'Free'
        if (!autoRenewalPlan && currentPlanName !== 'Free') {
          const currentPlan = filteredPlans.find(p => p.name === currentPlanName)
          if (currentPlan) {
            setAutoRenewalPlan(currentPlan.id)
          }
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки тарифных планов:', error)
    }
  }

  // Используем централизованную утилиту для названий планов


  const handleCreateFreeze = async () => {
    if (!freezeStartDate || !freezeEndDate) {
      setFreezeMessage('Заполните даты начала и окончания заморозки')
      return
    }

    const start = new Date(freezeStartDate)
    const end = new Date(freezeEndDate)

    if (start >= end) {
      setFreezeMessage('Дата начала должна быть раньше даты окончания')
      return
    }

    if (start < new Date()) {
      setFreezeMessage('Нельзя создать заморозку на прошедшие даты')
      return
    }

    setFreezeLoading(true)
    setFreezeMessage('')

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/subscriptions/freeze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription_id: subscriptionStatus?.subscription_id,
          start_date: start.toISOString(),
          end_date: end.toISOString()
        })
      })

      if (response.ok) {
        setFreezeMessage('Заморозка успешно создана!')
        setFreezeStartDate('')
        setFreezeEndDate('')
        await loadFreezeInfo()
      } else {
        const errorData = await response.json()
        setFreezeMessage(errorData.detail || 'Ошибка создания заморозки')
      }
    } catch (error) {
      console.error('Ошибка создания заморозки:', error)
      setFreezeMessage('Ошибка соединения с сервером')
    } finally {
      setFreezeLoading(false)
    }
  }

  const handleCancelFreeze = async (freezeId) => {
    if (!window.confirm('Вы уверены, что хотите отменить заморозку?')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/subscriptions/freeze/${freezeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setFreezeMessage('Заморозка отменена')
        await loadFreezeInfo()
      } else {
        const errorData = await response.json()
        setFreezeMessage(errorData.detail || 'Ошибка отмены заморозки')
      }
    } catch (error) {
      console.error('Ошибка отмены заморозки:', error)
      setFreezeMessage('Ошибка соединения с сервером')
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateString) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Загружаем список тарифных планов для выбора в автопродлении
  useEffect(() => {
    if (autoRenewal) {
      loadSubscriptionPlans()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRenewal])

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="pt-[140px] px-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="h-64 bg-gray-200 rounded"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const planName = subscriptionStatus?.plan_name || subscriptionData?.plan_name || 'Free'
  const isFreePlan = planName === 'Free'
  const isAlwaysFree = subscriptionStatus?.is_always_free || false
  // Используем единую утилиту для получения функций тарифа
  const planData = {
    name: planName,
    features: subscriptionStatus?.features || subscriptionData?.features || {},
    limits: subscriptionStatus?.limits || subscriptionData?.limits || {}
  }
  const features = getPlanFeatures(planData, serviceFunctions, isAlwaysFree)
  const canFreeze = freezeInfo?.can_freeze && !isFreePlan

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Мой тариф</h1>
          
          {/* Навигация по разделам */}
          <div className="flex space-x-1 mb-8">
            <button
              onClick={() => setActiveSection('subscription')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeSection === 'subscription'
                  ? 'bg-[#4CAF50] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Моя подписка
            </button>
            <button
              onClick={() => setActiveSection('payment')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeSection === 'payment'
                  ? 'bg-[#4CAF50] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Оплата
            </button>
            {!canCustomizeDomain ? (
              <div className="flex-1">
                <div className="relative w-full">
                  <Tooltip text="Доступно на тарифах Basic, Pro и Premium. Купите подписку для доступа к этой функции." position="top">
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="w-full py-3 px-4 rounded-md text-sm font-medium transition-colors text-gray-400 bg-gray-100 hover:bg-gray-200"
                    >
                      Собственный сайт
                      <span className="ml-2 text-xs">🔒</span>
                    </button>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setActiveSection('website')}
                className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeSection === 'website'
                    ? 'bg-[#4CAF50] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Собственный сайт
              </button>
            )}
          </div>

          {/* Раздел: Моя подписка */}
          {activeSection === 'subscription' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border p-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Информация о подписке</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 flex flex-col">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Статус подписки</span>
                      <span className="font-medium text-gray-900">
                        {(() => {
                          // Используем единый источник - plan_display_name из API
                          const planDisplayName = subscriptionStatus?.plan_display_name || subscriptionData?.plan_display_name || getPlanDisplayName(planName)
                          
                          // Если есть заморозка - показываем "Приостановлена (Название плана)"
                          if (subscriptionStatus?.is_frozen || !subscriptionStatus?.can_continue) {
                            if (subscriptionStatus?.freeze_info) {
                              const freezeInfo = subscriptionStatus.freeze_info
                              const freezeDates = freezeInfo.start_date && freezeInfo.end_date 
                                ? `${freezeInfo.start_date} - ${freezeInfo.end_date}`
                                : 'даты не указаны'
                              return `Приостановлена (${planDisplayName} /${freezeDates}/)`
                            }
                            return `Приостановлена (${planDisplayName})`
                          }
                          
                          // Для активных подписок - показываем просто название плана из plan_display_name
                          return planDisplayName
                        })()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Действует до</span>
                      <span className="font-medium">
                        {isFreePlan || subscriptionStatus?.is_unlimited 
                          ? 'Бессрочно' 
                          : formatDate(subscriptionStatus?.end_date)}
                      </span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Стоимость</span>
                      <span className="font-medium">
                        {isFreePlan ? 'Бесплатно' : subscriptionData?.price ? `${subscriptionData.price} ₽/мес` : '—'}
                      </span>
                    </div>
                    
                    {/* Кнопка покупки/продления подписки */}
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="w-full py-3 px-4 bg-[#4CAF50] text-white rounded-lg font-medium hover:bg-[#45A049] transition-colors mt-auto"
                    >
                      {isFreePlan ? 'Купить подписку' : 'Продлить/повысить подписку'}
                    </button>
                </div>
                
                  <div className="flex flex-col">
                    <div className="p-4 bg-[#DFF5EC] rounded-lg h-full flex flex-col border border-green-200">
                    <h3 className="font-medium text-[#2E7D32] mb-3">Условия тарифа</h3>
                      <div className="space-y-2 text-sm flex-1">
                        {features.map((feature, index) => (
                          <div key={index} className="flex items-center">
                            <span className="mr-2">
                              {feature.available ? '✅' : '❌'}
                            </span>
                            <span className={feature.available ? 'text-[#4CAF50]' : 'text-gray-500'}>
                              {feature.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Раздел заморозки подписки */}
              {!isFreePlan && freezeInfo && (
                <div className="bg-white rounded-lg shadow-sm border p-2">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Заморозка подписки</h2>
                  
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Всего дней заморозки:</span>
                        <div className="font-semibold text-lg">{freezeInfo.total_freeze_days}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Использовано:</span>
                        <div className="font-semibold text-lg">{freezeInfo.used_freeze_days}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Доступно:</span>
                        <div className="font-semibold text-lg text-green-600">{freezeInfo.available_freeze_days}</div>
                      </div>
                    </div>
                  </div>

                  {canFreeze && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                      <h3 className="font-medium text-gray-900 mb-4">Создать заморозку</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Дата начала
                          </label>
                          <input
                            type="date"
                            value={freezeStartDate}
                            onChange={(e) => setFreezeStartDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Дата окончания
                          </label>
                        <input
                            type="date"
                            value={freezeEndDate}
                            onChange={(e) => setFreezeEndDate(e.target.value)}
                            min={freezeStartDate || new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
                          />
                        </div>
                      </div>
                      {freezeMessage && (
                        <div className={`mb-4 text-sm p-2 rounded-md ${
                          freezeMessage.includes('успешно') 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {freezeMessage}
                        </div>
                      )}
                      <Button
                        onClick={handleCreateFreeze}
                        disabled={freezeLoading || !freezeStartDate || !freezeEndDate}
                        className="px-4 py-2"
                      >
                        {freezeLoading ? 'Создание...' : 'Создать заморозку'}
                      </Button>
                    </div>
                  )}

                  {freezeInfo.active_freezes && freezeInfo.active_freezes.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-medium text-gray-900 mb-4">Активные заморозки</h3>
                      <div className="space-y-2">
                        {freezeInfo.active_freezes.map((freeze) => (
                          <div key={freeze.id} className="p-4 bg-blue-50 rounded-lg flex justify-between items-center">
                            <div>
                              <div className="font-medium">
                                {formatDate(freeze.start_date)} — {formatDate(freeze.end_date)}
                              </div>
                              <div className="text-sm text-gray-600">
                                {freeze.freeze_days} дней
                              </div>
                            </div>
                            {new Date(freeze.start_date) > new Date() && (
                              <Button
                                variant="secondary"
                                onClick={() => handleCancelFreeze(freeze.id)}
                                className="px-3 py-1 text-sm"
                              >
                                Отменить
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {freezeInfo.freeze_history && freezeInfo.freeze_history.length > 0 && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-4">История заморозок</h3>
                      <div className="space-y-2">
                        {freezeInfo.freeze_history.map((freeze) => (
                          <div key={freeze.id} className={`p-4 rounded-lg flex justify-between items-center ${
                            freeze.is_cancelled ? 'bg-gray-50' : 'bg-green-50'
                          }`}>
                            <div>
                              <div className="font-medium">
                                {formatDate(freeze.start_date)} — {formatDate(freeze.end_date)}
                              </div>
                              <div className="text-sm text-gray-600">
                                {freeze.freeze_days} дней
                                {freeze.is_cancelled && ' (отменена)'}
                  </div>
                </div>
              </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
              )}
            </div>
          )}

          {/* Раздел: Собственный сайт */}
          {activeSection === 'website' && (
            <div className="bg-white rounded-lg shadow-sm border p-2">
              {!canCustomizeDomain && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-yellow-800">
                    Для доступа к функции "Собственный сайт" требуется тариф Basic, Pro или Premium. 
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="underline ml-1 font-medium"
                    >
                      Купить подписку
                    </button>
                  </p>
                </div>
              )}
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Собственный сайт</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-3">Текущий статус</h3>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                        <span className="text-gray-600">Домен не подключен</span>
                      </div>
                      <p className="text-sm text-gray-500">
                        У вас пока нет собственного домена. Подключите его для создания персонального сайта.
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2E7D32] mb-3">Возможности</h3>
                    <ul className="space-y-2 text-sm text-[#4CAF50]">
                      <li>• Персональный домен (например, master.ru)</li>
                      <li>• Индивидуальный дизайн</li>
                      <li>• Портфолио работ</li>
                      <li>• Отзывы клиентов</li>
                      <li>• SEO-продвижение</li>
                    </ul>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h3 className="font-medium text-yellow-900 mb-3">Стоимость</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-yellow-700">Регистрация домена:</span>
                        <span className="font-medium">от 500 ₽/год</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-700">Создание сайта:</span>
                        <span className="font-medium">1500 ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-700">Поддержка:</span>
                        <span className="font-medium">300 ₽/мес</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-medium text-green-900 mb-3">Преимущества</h3>
                    <ul className="space-y-1 text-sm text-green-700">
                      <li>• Персональный бренд</li>
                      <li>• Больше клиентов</li>
                      <li>• Высокие цены</li>
                      <li>• Независимость</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <Button>
                  Подключить домен
                </Button>
              </div>
            </div>
          )}

          {/* Раздел: Оплата */}
          {activeSection === 'payment' && (
            <div className="bg-white rounded-lg shadow-sm border p-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Оплата</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 flex flex-col">
                  {/* Блок оплаты и автопродления */}
                  <div className={`p-4 rounded-lg flex-1 flex flex-col ${autoRenewal ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <h3 className="font-medium text-gray-900 mb-3">Оплата и автопродление</h3>
                    <div className="space-y-4 flex-1">
                      {/* Способ оплаты (всегда видимый) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Способ оплаты
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          <option value="card">💳 Банковские карты (Рекомендуется)</option>
                          <option value="sbp">📱 СБП</option>
                          <option value="wallet">🏦 Электронные кошельки</option>
                        </select>
                      </div>
                      
                      {/* Чекбокс автопродления */}
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoRenewal}
                          onChange={(e) => setAutoRenewal(e.target.checked)}
                          className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                        />
                        <span className="ml-3 text-gray-700">
                          {autoRenewal ? 'Автопродление включено' : 'Включить автопродление'}
                        </span>
                      </label>
                      
                      {autoRenewal && (
                        <div className="space-y-4 mt-4">
                          {/* Выбор периода автопродления */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Период автопродления
                            </label>
                            <select
                              value={autoRenewalPeriod}
                              onChange={(e) => setAutoRenewalPeriod(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            >
                              <option value="1">1 месяц</option>
                              <option value="3">3 месяца</option>
                              <option value="6">6 месяцев</option>
                              <option value="12">12 месяцев</option>
                            </select>
                          </div>
                          
                          {/* Выбор тарифа */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Тарифный план
                            </label>
                            <select
                              value={autoRenewalPlan || ''}
                              onChange={(e) => setAutoRenewalPlan(e.target.value ? parseInt(e.target.value) : null)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            >
                              <option value="">Выберите тариф</option>
                              {subscriptionPlans.map((plan) => (
                                <option key={plan.id} value={plan.id}>
                                  {getPlanDisplayName(plan)}
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          {/* Кнопка Применить */}
                          <div className="pt-2">
                            <button
                              onClick={() => {
                                // TODO: Реализовать сохранение настроек автопродления
                                alert('Настройки автопродления сохранены (заглушка)')
                              }}
                              className="w-full py-2 px-4 bg-[#4CAF50] text-white rounded-lg font-medium hover:bg-[#45A049] transition-colors"
                            >
                              Применить
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {!autoRenewal && (
                        <p className="text-sm text-gray-500 mt-2">
                          Подключите автопродление для автоматического продления подписки.
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Кнопка выбора тарифа */}
                  <div>
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="w-full py-3 px-4 bg-[#4CAF50] text-white rounded-lg font-medium hover:bg-[#45A049] transition-colors"
                    >
                      Выбрать тариф
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4 flex flex-col">
                  <div className="p-4 bg-blue-50 rounded-lg flex-1 flex flex-col">
                    <h3 className="font-medium text-blue-900 mb-3">Баланс</h3>
                    <div className="space-y-2 text-sm flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-center">
                        <span className="text-blue-700">Доступно:</span>
                        <span className="font-medium text-lg">{paymentBalance?.available_balance?.toFixed(2) || '0.00'} ₽</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-blue-700">Зарезервировано:</span>
                        <span className="font-medium">{paymentBalance?.reserved_total?.toFixed(2) || '0.00'} ₽</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                        <span className="text-blue-900 font-medium">Всего:</span>
                        <span className="font-bold text-lg">{paymentBalance?.balance?.toFixed(2) || '0.00'} ₽</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gray-50 rounded-lg flex-1 flex flex-col">
                    <h3 className="font-medium text-gray-900 mb-3">Прошлые оплаты</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto flex-1">
                      {paymentTransactions && paymentTransactions.length > 0 ? (
                        paymentTransactions.slice(0, 10).map((transaction) => (
                          <div key={transaction.id} className="flex justify-between items-center p-2 bg-white rounded border text-sm">
                            <div>
                              <div className="font-medium">{transaction.description || 'Транзакция'}</div>
                              <div className="text-gray-500 text-xs">
                                {new Date(transaction.created_at).toLocaleDateString('ru-RU')}
                              </div>
                            </div>
                            <div className={`font-medium ${
                              transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)} ₽
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500 text-center py-4">
                          Нет транзакций
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
      
      {/* Модальное окно выбора тарифа */}
      {showSubscriptionModal && (
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => {
            setShowSubscriptionModal(false)
          }}
          isFreePlan={isFreePlan}
          currentPlanDisplayOrder={subscriptionStatus?.plan_display_order}
        />
      )}
    </div>
  )
} 
