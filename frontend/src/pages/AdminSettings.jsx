import { useState, useEffect } from "react"
import { 
  CogIcon, 
  BellIcon, 
  ShieldCheckIcon,
  GlobeAltIcon,
  ServerIcon,
  KeyIcon
} from "@heroicons/react/24/outline"
import { updateFeatures } from "../config/features"
import { getContactChannelPrices, saveContactChannelPrices } from "../services/contactPreferences"

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
    enableReviews: true,
    enableSalonFeatures: false,
    push_contact_price: 2,
    email_contact_price: 3,
    sms_contact_price: 6,
  })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadFeatureSettings()
  }, [])

  const loadFeatureSettings = async () => {
    try {
      // Загружаем настройки из БД через API
      const token = localStorage.getItem('access_token')
      if (token) {
        const response = await fetch('/api/admin/settings', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (response.ok) {
          const dbSettings = await response.json()
          setSettings(prev => ({
            ...prev,
            ...dbSettings
          }))
          return
        }
      }
      
      // Fallback на localStorage (для обратной совместимости)
      const stored = localStorage.getItem('appointo_feature_settings')
      if (stored) {
        const featureSettings = JSON.parse(stored)
        setSettings(prev => ({
          ...prev,
          ...featureSettings
        }))
      }

      const prices = await getContactChannelPrices()
      setSettings(prev => ({
        ...prev,
        ...prices,
      }))
    } catch (error) {
      console.warn('Ошибка загрузки настроек функций:', error)
    }
  }


  const handleSettingChange = (key, value) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        [key]: value
      }
      
      // Сохраняем настройки функций в localStorage
      if (['enableSalonFeatures', 'enableBlog', 'enableReviews', 'enableRegistration'].includes(key)) {
        updateFeatures({ [key]: value })
      }
      
      return newSettings
    })
  }


  const handleSave = async () => {
    setLoading(true)
    try {
      // Сохраняем фича-флаги в БД через API
      const token = localStorage.getItem('access_token')
      const featureFlags = {
        enableSalonFeatures: settings.enableSalonFeatures,
        enableBlog: settings.enableBlog,
        enableReviews: settings.enableReviews,
        enableRegistration: settings.enableRegistration
      }
      
      if (token) {
        const response = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(featureFlags)
        })
        
        if (response.ok) {
          // Обновляем features.js для обратной совместимости
          updateFeatures(featureFlags)
          
          // Сохраняем основные настройки в localStorage
          localStorage.setItem('appointo_settings', JSON.stringify(settings))
          await saveContactChannelPrices({
            push_contact_price: settings.push_contact_price,
            email_contact_price: settings.email_contact_price,
            sms_contact_price: settings.sms_contact_price,
          })
          alert("Настройки сохранены!")
          return
        } else {
          throw new Error('Ошибка сохранения в БД')
        }
      }
      
      // Fallback на localStorage
      localStorage.setItem('appointo_settings', JSON.stringify(settings))
      updateFeatures(featureFlags)
      await saveContactChannelPrices({
        push_contact_price: settings.push_contact_price,
        email_contact_price: settings.email_contact_price,
        sms_contact_price: settings.sms_contact_price,
      })
      alert("Настройки сохранены (только локально)")
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
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
              className="w-32 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Функции салона</h3>
              <p className="text-xs text-gray-500">Включить функционал работы с салонами</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableSalonFeatures}
                onChange={(e) => handleSettingChange('enableSalonFeatures', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
            </label>
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Цены контактов для рассылок */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <BellIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Цены каналов рассылок</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">push_contact_price</label>
            <input
              type="number"
              min="0"
              step="1"
              value={settings.push_contact_price}
              onChange={(e) => handleSettingChange('push_contact_price', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">email_contact_price</label>
            <input
              type="number"
              min="0"
              step="1"
              value={settings.email_contact_price}
              onChange={(e) => handleSettingChange('email_contact_price', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">sms_contact_price</label>
            <input
              type="number"
              min="0"
              step="1"
              value={settings.sms_contact_price}
              onChange={(e) => handleSettingChange('sms_contact_price', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            />
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4CAF50]"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Частота резервного копирования
            </label>
            <select
              value={settings.backupFrequency}
              onChange={(e) => handleSettingChange('backupFrequency', e.target.value)}
              className="w-48 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            >
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="monthly">Ежемесячно</option>
            </select>
          </div>
        </div>
      </div>


      {/* Кнопки действий */}
      <div className="flex justify-end space-x-4">
        <button className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors">
          Отменить
        </button>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 bg-[#4CAF50] text-white rounded-md hover:bg-[#43a047] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
} 