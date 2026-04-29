import { useState, useEffect } from "react"
import { Button } from "../components/ui"
import Tabs from "../components/ui/Tabs"
import WorkingHours from "../components/WorkingHours"

// Утилита для форматирования рабочих часов
const formatWorkingHoursDisplay = (hoursString) => {
  if (!hoursString) return '—'
  
  try {
    const hours = JSON.parse(hoursString)
    const days = {
      monday: 'Понедельник',
      tuesday: 'Вторник', 
      wednesday: 'Среда',
      thursday: 'Четверг',
      friday: 'Пятница',
      saturday: 'Суббота',
      sunday: 'Воскресенье'
    }
    
    const enabledDays = Object.entries(hours)
      .filter(([day, data]) => data.enabled)
      .map(([day, data]) => `${days[day]}: ${data.open}-${data.close}`)
    
    return enabledDays.length > 0 ? enabledDays.join(', ') : '—'
  } catch {
    return hoursString
  }
}

// Компонент для редактирования рабочих часов
const WorkingHoursEditor = ({ workingHours, handleWorkingHoursChange, toggleWorkingDay }) => {
  const days = {
    monday: 'Понедельник',
    tuesday: 'Вторник',
    wednesday: 'Среда', 
    thursday: 'Четверг',
    friday: 'Пятница',
    saturday: 'Суббота',
    sunday: 'Воскресенье'
  }
  
  const timeOptions = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      timeOptions.push(time)
    }
  }
  
  return (
    <div className="space-y-3">
      {Object.entries(days).map(([dayKey, dayName]) => (
        <div key={dayKey} className="flex items-center gap-3 p-3 border rounded-lg">
          <button
            type="button"
            onClick={() => toggleWorkingDay(dayKey)}
            className={`w-32 px-3 py-1 rounded text-sm font-medium transition-colors text-center ${
              workingHours[dayKey].enabled
                ? 'bg-[#4CAF50] text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {dayName}
          </button>
          {workingHours[dayKey].enabled && (
            <>
              <span className="text-sm text-gray-600">с</span>
              <select
                value={workingHours[dayKey].open}
                onChange={(e) => handleWorkingHoursChange(dayKey, 'open', e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                {timeOptions.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
              <span className="text-sm text-gray-600">до</span>
              <select
                value={workingHours[dayKey].close}
                onChange={(e) => handleWorkingHoursChange(dayKey, 'close', e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                {timeOptions.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// Компонент для создания/редактирования филиала
const BranchModal = ({ isOpen, onClose, branch, onSave, maxBranches, currentCount }) => {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    description: '',
    phone: '',
    email: '',
    working_hours: '',
    manager_id: null,
    is_active: true,
    
    // Поля для управления сайтом филиала
    url_slug: '',
    yandex_map_embed: '',
    background_color: '#ffffff',
    logo_path: '',
    use_salon_logo: false
  })

  // Состояние для рабочих часов
  const [workingHours, setWorkingHours] = useState({
    monday: { enabled: false, open: '09:00', close: '18:00' },
    tuesday: { enabled: false, open: '09:00', close: '18:00' },
    wednesday: { enabled: false, open: '09:00', close: '18:00' },
    thursday: { enabled: false, open: '09:00', close: '18:00' },
    friday: { enabled: false, open: '09:00', close: '18:00' },
    saturday: { enabled: false, open: '09:00', close: '18:00' },
    sunday: { enabled: false, open: '09:00', close: '18:00' }
  })

  // Состояние для поиска управляющего
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  // Состояние для активной вкладки
  const [activeTab, setActiveTab] = useState('basic')

  const tabs = [
    { id: 'basic', label: 'Основная информация' },
    { id: 'schedule', label: 'Расписание работы' },
    { id: 'website', label: 'Управление сайтом' }
  ]

  // Функции для работы с рабочими часами
  const parseWorkingHours = (hoursString) => {
    if (!hoursString) return workingHours
    try {
      return JSON.parse(hoursString)
    } catch {
      return workingHours
    }
  }

  const formatWorkingHours = (hours) => {
    return JSON.stringify(hours)
  }

  const handleWorkingHoursChange = (day, field, value) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }))
  }

  const toggleWorkingDay = (day) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled
      }
    }))
  }

  // Функция для поиска пользователей
  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    try {
      const response = await fetch(`/auth/users/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data)
      }
    } catch (error) {
      console.error('Ошибка поиска пользователей:', error)
    } finally {
      setIsSearching(false)
    }
  }

  // Функция для загрузки информации об управляющем
  const loadManagerInfo = async (managerId) => {
    try {
      const response = await fetch(`/auth/users/${managerId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const manager = await response.json()
        setSearchQuery(manager.full_name || manager.phone)
      }
    } catch (error) {
      console.error('Ошибка загрузки информации об управляющем:', error)
    }
  }

  // Функция для отправки приглашения управляющему
  const sendManagerInvitation = async (branchId, userId, message = '') => {
    try {
      const response = await fetch(`/salon/branches/${branchId}/invite-manager`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          message: message
        })
      })
      
      if (response.ok) {
        alert('Приглашение отправлено!')
        setSearchQuery('')
        setFormData({...formData, manager_id: null})
        // TODO: Перезагрузить филиалы после отправки приглашения
        // loadBranches() 
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка отправки приглашения')
      }
    } catch (error) {
      console.error('Ошибка отправки приглашения:', error)
      alert(`Ошибка: ${error.message}`)
    }
  }



  useEffect(() => {
    if (branch) {
      setFormData({
        name: branch.name || '',
        address: branch.address || '',
        description: branch.description || '',
        phone: branch.phone || '',
        email: branch.email || '',
        working_hours: branch.working_hours || '',
        manager_id: branch.manager_id || null,
        is_active: branch.is_active !== false,
        
        // Поля для управления сайтом филиала
        url_slug: branch.url_slug || '',
        yandex_map_embed: branch.yandex_map_embed || '',
        background_color: branch.background_color || '#ffffff',
        logo_path: branch.logo_path || '',
        use_salon_logo: branch.use_salon_logo || false
      })
      // Парсим рабочие часы
      setWorkingHours(parseWorkingHours(branch.working_hours))
      
      // Загружаем информацию об управляющем
      if (branch.manager_id) {
        loadManagerInfo(branch.manager_id)
      }
    } else {
      setFormData({
        name: '',
        address: '',
        description: '',
        phone: '',
        email: '',
        working_hours: '',
        manager_id: null,
        is_active: true,
        
        // Поля для управления сайтом филиала
        url_slug: '',
        yandex_map_embed: '',
        background_color: '#ffffff',
        logo_path: '',
        use_salon_logo: false
      })
      // Сбрасываем рабочие часы к значениям по умолчанию
      setWorkingHours({
        monday: { enabled: false, open: '09:00', close: '18:00' },
        tuesday: { enabled: false, open: '09:00', close: '18:00' },
        wednesday: { enabled: false, open: '09:00', close: '18:00' },
        thursday: { enabled: false, open: '09:00', close: '18:00' },
        friday: { enabled: false, open: '09:00', close: '18:00' },
        saturday: { enabled: false, open: '09:00', close: '18:00' },
        sunday: { enabled: false, open: '09:00', close: '18:00' }
      })
      setSearchQuery('')
    }
    
    // Сбрасываем активную вкладку на основную информацию
    setActiveTab('basic')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch])

  const handleSubmit = (e) => {
    e.preventDefault()
    const dataWithWorkingHours = {
      ...formData,
      working_hours: formatWorkingHours(workingHours)
    }
    
    // Если выбран управляющий, отправляем приглашение
    if (formData.manager_id) {
      sendManagerInvitation(branch?.id || 0, formData.manager_id, formData.description)
      return
    }
    
    // Иначе создаем/обновляем филиал
    onSave(dataWithWorkingHours)
    onClose()
  }

  if (!isOpen) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleBackdropClick}>
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Заголовок */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">
            {branch ? 'Редактировать филиал' : 'Создать филиал'}
          </h2>
          {!branch && (
            <div className="mt-4 p-3 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
              <p className="text-sm text-[#4CAF50]">
                Филиалов: {currentCount} / {maxBranches}
              </p>
            </div>
          )}
        </div>

        {/* Вкладки */}
        <div className="p-6 border-b border-gray-200">
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Прокручиваемая область с формой */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Вкладка основной информации */}
            {activeTab === 'basic' && (
              <>
                {/* Основная информация - две колонки */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Название филиала *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      required
                      placeholder="Например: Центральный филиал"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Адрес
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="ул. Примерная, 123"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Телефон
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="+7 (999) 123-45-67"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="branch@salon.com"
                    />
                  </div>
                </div>

                {/* Описание - полная ширина */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    rows="3"
                    placeholder="Краткое описание филиала"
                  />
                </div>

                {/* Управляющий филиалом */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Управляющий филиалом
                  </label>
                  <div className="space-y-2">
                    <input
                      type="tel"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        if (e.target.value.trim().length >= 7) {
                          searchUsers(e.target.value)
                        } else {
                          setSearchResults([])
                        }
                      }}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="Поиск по номеру телефона..."
                    />
                    
                    {/* Результаты поиска */}
                    {searchResults.length > 0 && (
                      <div className="border rounded-lg max-h-40 overflow-y-auto">
                        {searchResults.map(user => (
                          <div
                            key={user.id}
                            onClick={() => {
                              setFormData({...formData, manager_id: user.id})
                              setSearchQuery(user.phone)
                              setSearchResults([])
                            }}
                            className="p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                          >
                            <div className="font-medium">{user.full_name || 'Без имени'}</div>
                            <div className="text-sm text-gray-600">{user.phone}</div>
                            {user.email && <div className="text-xs text-gray-500">{user.email}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Выбранный управляющий */}
                    {formData.manager_id && (
                      <div className="p-2 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
                        <div className="text-sm text-[#4CAF50]">
                          <strong>Управляющий:</strong> {searchQuery}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({...formData, manager_id: null})
                            setSearchQuery('')
                          }}
                          className="text-xs text-[#4CAF50] hover:text-[#45A049] mt-1"
                        >
                          Убрать управляющего
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Статус активности */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    className="mr-2"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                    Активен
                  </label>
                </div>
              </>
            )}

            {/* Вкладка расписания работы */}
            {activeTab === 'schedule' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Расписание работы филиала</h3>
                <p className="text-gray-600 mb-4">
                  Настройте рабочие часы для каждого дня недели
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Рабочие часы
                  </label>
                  <WorkingHoursEditor
                    workingHours={workingHours}
                    handleWorkingHoursChange={handleWorkingHoursChange}
                    toggleWorkingDay={toggleWorkingDay}
                  />
                  <p className="text-xs text-gray-500 mt-1">Выберите хотя бы один рабочий день</p>
                </div>
              </div>
            )}

            {/* Вкладка управления сайтом */}
            {activeTab === 'website' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Управление сайтом филиала</h3>
                <p className="text-gray-600 mb-4">
                  Настройте внешний вид и контент страницы филиала
                </p>
                
                {/* URL slug для страницы филиала */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название в URL *
                  </label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">sitename.dedato.ru/</span>
                    <input
                      type="text"
                      value={formData.url_slug || ''}
                      onChange={(e) => setFormData({...formData, url_slug: e.target.value})}
                      className="flex-1 border rounded-lg px-3 py-2"
                      placeholder="название-филиала"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Используйте только латинские буквы, цифры и дефисы
                  </p>
                </div>

                {/* Цвет фона */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Цвет фона страницы
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={formData.background_color || '#ffffff'}
                      onChange={(e) => setFormData({...formData, background_color: e.target.value})}
                      className="w-16 h-10 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.background_color || '#ffffff'}
                      onChange={(e) => setFormData({...formData, background_color: e.target.value})}
                      className="flex-1 border rounded-lg px-3 py-2"
                      placeholder="#ffffff"
                    />
                  </div>
                </div>

                {/* Логотип филиала */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Логотип филиала
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="use_salon_logo"
                        checked={formData.use_salon_logo || false}
                        onChange={(e) => setFormData({...formData, use_salon_logo: e.target.checked})}
                        className="mr-2"
                      />
                      <label htmlFor="use_salon_logo" className="text-sm text-gray-700">
                        Использовать логотип организации
                      </label>
                    </div>
                    
                    {!formData.use_salon_logo && (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0]
                            if (file) {
                              // Здесь будет логика загрузки файла
                              setFormData({...formData, logo_path: file.name})
                            }
                          }}
                          className="w-full border rounded-lg px-3 py-2"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Загрузите логотип для филиала (PNG, JPG, до 2MB)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Яндекс карта */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Интерактивная карта
                  </label>
                  <textarea
                    value={formData.yandex_map_embed || ''}
                    onChange={(e) => setFormData({...formData, yandex_map_embed: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    rows="4"
                    placeholder="Вставьте HTML код для встраивания Яндекс карты..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Скопируйте код встраивания с сайта Яндекс.Карты
                  </p>
                </div>
              </div>
            )}


        </form>
        </div>

        {/* Футер с кнопками */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3">
            <Button type="submit" className="flex-1" onClick={handleSubmit}>
              {formData.manager_id ? 'Отправить приглашение' : (branch ? 'Обновить' : 'Создать')}
            </Button>
            <Button 
              variant="secondary" 
              onClick={onClose}
              className="flex-1"
            >
              Отмена
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BranchesDashboard() {
  const [user, setUser] = useState(null)
  const [salon, setSalon] = useState(null)
  const [branches, setBranches] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [branchModal, setBranchModal] = useState({ isOpen: false, branch: null })
  const [loading, setLoading] = useState(true)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  const loadUserData = async () => {
    try {
      const response = await fetch('/api/auth/users/me', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
      }
    } catch (error) {
      console.error('Ошибка загрузки данных пользователя:', error)
    }
  }

  const loadSalonProfile = async () => {
    try {
      const response = await fetch('/salon/profile', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const salonData = await response.json()
        setSalon(salonData)
      }
    } catch (error) {
      console.error('Ошибка загрузки профиля салона:', error)
    }
  }

  const loadBranches = async () => {
    try {
      const response = await fetch('/salon/branches', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const branchesData = await response.json()
        setBranches(branchesData)
      }
    } catch (error) {
      console.error('Ошибка загрузки филиалов:', error)
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
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        loadUserData(),
        loadSalonProfile(),
        loadSubscription()
      ])
      setLoading(false)
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (salon) {
      loadBranches()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon])

  const handleCreateBranch = () => {
    setBranchModal({ isOpen: true, branch: null })
  }

  const handleEditBranch = (branch) => {
    setBranchModal({ isOpen: true, branch })
  }

  const handleSaveBranch = async (branchData) => {
    try {
      const url = branchModal.branch 
        ? `/salon/branches/${branchModal.branch.id}`
        : '/salon/branches'
      const method = branchModal.branch ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(branchData)
      })
      
      if (response.ok) {
        loadBranches()
        setBranchModal({ isOpen: false, branch: null })
        alert(branchModal.branch ? 'Филиал обновлен!' : 'Филиал создан!')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения филиала')
      }
    } catch (error) {
      console.error('Ошибка сохранения филиала:', error)
      alert(`Ошибка: ${error.message}`)
    }
  }

  const handleDeleteBranch = async (branchId) => {
    if (!confirm('Вы уверены, что хотите удалить этот филиал? Это действие нельзя отменить.')) return
    
    try {
      const response = await fetch(`/salon/branches/${branchId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        loadBranches()
        alert('Филиал удален!')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления филиала')
      }
    } catch (error) {
      console.error('Ошибка удаления филиала:', error)
      alert(`Ошибка: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!user || !salon) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <p className="text-gray-600">Ошибка загрузки данных</p>
        </div>
      </div>
    )
  }

  // Проверяем подписку
  const maxBranches = subscription?.max_branches || 1
  const canCreateBranches = maxBranches >= 2
  const canCreateMore = branches.length < maxBranches

  if (!canCreateBranches) {
    return (
      <div className="mb-8">
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏢</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Управление филиалами</h1>
            <p className="text-gray-600 mb-6">
              Для создания филиалов необходимо оформить подписку с поддержкой 2 и более филиалов
            </p>
            <div className="bg-[#DFF5EC] border border-[#4CAF50] rounded-lg p-6 max-w-md mx-auto">
              <h3 className="font-semibold text-[#4CAF50] mb-2">Текущий тариф</h3>
              <p className="text-[#4CAF50] mb-4">
                Максимум филиалов: {maxBranches}
              </p>
              <Button
                onClick={() => window.location.href = '/dashboard/tariff'}
              >
                Обновить тариф
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Управление филиалами</h1>
          <p className="text-gray-600">Создавайте и управляйте филиалами вашего салона</p>
        </div>

        {/* Информация о лимитах */}
        <div className="bg-[#DFF5EC] border border-[#4CAF50] rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#4CAF50]">Лимит филиалов</h3>
              <p className="text-[#4CAF50]">
                Создано: {branches.length} / {maxBranches}
              </p>
            </div>
            {canCreateMore && (
              <Button
                onClick={handleCreateBranch}
              >
                + Создать филиал
              </Button>
            )}
          </div>
        </div>

        {/* Список филиалов */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch, index) => (
            <div key={branch.id} className="bg-white rounded-lg shadow p-6 border">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-[#DFF5EC] rounded-full flex items-center justify-center">
                    <span className="text-[#4CAF50] font-semibold">{index + 1}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                    <div className={`inline-block px-2 py-1 rounded text-xs mt-1 ${
                      branch.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {branch.is_active ? 'Активен' : 'Неактивен'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditBranch(branch)}
                    className="text-[#4CAF50] hover:text-[#45A049] p-1"
                    title="Редактировать"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteBranch(branch.id)}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Удалить"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              {branch.address && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">📍 {branch.address}</p>
                </div>
              )}
              
              {branch.phone && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">📞 {branch.phone}</p>
                </div>
              )}
              
              {branch.email && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">✉️ {branch.email}</p>
                </div>
              )}
              
              {branch.description && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">{branch.description}</p>
                </div>
              )}
              
              {branch.working_hours && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">🕒 {formatWorkingHoursDisplay(branch.working_hours)}</p>
                </div>
              )}
              
              {/* Информация об управляющем */}
              {branch.manager_id && branch.manager_name && (
                <div className="mb-2">
                  <p className="text-sm text-[#4CAF50]">👤 <strong>Управляющий:</strong> {branch.manager_name}</p>
                </div>
              )}
              
              {!branch.manager_id && (
                <div className="mb-2">
                  <p className="text-sm text-gray-500">👤 Управляющий не назначен</p>
                </div>
              )}
              
              {/* Прямая ссылка на бронирование в филиале */}
              <div className="mt-4 p-3 border border-[#4CAF50] rounded-lg">
                <h4 className="font-medium text-[#4CAF50] mb-2">Прямая ссылка на бронирование</h4>
                <p className="text-sm text-[#4CAF50] mb-2">
                  Отправьте эту ссылку клиентам для быстрой записи в этот филиал
                </p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={`${window.location.origin}/booking/${salon?.id}/${branch.id}`}
                    readOnly
                    className="flex-1 text-sm bg-white border border-[#4CAF50] rounded px-2 py-1"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/booking/${salon?.id}/${branch.id}`)
                      alert('Ссылка скопирована в буфер обмена!')
                    }}
                    className="text-[#4CAF50] hover:text-[#45A049] text-sm font-medium"
                    title="Копировать ссылку"
                  >
                    📋
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Пустое состояние */}
        {branches.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏢</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Филиалы не созданы</h3>
            <p className="text-gray-600 mb-6">
              Создайте первый филиал для расширения вашего бизнеса
            </p>
            <Button
              onClick={handleCreateBranch}
            >
              + Создать первый филиал
            </Button>
          </div>
        )}

        {/* Модальное окно */}
        <BranchModal
          isOpen={branchModal.isOpen}
          onClose={() => setBranchModal({ isOpen: false, branch: null })}
          branch={branchModal.branch}
          onSave={handleSaveBranch}
          maxBranches={maxBranches}
          currentCount={branches.length}
        />
      </div>
    </div>
  )
} 