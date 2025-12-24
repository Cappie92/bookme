import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import MasterSettings from '../components/MasterSettings'
import Header from '../components/Header'
import MasterScheduleCalendar from '../components/MasterScheduleCalendar'
import SalonWorkSchedule from '../components/SalonWorkSchedule'
import CategoryEditModal from '../modals/CategoryEditModal'
import ServiceEditModal from '../modals/ServiceEditModal'
import MasterTariff from './MasterTariff'
import PaymentMethodSelector from '../components/PaymentMethodSelector'
import { API_BASE_URL } from '../utils/config'
import DepositModal from '../modals/DepositModal'
import MasterDashboardStats from '../components/MasterDashboardStats'
import MasterStats from '../components/MasterStats'
import MasterAccounting from '../components/MasterAccounting'
import MasterLoyalty from '../components/MasterLoyalty'
import PastAppointments from '../components/PastAppointments'
import { isSalonFeaturesEnabled } from '../config/features'
import { useMasterSubscription } from '../hooks/useMasterSubscription'
import SubscriptionModal from '../components/SubscriptionModal'

function MasterSidebar({ activeTab, setActiveTab, refreshKey, masterSettings, scheduleConflicts, hasFinanceAccess, hasExtendedStats, handleTabChange }) {
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
        setUnconfirmedBookings(data.count || 0)
      }
    } catch (err) {
      console.error('Ошибка загрузки неподтвержденных услуг:', err)
    }
  }

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
          onClick={() => handleTabChange ? handleTabChange('dashboard') : setActiveTab('dashboard')}
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
        
        {/* Расписание - показываем всегда */}
        <button
          onClick={() => handleTabChange ? handleTabChange('schedule') : setActiveTab('schedule')}
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
        
        {/* Услуги - показываем всегда */}
        <button
          onClick={() => handleTabChange ? handleTabChange('services') : setActiveTab('services')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'services'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          ✂️ Услуги
        </button>
        
        {/* Работа в салоне - показываем только если включены функции салона */}
        {isSalonFeaturesEnabled() && (
          <button
            onClick={() => handleTabChange ? handleTabChange('salon-work') : setActiveTab('salon-work')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'salon-work'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            🏢 Работа в салоне
            {pendingInvitations > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {pendingInvitations}
              </span>
            )}
          </button>
        )}
        
        {/* Статистика - показываем всегда */}
        <button
          onClick={() => handleTabChange ? handleTabChange('stats') : setActiveTab('stats')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'stats'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          📈 Статистика
        </button>
        
        {/* Бухгалтерия - показываем всегда */}
        <button
          onClick={() => handleTabChange ? handleTabChange('accounting') : setActiveTab('accounting')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors bg-red-200 border-2 border-red-500 ${
            activeTab === 'accounting'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          💰 Финансы
        </button>
        
        {/* Лояльность - показываем только если доступна */}
        {hasFinanceAccess ? (
          <button
            onClick={() => handleTabChange ? handleTabChange('loyalty') : setActiveTab('loyalty')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'loyalty'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            🎁 Лояльность
          </button>
        ) : (
          <div className="w-full text-left px-4 py-2 rounded-lg text-gray-400 cursor-not-allowed relative group">
            🎁 Лояльность
            <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              Доступно на плане Pro и выше
            </span>
          </div>
        )}
        
        {/* Мой тариф - показываем всегда */}
        <button
          onClick={() => handleTabChange ? handleTabChange('tariff') : setActiveTab('tariff')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'tariff'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          💳 Мой тариф
        </button>
        
        <button
          onClick={() => handleTabChange ? handleTabChange('settings') : setActiveTab('settings')}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'settings'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          ⚙️ Настройки
        </button>
      </nav>
    </div>
  )
}



function ServicesSection() {
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingService, setEditingService] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [categoriesRes, servicesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/master/categories`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }),
        fetch(`${API_BASE_URL}/api/master/services`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        })
      ])

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json()
        setCategories(categoriesData)
      }

      if (servicesRes.ok) {
        const servicesData = await servicesRes.json()
        setServices(servicesData)
      }
    } catch (err) {
      console.error('Ошибка загрузки данных:', err)
      setError('Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateCategory = async (categoryData) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(categoryData)
      })

      if (res.ok) {
        setShowCategoryModal(false)
        setEditingCategory(null)
        loadData()
      } else {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Ошибка создания категории')
      }
    } catch (err) {
      console.error('Ошибка создания категории:', err)
      throw err
    }
  }

  const handleUpdateCategory = async (categoryData) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(categoryData)
      })

      if (res.ok) {
        setShowCategoryModal(false)
        setEditingCategory(null)
        loadData()
      } else {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Ошибка обновления категории')
      }
    } catch (err) {
      console.error('Ошибка обновления категории:', err)
      throw err
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Удалить категорию и все связанные услуги?')) return

    try {
      const res = await fetch(`${API_BASE_URL}/api/master/categories/${categoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })

      if (res.ok) {
        loadData()
      }
    } catch (err) {
      console.error('Ошибка удаления категории:', err)
    }
  }

  const handleCreateService = async (serviceData) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(serviceData)
      })

      if (res.ok) {
        setShowServiceModal(false)
        setEditingService(null)
        loadData()
      } else {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Ошибка создания услуги')
      }
    } catch (err) {
      console.error('Ошибка создания услуги:', err)
      throw err
    }
  }

  const handleUpdateService = async (serviceData) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/services/${editingService.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(serviceData)
      })

      if (res.ok) {
        setShowServiceModal(false)
        setEditingService(null)
        loadData()
      }
    } catch (err) {
      console.error('Ошибка обновления услуги:', err)
    }
  }

  const handleDeleteService = async (serviceId) => {
    if (!confirm('Удалить услугу?')) return

    try {
      const res = await fetch(`${API_BASE_URL}/api/master/services/${serviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })

      if (res.ok) {
        loadData()
      }
    } catch (err) {
      console.error('Ошибка удаления услуги:', err)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">Загрузка услуг...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Список услуг с вложенными категориями */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Мои услуги</h2>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditingCategory(null)
                setShowCategoryModal(true)
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              Создать категорию
            </button>
            <button
              onClick={() => {
                setEditingService(null)
                setShowServiceModal(true)
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Создать услугу
            </button>
          </div>
        </div>

        {/* Услуги без категорий */}
        {services.filter(service => !service.category_id).length > 0 && (
          <div className="mb-6">
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">Без категории</h3>
                    <p className="text-sm text-gray-600">{services.filter(service => !service.category_id).length} услуг</p>
                  </div>
                </div>
              </div>
              <div className="divide-y">
                {services.filter(service => !service.category_id).map(service => (
                  <div key={service.id} className="p-4 pl-8 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-lg">{service.name}</h4>
                        {service.description && (
                          <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>Стоимость: {service.price} ₽</span>
                          <span>Длительность: {service.duration} мин</span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingService(service)
                            setShowServiceModal(true)
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteService(service.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Категории с услугами */}
        {categories.length === 0 ? (
          services.filter(service => !service.category_id).length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 mb-4">У вас пока нет услуг</div>
              <p className="text-sm text-gray-400">Создайте первую услугу, нажав кнопку "Создать услугу"</p>
            </div>
          ) : null
        ) : (
          <div className="space-y-6">
            {categories.map(category => {
              // Получаем услуги для этой категории
              const categoryServices = services.filter(service => service.category_id === category.id)
              
              return (
                <div key={category.id} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-800">{category.name}</h3>
                        <p className="text-sm text-gray-600">{categoryServices.length} услуг</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCategory({ id: category.id, name: category.name })
                            setShowCategoryModal(true)
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y">
                    {categoryServices.length === 0 ? (
                      <div className="p-4 pl-8 text-gray-500 text-sm">
                        В этой категории пока нет услуг
                      </div>
                    ) : (
                      categoryServices.map(service => (
                        <div key={service.id} className="p-4 pl-8 hover:bg-gray-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-medium text-lg">{service.name}</h4>
                              {service.description && (
                                <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                              )}
                              <div className="flex gap-4 mt-2 text-sm text-gray-500">
                                <span>Стоимость: {service.price} ₽</span>
                                <span>Длительность: {service.duration} мин</span>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => {
                                  setEditingService(service)
                                  setShowServiceModal(true)
                                }}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Редактировать
                              </button>
                              <button
                                onClick={() => handleDeleteService(service.id)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Модальные окна */}
      {showCategoryModal && (
        <CategoryEditModal
          open={showCategoryModal}
          category={editingCategory}
          onSave={editingCategory ? handleUpdateCategory : handleCreateCategory}
          onClose={() => {
            setShowCategoryModal(false)
            setEditingCategory(null)
          }}
        />
      )}

      {showServiceModal && (
        <ServiceEditModal
          open={showServiceModal}
          service={editingService}
          categories={categories}
          onSave={editingService ? handleUpdateService : handleCreateService}
          onClose={() => {
            setShowServiceModal(false)
            setEditingService(null)
          }}
          onCategoryCreated={(newCategory) => {
            setCategories(prev => [...prev, newCategory])
          }}
        />
      )}
    </div>
  )
}

function SalonWorkSection({ onInvitationUpdate }) {
  const [salonData, setSalonData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSalon, setSelectedSalon] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(new Date())

  useEffect(() => {
    loadSalonWorkData()
  }, [])

  const loadSalonWorkData = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/salon-work`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setSalonData(data)
        if (data.working_salons.length > 0) {
          setSelectedSalon(data.working_salons[0])
        }
      } else {
        setError('Ошибка загрузки данных о работе в салонах')
      }
    } catch (err) {
      console.error('Ошибка сети:', err)
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvitation = async (invitationId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/invitations/${invitationId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ response: 'accept' })
      })
      
      if (res.ok) {
        await loadSalonWorkData()
        onInvitationUpdate()
      } else {
        const data = await res.json()
        setError(data.detail || 'Ошибка принятия приглашения')
      }
    } catch (err) {
      console.error('Ошибка принятия приглашения:', err)
      setError('Ошибка сети')
    }
  }

  const handleDeclineInvitation = async (invitationId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/invitations/${invitationId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ response: 'decline' })
      })
      
      if (res.ok) {
        await loadSalonWorkData()
        onInvitationUpdate()
      } else {
        const data = await res.json()
        setError(data.detail || 'Ошибка отклонения приглашения')
      }
    } catch (err) {
      console.error('Ошибка отклонения приглашения:', err)
      setError('Ошибка сети')
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU')
  }

  const formatTime = (timeString) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}ч ${mins}мин`
    }
    return `${mins}мин`
  }

  const formatEarnings = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount)
  }

  // Функции для работы с календарем
  const getWeekDates = (startDate) => {
    const monday = new Date(startDate)
    const currentDay = monday.getDay()
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1
    monday.setDate(monday.getDate() - daysToMonday)
    
    const weekDates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      weekDates.push(date)
    }
    return weekDates
  }

  const getBookingsForDate = (date) => {
    if (!selectedSalon) return []
    const dateStr = date.toISOString().split('T')[0]
    return selectedSalon.bookings.filter(booking => 
      booking.start_time.startsWith(dateStr)
    )
  }

  const getScheduleForDate = (date) => {
    if (!selectedSalon) return []
    const dateStr = date.toISOString().split('T')[0]
    return selectedSalon.schedule.filter(schedule => 
      schedule.date === dateStr
    )
  }

  const getEarningsForDate = (date) => {
    const bookings = getBookingsForDate(date)
    return bookings.reduce((total, booking) => total + booking.master_earnings, 0)
  }

  const isWorkingDay = (date) => {
    const schedule = getScheduleForDate(date)
    return schedule.some(s => s.is_available)
  }

  const hasBookings = (date) => {
    const bookings = getBookingsForDate(date)
    return bookings.length > 0
  }

  const getDayClass = (date) => {
    const isWorking = isWorkingDay(date)
    const hasBookingsOnDay = hasBookings(date)
    
    if (hasBookingsOnDay) {
      return 'bg-blue-100 border-blue-300'
    } else if (isWorking) {
      return 'bg-green-100 border-green-300'
    } else {
      return 'bg-gray-100 border-gray-300'
    }
  }

  const navigateWeek = (direction) => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(newWeek.getDate() + (direction * 7))
    setCurrentWeek(newWeek)
  }

  const weekDates = getWeekDates(currentWeek)

  if (loading) return <div className="text-center py-8">Загрузка...</div>

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold mb-8">Работа в салоне</h1>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      
      {/* Приглашения от салонов */}
      {salonData?.pending_invitations && salonData.pending_invitations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="text-orange-600">📨</span>
            Приглашения на работу
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {salonData.pending_invitations.length}
            </span>
          </h2>
          <div className="grid gap-4">
            {salonData.pending_invitations.map(invitation => (
              <div key={invitation.id} className="border border-orange-300 bg-orange-50 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900">{invitation.salon_name}</h3>
                    <p className="text-gray-600">{invitation.salon_phone}</p>
                    <p className="text-gray-500 text-sm">
                      Получено: {formatDate(invitation.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                    >
                      Принять
                    </button>
                    <button 
                      onClick={() => handleDeclineInvitation(invitation.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Салоны где мастер работает */}
      {salonData?.working_salons && salonData.working_salons.length > 0 ? (
        <div className="space-y-6">
          {/* Выбор салона */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h2 className="text-lg font-semibold mb-3">Выберите салон:</h2>
            <div className="flex gap-2 flex-wrap">
              {salonData.working_salons.map(salon => (
                <button
                  key={salon.salon_id}
                  onClick={() => setSelectedSalon(salon)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    selectedSalon?.salon_id === salon.salon_id
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {salon.salon_name}
                </button>
              ))}
            </div>
          </div>

          {selectedSalon && (
            <>
              {/* Информация о салоне */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-8 h-32">
                  {/* Левая часть - логотип */}
                  <div className="flex-shrink-0">
                    <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                      {selectedSalon.logo ? (
                        <img 
                          src={selectedSalon.logo} 
                          alt="Логотип салона" 
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="text-gray-400 text-6xl">🏢</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Центральная часть - основная информация */}
                  <div className="flex-1 flex flex-col justify-center space-y-2">
                    <h2 className="text-xl font-semibold text-gray-900 text-center">
                      {selectedSalon.salon_name}
                    </h2>
                    
                    <div className="flex flex-col items-center space-y-1">
                      {selectedSalon.salon_phone && (
                        <p className="text-gray-600 flex items-center gap-2">
                          <span className="text-gray-400">📞</span>
                          {selectedSalon.salon_phone}
                        </p>
                      )}
                      
                      {selectedSalon.email && (
                        <p className="text-gray-600 flex items-center gap-2">
                          <span className="text-gray-400">✉️</span>
                          {selectedSalon.email}
                        </p>
                      )}
                      
                      {selectedSalon.address && (
                        <p className="text-gray-600 flex items-center gap-2 text-center">
                          <span className="text-gray-400">📍</span>
                          <span className="text-sm">{selectedSalon.address}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Правая часть - график работы */}
                  {selectedSalon.working_hours && (
                    <div className="flex-shrink-0 w-64">
                      <div className="text-gray-600 h-full flex flex-col justify-center">
                        <p className="font-medium mb-3 flex items-center gap-2">
                          <span className="text-gray-400">🕒</span>
                          График работы
                        </p>
                        <div className="text-sm space-y-1">
                          {(() => {
                            try {
                              const hours = JSON.parse(selectedSalon.working_hours);
                              const days = {
                                monday: 'Пн',
                                tuesday: 'Вт', 
                                wednesday: 'Ср',
                                thursday: 'Чт',
                                friday: 'Пт',
                                saturday: 'Сб',
                                sunday: 'Вс'
                              };
                              
                              // Группируем дни с одинаковым временем
                              const groupedHours = {};
                              Object.entries(hours).forEach(([day, time]) => {
                                const timeKey = `${time.start}-${time.end}`;
                                if (!groupedHours[timeKey]) {
                                  groupedHours[timeKey] = [];
                                }
                                groupedHours[timeKey].push(days[day]);
                              });
                              
                              return Object.entries(groupedHours).map(([timeRange, dayList]) => (
                                <p key={timeRange} className="text-gray-500">
                                  {dayList.join(', ')}: {timeRange.split('-')[0]} - {timeRange.split('-')[1]}
                                </p>
                              ));
                            } catch {
                              return <p className="text-gray-500">{selectedSalon.working_hours}</p>;
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Расписание работы в салоне */}
              <SalonWorkSchedule 
                salonData={salonData}
                selectedSalon={selectedSalon}
                onWeekChange={(offset) => console.log('Week changed:', offset)}
              />

              {/* Услуги */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h2 className="text-xl font-semibold mb-4">Услуги</h2>
                {selectedSalon.services.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Услуги не найдены</p>
                ) : (
                  <div className="space-y-2">
                    {selectedSalon.services.map(service => (
                      <div key={service.service_id} className="flex justify-between items-center py-2 px-3 border-b border-gray-100 last:border-b-0">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{service.service_name}</span>
                          <span className="text-gray-500 ml-2">{formatDuration(service.service_duration)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-green-600">
                            {formatEarnings(service.master_earnings)} ₽
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-center py-8">
            <p className="text-gray-500 mb-2">Вы ещё не работаете ни в одном салоне</p>
            <p className="text-sm text-gray-400">Дождитесь приглашений от салонов</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MasterDashboard() {
  const { hasFinanceAccess, hasExtendedStats } = useMasterSubscription()
  const { search } = useLocation()
  const navigate = useNavigate()
  
  // Читаем tab из query параметров
  const getTabFromUrl = () => {
    const params = new URLSearchParams(search)
    const tab = params.get('tab')
    return tab || 'dashboard'
  }
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl())
  
  // Синхронизируем activeTab с URL при изменении
  useEffect(() => {
    const tabFromUrl = getTabFromUrl()
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  
  // Обновляем URL при изменении activeTab
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    navigate(`/master?tab=${tab}`, { replace: true })
  }
  const [schedule, setSchedule] = useState({})
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [refreshInvitations, setRefreshInvitations] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [scheduleConflicts, setScheduleConflicts] = useState(0)
  const [allConflicts, setAllConflicts] = useState([])
  const [masterSettings, setMasterSettings] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [balance, setBalance] = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [bookingsLimit, setBookingsLimit] = useState(null)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [scheduleView, setScheduleView] = useState('schedule') // 'schedule' или 'past'
  const [profileWarnings, setProfileWarnings] = useState([])

  // Проверка авторизации
  const checkAuth = () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      window.location.href = '/login'
      return false
    }
    return true
  }

  // Компонент MasterSidebar
  const MasterSidebar = ({ activeTab, setActiveTab, refreshKey, masterSettings, scheduleConflicts, handleTabChange, hasFinanceAccess }) => {
    const [pendingInvitations, setPendingInvitations] = useState(0)

    useEffect(() => {
      loadPendingInvitations()
    }, [refreshKey])

    const loadPendingInvitations = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) return

      try {
        const response = await fetch('/api/master/invitations', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setPendingInvitations(data.length)
        }
      } catch (error) {
        console.error('Ошибка загрузки приглашений:', error)
      }
    }

    return (
      <div className="w-64 bg-white shadow-lg h-screen fixed left-0 top-0 pt-[140px] z-10">
        <div className="p-4 space-y-2">
          {/* Дашборд */}
          <button
            onClick={() => handleTabChange ? handleTabChange('dashboard') : setActiveTab('dashboard')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            📊 Дашборд
          </button>
          
          {/* Расписание */}
          <button
            onClick={() => handleTabChange ? handleTabChange('schedule') : setActiveTab('schedule')}
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
          
          {/* Услуги */}
          <button
            onClick={() => handleTabChange ? handleTabChange('services') : setActiveTab('services')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'services'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            ✂️ Услуги
          </button>
          
          {/* Статистика */}
          <button
            onClick={() => handleTabChange ? handleTabChange('stats') : setActiveTab('stats')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'stats'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            📈 Статистика
          </button>
          
          {/* Работа в салоне - показываем только если включены функции салона */}
          {isSalonFeaturesEnabled() && (
            <button
              onClick={() => handleTabChange ? handleTabChange('salon-work') : setActiveTab('salon-work')}
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'salon-work'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              🏢 Работа в салоне
              {pendingInvitations > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {pendingInvitations}
                </span>
              )}
            </button>
          )}
          
        {/* Бухгалтерия - показываем только если доступна */}
        {hasFinanceAccess ? (
          <button
            onClick={() => handleTabChange ? handleTabChange('accounting') : setActiveTab('accounting')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'accounting'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            💰 Финансы
          </button>
        ) : (
          <div className="w-full text-left px-4 py-2 rounded-lg text-gray-400 cursor-not-allowed relative group">
            💰 Финансы
            <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              Доступно на плане Pro и выше
            </span>
          </div>
        )}
        
        {/* Лояльность - показываем только если доступна */}
        {hasFinanceAccess ? (
          <button
            onClick={() => handleTabChange ? handleTabChange('loyalty') : setActiveTab('loyalty')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'loyalty'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            🎁 Лояльность
          </button>
        ) : (
          <div className="w-full text-left px-4 py-2 rounded-lg text-gray-400 cursor-not-allowed relative group">
            🎁 Лояльность
            <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              Доступно на плане Pro и выше
            </span>
          </div>
        )}
          
          {/* Мой тариф - показываем всегда */}
          <button
            onClick={() => handleTabChange ? handleTabChange('tariff') : setActiveTab('tariff')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'tariff'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            💳 Мой тариф
          </button>
          
          {/* Настройки */}
          <button
            onClick={() => handleTabChange ? handleTabChange('settings') : setActiveTab('settings')}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            ⚙️ Настройки
          </button>
        </div>

      </div>
    )
  }

  // Загрузка настроек мастера
  const loadMasterSettings = async () => {
    if (!checkAuth()) return
    
    setSettingsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/settings`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setMasterSettings(data.master)
        setIsAuthorized(true)
      } else if (res.status === 401) {
        // Если токен недействителен, перенаправляем на логин
        localStorage.removeItem('access_token')
        window.location.href = '/login'
      } else {
        console.error('Ошибка загрузки настроек мастера:', res.status)
      }
    } catch (err) {
      console.error('Ошибка сети при загрузке настроек:', err)
    } finally {
      setSettingsLoading(false)
    }
  }

  // Загрузка баланса и статуса подписки
  const loadBookingsLimit = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`/api/master/bookings/limit`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBookingsLimit(data);
      }
    } catch (err) {
      console.error('Ошибка загрузки лимита записей:', err);
    }
  };

  const loadBalanceAndSubscription = async () => {
    if (!checkAuth()) return
    
    try {
      const token = localStorage.getItem('access_token')
      
      // Загружаем баланс
      const balanceResponse = await fetch(`${API_BASE_URL}/api/balance/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json()
        setBalance(balanceData)
      } else if (balanceResponse.status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
        return
      }
      
      // Загружаем статус подписки
      const subscriptionResponse = await fetch(`${API_BASE_URL}/api/balance/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (subscriptionResponse.ok) {
        const subscriptionData = await subscriptionResponse.json()
        setSubscriptionStatus(subscriptionData)
      } else if (subscriptionResponse.status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
        return
      }
      
    } catch (error) {
      console.error('Ошибка при загрузке баланса и подписки:', error)
    }
  }

  // Проверка заполненности профиля
  const checkProfileCompleteness = async () => {
    if (!checkAuth()) return
    
    const warnings = []
    const token = localStorage.getItem('access_token')
    
    try {
      // Загружаем настройки мастера
      const settingsRes = await fetch(`${API_BASE_URL}/api/master/settings`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        const { user, master } = settingsData
        
        // Проверка имени
        if (!user.full_name || user.full_name.trim() === '') {
          warnings.push({
            type: 'name',
            message: 'Не указано имя',
            link: 'settings'
          })
        }
        
        // Проверка фото
        if (!master.photo || master.photo.trim() === '') {
          warnings.push({
            type: 'photo',
            message: 'Не загружено фото',
            link: 'settings'
          })
        }
        
        // Проверка адреса и города
        if (!master.address || master.address.trim() === '' || !master.city || master.city.trim() === '') {
          warnings.push({
            type: 'address',
            message: 'Не указаны адрес и/или город',
            link: 'settings'
          })
        }
        
        // Проверка телефона и email
        if ((!user.phone || user.phone.trim() === '') && (!user.email || user.email.trim() === '')) {
          warnings.push({
            type: 'contact',
            message: 'Не указаны телефон и/или e-mail',
            link: 'settings'
          })
        }
      }
      
      // Проверка наличия услуг
      const servicesRes = await fetch(`${API_BASE_URL}/api/master/services`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (servicesRes.ok) {
        const servicesData = await servicesRes.json()
        if (!servicesData || servicesData.length === 0) {
          warnings.push({
            type: 'services',
            message: 'Не добавлены услуги',
            link: 'services'
          })
        }
      }
      
      // Проверка наличия расписания и доступных слотов
      const scheduleRes = await fetch(`${API_BASE_URL}/api/master/schedule/weekly?week_offset=0&weeks_ahead=4`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json()
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const availableSlots = scheduleData.slots?.filter(slot => {
          const slotDate = new Date(slot.schedule_date)
          slotDate.setHours(0, 0, 0, 0)
          
          return slot.is_working && 
                 !slot.has_conflict &&
                 slotDate >= today
        }) || []
        
        if (availableSlots.length === 0) {
          warnings.push({
            type: 'schedule',
            message: 'Нет доступных слотов для записи',
            link: 'schedule'
          })
        }
      }
      
      setProfileWarnings(warnings)
    } catch (err) {
      console.error('Ошибка проверки заполненности профиля:', err)
    }
  }

  // Загрузка конфликтов расписания
  const loadScheduleConflicts = async () => {
    if (!checkAuth()) return
    
    try {
      // Загружаем конфликты на 52 недели назад и 12 недель вперед
      const res = await fetch(`${API_BASE_URL}/api/master/schedule/weekly?week_offset=-52&weeks_ahead=64`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        
        // Подсчитываем конфликты по дням (не по слотам)
        const conflictsByDate = new Set()
        const allConflictsList = []
        
        data.slots.forEach(slot => {
          if (slot.is_working && slot.has_conflict) {
            conflictsByDate.add(slot.schedule_date)
            allConflictsList.push({
              date: slot.schedule_date,
              start_time: `${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`,
              end_time: `${(slot.hour + (slot.minute + 30 >= 60 ? 1 : 0)).toString().padStart(2, '0')}:${((slot.minute + 30) % 60).toString().padStart(2, '0')}`,
              conflict_type: slot.conflict_type,
              work_type: slot.work_type
            })
          }
        })
        
        setScheduleConflicts(conflictsByDate.size)
        setAllConflicts(allConflictsList)
      } else if (res.status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
        return
      }
    } catch (err) {
      console.error('Ошибка загрузки конфликтов расписания:', err)
    }
  }

  useEffect(() => {
    // Проверяем авторизацию при загрузке компонента
    if (!checkAuth()) return
    
    loadMasterSettings()
    loadBalanceAndSubscription()
    loadBookingsLimit()
    loadScheduleConflicts() // Загружаем конфликты при входе
    checkProfileCompleteness() // Проверяем заполненность профиля
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Перезагружаем расписание при изменении недели
  useEffect(() => {
    if (activeTab === 'schedule') {
      loadSchedule()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekOffset, activeTab])

  // Загрузка расписания
  const loadSchedule = async () => {
    if (!checkAuth()) return
    
    setScheduleLoading(true)
    setScheduleError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/schedule/weekly?week_offset=${currentWeekOffset}&weeks_ahead=3`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        // Преобразуем слоты в формат для календаря
        const scheduleDict = {}
        data.slots.forEach(slot => {
          const key = `${slot.schedule_date}_${slot.hour}_${slot.minute}`
          scheduleDict[key] = {
            is_working: slot.is_working,
            work_type: slot.work_type,
            has_conflict: slot.has_conflict,
            conflict_type: slot.conflict_type
          }
        })
        setSchedule(scheduleDict)
      } else if (res.status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
        return
      } else {
        setScheduleError('Ошибка загрузки расписания')
      }
    } catch (err) {
      console.error('Ошибка загрузки расписания:', err)
      setScheduleError('Ошибка сети')
    } finally {
      setScheduleLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'schedule') {
      loadSchedule()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Обработка массовых изменений
  const handleScheduleChange = async (updates) => {
    setSchedule(prev => {
      const newSchedule = { ...prev, ...updates }
      return newSchedule
    })
    
    // Получаем все слоты недели с обновлениями
    const allSlots = []
    
    // Получаем даты текущей недели
    const today = new Date()
    const currentDay = today.getDay() // 0 = воскресенье, 1 = понедельник
    const monday = new Date(today)
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1))
    
    // Генерируем все слоты недели
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monday)
      currentDate.setDate(monday.getDate() + i)
      const dateStr = currentDate.toISOString().split('T')[0]
      
      for (let hour = 0; hour < 24; hour++) {
        for (let minute of [0, 30]) {
          const key = `${dateStr}_${hour}_${minute}`
          const isWorking = updates[key] !== undefined ? updates[key] : (schedule[key] || false)
          
          allSlots.push({
            schedule_date: dateStr,
            hour: hour,
            minute: minute,
            is_working: isWorking
          })
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/master/schedule/weekly`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ slots: allSlots })
      })
      
      if (res.ok) {
        // Обновляем проверку заполненности после успешного сохранения расписания
        checkProfileCompleteness()
      } else {
        console.error('Ошибка сохранения расписания:', res.status)
        // Откатываем изменения при ошибке
        setSchedule(prev => {
          const newSchedule = { ...prev }
          Object.keys(updates).forEach(key => {
            delete newSchedule[key]
          })
          return newSchedule
        })
      }
    } catch (err) {
      console.error('Ошибка сохранения расписания:', err)
      // Откатываем изменения при ошибке
      setSchedule(prev => {
        const newSchedule = { ...prev }
        Object.keys(updates).forEach(key => {
          delete newSchedule[key]
        })
        return newSchedule
      })
    }
  }

  // Функция для изменения недели
  const handleWeekChange = (offset) => {
    setCurrentWeekOffset(offset)
  }

  // Функция для обновления счетчика приглашений
  const refreshInvitationsCount = () => {
    setRefreshInvitations(prev => prev + 1)
  }

  // Функция для обновления настроек после их изменения
  const refreshSettings = () => {
    loadMasterSettings()
    checkProfileCompleteness()
  }

  // Обработка успешного пополнения баланса
  const handleDepositSuccess = (result) => {
    // Обновляем баланс после успешного пополнения
    if (balance) {
      setBalance({
        ...balance,
        balance: result.new_balance
      });
    }
  };

  // Проверяем авторизацию перед рендером
  if (!localStorage.getItem('access_token')) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex justify-center items-center h-screen">
          <div className="text-xl">Перенаправление на страницу входа...</div>
        </div>
      </div>
    )
  }

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex justify-center items-center h-screen">
          <div className="text-xl">Загрузка...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="flex">
        <MasterSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          refreshKey={refreshInvitations}
          masterSettings={masterSettings}
          scheduleConflicts={scheduleConflicts}
          hasFinanceAccess={hasFinanceAccess}
          hasExtendedStats={hasExtendedStats}
          handleTabChange={handleTabChange}
        />
        <main className="flex-1 ml-64 pt-[140px] p-8">
          {activeTab === 'dashboard' && (
            <div>
              <h1 className="text-3xl font-bold mb-6">Дашборд мастера</h1>
              
              {/* Баланс, подписка и предупреждения */}
              {(balance || subscriptionStatus || profileWarnings.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {balance && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Баланс</h3>
                          <p className="text-2xl font-bold text-green-600 mt-1">
                            {balance.available_balance !== undefined ? balance.available_balance.toFixed(2) : balance.balance.toFixed(2)} ₽
                          </p>
                        </div>
                        <div className="p-2 bg-green-100 rounded-lg">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                          </svg>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowDepositModal(true)}
                        className="w-full bg-green-600 text-white py-1.5 px-3 rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        Пополнить баланс
                      </button>
                    </div>
                  )}
                  
                  {subscriptionStatus && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-gray-900">Подписка</h3>
                          {subscriptionStatus.plan_name && (
                            <p className="text-lg font-semibold text-gray-900 mt-1">
                              {subscriptionStatus.plan_display_name || subscriptionStatus.plan_name}
                            </p>
                          )}
                          <p className={`text-sm font-medium mt-1 ${subscriptionStatus.can_continue && !subscriptionStatus.is_frozen ? 'text-green-600' : 'text-red-600'}`}>
                            {subscriptionStatus.is_frozen 
                              ? subscriptionStatus.freeze_info 
                                ? `Приостановлена (${subscriptionStatus.freeze_info.start_date || ''} - ${subscriptionStatus.freeze_info.end_date || ''})`
                                : 'Приостановлена'
                              : subscriptionStatus.can_continue 
                                ? 'Активна' 
                                : 'Бесплатная'}
                          </p>
                          {bookingsLimit && bookingsLimit.plan_name === "Free" && (
                            <p className="text-xs text-gray-600 mt-1">
                              Активные записи: {bookingsLimit.current_active_bookings}/{bookingsLimit.max_future_bookings}
                            </p>
                          )}
                        </div>
                        <div className={`p-2 rounded-lg ${subscriptionStatus.can_continue ? 'bg-green-100' : 'bg-red-100'}`}>
                          <svg className={`w-6 h-6 ${subscriptionStatus.can_continue ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Карточка предупреждений о нехватке информации */}
                  {profileWarnings.length > 0 && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-yellow-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Требуется внимание</h3>
                          <p className="text-lg font-bold text-yellow-600 mt-1">
                            {profileWarnings.length} {profileWarnings.length === 1 ? 'проблема' : profileWarnings.length < 5 ? 'проблемы' : 'проблем'}
                          </p>
                        </div>
                        <div className="p-2 bg-yellow-100 rounded-lg">
                          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {profileWarnings.slice(0, 2).map((warning, index) => (
                          <button
                            key={index}
                            onClick={() => handleTabChange ? handleTabChange(warning.link) : setActiveTab(warning.link)}
                            className="w-full text-left text-xs text-gray-700 hover:text-blue-600 transition-colors"
                          >
                            • {warning.message}
                          </button>
                        ))}
                        {profileWarnings.length > 2 && (
                          <p className="text-xs text-gray-500">
                            +{profileWarnings.length - 2} еще
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Статистика дашборда */}
              <MasterDashboardStats 
                onNavigateToStats={() => handleTabChange('stats')} 
                subscriptionStatus={subscriptionStatus}
                hasExtendedStats={hasExtendedStats}
                onConfirmSuccess={() => {
                  setRefreshKey(prev => prev + 1);
                }}
                onOpenSubscriptionModal={() => setShowSubscriptionModal(true)}
              />
            </div>
          )}
          {activeTab === 'schedule' && (
            <div>
              <h1 className="text-3xl font-bold mb-6">Расписание</h1>
              
              {/* Навигация между расписанием и прошедшими записями */}
              <div className="mb-6">
                <div className="flex gap-2">
                  <button
                    onClick={() => setScheduleView('schedule')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      scheduleView === 'schedule'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Расписание
                  </button>
                  <button
                    onClick={() => setScheduleView('past')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      scheduleView === 'past'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Прошедшие записи
                  </button>
                </div>
              </div>

              {/* Контент в зависимости от выбранного вида */}
              {scheduleView === 'schedule' ? (
                <>
                  {scheduleError && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                      {scheduleError}
                    </div>
                  )}
                  {scheduleLoading ? (
                    <div className="text-center py-8">Загрузка расписания...</div>
                  ) : (
                    <MasterScheduleCalendar
                        key="master-schedule-calendar"
                        schedule={schedule}
                        onChange={handleScheduleChange}
                        currentWeekOffset={currentWeekOffset}
                        setCurrentWeekOffset={setCurrentWeekOffset}
                        onWeekChange={handleWeekChange}
                        allConflicts={allConflicts}
                      />
                  )}
                </>
              ) : (
                <PastAppointments />
              )}
            </div>
          )}
          {activeTab === 'services' && <ServicesSection />}
          {activeTab === 'stats' && (
            <div>
              <h1 className="text-3xl font-bold mb-6">Статистика</h1>
              <MasterStats 
                hasExtendedStats={hasExtendedStats}
                onOpenSubscriptionModal={() => setShowSubscriptionModal(true)}
              />
            </div>
          )}
          {activeTab === 'accounting' && hasFinanceAccess && (
            <div>
              <h1 className="text-3xl font-bold mb-6">Финансы</h1>
              <MasterAccounting />
            </div>
          )}
          {activeTab === 'accounting' && !hasFinanceAccess && (
            <div>
              <h1 className="text-3xl font-bold mb-6">Финансы</h1>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <p className="text-yellow-800">
                  Доступ к разделу "Финансы" доступен на плане Pro и выше.
                </p>
                <a href="/master/tariff" className="text-blue-600 underline mt-2 inline-block">
                  Обновить план
                </a>
              </div>
            </div>
          )}
          {isSalonFeaturesEnabled() && activeTab === 'salon-work' && (
            <SalonWorkSection onInvitationUpdate={refreshInvitationsCount} />
          )}
          {activeTab === 'loyalty' && hasFinanceAccess && (
            <div>
              <MasterLoyalty />
            </div>
          )}
          {activeTab === 'loyalty' && !hasFinanceAccess && (
            <div>
              <h1 className="text-3xl font-bold mb-6">Лояльность</h1>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <p className="text-yellow-800">
                  Доступ к разделу "Лояльность" доступен на плане Pro и выше.
                </p>
                <a href="/master?tab=tariff" className="text-blue-600 underline mt-2 inline-block">
                  Обновить план
                </a>
              </div>
            </div>
          )}
          {activeTab === 'settings' && <MasterSettings onSettingsUpdate={refreshSettings} />}
          {activeTab === 'tariff' && <MasterTariff />}
        </main>
      </div>
      
      {/* Модальное окно пополнения баланса */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={handleDepositSuccess}
        currentBalance={balance?.balance}
        availableBalance={balance?.available_balance}
      />
      
      {/* Модальное окно покупки подписки */}
      {showSubscriptionModal && (
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
          isFreePlan={subscriptionStatus?.plan_name === 'Free'}
          currentPlanDisplayOrder={subscriptionStatus?.plan_display_order}
        />
      )}
    </div>
  )
}
