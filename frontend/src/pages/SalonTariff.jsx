import React, { useState, useEffect } from 'react'
import { Button } from '../components/ui'

export default function SalonTariff() {
  const [activeSection, setActiveSection] = useState('subscription')
  const [subscriptionData, setSubscriptionData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSubscriptionData()
  }, [])

  const loadSubscriptionData = async () => {
    try {
      const response = await fetch('/api/subscriptions/my', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setSubscriptionData({
          status: data.status,
          plan: data.subscription_type === 'salon' ? 'Салон' : 'Мастер',
          expiresAt: data.valid_until,
          branches: data.salon_branches,
          employees: data.salon_employees,
          price: data.price,
          paymentMethod: data.payment_method,
          autoRenewal: data.auto_renewal
        })
      } else if (response.status === 404) {
        setSubscriptionData(null)
      } else {
        console.error('Ошибка загрузки подписки:', response.status)
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

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div>
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
                    <span className="font-medium">{subscriptionData?.price} ₽ в месяц</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Условия тарифа</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Количество филиалов:</span>
                        <span className="font-medium text-[#2D2D2D]">{subscriptionData?.branches}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Количество работников:</span>
                        <span className="font-medium text-[#2D2D2D]">{subscriptionData?.employees}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Способ оплаты</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Метод:</span>
                        <span className="font-medium text-[#2D2D2D]">Банковская карта</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Автопродление:</span>
                        <span className="font-medium text-[#2D2D2D]">{subscriptionData?.autoRenewal ? 'Включено' : 'Отключено'}</span>
                      </div>
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
                        У вас пока нет собственного домена. Подключите его для создания уникального сайта.
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Возможности</h3>
                    <ul className="space-y-2 text-sm text-[#2D2D2D]">
                      <li>• Собственный домен (например, mysalon.ru)</li>
                      <li>• Уникальный дизайн сайта</li>
                      <li>• SEO-оптимизация</li>
                      <li>• Интеграция с соцсетями</li>
                    </ul>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Стоимость</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Регистрация домена:</span>
                        <span className="font-medium text-[#2D2D2D]">от 500 ₽ в год</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Настройка сайта:</span>
                        <span className="font-medium text-[#2D2D2D]">2000 ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Поддержка:</span>
                        <span className="font-medium text-[#2D2D2D]">500 ₽ в месяц</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Преимущества</h3>
                    <ul className="space-y-1 text-sm text-[#2D2D2D]">
                      <li>• Повышение доверия клиентов</li>
                      <li>• Лучшая видимость в поиске</li>
                      <li>• Профессиональный имидж</li>
                      <li>• Независимость от платформы</li>
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
                        Подключите онлайн-оплату для приема платежей от клиентов.
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Доступные методы</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex items-center">
                          <span className="text-lg mr-3">💳</span>
                          <span className="font-medium text-[#2D2D2D]">Банковские карты</span>
                        </div>
                        <span className="text-sm text-[#2D2D2D]">Рекомендуется</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex items-center">
                          <span className="text-lg mr-3">📱</span>
                          <span className="font-medium text-[#2D2D2D]">СБП</span>
                        </div>
                        <span className="text-sm text-[#2D2D2D]">Доступно</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex items-center">
                          <span className="text-lg mr-3">🏦</span>
                          <span className="font-medium text-[#2D2D2D]">Электронные кошельки</span>
                        </div>
                        <span className="text-sm text-[#2D2D2D]">Доступно</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Комиссии</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Банковские карты:</span>
                        <span className="font-medium text-[#2D2D2D]">2.8%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">СБП:</span>
                        <span className="font-medium text-[#2D2D2D]">0.7%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#2D2D2D]">Электронные кошельки:</span>
                        <span className="font-medium text-[#2D2D2D]">3.5%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-[#DFF5EC] rounded-lg">
                    <h3 className="font-medium text-[#2D2D2D] mb-3">Преимущества</h3>
                    <ul className="space-y-1 text-sm text-[#2D2D2D]">
                      <li>• Мгновенные платежи</li>
                      <li>• Автоматическое зачисление</li>
                      <li>• Защита от мошенничества</li>
                      <li>• Поддержка круглосуточно</li>
                      <li>• Простая интеграция</li>
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
  )
} 