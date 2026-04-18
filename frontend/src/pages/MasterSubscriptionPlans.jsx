import { useState, useEffect } from 'react'
import { CheckIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { API_BASE_URL } from '../utils/config'
import { useMasterSubscription } from '../hooks/useMasterSubscription'
import { Link } from 'react-router-dom'
import { getPlanDisplayName } from '../utils/subscriptionPlanNames'

export default function MasterSubscriptionPlans() {
  const { planName, features } = useMasterSubscription()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('monthly') // 'monthly' или 'yearly'

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/subscription-plans/available?subscription_type=master`)
      
      if (response.ok) {
        const data = await response.json()
        setPlans(data.filter(plan => plan.is_active).sort((a, b) => a.display_order - b.display_order))
      } else {
        setError('Не удалось загрузить планы')
      }
    } catch (err) {
      console.error('Ошибка при загрузке планов:', err)
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId) => {
    if (!confirm('Вы уверены, что хотите обновить план подписки?')) return

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/subscriptions/upgrade`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: planId,
          period: selectedPeriod
        })
      })

      if (response.ok) {
        alert('План подписки успешно обновлен!')
        window.location.reload()
      } else {
        const error = await response.json()
        alert(`Ошибка: ${error.detail || 'Не удалось обновить план'}`)
      }
    } catch (err) {
      console.error('Ошибка при обновлении плана:', err)
      alert('Ошибка при обновлении плана')
    }
  }

  const getFeatureList = (planFeatures) => {
    const featuresList = []
    if (planFeatures?.can_customize_domain) {
      featuresList.push('Изменение URL домена')
    }
    if (planFeatures?.can_add_page_modules) {
      featuresList.push(`Модули на странице (${planFeatures.max_page_modules === 999999 ? '∞' : planFeatures.max_page_modules})`)
    }
    if (planFeatures?.has_finance_access) {
      featuresList.push('Доступ к финансам')
    }
    if (planFeatures?.has_extended_stats) {
      featuresList.push('Расширенная статистика')
    }
    return featuresList
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Загрузка планов...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Выберите план подписки</h1>
          <p className="text-gray-600">Выберите план, который лучше всего подходит для ваших потребностей</p>
        </div>

        {/* Переключатель периода */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg p-1 inline-flex shadow-sm">
            <button
              onClick={() => setSelectedPeriod('monthly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Месяц
            </button>
            <button
              onClick={() => setSelectedPeriod('yearly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'yearly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Год (скидка ~17%)
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Текущий план */}
        {planName && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800">
              Ваш текущий план: <span className="font-bold">{planName}</span>
            </p>
          </div>
        )}

        {/* Список планов */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = plan.name === planName
            const price = selectedPeriod === 'monthly' ? (plan.price_1month || 0) : ((plan.price_12months || 0) * 12)
            const featuresList = getFeatureList(plan.features)

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-lg shadow-lg border-2 ${
                  isCurrentPlan ? 'border-blue-500' : 'border-gray-200'
                } overflow-hidden`}
              >
                {isCurrentPlan && (
                  <div className="bg-blue-500 text-white text-center py-2 text-sm font-medium">
                    Текущий план
                  </div>
                )}
                
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{getPlanDisplayName(plan)}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900">
                      {price.toLocaleString()}₽
                    </span>
                    <span className="text-gray-600 ml-2">
                      / {selectedPeriod === 'monthly' ? 'мес' : 'год'}
                    </span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {featuresList.length > 0 ? (
                      featuresList.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-700">{feature}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-gray-500">Базовые функции</li>
                    )}
                  </ul>

                  {isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full py-2 px-4 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
                    >
                      Текущий план
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {planName && plan.price_1month > 0 ? 'Обновить' : 'Выбрать'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Дополнительная информация */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">Часто задаваемые вопросы</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Можно ли изменить план позже?</h3>
              <p className="text-gray-600 text-sm">
                Да, вы можете обновить или понизить план в любое время. Изменения вступят в силу немедленно.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Что происходит при отмене подписки?</h3>
              <p className="text-gray-600 text-sm">
                При отмене подписки вы переходите на бесплатный план Free. Доступ к расширенным функциям будет ограничен.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/master/dashboard"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Вернуться в кабинет
          </Link>
        </div>
      </div>
    </div>
  )
}

