import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  InboxIcon,
  LockClosedIcon,
  PresentationChartLineIcon,
  ScissorsIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { API_BASE_URL } from '../utils/config'
import { apiGet } from '../utils/api'
import { Button } from '../components/ui'
import SubscriptionModal from '../components/SubscriptionModal'
import Tooltip from '../components/Tooltip'
import {
  getMasterTariffComparisonRows,
  splitTariffComparisonColumns,
} from '../utils/subscriptionFeatures'
import { getPlanDisplayName } from '../utils/subscriptionPlanNames'
import { formatMoney } from '../utils/formatMoney'
import {
  PROMO_FIRST_PAYMENT_ONLY_MESSAGE,
  applyMasterPromoCode,
  getCurrentMasterPromoCode,
  getMasterReferralCode,
  getPromoErrorMessage,
  getSubscriptionPoints,
} from '../utils/promoEngineApi'

// Импортируем MasterSidebar из MasterDashboard
function MasterSidebar({ activeTab, setActiveTab, refreshKey, masterSettings, scheduleConflicts, hasFinanceAccess, hasExtendedStats, hasLoyaltyAccess }) {
  const [pendingInvitations, setPendingInvitations] = useState(0)
  const [unconfirmedBookings, setUnconfirmedBookings] = useState(0)

  useEffect(() => {
    loadPendingInvitations()
    loadUnconfirmedBookings()
  }, [refreshKey])

  const loadPendingInvitations = async () => {
    try {
      const data = await apiGet('/api/master/invitations')
      const pendingCount = data.filter(inv => inv.status === 'pending').length
      setPendingInvitations(pendingCount)
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
      } else {
        console.error('Ошибка загрузки приглашений:', err)
      }
    }
  }

  const loadUnconfirmedBookings = async () => {
    try {
      const data = await apiGet('/api/master/accounting/pending-confirmations')
      setUnconfirmedBookings(data.count || 0)
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
          type="button"
          onClick={() => navigate('/master?tab=dashboard')}
          className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <ChartBarIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1">Дашборд</span>
          {unconfirmedBookings > 0 && (
            <span className="shrink-0 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
              {unconfirmedBookings}
            </span>
          )}
        </button>
        
        <button
          type="button"
          onClick={() => navigate('/master?tab=schedule')}
          className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'schedule'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <CalendarDaysIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1">Расписание</span>
          {scheduleConflicts > 0 && (
            <span className="shrink-0 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {scheduleConflicts}
            </span>
          )}
        </button>
        
        <button
          type="button"
          onClick={() => navigate('/master?tab=services')}
          className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'services'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <ScissorsIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          Услуги
        </button>
        
        <button
          type="button"
          onClick={() => navigate('/master?tab=stats')}
          className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'stats'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <PresentationChartLineIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          Статистика
        </button>
        
        <button
          type="button"
          onClick={() => navigate('/master?tab=tariff')}
          data-testid="nav-tariff"
          className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'tariff'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <CreditCardIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          Мой тариф
        </button>
        
        {hasFinanceAccess && (
          <button
            type="button"
            onClick={() => navigate('/master?tab=accounting')}
            className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'accounting'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <BanknotesIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
            Финансы
          </button>
        )}
        
        <button
          type="button"
          onClick={() => navigate('/master?tab=settings')}
          className={`flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'settings'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Cog6ToothIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          Настройки
        </button>
        
        {pendingInvitations > 0 && (
          <button
            type="button"
            onClick={() => navigate('/master?tab=salon-work')}
            className="relative flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
          >
            <InboxIcon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1">Приглашения</span>
            <span className="shrink-0 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
              {pendingInvitations}
            </span>
          </button>
        )}
      </nav>
    </div>
  )
}

export default function MasterTariff({ canCustomizeDomain, onRefreshSubscriptionFeatures }) {
  const location = useLocation()
  const navigate = useNavigate()
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
  // Variant A: скрываем “кошелек/баланс” из пользовательского UI
  const [paymentBalance, setPaymentBalance] = useState(null)
  const [paymentTransactions, setPaymentTransactions] = useState([])
  const [autoRenewal, setAutoRenewal] = useState(false)
  const [autoRenewalPeriod, setAutoRenewalPeriod] = useState('1')
  const [autoRenewalPlan, setAutoRenewalPlan] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('card') // Общий способ оплаты для всех платежей
  const [referralCodeData, setReferralCodeData] = useState(null)
  const [currentPromo, setCurrentPromo] = useState(null)
  const [subscriptionPoints, setSubscriptionPoints] = useState({ balance: 0, items: [] })
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [promoMessage, setPromoMessage] = useState('')
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  
  const refreshSubscriptionFeatures = onRefreshSubscriptionFeatures || (() => {})

  useEffect(() => {
    loadSubscriptionData()
    loadFreezeInfo()
    loadPromoEngineData()
  }, [])

  useEffect(() => {
    // Variant A: не показываем "кошелек/баланс" пользователю
  }, [activeSection])

  // Variant A: loadPaymentData удален (кошелек/баланс скрыт из UI)

  // Загружаем конфликты расписания
  useEffect(() => {
    const loadScheduleConflicts = async () => {
      try {
        const data = await apiGet('/api/master/schedule/weekly?weeks_ahead=4')
        const conflictsByDate = new Set()
        data.slots.forEach(slot => {
          if (slot.is_working && slot.has_conflict) {
            conflictsByDate.add(slot.schedule_date)
          }
        })
        setScheduleConflicts(conflictsByDate.size)
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
      
      // Загружаем данные подписки (GET read-only, 404 = no_subscription)
      const response = await fetch(`/api/subscriptions/my`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSubscriptionData(data)
        if (data.auto_renewal !== undefined) {
          setAutoRenewal(data.auto_renewal)
        }
      } else if (response.status === 404) {
        setSubscriptionData(null)
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

  const loadPromoEngineData = async () => {
    try {
      const [referral, current, points] = await Promise.all([
        getMasterReferralCode(),
        getCurrentMasterPromoCode(),
        getSubscriptionPoints(),
      ])
      setReferralCodeData(referral)
      setCurrentPromo(current?.promo_code || null)
      setSubscriptionPoints(points || { balance: 0, items: [] })
    } catch (error) {
      console.error('Ошибка загрузки промокодов:', error)
    }
  }

  const handleCopyReferralCode = async () => {
    const code = referralCodeData?.code
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setPromoMessage('Промокод скопирован')
      setPromoError('')
    } catch {
      setPromoError('Не удалось скопировать промокод')
    }
  }

  const handleApplyPromoCode = async (e) => {
    e.preventDefault()
    const code = promoCodeInput.trim()
    if (!code) {
      setPromoError('Введите промокод')
      return
    }
    setPromoLoading(true)
    setPromoError('')
    setPromoMessage('')
    try {
      await applyMasterPromoCode(code)
      setPromoCodeInput('')
      setPromoMessage('Промокод применён. Бонус будет начислен после первой оплаты подписки.')
      await loadPromoEngineData()
    } catch (error) {
      setPromoError(getPromoErrorMessage(error))
      await loadPromoEngineData()
    } finally {
      setPromoLoading(false)
    }
  }

  // После возврата со страницы успешной оплаты — форс-обновляем данные (без перезагрузки страницы)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || '')
      if (params.get('refresh') === '1') {
        loadSubscriptionData()
        refreshSubscriptionFeatures()
        params.delete('refresh')
        const nextSearch = params.toString()
        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : ''
          },
          { replace: true }
        )
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

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

  const formatPoints = (value) => `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} баллов`

  const getPointsTraceTitle = (item) => {
    const promo = item?.promo || {}
    if (promo.recipient_role === 'referrer') {
      return promo.invited_master_name_masked
        ? `За приглашённого мастера ${promo.invited_master_name_masked}`
        : 'За приглашённого мастера'
    }
    if (promo.recipient_role === 'beneficiary') return 'По применённому промокоду'
    return item?.description || 'Начисление бонусных баллов'
  }

  const getPointsTraceSubtitle = (item) => {
    const promo = item?.promo || {}
    const parts = []
    if (promo.promo_code) parts.push(`Промокод ${promo.promo_code}`)
    if (promo.campaign_type) parts.push(promo.campaign_type === 'master_referral' ? 'реферальная программа' : 'промо-кампания')
    if (promo.period_months) parts.push(`${promo.period_months} мес.`)
    if (promo.percent) parts.push(`${promo.percent}%`)
    return parts.join(' · ')
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
  const hasPaidSubscriptionPlan = !isFreePlan && !isAlwaysFree
  const tariffComparisonRows = getMasterTariffComparisonRows(planData, isAlwaysFree)
  const { left: tariffLeftCol, right: tariffRightCol } = splitTariffComparisonColumns(tariffComparisonRows)
  const canFreeze = freezeInfo?.can_freeze && !isFreePlan

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8" data-testid="tariff-page-title">Мой тариф</h1>
          
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
                      type="button"
                      onClick={() => setShowSubscriptionModal(true)}
                      className="inline-flex w-full items-center justify-center gap-2 py-3 px-4 rounded-md text-sm font-medium transition-colors text-gray-400 bg-gray-100 hover:bg-gray-200"
                    >
                      Собственный сайт
                      <LockClosedIcon className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
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
                      data-testid="tariff-buy-button"
                      className="w-full py-3 px-4 bg-[#4CAF50] text-white rounded-lg font-medium hover:bg-[#45A049] transition-colors mt-auto"
                    >
                      {isFreePlan ? 'Купить подписку' : 'Продлить/повысить подписку'}
                    </button>
                </div>
                
                  <div className="flex flex-col">
                    <div className="p-4 bg-[#DFF5EC] rounded-lg h-full flex flex-col border border-green-200">
                    <h3 className="font-medium text-[#4CAF50] mb-3">Доступные функции</h3>
                      <div className="flex gap-6 text-sm flex-1">
                        <div className="flex-1 space-y-2 min-w-0">
                          {tariffLeftCol.map((row) => (
                            <div key={row.key} className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0" aria-hidden>
                                {row.available ? (
                                  <CheckIcon className="h-4 w-4 text-[#4CAF50]" strokeWidth={2.5} />
                                ) : (
                                  <XMarkIcon className="h-4 w-4 text-red-500" strokeWidth={2.5} />
                                )}
                              </span>
                              <span className={row.available ? 'text-[#4CAF50] font-medium' : 'text-gray-500'}>
                                {row.label}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex-1 space-y-2 min-w-0">
                          {tariffRightCol.map((row) => (
                            <div key={row.key} className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0" aria-hidden>
                                {row.available ? (
                                  <CheckIcon className="h-4 w-4 text-[#4CAF50]" strokeWidth={2.5} />
                                ) : (
                                  <XMarkIcon className="h-4 w-4 text-red-500" strokeWidth={2.5} />
                                )}
                              </span>
                              <span className={row.available ? 'text-[#4CAF50] font-medium' : 'text-gray-500'}>
                                {row.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Ваш промокод</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Поделитесь кодом с другим мастером. После его первой оплаты от 3 месяцев вы оба получите бонусные баллы на оплату подписки.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyReferralCode}
                      disabled={!referralCodeData?.code}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Скопировать
                    </button>
                  </div>
                  <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                    <div className="text-xs uppercase tracking-wide text-green-700 font-semibold">Личный код</div>
                    <div className="mt-1 text-2xl font-bold tracking-wide text-gray-900" data-testid="master-referral-code">
                      {referralCodeData?.code || 'Загрузка...'}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="font-medium text-gray-900 mb-1">Мастер по вашему коду</div>
                      <div className="text-gray-600">3 мес — 15%, 6 мес — 20%, 12 мес — 25%</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="font-medium text-gray-900 mb-1">Вы получите</div>
                      <div className="text-gray-600">15% от первой оплаты приглашённого мастера от 3 месяцев</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Введите промокод</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Бонусные баллы начислятся после первой успешной оплаты подписки. Для текущих acquisition-промокодов применить код можно только до первой оплаты.
                  </p>
                  {currentPromo ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 mb-4" data-testid="current-promo-state">
                      <div className="font-medium text-green-900">Промокод применён</div>
                      <div className="text-sm text-green-800 mt-1">
                        {currentPromo.code} · бонус будет начислен после первой оплаты.
                      </div>
                    </div>
                  ) : null}
                  {!currentPromo && hasPaidSubscriptionPlan ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 text-sm text-amber-900" data-testid="paid-promo-unavailable-state">
                      {PROMO_FIRST_PAYMENT_ONLY_MESSAGE}
                    </div>
                  ) : null}
                  <form className="flex flex-col sm:flex-row gap-2" onSubmit={handleApplyPromoCode}>
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                      placeholder="Промокод"
                      className="flex-1 border rounded-lg px-3 py-2 min-h-[44px]"
                      data-testid="master-promo-code-input"
                    />
                    <button
                      type="submit"
                      disabled={promoLoading}
                      className="px-4 py-2 rounded-lg bg-[#4CAF50] text-white font-medium hover:bg-[#45A049] disabled:opacity-50"
                    >
                      {promoLoading ? 'Проверяем...' : 'Применить'}
                    </button>
                  </form>
                  {promoMessage ? <div className="mt-3 text-sm text-green-700">{promoMessage}</div> : null}
                  {promoError ? <div className="mt-3 text-sm text-red-700" data-testid="master-promo-error">{promoError}</div> : null}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-4" data-testid="subscription-points-card">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Бонусные баллы</h2>
                    <p className="text-sm text-gray-600 mt-1">Баллы на оплату подписки. Это не деньги и не клиентская лояльность.</p>
                  </div>
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                    <div className="text-xs text-green-700 font-semibold">Текущий баланс</div>
                    <div className="text-2xl font-bold text-gray-900">{formatPoints(subscriptionPoints?.balance)}</div>
                  </div>
                </div>
                {subscriptionPoints?.items?.length ? (
                  <div className="space-y-3">
                    {subscriptionPoints.items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-gray-900">{getPointsTraceTitle(item)}</div>
                            <div className="text-sm text-gray-600 mt-1">{getPointsTraceSubtitle(item) || item.description}</div>
                            <div className="text-xs text-gray-500 mt-1">{formatDateTime(item.created_at)} · {item.status || item.direction || 'active'}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-700">+{formatPoints(item.amount)}</div>
                            <div className="text-xs text-gray-500">осталось {formatPoints(item.remaining_amount)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600" data-testid="subscription-points-empty">
                    Пока нет бонусных баллов. Они появятся после первой оплаты мастера, который использовал ваш промокод, или после вашей оплаты с применённым промокодом.
                  </div>
                )}
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
                    <h3 className="font-medium text-[#4CAF50] mb-3">Возможности</h3>
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
                          <option value="card">Банковские карты (рекомендуется)</option>
                          <option value="sbp">СБП</option>
                          {/* Variant A: кошельки/баланс скрыты из UI */}
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
                      
                      <p className="text-sm text-gray-500 mt-2">
                        Автопродление по карте будет добавлено позже (требуется привязка).
                      </p>
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
                
                {/* Variant A: “кошелек/баланс” и транзакции скрыты из UI */}
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
