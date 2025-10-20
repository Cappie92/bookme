import React, { useState, useEffect } from 'react'

export default function SalonSidebar({ activeTab, setActiveTab }) {
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  const loadSubscription = async () => {
    try {
      const response = await fetch('/api/balance/subscription-status', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const subscriptionData = await response.json()
        setSubscription(subscriptionData)
      }
    } catch (error) {
      console.error('Ошибка загрузки подписки:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubscription()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Базовые пункты меню
  const baseMenuItems = [
    { id: 'dashboard', label: 'Дашборд', icon: '📊' },
    { id: 'masters', label: 'Мастера', icon: '🧑‍🎤' },
    { id: 'analytics', label: 'Аналитика', icon: '📈' },
    { id: 'places', label: 'Места', icon: '🪑' },
    { id: 'schedule', label: 'Расписание', icon: '📅' },
    { id: 'services', label: 'Услуги', icon: '✂️' },
    { id: 'loyalty', label: 'Лояльность', icon: '🎁' },
    { id: 'tariff', label: 'Мой тариф', icon: '💳' },
    { id: 'salon', label: 'Управление салоном', icon: '⚙️' },
    { id: 'restrictions', label: 'Ограничения', icon: '🚫' },
    { id: 'accounting', label: 'Бухгалтерия', icon: '💰' }
  ]

  // Проверяем, нужно ли показывать вкладку филиалов
  const canShowBranches = subscription?.max_branches >= 2

  // Формируем финальный список меню
  const menuItems = [
    ...baseMenuItems.slice(0, 1), // Дашборд
    ...(canShowBranches ? [{ id: 'branches', label: 'Филиалы', icon: '🏢' }] : []),
    ...baseMenuItems.slice(1) // Остальные пункты
  ]

  return (
    <aside className="w-64 bg-gray-100 p-4 min-h-screen pt-[140px] fixed left-0 top-0">
      <nav className="flex flex-col gap-2">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`text-left px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-3 ${
              activeTab === item.id
                ? 'bg-[#4CAF50] text-white shadow-md'
                : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-sm'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
} 