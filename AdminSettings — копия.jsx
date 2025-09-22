import { useState, useEffect } from "react"
import { 
  CogIcon, 
  BellIcon, 
  ShieldCheckIcon,
  GlobeAltIcon,
  ServerIcon,
  KeyIcon,
  CalculatorIcon,
  BuildingStorefrontIcon,
  UserIcon
} from "@heroicons/react/24/outline"

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    siteName: "Appointo",
    siteDescription: "Система управления записями в салоны красоты",
    maintenanceMode: false,
    emailNotifications: true,
    smsNotifications: true,
    autoBackup: true,
    backupFrequency: "daily",
    maxFileSize: 10,
    sessionTimeout: 30,
    enableRegistration: true,
    requireEmailVerification: true,
    enableBlog: true,
    enableReviews: true
  })

  const [calculatorType, setCalculatorType] = useState('salon')
  const [loading, setLoading] = useState(false)
  
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

  // Отладочная информация
  const debugCalculation = () => {
    console.log('Текущие настройки салона:', salonCalculator)
    console.log('Формула: baseRate + branchPrice + (employeePricePerEmployee * employeeCount)')
    console.log('Где:')
    console.log('- baseRate =', salonCalculator.baseRate)
    console.log('- branchPrice = последовательная доплата за дополнительные филиалы (2-й, 3-й, 4-7-й, 8+-й)')
    console.log('- employeePricePerEmployee = наценка за 1 работника (берется тариф для >= количества работников)')
    console.log('- employeeCount = количество работников (умножается на employeePricePerEmployee)')
  }

  const [masterCalculator, setMasterCalculator] = useState({
    baseRate: 2000,
    bookingPricing: {
      "До 100": 10.0,
      "101-150": 8.0,
      "151+": 6.0
    }
  })

  // Загрузка настроек калькулятора при монтировании компонента
  useEffect(() => {
    loadCalculatorSettings()
  }, [])

  const loadCalculatorSettings = async () => {
    try {
      const response = await fetch('/admin/calculator/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Загруженные настройки калькулятора:', data)
        
        setSalonCalculator({
          baseRate: data.salon_base_rate || 5000,
          branchPricing: data.salon_branch_pricing || {
            "1": 0,
            "2": 1000,
            "3": 2000,
            "4-7": 3000,
            "8+": 5000
          },
          employeePricing: data.salon_employee_pricing || {
            "5": 0,
            "10": 500,
            "15": 1000,
            "20": 1500,
            "25": 2000,
            "30": 2500
          }
        })
        setMasterCalculator({
          baseRate: data.master_base_rate || 2000,
          bookingPricing: data.master_booking_pricing || {
            "До 100": 10.0,
            "101-150": 8.0,
            "151+": 6.0
          }
        })
      } else {
        console.error('Ошибка загрузки настроек:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек калькулятора:', error)
    }
  }

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
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

  const handleSave = async () => {
    setLoading(true)
    try {
      // Сохраняем настройки калькулятора
      const calculatorSettings = {
        salon_base_rate: salonCalculator.baseRate,
        salon_branch_pricing: salonCalculator.branchPricing,
        salon_employee_pricing: salonCalculator.employeePricing,
        master_base_rate: masterCalculator.baseRate,
        master_booking_pricing: masterCalculator.bookingPricing
      }
      
      const response = await fetch('/admin/calculator/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(calculatorSettings)
      })
      
      if (response.ok) {
        alert("Настройки калькулятора сохранены!")
      } else {
        alert("Ошибка при сохранении настроек калькулятора")
      }
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error)
      alert("Ошибка при сохранении настроек")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Настройки системы</h1>
        <p className="text-gray-600 mt-2">Управление настройками приложения</p>
      </div>

      {/* Основные настройки */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <CogIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Основные настройки</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Название сайта
            </label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => handleSettingChange('siteName', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание сайта
            </label>
            <input
              type="text"
              value={settings.siteDescription}
              onChange={(e) => handleSettingChange('siteDescription', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Настройки безопасности */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <ShieldCheckIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Безопасность</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Режим обслуживания</h3>
              <p className="text-xs text-gray-500">Временно отключить сайт для посетителей</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => handleSettingChange('maintenanceMode', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Требовать подтверждение email</h3>
              <p className="text-xs text-gray-500">Пользователи должны подтвердить email при регистрации</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.requireEmailVerification}
                onChange={(e) => handleSettingChange('requireEmailVerification', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Таймаут сессии (минуты)
            </label>
            <input
              type="number"
              value={settings.sessionTimeout}
              onChange={(e) => handleSettingChange('sessionTimeout', parseInt(e.target.value))}
              className="w-32 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Настройки уведомлений */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <BellIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Уведомления</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Email уведомления</h3>
              <p className="text-xs text-gray-500">Отправлять уведомления по email</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">SMS уведомления</h3>
              <p className="text-xs text-gray-500">Отправлять уведомления по SMS</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.smsNotifications}
                onChange={(e) => handleSettingChange('smsNotifications', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Настройки функций */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <GlobeAltIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Функции</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Регистрация пользователей</h3>
              <p className="text-xs text-gray-500">Разрешить новым пользователям регистрироваться</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableRegistration}
                onChange={(e) => handleSettingChange('enableRegistration', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Блог</h3>
              <p className="text-xs text-gray-500">Включить функционал блога</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableBlog}
                onChange={(e) => handleSettingChange('enableBlog', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Отзывы</h3>
              <p className="text-xs text-gray-500">Разрешить пользователям оставлять отзывы</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableReviews}
                onChange={(e) => handleSettingChange('enableReviews', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Настройки резервного копирования */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <ServerIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Резервное копирование</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Автоматическое резервное копирование</h3>
              <p className="text-xs text-gray-500">Создавать резервные копии базы данных автоматически</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoBackup}
                onChange={(e) => handleSettingChange('autoBackup', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Частота резервного копирования
            </label>
            <select
              value={settings.backupFrequency}
              onChange={(e) => handleSettingChange('backupFrequency', e.target.value)}
              className="w-48 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="monthly">Ежемесячно</option>
            </select>
          </div>
        </div>
      </div>

      {/* Управление калькулятором */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
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
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-end space-x-4">
        <button className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors">
          Отменить
        </button>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
} 