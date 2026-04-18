import React, { useState, useEffect, useMemo } from 'react'
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  MapPinIcon,
  PhoneIcon,
} from '@heroicons/react/24/outline'
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
import { apiGet, apiPost, apiPut, apiDelete, apiRequest } from '../utils/api'
import DeleteConfirmModal from '../modals/DeleteConfirmModal'
import MasterDashboardStats from '../components/MasterDashboardStats'
import MasterStats from '../components/MasterStats'
import MasterAccounting from '../components/MasterAccounting'
// Используем LoyaltySystem вместо MasterLoyalty (MasterLoyalty не был включен в коммит 4395369)
import MasterLoyalty from '../components/LoyaltySystem'
import PastAppointments from '../components/PastAppointments'
import AllIssuesModal from '../components/AllIssuesModal'
import { isSalonFeaturesEnabled } from '../config/features'
import { useMasterSubscription } from '../hooks/useMasterSubscription'
import SubscriptionModal from '../components/SubscriptionModal'
import { formatMoney } from '../utils/formatMoney'
import { getCheapestPlanForFeature } from '../utils/getCheapestPlanForFeature'
import ClientRestrictionsManager from '../components/ClientRestrictionsManager'
import MasterClients from '../components/MasterClients'
import MasterClientsDemo from '../components/MasterClientsDemo'
import MasterAccountingDemo from '../components/MasterAccountingDemo'
import MasterLoyaltyDemo from '../components/MasterLoyaltyDemo'
import MasterStatsDemo from '../components/MasterStatsDemo'
import ClientRestrictionsDemo from '../components/ClientRestrictionsDemo'
import DemoAccessBanner from '../components/DemoAccessBanner'
import LockedNavItem from '../components/LockedNavItem'
import { useToast } from '../contexts/ToastContext'
import { getWeekDates } from '../utils/calendarUtils'
import MasterNavTabIcon from '../components/master/MasterNavTabIcon'
import MasterMobileBottomNav from '../components/master/mobile/MasterMobileBottomNav'
import MasterMobileMenu from '../components/master/mobile/MasterMobileMenu'
import {
  MASTER_NAV_SIDEBAR_LEAD,
  MASTER_NAV_SIDEBAR_TAIL,
  getMasterNavCatalogRows,
  MASTER_MOBILE_MAIN_BOTTOM_PADDING_CLASS,
} from '../config/masterNavConfig'

/** Ключ блока «Без категории» в Set свёрнутых секций */
const SERVICES_UNCATEGORIZED_KEY = '__uncategorized__'

