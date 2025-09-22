import React, { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_BASE_URL } from '../utils/config'
import { Button } from '../components/ui'

export default function MasterTariff() {
  const [activeSection, setActiveSection] = useState('subscription')
  const [subscriptionData, setSubscriptionData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoMessage, setPromoMessage] = useState('')

  useEffect(() => {
    loadSubscriptionData()
  }, [])

  const loadSubscriptionData = async () => {
    try {
      const token = localStorage.getItem('access_token')
      console.log('Токен авторизации:', token ? 'Найден' : 'Не найден')
      console.log('API URL:', `/api/subscriptions/my`)
      
      const response = await fetch(`/api/subscriptions/my`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('Статус ответа:', response.status)
      console.log('Заголовки ответа:', Object.fromEntries(response.headers.entries()))
      
      if (response.ok) {
        const data = await response.json()
        console.log('Данные подписки получены:', data)
        setSubscriptionData({
          status: data.status,
          plan: data.subscription_type === 'master' ? 'Индивидуальный мастер' : 'Салон',
          expiresAt: data.end_date,
          monthlyBookings: data.master_bookings,
          price: data.price,
          paymentMethod: 'card',
          autoRenewal: data.auto_renewal
        })
      } else {
        console.error('Ошибка загрузки подписки:', response.status)
        const errorText = await response.text()
        console.error('Текст ошибки:', errorText)
      }
    } catch (error) {
      console.error('Ошибка загрузки данных подписки:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-[#4CAF50] bg-[#DFF5EC]'
      case 'expired': return 'text-red-600 bg-red-100'
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Активна'
      case 'expired': return 'Истекла'
      case 'pending': return 'Ожидает оплаты'
      default: return 'Неизвестно'
    }
  }

  const handlePromoCodeActivation = async () => {
    if (!promoCode.trim()) {
      setPromoMessage('Введите промо-код')
      return
    }

    setPromoLoading(true)
    setPromoMessage('')

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/promo-codes/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: promoCode.trim() })
      })

      if (response.ok) {
        const data = await response.json()
        setPromoMessage('Промо-код успешно активирован!')
        setPromoCode('')
        // Перезагружаем данные подписки
        await loadSubscriptionData()
      } else {
        const errorData = await response.json()
        setPromoMessage(errorData.detail || 'Ошибка активации промо-кода')
      }
    } catch (error) {
      console.error('Ошибка активации промо-кода:', error)
      setPromoMessage('Ошибка соединения с сервером')
    } finally {
      setPromoLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F7F6]">
        <Header />
        <div className="pt-[140px] px-6">
          <div className="max-w-4xl mx-auto">
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
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6]">
      <Header />
      <div className="pt-[140px] px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Мой тариф</h1>
          
          {/* Навигация по разделам */}
          <div className="flex space-x-1 bg-white rounded-lg p-1 mb-8 shadow-sm">
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
              onClick={() => setActiveSection('website')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeSection === 'website'
                  ? 'bg-[#4CAF50] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Собственный сайт
            </button>
            <button
              onClick={() => setActiveSection('payment')}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                activeSection === 'payment'
                  ? 'bg-[#4CAF50] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Подключить оплату
            </button>
          </div>

          {/* Раздел: Моя подписка */}
          {activeSection === 'subscription' && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Информация о подписке</h2>
              
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Статус подписки</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscriptionData?.status)}`}>
                      {getStatusText(subscriptionData?.status)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Тарифный план</span>
                    <span className="font-medium">{subscriptionData?.plan}</span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Действует до</span>
                    <span className="font-medium">{formatDate(subscriptionData?.expiresAt)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Стоимость</span>
                    <span className="font-medium">{subscriptionData?.price} ₽/мес</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2E7D32] mb-3">Условия тарифа</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#4CAF50]">Месячных записей:</span>
                        <span className="font-medium">{subscriptionData?.monthlyBookings}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2E7D32] mb-3">Способ оплаты</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#4CAF50]">Метод:</span>
                        <span className="font-medium">Банковская карта</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#4CAF50]">Автопродление:</span>
                        <span className="font-medium">{subscriptionData?.autoRenewal ? 'Включено' : 'Отключено'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2E7D32] mb-3">Промо-код</h3>
                    <div className="space-y-3">
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          placeholder="Введите промо-код"
                          className="flex-1 px-3 py-2 border border-[#4CAF50] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:border-transparent"
                          maxLength={20}
                        />
                        <Button
                          onClick={handlePromoCodeActivation}
                          disabled={promoLoading || !promoCode.trim()}
                          className="px-4 py-2 text-sm"
                        >
                          {promoLoading ? 'Активация...' : 'Активировать'}
                        </Button>
                      </div>
                      {promoMessage && (
                        <div className={`text-sm p-2 rounded-md ${
                          promoMessage.includes('успешно') 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {promoMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex space-x-4">
                <Button>
                  Изменить тариф
                </Button>
                <Button variant="secondary">
                  История платежей
                </Button>
              </div>
            </div>
          )}

          {/* Раздел: Собственный сайт */}
          {activeSection === 'website' && (
            <div className="bg-white rounded-lg shadow-sm p-6">
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

          {/* Раздел: Подключить оплату */}
          {activeSection === 'payment' && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Подключение оплаты</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-3">Текущий статус</h3>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                        <span className="text-gray-600">Оплата не подключена</span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Подключите онлайн-оплату для приема предоплат от клиентов.
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2E7D32] mb-3">Доступные методы</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex items-center">
                          <span className="text-lg mr-3">💳</span>
                          <span className="font-medium">Банковские карты</span>
                        </div>
                        <span className="text-sm text-green-600">Рекомендуется</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex items-center">
                          <span className="text-lg mr-3">📱</span>
                          <span className="font-medium">СБП</span>
                        </div>
                        <span className="text-sm text-gray-500">Доступно</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex items-center">
                          <span className="text-lg mr-3">🏦</span>
                          <span className="font-medium">Электронные кошельки</span>
                        </div>
                        <span className="text-sm text-gray-500">Доступно</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h3 className="font-medium text-yellow-900 mb-3">Комиссии</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-yellow-700">Банковские карты:</span>
                        <span className="font-medium">2.8%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-700">СБП:</span>
                        <span className="font-medium">0.7%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-700">Электронные кошельки:</span>
                        <span className="font-medium">3.5%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-medium text-green-900 mb-3">Преимущества</h3>
                    <ul className="space-y-1 text-sm text-green-700">
                      <li>• Предоплата услуг</li>
                      <li>• Меньше отмен</li>
                      <li>• Стабильный доход</li>
                      <li>• Автоматические выплаты</li>
                      <li>• Защита от мошенничества</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <Button>
                  Подключить оплату
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 