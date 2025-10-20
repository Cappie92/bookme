import { useState, useEffect } from "react"
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  EyeIcon,
  CogIcon,
  ChartBarIcon,
  PlusIcon,
  CalculatorIcon,
  CreditCardIcon,
  BuildingStorefrontIcon,
  UserIcon,
  TagIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon
} from "@heroicons/react/24/outline"
import { API_BASE_URL } from '../utils/config'

export default function AdminFunctions() {
  const [functions, setFunctions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    functionType: '',
    search: ''
  })
  
  // Состояние для модальных окон
  const [selectedFunction, setSelectedFunction] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCalculatorModal, setShowCalculatorModal] = useState(false)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  
  // Состояние для управления подписками
  const [activeTab, setActiveTab] = useState('functions') // 'functions', 'subscriptions', 'calculator', 'promo-codes'
  const [subscriptions, setSubscriptions] = useState([])
  const [subscriptionStats, setSubscriptionStats] = useState({
    total: 0,
    active: 0,
    expired: 0,
    pending: 0
  })

  // Состояние для промо-кодов
  const [promoCodes, setPromoCodes] = useState([])
  const [promoCodeStats, setPromoCodeStats] = useState({
    total: 0,
    active: 0,
    expired: 0,
    deactivated: 0,
    totalActivations: 0
  })
  const [promoCodeFilters, setPromoCodeFilters] = useState({
    subscriptionType: '',
    isActive: '',
    search: ''
  })
  const [showCreatePromoModal, setShowCreatePromoModal] = useState(false)
  const [showEditPromoModal, setShowEditPromoModal] = useState(false)
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false)
  const [selectedPromoCode, setSelectedPromoCode] = useState(null)
  const [promoCodeAnalytics, setPromoCodeAnalytics] = useState(null)
  const [newPromoCode, setNewPromoCode] = useState({
    code: '',
    maxUses: 1,
    expiresAt: '',
    subscriptionType: 'master',
    subscriptionDurationDays: 30,
    isActive: true
  })

  // Состояние для калькулятора
  const [calculatorType, setCalculatorType] = useState('salon')
  const [salonCalculator, setSalonCalculator] = useState({
    baseRate: 5000,
    branchPricing: {
      "1": 0,
      "2": 1000,
      "3": 2000,
      "4-7": 3000,
      "8+": 5000
    },
    employeePricing: {
      "5": 0,
      "10": 500,
      "15": 1000,
      "20": 1500,
      "25": 2000,
      "30": 2500
    }
  })
  
  const [masterCalculator, setMasterCalculator] = useState({
    baseRate: 2000,
    bookingPricing: {
      "До 100": 10.0,
      "101-150": 8.0,
      "151+": 6.0
    }
  })


  useEffect(() => {
    if (activeTab === 'functions') {
      fetchFunctions()
    } else if (activeTab === 'subscriptions') {
      fetchSubscriptions()
    } else if (activeTab === 'calculator') {
      loadCalculatorSettings()
    } else if (activeTab === 'promo-codes') {
      fetchPromoCodes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab, promoCodeFilters])

  const fetchFunctions = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      
      // Пока что возвращаем пустой массив, так как функции сервиса еще не реализованы
      setFunctions([])
    } catch (error) {
      console.error('Ошибка при загрузке функций:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscriptions = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      
      // Заглушка для подписок (позже можно добавить API)
      const mockSubscriptions = [
        {
          id: 1,
          user_name: "Иван Петров",
          user_phone: "+7 (999) 123-45-67",
          subscription_type: "salon",
          status: "active",
          salon_branches: 2,
          salon_employees: 5,
          end_date: "2024-12-31",
          price: 15000
        },
        {
          id: 2,
          user_name: "Мария Сидорова",
          user_phone: "+7 (999) 765-43-21",
          subscription_type: "master",
          status: "active",
          master_bookings: 50,
          end_date: "2024-12-31",
          price: 5000
        }
      ]
      
      setSubscriptions(mockSubscriptions)
      
      // Подсчитываем статистику
      setSubscriptionStats({
        total: mockSubscriptions.length,
        active: mockSubscriptions.filter(s => s.status === 'active').length,
        expired: mockSubscriptions.filter(s => s.status === 'expired').length,
        pending: mockSubscriptions.filter(s => s.status === 'pending').length
      })
    } catch (error) {
      console.error('Ошибка при загрузке подписок:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCalculatorSettings = async () => {
    try {
      const token = localStorage.getItem('access_token')
      
      // Загружаем настройки калькулятора из localStorage или API
      const savedSettings = localStorage.getItem('calculator_settings')
      if (savedSettings) {
        const data = JSON.parse(savedSettings)
        if (data.salon_base_rate) {
          setSalonCalculator(prev => ({
            ...prev,
            baseRate: data.salon_base_rate || prev.baseRate,
            branchPricing: data.salon_branch_pricing || prev.branchPricing,
            employeePricing: data.salon_employee_pricing || prev.employeePricing
          }))
        }
        if (data.master_base_rate) {
          setMasterCalculator(prev => ({
            ...prev,
            baseRate: data.master_base_rate || prev.baseRate,
            bookingPricing: data.master_booking_pricing || prev.bookingPricing
          }))
        }
      }
    } catch (error) {
      console.error('Ошибка при загрузке настроек калькулятора:', error)
    }
  }

  const fetchPromoCodes = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      
      const params = new URLSearchParams()
      if (promoCodeFilters.subscriptionType) params.append('subscription_type', promoCodeFilters.subscriptionType)
      if (promoCodeFilters.isActive !== '') params.append('is_active', promoCodeFilters.isActive)
      if (promoCodeFilters.search) params.append('search', promoCodeFilters.search)
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPromoCodes(data)
      } else {
        console.error('Ошибка при загрузке промо-кодов:', response.statusText)
      }
    } catch (error) {
      console.error('Ошибка при загрузке промо-кодов:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPromoCodeStats = async () => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPromoCodeStats(data)
      }
    } catch (error) {
      console.error('Ошибка при загрузке статистики промо-кодов:', error)
    }
  }

  const createPromoCode = async (promoData) => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(promoData)
      })
      
      if (response.ok) {
        await fetchPromoCodes()
        await fetchPromoCodeStats()
        return { success: true }
      } else {
        const error = await response.json()
        return { success: false, error: error.detail }
      }
    } catch (error) {
      console.error('Ошибка при создании промо-кода:', error)
      return { success: false, error: 'Ошибка сети' }
    }
  }

  const updatePromoCode = async (id, promoData) => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(promoData)
      })
      
      if (response.ok) {
        await fetchPromoCodes()
        await fetchPromoCodeStats()
        return { success: true }
      } else {
        const error = await response.json()
        return { success: false, error: error.detail }
      }
    } catch (error) {
      console.error('Ошибка при обновлении промо-кода:', error)
      return { success: false, error: 'Ошибка сети' }
    }
  }

  const deletePromoCode = async (id) => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        await fetchPromoCodes()
        await fetchPromoCodeStats()
        return { success: true }
      } else {
        const error = await response.json()
        return { success: false, error: error.detail }
      }
    } catch (error) {
      console.error('Ошибка при удалении промо-кода:', error)
      return { success: false, error: 'Ошибка сети' }
    }
  }

  const deactivatePromoCode = async (id) => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${id}/deactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        await fetchPromoCodes()
        await fetchPromoCodeStats()
        return { success: true }
      } else {
        const error = await response.json()
        return { success: false, error: error.detail }
      }
    } catch (error) {
      console.error('Ошибка при деактивации промо-кода:', error)
      return { success: false, error: 'Ошибка сети' }
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handlePromoCodeFilterChange = (key, value) => {
    setPromoCodeFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleCreatePromoCode = async () => {
    const result = await createPromoCode(newPromoCode)
    if (result.success) {
      setShowCreatePromoModal(false)
      setNewPromoCode({
        code: '',
        maxUses: 1,
        expiresAt: '',
        subscriptionType: 'master',
        subscriptionDurationDays: 30,
        isActive: true
      })
      alert('Промо-код успешно создан!')
    } else {
      alert(`Ошибка: ${result.error}`)
    }
  }

  const handleEditPromoCode = (promoCode) => {
    setSelectedPromoCode(promoCode)
    setShowEditPromoModal(true)
  }

  const handleUpdatePromoCode = async () => {
    const result = await updatePromoCode(selectedPromoCode.id, selectedPromoCode)
    if (result.success) {
      setShowEditPromoModal(false)
      setSelectedPromoCode(null)
      alert('Промо-код успешно обновлен!')
    } else {
      alert(`Ошибка: ${result.error}`)
    }
  }

  const handleDeletePromoCode = async (id) => {
    if (window.confirm('Вы уверены, что хотите удалить этот промо-код?')) {
      const result = await deletePromoCode(id)
      if (result.success) {
        alert('Промо-код успешно удален!')
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    }
  }

  const handleDeactivatePromoCode = async (id) => {
    if (window.confirm('Вы уверены, что хотите деактивировать этот промо-код?')) {
      const result = await deactivatePromoCode(id)
      if (result.success) {
        alert('Промо-код успешно деактивирован!')
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    }
  }

  const generatePromoCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewPromoCode(prev => ({ ...prev, code: result }))
  }

  const fetchPromoCodeAnalytics = async (promoCodeId) => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${promoCodeId}/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPromoCodeAnalytics(data)
        return { success: true, data }
      } else {
        const error = await response.json()
        return { success: false, error: error.detail }
      }
    } catch (error) {
      console.error('Ошибка при загрузке аналитики промо-кода:', error)
      return { success: false, error: 'Ошибка сети' }
    }
  }

  const handleViewAnalytics = async (promoCodeId) => {
    const result = await fetchPromoCodeAnalytics(promoCodeId)
    if (result.success) {
      setShowAnalyticsModal(true)
    } else {
      alert(`Ошибка: ${result.error}`)
    }
  }


  const handleEditFunction = (func) => {
    setSelectedFunction(func)
    setShowEditModal(true)
  }

  // Функции для работы с калькулятором
  const debugCalculation = () => {
    console.log('Текущие настройки салона:', salonCalculator)
    console.log('Формула: baseRate + branchPrice + (employeePricePerEmployee * employeeCount)')
    console.log('Где:')
    console.log('- baseRate =', salonCalculator.baseRate)
    console.log('- branchPrice = последовательная доплата за дополнительные филиалы (2-й, 3-й, 4-7-й, 8+-й)')
    console.log('- employeePricePerEmployee = наценка за 1 работника (берется тариф для >= количества работников)')
    console.log('- employeeCount = количество работников (умножается на employeePricePerEmployee)')
  }

  const handleSalonCalculatorChange = (key, value) => {
    setSalonCalculator(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSalonBranchPricingChange = (branch, value) => {
    setSalonCalculator(prev => ({
      ...prev,
      branchPricing: {
        ...prev.branchPricing,
        [branch]: parseInt(value) || 0
      }
    }))
  }

  const handleSalonEmployeePricingChange = (employeeCount, value) => {
    setSalonCalculator(prev => ({
      ...prev,
      employeePricing: {
        ...prev.employeePricing,
        [employeeCount]: parseInt(value) || 0
      }
    }))
  }

  const handleMasterCalculatorChange = (key, value) => {
    setMasterCalculator(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleMasterBookingPricingChange = (bookingType, value) => {
    setMasterCalculator(prev => ({
      ...prev,
      bookingPricing: {
        ...prev.bookingPricing,
        [bookingType]: parseFloat(value) || 0
      }
    }))
  }

  const handleSaveCalculator = async () => {
    setLoading(true)
    try {
      // Сохраняем настройки калькулятора
      const calculatorData = {
        salon_base_rate: salonCalculator.baseRate,
        salon_branch_pricing: salonCalculator.branchPricing,
        salon_employee_pricing: salonCalculator.employeePricing,
        master_base_rate: masterCalculator.baseRate,
        master_booking_pricing: masterCalculator.bookingPricing
      }
      
      localStorage.setItem('calculator_settings', JSON.stringify(calculatorData))
      alert("Настройки калькулятора сохранены!")
    } catch (error) {
      console.error('Ошибка сохранения настроек калькулятора:', error)
      alert("Ошибка при сохранении настроек калькулятора")
    } finally {
      setLoading(false)
    }
  }


  const getFunctionTypeLabel = (type) => {
    switch (type) {
      case 'free':
        return 'Бесплатно'
      case 'subscription':
        return 'В подписке'
      case 'volume_based':
        return 'Оплата за объем'
      default:
        return 'Не указано'
    }
  }

  const getFunctionTypeColor = (type) => {
    switch (type) {
      case 'free':
        return 'bg-green-100 text-green-800'
      case 'subscription':
        return 'bg-blue-100 text-blue-800'
      case 'volume_based':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Статистика по функциям
  const functionStats = {
    total: functions.length,
    free: functions.filter(f => f.function_type === 'free').length,
    subscription: functions.filter(f => f.function_type === 'subscription').length,
    volumeBased: functions.filter(f => f.function_type === 'volume_based').length
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление функциями</h1>
          <p className="text-gray-600">Настройка функций сервиса, подписок и калькулятора тарифов</p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'functions' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Добавить функцию
            </button>
          )}
          {activeTab === 'promo-codes' && (
            <button
              onClick={() => setShowCreatePromoModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Создать промо-код
            </button>
          )}
        </div>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('functions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'functions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CogIcon className="w-5 h-5 inline mr-2" />
            Функции сервиса
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'subscriptions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CreditCardIcon className="w-5 h-5 inline mr-2" />
            Управление подписками
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'calculator'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CalculatorIcon className="w-5 h-5 inline mr-2" />
            Калькулятор тарифов
          </button>
          <button
            onClick={() => setActiveTab('promo-codes')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'promo-codes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TagIcon className="w-5 h-5 inline mr-2" />
            Промо-коды
          </button>
        </nav>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <FunnelIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Фильтры</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип функции
            </label>
            <select
              value={filters.functionType}
              onChange={(e) => handleFilterChange('functionType', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все типы</option>
              <option value="free">Бесплатно</option>
              <option value="subscription">В подписке</option>
              <option value="volume_based">Оплата за объем</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Поиск по названию
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Статистика */}
      {activeTab === 'functions' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CogIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Всего функций</p>
                <p className="text-2xl font-bold text-gray-900">{functionStats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CogIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Бесплатные</p>
                <p className="text-2xl font-bold text-gray-900">{functionStats.free}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CogIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">В подписке</p>
                <p className="text-2xl font-bold text-gray-900">{functionStats.subscription}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <CogIcon className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Оплата за объем</p>
                <p className="text-2xl font-bold text-gray-900">{functionStats.volumeBased}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Статистика подписок */}
      {activeTab === 'subscriptions' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CreditCardIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Всего подписок</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptionStats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CreditCardIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Активные</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptionStats.active}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <CreditCardIcon className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Истекшие</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptionStats.expired}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <CreditCardIcon className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Ожидающие</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptionStats.pending}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Статистика промо-кодов */}
      {activeTab === 'promo-codes' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TagIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Всего промо-кодов</p>
                <p className="text-2xl font-bold text-gray-900">{promoCodeStats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <TagIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Активные</p>
                <p className="text-2xl font-bold text-gray-900">{promoCodeStats.active}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <TagIcon className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Истекшие</p>
                <p className="text-2xl font-bold text-gray-900">{promoCodeStats.expired}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-gray-100 rounded-lg">
                <TagIcon className="w-6 h-6 text-gray-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Деактивированные</p>
                <p className="text-2xl font-bold text-gray-900">{promoCodeStats.deactivated}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TagIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Активаций</p>
                <p className="text-2xl font-bold text-gray-900">{promoCodeStats.totalActivations}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Основное содержимое */}
      {activeTab === 'functions' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Список функций</h2>
          </div>
        
        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Тип
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Описание
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {functions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center">
                      <CogIcon className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">Функции не найдены</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Начните с добавления первой функции сервиса.
                      </p>
                    </td>
                  </tr>
                ) : (
                  functions.map((func) => (
                    <tr key={func.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{func.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {func.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getFunctionTypeColor(func.function_type)}`}>
                          {getFunctionTypeLabel(func.function_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {func.description || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => handleEditFunction(func)}
                            className="text-blue-600 hover:text-blue-900" 
                            title="Редактировать"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}

      {/* Таблица подписок */}
      {activeTab === 'subscriptions' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Список подписок</h2>
          </div>
          
          {loading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Пользователь
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Тип
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Параметры
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Цена
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">Подписки не найдены</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Начните с создания первой подписки.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((subscription) => (
                      <tr key={subscription.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{subscription.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {subscription.user_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {subscription.user_phone}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            subscription.subscription_type === 'salon' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {subscription.subscription_type === 'salon' ? 'Салон' : 'Мастер'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            subscription.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : subscription.status === 'expired'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {subscription.status === 'active' ? 'Активна' : 
                             subscription.status === 'expired' ? 'Истекла' : 'Ожидает'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {subscription.subscription_type === 'salon' ? (
                            <div>
                              <div>Филиалы: {subscription.salon_branches}</div>
                              <div>Работники: {subscription.salon_employees}</div>
                            </div>
                          ) : (
                            <div>Записи: {subscription.master_bookings}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {subscription.price.toLocaleString()} ₽
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => {/* TODO: Редактировать подписку */}}
                              className="text-blue-600 hover:text-blue-900" 
                              title="Редактировать"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {/* TODO: Просмотреть детали */}}
                              className="text-green-600 hover:text-green-900" 
                              title="Просмотреть"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Калькулятор тарифов */}
      {activeTab === 'calculator' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center mb-4">
              <CalculatorIcon className="w-5 h-5 text-gray-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Управление калькулятором</h2>
            </div>
            
            {/* Переключатель типа калькулятора */}
            <div className="mb-6">
              <div className="flex space-x-4">
                <button
                  onClick={() => setCalculatorType('salon')}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                    calculatorType === 'salon'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <BuildingStorefrontIcon className="w-4 h-4 mr-2" />
                  Салон
                </button>
                <button
                  onClick={() => setCalculatorType('master')}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                    calculatorType === 'master'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <UserIcon className="w-4 h-4 mr-2" />
                  Мастер
                </button>
              </div>
            </div>

            {/* Настройки для салона */}
            {calculatorType === 'salon' && (
              <div className="space-y-6">
                {/* Отладочная информация */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">Отладочная информация</h4>
                  <p className="text-xs text-yellow-700 mb-2">
                    Формула: Базовая ставка + Доплата за филиалы + (Наценка за 1 работника × Количество работников)
                  </p>
                  <p className="text-xs text-yellow-700 mb-2">
                    Для работников берется тариф для количества &gt;= выбранного (5, 10, 15, 20, 25, 30)
                  </p>
                  <button 
                    onClick={debugCalculation}
                    className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-300"
                  >
                    Показать в консоли
                  </button>
                </div>
                {/* Базовая ставка */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Базовая ставка в месяц (₽)
                  </label>
                  <input
                    type="number"
                    value={salonCalculator.baseRate}
                    onChange={(e) => handleSalonCalculatorChange('baseRate', parseInt(e.target.value) || 0)}
                    className="w-48 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                {/* Наценка за доп. филиал */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Наценка за доп. филиал (₽)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.keys(salonCalculator.branchPricing).map((branch) => (
                      <div key={branch}>
                        <label className="block text-xs text-gray-600 mb-1">{branch} филиал</label>
                        <input
                          type="number"
                          value={salonCalculator.branchPricing[branch]}
                          onChange={(e) => handleSalonBranchPricingChange(branch, e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Наценка за количество работников */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Наценка за количество работников (₽)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.keys(salonCalculator.employeePricing).map((employeeCount) => (
                      <div key={employeeCount}>
                        <label className="block text-xs text-gray-600 mb-1">{employeeCount} работников</label>
                        <input
                          type="number"
                          value={salonCalculator.employeePricing[employeeCount]}
                          onChange={(e) => handleSalonEmployeePricingChange(employeeCount, e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Настройки для мастера */}
            {calculatorType === 'master' && (
              <div className="space-y-6">
                {/* Базовая ставка */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Базовая ставка доступа к кабинету (₽)
                  </label>
                  <input
                    type="number"
                    value={masterCalculator.baseRate}
                    onChange={(e) => handleMasterCalculatorChange('baseRate', parseInt(e.target.value) || 0)}
                    className="w-48 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                {/* Стоимость за бронирование */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Стоимость за 1 бронирование (₽)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.keys(masterCalculator.bookingPricing).map((bookingType) => (
                      <div key={bookingType}>
                        <label className="block text-xs text-gray-600 mb-1">{bookingType} бронирований</label>
                        <input
                          type="number"
                          step="0.01"
                          value={masterCalculator.bookingPricing[bookingType]}
                          onChange={(e) => handleMasterBookingPricingChange(bookingType, e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Кнопки действий */}
            <div className="flex justify-end space-x-4 mt-6">
              <button className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors">
                Отменить
              </button>
              <button 
                onClick={handleSaveCalculator}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Таблица промо-кодов */}
      {activeTab === 'promo-codes' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Список промо-кодов</h2>
          </div>
          
          {/* Фильтры для промо-кодов */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Тип подписки
                </label>
                <select
                  value={promoCodeFilters.subscriptionType}
                  onChange={(e) => handlePromoCodeFilterChange('subscriptionType', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Все типы</option>
                  <option value="master">Мастер</option>
                  <option value="salon">Салон</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Статус
                </label>
                <select
                  value={promoCodeFilters.isActive}
                  onChange={(e) => handlePromoCodeFilterChange('isActive', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Все статусы</option>
                  <option value="true">Активные</option>
                  <option value="false">Неактивные</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Поиск по коду
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Поиск..."
                    value={promoCodeFilters.search}
                    onChange={(e) => handlePromoCodeFilterChange('search', e.target.value)}
                    className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                </div>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Код
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Тип подписки
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Длительность
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Использования
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Создан
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {promoCodes.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <TagIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">Промо-коды не найдены</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Начните с создания первого промо-кода.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    promoCodes.map((promoCode) => (
                      <tr key={promoCode.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 font-mono">
                            {promoCode.code}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            promoCode.subscription_type === 'salon' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {promoCode.subscription_type === 'salon' ? 'Салон' : 'Мастер'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {promoCode.subscription_duration_days} дней
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {promoCode.used_count} / {promoCode.max_uses}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            promoCode.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : promoCode.status === 'expired'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {promoCode.status === 'active' ? 'Активен' : 
                             promoCode.status === 'expired' ? 'Истек' : 'Деактивирован'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(promoCode.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleEditPromoCode(promoCode)}
                              className="text-blue-600 hover:text-blue-900" 
                              title="Редактировать"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleViewAnalytics(promoCode.id)}
                              className="text-purple-600 hover:text-purple-900" 
                              title="Аналитика"
                            >
                              <ChartBarIcon className="w-4 h-4" />
                            </button>
                            {promoCode.status === 'active' && (
                              <button 
                                onClick={() => handleDeactivatePromoCode(promoCode.id)}
                                className="text-yellow-600 hover:text-yellow-900" 
                                title="Деактивировать"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeletePromoCode(promoCode.id)}
                              className="text-red-600 hover:text-red-900" 
                              title="Удалить"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}


      {/* Модальное окно создания функции */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Добавить функцию</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="text-center py-8">
              <CogIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Функция в разработке</h3>
              <p className="mt-1 text-sm text-gray-500">
                Создание функций сервиса будет доступно в следующих версиях.
              </p>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания промо-кода */}
      {showCreatePromoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Создать промо-код</h2>
              <button 
                onClick={() => setShowCreatePromoModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Промо-код
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newPromoCode.code}
                    onChange={(e) => setNewPromoCode(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="ABC123"
                    maxLength={6}
                  />
                  <button
                    onClick={generatePromoCode}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Сгенерировать
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Количество активаций
                </label>
                <input
                  type="number"
                  value={newPromoCode.maxUses}
                  onChange={(e) => setNewPromoCode(prev => ({ ...prev, maxUses: parseInt(e.target.value) || 1 }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата истечения
                </label>
                <input
                  type="date"
                  value={newPromoCode.expiresAt}
                  onChange={(e) => setNewPromoCode(prev => ({ ...prev, expiresAt: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Оставьте пустым для бессрочного действия</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Тип подписки
                </label>
                <select
                  value={newPromoCode.subscriptionType}
                  onChange={(e) => setNewPromoCode(prev => ({ ...prev, subscriptionType: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="master">Мастер</option>
                  <option value="salon">Салон</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Длительность (дни)
                </label>
                <input
                  type="number"
                  value={newPromoCode.subscriptionDurationDays}
                  onChange={(e) => setNewPromoCode(prev => ({ ...prev, subscriptionDurationDays: parseInt(e.target.value) || 30 }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="364"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={newPromoCode.isActive}
                  onChange={(e) => setNewPromoCode(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                  Активен
                </label>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreatePromoModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отменить
              </button>
              <button
                onClick={handleCreatePromoCode}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования промо-кода */}
      {showEditPromoModal && selectedPromoCode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Редактировать промо-код</h2>
              <button 
                onClick={() => setShowEditPromoModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Промо-код
                </label>
                <div className="text-sm font-mono bg-gray-100 px-3 py-2 rounded-md">
                  {selectedPromoCode.code}
                </div>
                <p className="text-xs text-gray-500 mt-1">Код нельзя изменить</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Количество активаций
                </label>
                <input
                  type="number"
                  value={selectedPromoCode.maxUses}
                  onChange={(e) => setSelectedPromoCode(prev => ({ ...prev, maxUses: parseInt(e.target.value) || 1 }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">Не может быть меньше {selectedPromoCode.used_count}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата истечения
                </label>
                <input
                  type="date"
                  value={selectedPromoCode.expiresAt ? selectedPromoCode.expiresAt.split('T')[0] : ''}
                  onChange={(e) => setSelectedPromoCode(prev => ({ ...prev, expiresAt: e.target.value ? e.target.value + 'T23:59:59' : null }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={selectedPromoCode.isActive}
                  onChange={(e) => setSelectedPromoCode(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="editIsActive" className="ml-2 block text-sm text-gray-900">
                  Активен
                </label>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditPromoModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отменить
              </button>
              <button
                onClick={handleUpdatePromoCode}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно аналитики промо-кода */}
      {showAnalyticsModal && promoCodeAnalytics && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Аналитика промо-кода</h2>
              <button 
                onClick={() => setShowAnalyticsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Основная статистика */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{promoCodeAnalytics.total_activations}</div>
                  <div className="text-sm text-blue-800">Всего активаций</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{promoCodeAnalytics.unique_users}</div>
                  <div className="text-sm text-green-800">Уникальных пользователей</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{promoCodeAnalytics.conversion_rate}%</div>
                  <div className="text-sm text-purple-800">Конверсия в платных</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{promoCodeAnalytics.total_revenue_after_expiry}₽</div>
                  <div className="text-sm text-orange-800">Доход после истечения</div>
                </div>
              </div>

              {/* График активаций по дням */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4">Активации за последние 30 дней</h3>
                <div className="space-y-2">
                  {promoCodeAnalytics.activations_by_day.slice(0, 7).map((day, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{day.date}</span>
                      <div className="flex items-center">
                        <div className="w-32 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${(day.activations / Math.max(...promoCodeAnalytics.activations_by_day.map(d => d.activations))) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{day.activations}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Топ пользователей */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4">Топ пользователей по активациям</h3>
                <div className="space-y-2">
                  {promoCodeAnalytics.top_users.map((user, index) => (
                    <div key={index} className="flex items-center justify-between bg-white p-3 rounded">
                      <div>
                        <div className="font-medium">{user.user_name}</div>
                        <div className="text-sm text-gray-500">ID: {user.user_id}</div>
                      </div>
                      <div className="text-lg font-bold text-blue-600">{user.activations}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Дополнительная информация */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Среднее время до оплаты</h4>
                  <div className="text-2xl font-bold text-gray-800">
                    {promoCodeAnalytics.average_days_to_payment ? 
                      `${promoCodeAnalytics.average_days_to_payment} дней` : 
                      'Нет данных'
                    }
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Общий доход</h4>
                  <div className="text-2xl font-bold text-gray-800">
                    {promoCodeAnalytics.total_revenue_after_expiry}₽
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowAnalyticsModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