function ServicesSection() {
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingService, setEditingService] = useState(null)
  /** Удаление услуги/категории: кастомный modal вместо window.confirm */
  const [pendingDelete, setPendingDelete] = useState(null)
  /** Пустой Set = все секции развёрнуты по умолчанию */
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState(() => new Set())

  const toggleSectionCollapsed = (key) => {
    setCollapsedSectionKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isSectionCollapsed = (key) => collapsedSectionKeys.has(key)

  /**
   * Загрузка списков. silent: true — без полноэкранного «Загрузка…» (список остаётся виден), после мутаций.
   * cache: 'no-store' — единое поведение refetch на iOS/Android mobile web (без устаревшего GET из кэша).
   */
  const loadData = async (options = {}) => {
    const { silent = false } = options
    if (!silent) setLoading(true)
    setError('')
    const getOpts = { method: 'GET', cache: 'no-store' }
    try {
      const [categoriesData, servicesData] = await Promise.all([
        apiRequest('/api/master/categories', getOpts).catch(() => []),
        apiRequest('/api/master/services', getOpts).catch(() => []),
      ])
      setCategories(Array.isArray(categoriesData) ? categoriesData : [])
      setServices(Array.isArray(servicesData) ? servicesData : [])
    } catch (err) {
      console.error('Ошибка загрузки данных:', err)
      setError('Ошибка загрузки данных')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleCreateCategory = async (categoryData) => {
    try {
      await apiPost('/api/master/categories', categoryData)
      setShowCategoryModal(false)
      setEditingCategory(null)
      await loadData({ silent: true })
    } catch (err) {
      const errorData = err.response?.data || {}
      throw new Error(errorData.detail || 'Ошибка создания категории')
    }
  }

  const handleUpdateCategory = async (categoryData) => {
    try {
      await apiPut(`/api/master/categories/${editingCategory.id}`, categoryData)
      setShowCategoryModal(false)
      setEditingCategory(null)
      await loadData({ silent: true })
    } catch (err) {
      const errorData = err.response?.data || {}
      throw new Error(errorData.detail || 'Ошибка обновления категории')
    }
  }

  const requestDeleteCategory = (categoryId, name) => {
    setPendingDelete({ type: 'category', id: categoryId, name })
  }

  const requestDeleteService = (serviceId, name) => {
    setPendingDelete({ type: 'service', id: serviceId, name })
  }

  const handleDeleteConfirmed = async () => {
    const t = pendingDelete
    if (!t) return
    if (t.type === 'service') {
      await apiDelete(`/api/master/services/${t.id}`)
    } else {
      await apiDelete(`/api/master/categories/${t.id}`)
    }
    await loadData({ silent: true })
  }

  const handleCreateService = async (serviceData) => {
    try {
      await apiPost('/api/master/services', serviceData)
      setShowServiceModal(false)
      setEditingService(null)
      await loadData({ silent: true })
    } catch (err) {
      const errorData = err.response?.data || {}
      throw new Error(errorData.detail || 'Ошибка создания услуги')
    }
  }

  const handleUpdateService = async (serviceData) => {
    try {
      await apiPut(`/api/master/services/${editingService.id}`, serviceData)
      setShowServiceModal(false)
      setEditingService(null)
      await loadData({ silent: true })
    } catch (err) {
      console.error('Ошибка обновления услуги:', err)
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
    <div className="space-y-4 lg:space-y-8">
      {/* Список услуг с вложенными категориями */}
      <div className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">Мои услуги</h2>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingService(null)
                setShowServiceModal(true)
              }}
              className="min-h-[40px] rounded-lg bg-green-600 px-3 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-green-700 sm:min-h-0 sm:px-4 sm:text-sm"
            >
              Создать услугу
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCategory(null)
                setShowCategoryModal(true)
              }}
              className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:min-h-0 sm:px-4 sm:text-sm"
            >
              Создать категорию
            </button>
          </div>
        </div>

        {/* Услуги без категорий */}
        {services.filter(service => !service.category_id).length > 0 && (
          <div className="mb-4 sm:mb-6">
            <div className="overflow-hidden rounded-lg border">
              <div className="border-b bg-gray-50 px-2.5 py-2 sm:px-3">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-start gap-1.5 rounded text-left"
                  onClick={() => toggleSectionCollapsed(SERVICES_UNCATEGORIZED_KEY)}
                  aria-expanded={!isSectionCollapsed(SERVICES_UNCATEGORIZED_KEY)}
                  aria-label={
                    isSectionCollapsed(SERVICES_UNCATEGORIZED_KEY)
                      ? 'Развернуть блок «Без категории»'
                      : 'Свернуть блок «Без категории»'
                  }
                >
                  <ChevronDownIcon
                    className={`mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 ${
                      isSectionCollapsed(SERVICES_UNCATEGORIZED_KEY) ? '-rotate-90' : ''
                    }`}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-tight text-gray-800">Без категории</h3>
                    <p className="text-[11px] leading-tight text-gray-500">
                      {services.filter(service => !service.category_id).length} услуг
                    </p>
                  </div>
                </button>
              </div>
              {!isSectionCollapsed(SERVICES_UNCATEGORIZED_KEY) ? (
              <div className="divide-y divide-gray-100">
                {services.filter(service => !service.category_id).map(service => (
                  <div key={service.id} className="px-2.5 py-2 transition-colors hover:bg-gray-50 sm:px-3 sm:py-2.5 lg:pl-6">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-gray-900">
                          {service.name}
                        </h4>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingService(service)
                              setShowServiceModal(true)
                            }}
                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-50"
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteService(service.id, service.name)}
                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                      {service.description && (
                        <p className="mt-1 text-xs leading-snug text-gray-600">{service.description}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-tight text-gray-500">
                        <span>
                          <span className="text-gray-400">Стоимость</span> · {service.price} ₽
                        </span>
                        <span>
                          <span className="text-gray-400">Длительность</span> · {service.duration} мин
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              ) : null}
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
          <div className="space-y-4 sm:space-y-6">
            {categories.map(category => {
              // Получаем услуги для этой категории
              const categoryServices = services.filter(service => service.category_id === category.id)
              const sectionKey = String(category.id)
              const collapsed = isSectionCollapsed(sectionKey)
              
              return (
                <div key={category.id} className="overflow-hidden rounded-lg border">
                  <div className="border-b bg-gray-50 px-2.5 py-2 sm:px-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-1.5 rounded text-left"
                        onClick={() => toggleSectionCollapsed(sectionKey)}
                        aria-expanded={!collapsed}
                        aria-label={
                          collapsed ? `Развернуть категорию «${category.name}»` : `Свернуть категорию «${category.name}»`
                        }
                      >
                        <ChevronDownIcon
                          className={`mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 ${
                            collapsed ? '-rotate-90' : ''
                          }`}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-semibold leading-tight text-gray-800">
                            {category.name}
                          </h3>
                          <p className="text-[11px] leading-tight text-gray-500">
                            {categoryServices.length} услуг
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory({ id: category.id, name: category.name })
                            setShowCategoryModal(true)
                          }}
                          className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-50"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteCategory(category.id, category.name)}
                          className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                  {!collapsed ? (
                  <div className="divide-y divide-gray-100">
                    {categoryServices.length === 0 ? (
                      <div className="px-2.5 py-2 pl-3 text-xs text-gray-500 sm:px-3 sm:py-2.5 lg:pl-6">
                        В этой категории пока нет услуг
                      </div>
                    ) : (
                      categoryServices.map(service => (
                        <div key={service.id} className="px-2.5 py-2 transition-colors hover:bg-gray-50 sm:px-3 sm:py-2.5 lg:pl-6">
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-gray-900">
                                {service.name}
                              </h4>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingService(service)
                                    setShowServiceModal(true)
                                  }}
                                  className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-50"
                                >
                                  Редактировать
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeleteService(service.id, service.name)}
                                  className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>
                            {service.description && (
                              <p className="mt-1 text-xs leading-snug text-gray-600">{service.description}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-tight text-gray-500">
                              <span>
                                <span className="text-gray-400">Стоимость</span> · {service.price} ₽
                              </span>
                              <span>
                                <span className="text-gray-400">Длительность</span> · {service.duration} мин
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  ) : null}
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
          onCategoryCreated={async () => {
            await loadData({ silent: true })
          }}
        />
      )}

      <DeleteConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        category={
          pendingDelete
            ? {
                type: pendingDelete.type === 'service' ? 'service' : 'category',
                name: pendingDelete.name,
              }
            : null
        }
        cancelLabel="Отмена"
        confirmLabel="Удалить"
        variant="danger"
      />
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
      const data = await apiGet('/api/master/salon-work')
      setSalonData(data)
      if (data.working_salons.length > 0) {
        setSelectedSalon(data.working_salons[0])
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
      await apiPost(`/api/master/invitations/${invitationId}/respond`, { response: 'accept' })
      await loadSalonWorkData()
      onInvitationUpdate()
    } catch (err) {
      const errorData = err.response?.data || {}
      setError(errorData.detail || 'Ошибка принятия приглашения')
    }
  }

  const handleDeclineInvitation = async (invitationId) => {
    try {
      await apiPost(`/api/master/invitations/${invitationId}/respond`, { response: 'decline' })
      await loadSalonWorkData()
      onInvitationUpdate()
    } catch (err) {
      const errorData = err.response?.data || {}
      setError(errorData.detail || 'Ошибка отклонения приглашения')
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
    <div className="space-y-6 lg:space-y-8">
      <h1 className="mb-4 text-2xl font-bold lg:mb-8 lg:text-3xl">Работа в салоне</h1>
      {error && <div className="mb-4 text-red-500">{error}</div>}
      
      {/* Приглашения от салонов */}
      {salonData?.pending_invitations && salonData.pending_invitations.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
          <h2 className="mb-4 flex flex-wrap items-center gap-2 text-lg font-semibold lg:text-xl">
            <InboxIcon className="h-6 w-6 shrink-0 text-orange-600" strokeWidth={2} aria-hidden />
            Приглашения на работу
            <span className="rounded-full bg-red-500 px-2 py-1 text-xs text-white">
              {salonData.pending_invitations.length}
            </span>
          </h2>
          <div className="grid gap-4">
            {salonData.pending_invitations.map(invitation => (
              <div key={invitation.id} className="rounded-lg border border-orange-300 bg-orange-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{invitation.salon_name}</h3>
                    <p className="text-gray-600">{invitation.salon_phone}</p>
                    <p className="text-sm text-gray-500">
                      Получено: {formatDate(invitation.created_at)}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:shrink-0">
                    <button 
                      type="button"
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      className="min-h-10 w-full rounded bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700 sm:w-auto"
                    >
                      Принять
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDeclineInvitation(invitation.id)}
                      className="min-h-10 w-full rounded bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 sm:w-auto"
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
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Выберите салон:</h2>
            <div className="flex flex-wrap gap-2">
              {salonData.working_salons.map(salon => (
                <button
                  type="button"
                  key={salon.salon_id}
                  onClick={() => setSelectedSalon(salon)}
                  className={`min-h-10 rounded-lg border px-4 py-2 text-left transition-colors ${
                    selectedSalon?.salon_id === salon.salon_id
                      ? 'border-blue-300 bg-blue-100 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
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
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                <div className="flex flex-col items-center gap-6 lg:h-32 lg:flex-row lg:items-center lg:gap-8">
                  {/* Левая часть - логотип */}
                  <div className="shrink-0">
                    <div className="flex h-28 w-28 items-center justify-center rounded-lg bg-gray-100 lg:h-32 lg:w-32">
                      {selectedSalon.logo ? (
                        <img 
                          src={selectedSalon.logo} 
                          alt="Логотип салона" 
                          className="h-full w-full rounded-lg object-cover"
                        />
                      ) : (
                        <BuildingOffice2Icon
                          className="h-14 w-14 text-gray-400 lg:h-16 lg:w-16"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      )}
                    </div>
                  </div>
                  
                  {/* Центральная часть - основная информация */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center space-y-2 text-center lg:text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedSalon.salon_name}
                    </h2>
                    
                    <div className="flex flex-col items-center space-y-1 lg:items-start">
                      {selectedSalon.salon_phone && (
                        <p className="flex items-center gap-2 text-gray-600">
                          <PhoneIcon className="h-5 w-5 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
                          {selectedSalon.salon_phone}
                        </p>
                      )}
                      
                      {selectedSalon.email && (
                        <p className="flex min-w-0 items-center gap-2 break-all text-gray-600">
                          <EnvelopeIcon className="h-5 w-5 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
                          {selectedSalon.email}
                        </p>
                      )}
                      
                      {selectedSalon.address && (
                        <p className="flex items-start gap-2 text-center text-gray-600 lg:text-left">
                          <MapPinIcon
                            className="mt-0.5 h-5 w-5 shrink-0 text-gray-400"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span className="text-sm">{selectedSalon.address}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Правая часть - график работы */}
                  {selectedSalon.working_hours && (
                    <div className="w-full shrink-0 border-t border-gray-100 pt-4 lg:w-64 lg:border-t-0 lg:pt-0">
                      <div className="flex flex-col justify-center text-gray-600 lg:h-full">
                        <p className="mb-3 flex items-center justify-center gap-2 font-medium lg:justify-start">
                          <ClockIcon className="h-5 w-5 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
                          График работы
                        </p>
                        <div className="space-y-1 text-center text-sm lg:text-left">
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
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                <h2 className="mb-4 text-xl font-semibold">Услуги</h2>
                {selectedSalon.services.length === 0 ? (
                  <p className="py-4 text-center text-gray-500">Услуги не найдены</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {selectedSalon.services.map(service => (
                      <div
                        key={service.service_id}
                        className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-gray-900">{service.service_name}</span>
                          <span className="ml-2 text-gray-500">{formatDuration(service.service_duration)}</span>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="py-8 text-center">
            <p className="mb-2 text-gray-500">Вы ещё не работаете ни в одном салоне</p>
            <p className="text-sm text-gray-400">Дождитесь приглашений от салонов</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MasterDashboard() {
  const { showToast } = useToast()
  const {
    hasFinanceAccess,
    hasExtendedStats,
    hasLoyaltyAccess,
    hasClientRestrictions,
    hasClientsAccess,
    loading: subscriptionFeaturesLoading,
    canCustomizeDomain,
    planName: subscriptionPlanName,
    refresh: refreshSubscriptionFeatures,
  } = useMasterSubscription()
  const { search } = useLocation()
  const navigate = useNavigate()
  const isDemoMode = localStorage.getItem('demo_mode') === '1' || new URLSearchParams(search).get('demo') === '1'
  const canUseFinance = isDemoMode || hasFinanceAccess
  const canUseExtendedStats = isDemoMode || hasExtendedStats
  const canUseLoyalty = isDemoMode || hasLoyaltyAccess
  const canUseRestrictions = isDemoMode || hasClientRestrictions
  const canUseClients = isDemoMode || hasClientsAccess
  
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
    navigate(`/master?tab=${encodeURIComponent(tab)}`, { replace: true })
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
  /** Полный ответ GET /api/master/settings (user+master) — для дочерних виджетов без повторного запроса */
  const [masterSettingsPayload, setMasterSettingsPayload] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [balance, setBalance] = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [bookingsLimit, setBookingsLimit] = useState(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [scheduleView, setScheduleView] = useState('schedule') // 'schedule' или 'past'
  const [profileWarnings, setProfileWarnings] = useState([])
  /**
   * Локально скрыть карточку «Требуется внимание» (без API).
   * Сброс: полная перезагрузка; в SPA — когда меняется состав предупреждений (type/message/link), а не только длина.
   */
  const [dashboardAttentionDismissed, setDashboardAttentionDismissed] = useState(false)
  const [subscriptionPlans, setSubscriptionPlans] = useState([])
  const [showAllIssuesModal, setShowAllIssuesModal] = useState(false)
  const [clientsUpdateTrigger, setClientsUpdateTrigger] = useState(0)
  const [masterMenuOpen, setMasterMenuOpen] = useState(false)
  /** Инкремент при тапе «Дашборд» в bottom bar — закрыть модалки дашборда (все записи и т.п.) */
  const [dashboardOverlayResetKey, setDashboardOverlayResetKey] = useState(0)

  const profileWarningsSignature = useMemo(() => {
    if (!profileWarnings.length) return ''
    const rows = profileWarnings.map((w) => [
      String(w.type ?? ''),
      String(w.message ?? ''),
      String(w.link ?? ''),
    ])
    rows.sort((a, b) => {
      for (let i = 0; i < 3; i += 1) {
        const c = a[i].localeCompare(b[i])
        if (c !== 0) return c
      }
      return 0
    })
    return JSON.stringify(rows)
  }, [profileWarnings])

  useEffect(() => {
    setDashboardAttentionDismissed(false)
  }, [profileWarningsSignature])

  useEffect(() => {
    setMasterMenuOpen(false)
  }, [activeTab])

  /** Единый сброс прокрутки при смене вкладки (в т.ч. прямой заход по ?tab=…), иначе позиция сохраняется от предыдущего экрана. */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [activeTab])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onViewport = () => {
      if (mq.matches) setMasterMenuOpen(false)
    }
    onViewport()
    mq.addEventListener('change', onViewport)
    return () => mq.removeEventListener('change', onViewport)
  }, [])

  // Проверка авторизации
  const checkAuth = () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      window.location.href = '/login'
      return false
    }
    return true
  }

  // Компонент MasterSidebar — пункты каталога из ../config/masterNavConfig (как у mobile menu)
  const MasterSidebar = ({ activeTab, setActiveTab, refreshKey, masterSettings, scheduleConflicts, handleTabChange, hasFinanceAccess, hasExtendedStats, hasLoyaltyAccess, hasClientRestrictions, hasClientsAccess, subscriptionPlans }) => {
    const [pendingInvitations, setPendingInvitations] = useState(0)

    useEffect(() => {
      loadPendingInvitations()
    }, [refreshKey])

    const loadPendingInvitations = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) return

      try {
        const data = await apiGet('/api/master/invitations')
        setPendingInvitations(data.length)
      } catch (error) {
        console.error('Ошибка загрузки приглашений:', error)
      }
    }

    const accessFlags = {
      hasExtendedStats,
      hasFinanceAccess,
      hasLoyaltyAccess,
      hasClientRestrictions,
      hasClientsAccess,
    }
    const catalogRows = getMasterNavCatalogRows(accessFlags, isSalonFeaturesEnabled(), {
      scheduleConflicts,
      pendingInvitations,
    })

    const navButtonClass = (tab) =>
      `w-full text-left px-4 py-2 rounded-lg transition-colors flex items-center gap-2.5 ${
        activeTab === tab ? 'bg-[#4CAF50]/20 text-[#81C784]' : 'text-gray-700 hover:bg-gray-100'
      }`

    const onNav = (tab) => (handleTabChange ? handleTabChange(tab) : setActiveTab(tab))

    return (
      <div className="hidden lg:block w-64 shrink-0 bg-white shadow-lg h-screen fixed left-0 top-0 pt-[140px] z-10">
        <div className="p-4 space-y-2">
            <button
            data-testid={MASTER_NAV_SIDEBAR_LEAD.navTestId}
            onClick={() => onNav(MASTER_NAV_SIDEBAR_LEAD.tab)}
            className={navButtonClass(MASTER_NAV_SIDEBAR_LEAD.tab)}
          >
            <MasterNavTabIcon tab={MASTER_NAV_SIDEBAR_LEAD.tab} className="h-5 w-5 shrink-0" />
            <span>{MASTER_NAV_SIDEBAR_LEAD.label}</span>
            </button>

          {catalogRows.map((row) =>
            row.unlocked ? (
            <button
                key={row.tab}
                type="button"
                data-testid={row.navTestId}
                onClick={() => onNav(row.tab)}
                className={navButtonClass(row.tab)}
              >
                <MasterNavTabIcon tab={row.tab} className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 text-left">{row.label}</span>
                {row.badge != null ? (
                  <span className="shrink-0 bg-red-500 text-white text-xs px-2 py-1 rounded-full">{row.badge}</span>
                ) : null}
          </button>
        ) : (
          <LockedNavItem
                key={row.tab}
                dataTestId={row.lockedNavTestId || `locked-${row.tab}`}
                navTab={row.tab}
                label={row.label}
            hasAccess={false}
                serviceFunctionId={row.lockedServiceFunctionId}
                tab={row.tab}
            activeTab={activeTab}
            handleTabChange={handleTabChange}
            subscriptionPlans={subscriptionPlans}
          />
            )
        )}
        
          <button
            data-testid={MASTER_NAV_SIDEBAR_TAIL.navTestId}
            onClick={() => onNav(MASTER_NAV_SIDEBAR_TAIL.tab)}
            className={navButtonClass(MASTER_NAV_SIDEBAR_TAIL.tab)}
          >
            <MasterNavTabIcon tab={MASTER_NAV_SIDEBAR_TAIL.tab} className="h-5 w-5 shrink-0" />
            <span>{MASTER_NAV_SIDEBAR_TAIL.label}</span>
          </button>
        </div>
      </div>
    )
  }

  // Загрузка настроек мастера
  const loadMasterSettings = async () => {
    if (!checkAuth()) return null
    
    setSettingsLoading(true)
    try {
      const data = await apiGet('/api/master/settings')
      setMasterSettings(data.master)
      setMasterSettingsPayload(data)
      setIsAuthorized(true)
      return data
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
      } else {
        console.error('Ошибка загрузки настроек мастера:', err)
      }
      return null
    } finally {
      setSettingsLoading(false)
    }
  }

  // Загрузка баланса и статуса подписки
  const loadBookingsLimit = async () => {
    try {
      const data = await apiGet('/api/master/bookings/limit');
      setBookingsLimit(data);
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
      
      // Загружаем планы подписки для определения самого дешевого тарифа
      const plansResponse = await fetch(`${API_BASE_URL}/api/subscription-plans/available?subscription_type=master`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (plansResponse.ok) {
        const plansData = await plansResponse.json()
        setSubscriptionPlans(plansData)
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
  const checkProfileCompleteness = async (preloadedSettings = null) => {
    if (!checkAuth()) return
    
    const warnings = []

    try {
      const settingsData =
        preloadedSettings && preloadedSettings.user && preloadedSettings.master
          ? preloadedSettings
          : await apiGet('/api/master/settings')
      const { user, master } = settingsData
        
        // Проверка ФИО
        if (!user.full_name || user.full_name.trim() === '') {
          warnings.push({
            type: 'name',
            message: 'Не указано ФИО',
            link: 'settings'
          })
        }
        
        // Проверка email
        if (!user.email || user.email.trim() === '') {
          warnings.push({
            type: 'email',
            message: 'Не указан email',
            link: 'settings'
          })
        }
        
        // Проверка фото
        if (!master.photo || master.photo.trim() === '') {
          warnings.push({
            type: 'photo',
            message: 'Не загружено фото профиля',
            link: 'settings'
          })
        }
        
        // Проверка описания
        if (!master.bio || master.bio.trim() === '') {
          warnings.push({
            type: 'bio',
            message: 'Не заполнено описание профиля',
            link: 'settings'
          })
        }
        
        // Проверка города
        if (!master.city || master.city.trim() === '') {
          warnings.push({
            type: 'city',
            message: 'Не указан город',
            link: 'settings'
          })
        }

        // Проверка часового пояса (обязателен для скидок)
        if (!master.timezone || !String(master.timezone).trim()) {
          warnings.push({
            type: 'timezone',
            message: 'Не указан часовой пояс',
            link: 'settings'
          })
        }
        
        // Проверка адреса
        if (!master.address || master.address.trim() === '') {
          warnings.push({
            type: 'address',
            message: 'Не указан адрес',
            link: 'settings'
          })
        }
      
      // Проверка наличия услуг
      const servicesData = await apiGet('/api/master/services').catch(() => [])
      if (!servicesData || servicesData.length === 0) {
        warnings.push({
          type: 'services',
          message: 'Не добавлены услуги',
          link: 'services'
        })
      }
      
      // Проверка наличия расписания и доступных слотов
      const scheduleData = await apiGet('/api/master/schedule/weekly?week_offset=0&weeks_ahead=4').catch(() => ({ slots: [] }))
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
      const data = await apiGet('/api/master/schedule/weekly?week_offset=-52&weeks_ahead=64')
      
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
    } catch (err) {
      console.error('Ошибка загрузки конфликтов расписания:', err)
    }
  }

  useEffect(() => {
    // Проверяем авторизацию при загрузке компонента
    const token = localStorage.getItem('access_token')
    if (!token) {
      navigate('/')
      return
    }
    
    // Небольшая задержка, чтобы убедиться, что токен сохранен
    const timer = setTimeout(() => {
      ;(async () => {
        const settingsData = await loadMasterSettings()
        if (settingsData) {
          await checkProfileCompleteness(settingsData)
        }
      loadBalanceAndSubscription()
      loadBookingsLimit()
        loadScheduleConflicts()
      })()
    }, 100)
    
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Перезагружаем расписание при изменении недели
  useEffect(() => {
    if (activeTab === 'schedule') {
      loadSchedule()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekOffset, activeTab])

  // Загрузка расписания (silent: без полноэкранного лоадера — после сохранения)
  const loadSchedule = async (options = {}) => {
    const silent = options.silent === true
    if (!checkAuth()) return

    if (!silent) {
      setScheduleLoading(true)
      setScheduleError('')
    }
    try {
      const data = await apiGet(`/api/master/schedule/weekly?week_offset=${currentWeekOffset}&weeks_ahead=3`)
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
    } catch (err) {
      console.error('Ошибка загрузки расписания:', err)
      setScheduleError('Ошибка сети')
    } finally {
      if (!silent) {
        setScheduleLoading(false)
      }
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
    const prevSchedule = schedule
    const merged = { ...schedule, ...updates }
    setSchedule(merged)

    const weekDates = getWeekDates(currentWeekOffset)
    const allSlots = []

    for (const dayData of weekDates) {
      const dateStr = dayData.date.toISOString().split('T')[0]
      for (let hour = 0; hour < 24; hour++) {
        for (let minute of [0, 30]) {
          const key = `${dateStr}_${hour}_${minute}`
          const slot = merged[key]
          const currentIsWorking =
            typeof slot === 'object' && slot !== null
              ? Boolean(slot.is_working)
              : Boolean(slot)
          allSlots.push({
            schedule_date: dateStr,
            hour,
            minute,
            is_working: currentIsWorking,
          })
        }
      }
    }

    try {
      await apiPut('/api/master/schedule/weekly', { slots: allSlots })
      await loadSchedule({ silent: true })
      loadScheduleConflicts()
      checkProfileCompleteness()
      showToast('Расписание сохранено')
    } catch (err) {
      console.error('Ошибка сохранения расписания:', err)
      const detail = err?.response?.data?.detail
      const msg =
        Array.isArray(detail)
          ? 'Не удалось сохранить расписание. Проверьте данные.'
          : (detail || 'Не удалось сохранить расписание')
      showToast(msg, 'error')
      setSchedule(prevSchedule)
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
  const refreshSettings = async () => {
    const data = await loadMasterSettings()
    if (data) {
      await checkProfileCompleteness(data)
    }
  }

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
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Header />
      {/* Mobile (<lg): sidebar скрыт, main на всю ширину. Навигация — Phase 2. Desktop: без изменений. */}
      <div className="flex min-w-0">
        <MasterSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          refreshKey={refreshInvitations}
          masterSettings={masterSettings}
          scheduleConflicts={scheduleConflicts}
          hasFinanceAccess={canUseFinance}
          hasExtendedStats={canUseExtendedStats}
          hasLoyaltyAccess={canUseLoyalty}
          hasClientRestrictions={canUseRestrictions}
          hasClientsAccess={canUseClients}
          handleTabChange={handleTabChange}
          subscriptionPlans={subscriptionPlans}
        />
        <main
          className={`flex-1 min-w-0 overflow-x-hidden ml-0 lg:ml-64 pt-[6.75rem] md:pt-24 lg:pt-[140px] px-4 lg:px-8 lg:pb-8 lg:overflow-x-visible ${MASTER_MOBILE_MAIN_BOTTOM_PADDING_CLASS}`}
        >
          {isDemoMode && (
            <div className="mb-6 rounded-xl border border-[#4CAF50]/40 bg-[#4CAF50]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[#2f7d32]">Демо-режим</p>
              <p className="text-sm text-[#2f7d32] mt-0.5">
                Вы просматриваете возможности кабинета мастера. Изменение данных в демо недоступно.
              </p>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <div className="min-w-0 overflow-x-hidden">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-4 lg:text-3xl lg:mb-6">Дашборд мастера</h1>

              {/* Phase 3: mobile — колонка с порядком «алерты → баланс → подписка»; lg+ — сетка 3 колонки как раньше */}
              {(balance ||
                subscriptionStatus ||
                (profileWarnings.length > 0 && !dashboardAttentionDismissed)) && (
                <div className="flex flex-col gap-3 mb-5 lg:mb-8 lg:grid lg:grid-cols-3 lg:gap-4">
                  {balance && (
                    <div className="order-2 bg-white p-3.5 lg:p-4 rounded-xl lg:rounded-lg shadow-sm border border-gray-200/90 lg:order-1">
                      <div className="flex items-center justify-between mb-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide lg:text-base lg:normal-case lg:tracking-normal lg:text-gray-900">Баланс</h3>
                          <p className="text-xl lg:text-2xl font-bold text-green-600 mt-0.5 lg:mt-1 tabular-nums">
                            {formatMoney(balance.available_balance !== undefined ? balance.available_balance : balance.balance)}
                          </p>
                          {subscriptionStatus && typeof subscriptionStatus.days_remaining === 'number' && (
                            <div className="mt-1">
                              <p className={`text-sm ${subscriptionStatus.days_remaining === 0 && (subscriptionStatus.daily_rate ?? 0) > 0 && (subscriptionStatus.plan_name ?? '').toLowerCase() !== 'free' && subscriptionStatus.status !== 'no_subscription' ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                                Дней осталось: {subscriptionStatus.days_remaining}
                              </p>
                              {subscriptionStatus.days_remaining === 0 && (subscriptionStatus.daily_rate ?? 0) > 0 && (subscriptionStatus.plan_name ?? '').toLowerCase() !== 'free' && subscriptionStatus.status !== 'no_subscription' && (
                                <p className="text-xs text-orange-600 mt-0.5">
                                  Пополните баланс, чтобы подписка не отключилась
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="p-2 bg-green-100 rounded-lg shrink-0">
                          <BanknotesIcon className="h-6 w-6 text-green-600" strokeWidth={2} aria-hidden />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSubscriptionModal(true)}
                        className="w-full bg-green-600 text-white py-2.5 lg:py-1.5 px-3 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        Продлить / Апгрейд
                      </button>
                    </div>
                  )}
                  
                  {subscriptionStatus && (
                    <div className="order-3 bg-white p-3.5 lg:p-4 rounded-xl lg:rounded-lg shadow-sm border border-gray-200/90 lg:order-2">
                      <div className="flex items-center justify-between mb-1 lg:mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide lg:text-base lg:normal-case lg:tracking-normal lg:text-gray-900">Подписка</h3>
                          {subscriptionStatus.plan_name && (
                            <p className="text-base lg:text-lg font-semibold text-gray-900 mt-0.5 lg:mt-1 truncate">
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
                          {bookingsLimit && bookingsLimit.plan_name === 'Free' && (
                            <p className="text-xs text-gray-600 mt-1">
                              Активные записи: {bookingsLimit.current_active_bookings}/{bookingsLimit.max_future_bookings}
                            </p>
                          )}
                        </div>
                        <div className={`p-2 rounded-lg shrink-0 ${subscriptionStatus.can_continue ? 'bg-green-100' : 'bg-red-100'}`}>
                          <CheckCircleIcon
                            className={`h-6 w-6 ${subscriptionStatus.can_continue ? 'text-green-600' : 'text-red-600'}`}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {profileWarnings.length > 0 && !dashboardAttentionDismissed && (
                    <div className="order-1 rounded border border-amber-300/80 bg-amber-50/95 px-1.5 py-0.5 shadow-sm lg:order-3 lg:rounded-lg lg:border-yellow-200 lg:bg-white lg:p-4 lg:shadow-sm">
                      {/* Mobile: одна полоса — иконка + заголовок/счёт в одной строке со «Скрыть», без отдельного helper-блока */}
                      <div className="flex items-start gap-1 lg:mb-3 lg:gap-3">
                        <ExclamationTriangleIcon
                          className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 lg:hidden"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="min-w-0 text-[11px] leading-tight text-amber-900 lg:hidden">
                              <span className="font-semibold">Требуется внимание</span>
                              <span className="font-bold tabular-nums text-amber-800">
                                {' '}
                                · {profileWarnings.length}{' '}
                                {profileWarnings.length === 1
                                  ? 'проблема'
                                  : profileWarnings.length < 5
                                    ? 'проблемы'
                                    : 'проблем'}
                              </span>
                            </p>
                            <div className="hidden min-w-0 flex-1 lg:block">
                              <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-semibold text-gray-900">Требуется внимание</h3>
                                <button
                                  type="button"
                                  onClick={() => setDashboardAttentionDismissed(true)}
                                  className="shrink-0 rounded px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
                                >
                                  Скрыть
                                </button>
                              </div>
                              <p className="mt-1 text-lg font-bold tabular-nums text-yellow-600">
                                {profileWarnings.length}{' '}
                                {profileWarnings.length === 1
                                  ? 'проблема'
                                  : profileWarnings.length < 5
                                    ? 'проблемы'
                                    : 'проблем'}
                          </p>
                        </div>
                            <button
                              type="button"
                              onClick={() => setDashboardAttentionDismissed(true)}
                              className="shrink-0 rounded px-1 py-0.5 text-[11px] font-medium text-amber-900/90 hover:bg-amber-100/90 lg:hidden"
                            >
                              Скрыть
                            </button>
                        </div>
                          <p className="mt-2 hidden text-xs leading-snug text-gray-500 lg:block">
                            {profileWarnings.length > 2
                              ? 'Первые два пункта ниже; остальное — в «Меню».'
                              : 'Нажмите строку — откроется раздел.'}
                          </p>
                      </div>
                        <div className="hidden shrink-0 rounded-lg bg-yellow-100 p-2 lg:flex">
                          <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" strokeWidth={2} aria-hidden />
                        </div>
                      </div>
                      <div className="mt-0 space-y-0 lg:mt-2 lg:space-y-1">
                        {profileWarnings.slice(0, 2).map((warning, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => (handleTabChange ? handleTabChange(warning.link) : setActiveTab(warning.link))}
                            className="flex w-full items-start gap-0.5 rounded-sm py-px pl-0 pr-0.5 text-left text-[11px] leading-[1.25] text-gray-900 transition-colors hover:bg-amber-100/70 hover:text-[#2e7d32] lg:gap-1 lg:rounded-md lg:py-1.5 lg:pl-1 lg:pr-1 lg:text-xs lg:text-gray-700 lg:hover:bg-transparent"
                          >
                            <ChevronRightIcon
                              className="mt-px h-3 w-3 shrink-0 text-amber-600 lg:h-4 lg:w-4 lg:text-gray-400"
                              strokeWidth={2}
                              aria-hidden
                            />
                            <span className="min-w-0">{warning.message}</span>
                          </button>
                        ))}
                      </div>
                      {profileWarnings.length > 2 ? (
                        <p className="mt-px text-[9px] leading-tight text-amber-900/65 lg:mt-2 lg:border-t lg:border-gray-100 lg:pt-2 lg:text-xs lg:leading-snug lg:text-gray-500">
                          +{profileWarnings.length - 2} в «Меню»
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
              
              <MasterDashboardStats 
                refreshTrigger={clientsUpdateTrigger}
                dashboardOverlayResetKey={dashboardOverlayResetKey}
                settingsPayload={masterSettingsPayload}
                onNavigateToStats={() => handleTabChange('stats')} 
                subscriptionStatus={subscriptionStatus}
                hasExtendedStats={canUseExtendedStats}
                onConfirmSuccess={() => {
                  setRefreshKey((prev) => prev + 1);
                  setClientsUpdateTrigger((t) => t + 1);
                }}
                onOpenSubscriptionModal={() => setShowSubscriptionModal(true)}
              />
            </div>
          )}
          {activeTab === 'schedule' && (
            <div>
              <h1 className="mb-3 text-2xl font-bold lg:mb-6 lg:text-3xl">Расписание</h1>
              
              {/* Режимы: на <lg — низкие сегменты без flex-1 «плашек» */}
              <div className="mb-3 lg:mb-6">
                <div
                  className="inline-flex max-w-full rounded-md border border-gray-200/90 bg-gray-100/90 p-px shadow-sm lg:rounded-xl lg:p-1"
                  role="tablist"
                  aria-label="Режим просмотра расписания"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleView === 'schedule'}
                    onClick={() => setScheduleView('schedule')}
                    className={`rounded-[4px] px-2 py-0.5 text-center text-[11px] font-medium leading-snug transition-all lg:min-w-[9.5rem] lg:rounded-lg lg:px-5 lg:py-2.5 lg:text-sm lg:font-semibold ${
                      scheduleView === 'schedule'
                        ? 'bg-[#4CAF50] text-white shadow-sm ring-1 ring-green-600/25'
                        : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                    }`}
                  >
                    Расписание
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleView === 'past'}
                    onClick={() => setScheduleView('past')}
                    className={`rounded-[4px] px-2 py-0.5 text-center text-[11px] font-medium leading-snug transition-all lg:min-w-[9.5rem] lg:rounded-lg lg:px-5 lg:py-2.5 lg:text-sm lg:font-semibold ${
                      scheduleView === 'past'
                        ? 'bg-[#4CAF50] text-white shadow-sm ring-1 ring-green-600/25'
                        : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
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
                        masterSettings={masterSettings}
                        hasExtendedStats={canUseExtendedStats}
                        onDayScheduleSaved={loadSchedule}
                      />
                  )}
                </>
              ) : (
                <PastAppointments />
              )}
            </div>
          )}
          {activeTab === 'services' && <ServicesSection />}
          {activeTab === 'stats' && canUseExtendedStats && (
            <div className="min-w-0">
              <h1 className="mb-2 text-xl font-bold leading-snug tracking-tight text-gray-900 lg:mb-6 lg:text-3xl">Статистика</h1>
              <MasterStats 
                hasExtendedStats={canUseExtendedStats}
                onOpenSubscriptionModal={() => setShowSubscriptionModal(true)}
              />
            </div>
          )}
          {activeTab === 'stats' && !canUseExtendedStats && (
            <div className="min-w-0">
              <DemoAccessBanner
                title="Статистика"
                description={(() => {
                  const cheapestPlan = getCheapestPlanForFeature(subscriptionPlans, 2)
                  return cheapestPlan ? `Расширенная статистика доступна в тарифе ${cheapestPlan}.` : 'Расширенная статистика доступна в подписке.'
                })()}
                ctaText="Перейти к тарифам"
                onCtaClick={() => handleTabChange('tariff')}
              />
              <div className="p-6">
                <MasterStatsDemo />
              </div>
            </div>
          )}
          {activeTab === 'accounting' && canUseFinance && (
            <div className="min-w-0 overflow-x-hidden">
              <MasterAccounting hasFinanceAccess={canUseFinance} />
            </div>
          )}
          {activeTab === 'accounting' && !canUseFinance && (
            <div>
              <DemoAccessBanner
                title="Финансы"
                description={(() => {
                  const cheapestPlan = getCheapestPlanForFeature(subscriptionPlans, 4)
                  return cheapestPlan ? `Раздел «Финансы» доступен в тарифе ${cheapestPlan}.` : 'Раздел «Финансы» доступен в подписке.'
                })()}
                ctaText="Перейти к тарифам"
                onCtaClick={() => handleTabChange('tariff')}
              />
              <div className="p-6">
                <MasterAccountingDemo />
              </div>
            </div>
          )}
          {isSalonFeaturesEnabled() && activeTab === 'salon-work' && (
            <SalonWorkSection onInvitationUpdate={refreshInvitationsCount} />
          )}
          {activeTab === 'loyalty' && canUseLoyalty && (
            <div>
              <MasterLoyalty
                hasLoyaltyAccess={canUseLoyalty}
                masterSettings={masterSettings}
                onOpenSettings={() => handleTabChange('settings')}
              />
            </div>
          )}
          {activeTab === 'loyalty' && !canUseLoyalty && (
            <div>
              <DemoAccessBanner
                title="Лояльность"
                description={(() => {
                  const cheapestPlan = getCheapestPlanForFeature(subscriptionPlans, 3)
                  return cheapestPlan ? `Раздел «Лояльность» доступен в тарифе ${cheapestPlan}.` : 'Раздел «Лояльность» доступен в подписке.'
                })()}
                ctaText="Перейти к тарифам"
                onCtaClick={() => handleTabChange('tariff')}
              />
              <div className="p-6">
                <MasterLoyaltyDemo />
              </div>
            </div>
          )}
          {activeTab === 'clients' && canUseClients && (
            <MasterClients onMetadataSaved={() => setClientsUpdateTrigger(t => t + 1)} />
          )}
          {activeTab === 'clients' && !canUseClients && (
            <div>
              <DemoAccessBanner
                title="Клиенты"
                description={(() => {
                  const cheapestPlan = getCheapestPlanForFeature(subscriptionPlans, 7)
                  return cheapestPlan
                    ? `Раздел «Клиенты» доступен в тарифе ${cheapestPlan}.`
                    : 'Раздел «Клиенты» доступен в подписке.'
                })()}
                ctaText="Перейти к тарифам"
                onCtaClick={() => handleTabChange('tariff')}
              />
              <div className="p-6">
                <MasterClientsDemo />
              </div>
            </div>
          )}
          {activeTab === 'restrictions' && canUseRestrictions && (
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-6">Ограничения клиентов</h1>
              <ClientRestrictionsManager
                indieMasterId={masterSettings?.id}
                apiEndpoint="/api/master/restrictions"
                hasAccess={canUseRestrictions}
                onOpenSubscriptionModal={() => handleTabChange('tariff')}
              />
            </div>
          )}
          {activeTab === 'restrictions' && !canUseRestrictions && (
            <div>
              <DemoAccessBanner
                title="Правила"
                description={(() => {
                  const cheapestPlan = getCheapestPlanForFeature(subscriptionPlans, 5)
                  return cheapestPlan ? `Раздел «Правила» доступен в тарифе ${cheapestPlan}.` : 'Раздел «Правила» доступен в подписке.'
                })()}
                ctaText="Перейти к тарифам"
                onCtaClick={() => handleTabChange('tariff')}
              />
              <div className="p-6">
                <ClientRestrictionsDemo />
              </div>
            </div>
          )}
          {activeTab === 'settings' && (
            <MasterSettings
              onSettingsUpdate={refreshSettings}
              featuresLoading={subscriptionFeaturesLoading}
              canCustomizeDomain={canCustomizeDomain}
              hasClientRestrictions={hasClientRestrictions}
              hasExtendedStats={hasExtendedStats}
              planName={subscriptionPlanName}
            />
          )}
          {activeTab === 'tariff' && (
            <MasterTariff
              canCustomizeDomain={canCustomizeDomain}
              onRefreshSubscriptionFeatures={refreshSubscriptionFeatures}
            />
          )}
        </main>
      </div>
      
      {/* Модальное окно покупки подписки */}
      {showSubscriptionModal && (
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
          isFreePlan={subscriptionStatus?.plan_name === 'Free'}
          currentPlanDisplayOrder={subscriptionStatus?.plan_display_order}
        />
      )}

      {/* Модальное окно "Все проблемы" */}
      {showAllIssuesModal && (
        <AllIssuesModal
          isOpen={showAllIssuesModal}
          onClose={() => setShowAllIssuesModal(false)}
          issues={profileWarnings}
          onIssueClick={(issue) => {
            handleTabChange ? handleTabChange(issue.link) : setActiveTab(issue.link);
          }}
        />
      )}

      <MasterMobileBottomNav
        activeTab={activeTab}
        menuOpen={masterMenuOpen}
        onDashboard={() => {
          setMasterMenuOpen(false)
          setDashboardOverlayResetKey((k) => k + 1)
          handleTabChange('dashboard')
        }}
        onMenuToggle={() => setMasterMenuOpen((open) => !open)}
        onSettings={() => {
          setMasterMenuOpen(false)
          handleTabChange('settings')
        }}
      />
      <MasterMobileMenu
        isOpen={masterMenuOpen}
        onClose={() => setMasterMenuOpen(false)}
        activeTab={activeTab}
        handleTabChange={handleTabChange}
        hasFinanceAccess={canUseFinance}
        hasExtendedStats={canUseExtendedStats}
        hasLoyaltyAccess={canUseLoyalty}
        hasClientRestrictions={canUseRestrictions}
        hasClientsAccess={canUseClients}
        subscriptionPlans={subscriptionPlans}
        scheduleConflicts={scheduleConflicts}
        refreshKey={refreshInvitations}
      />
    </div>
  )
}
