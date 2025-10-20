import { useState, useEffect } from "react"
import Header from "../components/Header"
import ServiceModal from "../modals/ServiceModal"
import CategoryEditModal from "../modals/CategoryEditModal"
import DeleteConfirmModal from "../modals/DeleteConfirmModal"
import ServiceEditModal from "../modals/ServiceEditModal"
import SalonSidebar from "../components/SalonSidebar"
import SalonMasters from "../components/SalonMasters"
import PlacesDashboard from "./PlacesDashboard"
import BranchesDashboard from "./BranchesDashboard"
import { cities, getTimezoneByCity } from "../utils/cities"
import SalonTariff from "./SalonTariff"
import AdvancedScheduleView from "../components/AdvancedScheduleView"
import LoyaltySystem from "../components/LoyaltySystem"

import { getApiUrl, getImageUrl } from "../utils/config"
import WorkingHours from "../components/WorkingHours"
import YandexGeocoder from "../components/YandexGeocoder"
import PaymentMethodSelector from "../components/PaymentMethodSelector"
import ClientRestrictionsManager from "../components/ClientRestrictionsManager"
import { Button } from "../components/ui"

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

// Компонент календаря расписания работы
const ScheduleCalendar = ({ workingHours }) => {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  
  // Функция для получения дат на выбранную неделю
  const getWeekDates = (weekOffset = 0) => {
    const today = new Date()
    const currentDay = today.getDay() // 0 = воскресенье, 1 = понедельник, ...
    
    // Находим понедельник текущей недели
    const monday = new Date(today)
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1
    monday.setDate(today.getDate() - daysToMonday)
    
    // Добавляем смещение недели
    monday.setDate(monday.getDate() + (weekOffset * 7))
    
    const weekDates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      weekDates.push(date)
    }
    
    return weekDates
  }
  
  // Маппинг дней недели для определения рабочих часов
  const dayMapping = {
    1: 'monday',    // Понедельник
    2: 'tuesday',   // Вторник
    3: 'wednesday', // Среда
    4: 'thursday',  // Четверг
    5: 'friday',    // Пятница
    6: 'saturday',  // Суббота
    0: 'sunday'     // Воскресенье
  }
  
  // Получаем даты недели
  const weekDates = getWeekDates(currentWeekOffset)
  
  // Получаем активные дни с датами
  const activeDaysWithDates = weekDates
    .map(date => {
      const dayOfWeek = date.getDay()
      const dayKey = dayMapping[dayOfWeek]
      const dayData = workingHours[dayKey]
      
      return {
        date,
        dayKey,
        dayName: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
        dateString: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        enabled: dayData?.enabled || false,
        open: dayData?.open || '09:00',
        close: dayData?.close || '18:00'
      }
    })
    .filter(day => day.enabled)
  
  // Если нет активных дней, показываем сообщение
  if (activeDaysWithDates.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-2">Не задан режим работы</div>
        <p className="text-sm text-gray-400">Установите рабочие часы в разделе "Управление салоном"</p>
      </div>
    )
  }
  
  // Находим самое раннее время начала и самое позднее время окончания
  const allTimes = activeDaysWithDates.flatMap(day => [day.open, day.close])
  const earliestTime = allTimes.reduce((earliest, time) => 
    time < earliest ? time : earliest, allTimes[0])
  const latestTime = allTimes.reduce((latest, time) => 
    time > latest ? time : latest, allTimes[0])
  
  // Генерируем временные слоты с шагом 30 минут
  const timeSlots = []
  const [startHour, startMinute] = earliestTime.split(':').map(Number)
  const [endHour, endMinute] = latestTime.split(':').map(Number)
  
  let currentHour = startHour
  let currentMinute = startMinute
  
  while (currentHour < endHour || (currentHour === endHour && currentMinute <= endMinute)) {
    timeSlots.push(`${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`)
    currentMinute += 30
    if (currentMinute >= 60) {
      currentMinute = 0
      currentHour += 1
    }
  }
  
  // Функция для проверки, работает ли салон в данное время
  const isWorkingTime = (day, time) => {
    return time >= day.open && time < day.close
  }
  
  // Функция для определения, является ли дата сегодняшней
  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }
  
  // Функция для определения, прошло ли время
  const isTimePassed = (date, time) => {
    const today = new Date()
    const targetDate = new Date(date)
    // Сравниваем только дату (без времени)
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())

    if (targetDateOnly < todayDate) {
      // День в прошлом
      return true
    }
    if (targetDateOnly > todayDate) {
      // День в будущем
      return false
    }
    // День сегодня — сравниваем время
    const [timeHour, timeMinute] = time.split(':').map(Number)
    const currentHour = today.getHours()
    const currentMinute = today.getMinutes()
    return (timeHour < currentHour) || (timeHour === currentHour && timeMinute <= currentMinute)
  }
  
  // Функции навигации
  const goToPreviousWeek = () => setCurrentWeekOffset(prev => prev - 1)
  const goToNextWeek = () => setCurrentWeekOffset(prev => prev + 1)
  const goToCurrentWeek = () => setCurrentWeekOffset(0)
  
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Заголовок с периодом и навигацией */}
        <div className="mb-4 text-center">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={goToPreviousWeek}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              ← Предыдущая
            </button>
            <button
              onClick={goToCurrentWeek}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                currentWeekOffset === 0 
                  ? 'bg-[#E8F5E8] text-[#2E7D32]' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Текущая неделя
            </button>
            <button
              onClick={goToNextWeek}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Следующая →
            </button>
          </div>
          <h3 className="text-lg font-semibold text-gray-800">
            Расписание на неделю
          </h3>
          <p className="text-sm text-gray-600">
            {weekDates[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} - {weekDates[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </p>
        </div>
        
        {/* Заголовки дней */}
        <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `80px repeat(${activeDaysWithDates.length}, 1fr)` }}>
          <div className="w-20 h-12"></div> {/* Пустая ячейка для времени */}
          {activeDaysWithDates.map((day) => (
            <div 
              key={day.date.toISOString()} 
              className={`h-12 rounded flex flex-col items-center justify-center text-sm font-medium border-2 ${
                isToday(day.date) 
                  ? 'bg-blue-100 border-blue-300 text-blue-800' 
                  : 'bg-gray-100 border-gray-200 text-gray-700'
              }`}
            >
              <div className="font-bold">{day.dayName}</div>
              <div className="text-xs">{day.dateString}</div>
              {isToday(day.date) && (
                <div className="text-xs text-blue-600 font-medium">Сегодня</div>
              )}
            </div>
          ))}
        </div>
        
        {/* Временные слоты */}
        {timeSlots.map(time => (
          <div key={time} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `80px repeat(${activeDaysWithDates.length}, 1fr)` }}>
            <div className="w-20 h-8 flex items-center justify-end pr-2 text-xs text-gray-500 font-medium">
              {time}
            </div>
            {activeDaysWithDates.map((day) => (
              <div 
                key={`${day.date.toISOString()}-${time}`} 
                className={`h-8 rounded border relative overflow-hidden ${
                  isWorkingTime(day, time) 
                    ? isTimePassed(day.date, time)
                      ? 'bg-gray-300 border-gray-400'
                      : 'bg-green-100 border-green-300'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {isWorkingTime(day, time) && !isTimePassed(day.date, time) && (
                  <div className="w-full h-full bg-green-500 opacity-20 rounded"></div>
                )}
                {/* Диагональная полоска для прошедшего времени */}
                {isTimePassed(day.date, time) && (
                  <div 
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(45deg, transparent 40%, rgba(156, 163, 175, 0.6) 40%, rgba(156, 163, 175, 0.6) 60%, transparent 60%)',
                      backgroundSize: '4px 4px'
                    }}
                  ></div>
                )}
              </div>
            ))}
          </div>
        ))}
        
        {/* Легенда */}
        <div className="mt-4 flex items-center justify-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-600">Рабочее время</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-100 border-2 border-blue-300 rounded"></div>
            <span className="text-gray-600">Сегодня</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-300 border border-gray-400 rounded relative overflow-hidden">
              <div 
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(45deg, transparent 40%, rgba(156, 163, 175, 0.6) 40%, rgba(156, 163, 175, 0.6) 60%, transparent 60%)',
                  backgroundSize: '4px 4px'
                }}
              ></div>
            </div>
            <span className="text-gray-600">Прошедшее время</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Компонент уведомления о недостающих данных
const MissingDataNotification = ({ missingData, setActiveTab }) => {
  if (missingData.length === 0) return null
  
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            Для начала работы нужно ещё немного информации
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            <p className="mb-2">Не хватает следующих данных:</p>
            <ul className="list-disc list-inside space-y-1">
              {missingData.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3">
              <button
                onClick={() => setActiveTab('salon')}
                className="text-yellow-800 underline hover:text-yellow-900"
              >
                Заполнить данные →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ServiceDashboard() {
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [salonProfile, setSalonProfile] = useState(null)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    address: '',
    description: '',
    phone: '',
    email: '',
    website: '',
    instagram: '',
    city: '',
    is_active: true
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
  
  // Состояние для управления категориями
  const [categoryEditModalOpen, setCategoryEditModalOpen] = useState(false)
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)

  // Состояния для модальных окон услуг
  const [serviceEditModalOpen, setServiceEditModalOpen] = useState(false)
  const [serviceDeleteModalOpen, setServiceDeleteModalOpen] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [categories, setCategories] = useState([])

  // Состояние для активной вкладки
  const [activeTab, setActiveTab] = useState('dashboard')

  // Состояния для расписания
  const [places, setPlaces] = useState([])
  const [masters, setMasters] = useState([])
  const [scheduleData, setScheduleData] = useState(null)

  // Новое состояние для формы редактирования профиля
  const [editProfileMode, setEditProfileMode] = useState(false)
  const [editProfileForm, setEditProfileForm] = useState({})
  const [logoFile, setLogoFile] = useState(null)
  const [profileSaveError, setProfileSaveError] = useState('')
  const [profileSaveSuccess, setProfileSaveSuccess] = useState('')
  const [websiteSettingsChanged, setWebsiteSettingsChanged] = useState(false)

  // Функции валидации телефона (из AuthModal)
  const validatePhone = (phone) => {
    return /^\+7\d{10}$/.test(phone)
  }
  
  const formatPhone = (input) => {
    // Оставляем только цифры
    let digits = input.replace(/\D/g, '')
    if (digits.startsWith('7')) digits = digits.slice(1)
    if (digits.length > 10) digits = digits.slice(0, 10)
    return '+7' + digits
  }

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }

  const loadSalonProfile = async () => {
    try {
      const response = await fetch('/salon/profile', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const profileData = await response.json()
        setSalonProfile(profileData)

        return profileData
      } else if (response.status === 404) {
        setSalonProfile(null)
        return null
      }
    } catch {
      console.error('Ошибка загрузки профиля салона:', err)
      setSalonProfile(null)
      return null
    }
  }

  const createSalonProfile = async (e) => {
    e.preventDefault()
    try {
      const formData = {
        ...profileForm
      }
      const response = await fetch('/salon/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      })
      if (response.ok) {
        const data = await response.json()
        setSalonProfile(data)
        setShowProfileForm(false)
        loadServices()
      } else {
        const errorData = await response.json()
        setError(`Ошибка создания профиля: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch {
      console.error('Ошибка создания профиля салона:', err)
      setError('Ошибка создания профиля салона')
    }
  }

  const loadServices = async () => {
    try {
      setLoading(true)
      console.log('Loading services...')
      const response = await fetch('/salon/services', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Services loaded:', data)
        setServices(data)
      } else {
        console.error('Error loading services:', response.status)
        setError('Ошибка загрузки услуг')
      }
    } catch {
      console.error('Ошибка загрузки услуг:', err)
      setError('Ошибка загрузки услуг')
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      console.log('Loading categories...')
      const response = await fetch('/salon/categories', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Categories loaded:', data)
        setCategories(data)
      } else {
        console.error('Error loading categories:', response.status)
      }
    } catch {
      console.error('Error loading categories:', err)
    }
  }

  const loadUserData = async () => {
    try {
      const response = await fetch('/auth/users/me', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const userData = await response.json()
        // Предзаполняем форму данными пользователя
        setProfileForm(prev => ({
          ...prev,
          phone: userData.phone || '',
          email: userData.email || ''
        }))
      }
    } catch {
      console.error('Ошибка загрузки данных пользователя:', err)
    }
  }

  const loadPlaces = async () => {
    try {
      console.log('Loading places...')
      const response = await fetch('/salon/places', {
        headers: getAuthHeaders()
      })
      console.log('Places response status:', response.status)
      if (response.ok) {
        const placesData = await response.json()
        console.log('Places loaded:', placesData)
        setPlaces(placesData)
      } else {
        console.error('Ошибка загрузки мест:', response.status)
        // Устанавливаем пустой массив при ошибке
        setPlaces([])
      }
    } catch (error) {
      console.error('Ошибка загрузки мест:', error)
      // Устанавливаем пустой массив при ошибке
      setPlaces([])
    }
  }

  const loadMasters = async () => {
    try {
      console.log('Loading masters...')
      const response = await fetch('/salon/masters', {
        headers: getAuthHeaders()
      })
      console.log('Masters response status:', response.status)
      if (response.ok) {
        const mastersData = await response.json()
        console.log('Masters loaded:', mastersData)
        // API возвращает объект с ключом 'masters', извлекаем массив
        const mastersArray = mastersData.masters || []
        console.log('Masters array:', mastersArray)
        setMasters(mastersArray)
      } else {
        console.error('Ошибка загрузки мастеров:', response.status)
        // Устанавливаем пустой массив при ошибке
        setMasters([])
      }
    } catch (error) {
      console.error('Ошибка загрузки мастеров:', error)
      // Устанавливаем пустой массив при ошибке
      setMasters([])
    }
  }

  const loadSchedule = async () => {
    try {
      console.log('Loading schedule...')
      // Пока используем пустые данные, так как API endpoint не существует
      console.log('Schedule API endpoint not available, using empty data')
      setScheduleData({ bookings: [] })
    } catch (error) {
      console.error('Ошибка загрузки расписания:', error)
      // Устанавливаем пустые данные при ошибке
      setScheduleData({ bookings: [] })
    }
  }

  // Функция для назначения мастера на место
  const handleAssignMaster = async (placeId, date, masterId) => {
    try {
      const response = await fetch('/salon/places/assign-master', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          place_id: placeId,
          date: date,
          master_id: masterId
        })
      })
      
      if (response.ok) {
        console.log('Мастер успешно назначен')
        // Перезагружаем расписание для обновления данных
        await loadSchedule()
      } else {
        console.error('Ошибка назначения мастера:', response.status)
      }
    } catch (error) {
      console.error('Ошибка назначения мастера:', error)
    }
  }

  // Функция для удаления мастера с места
  const handleRemoveMaster = async (placeId, date) => {
    try {
      const response = await fetch('/salon/places/remove-master', {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          place_id: placeId,
          date: date
        })
      })
      
      if (response.ok) {
        console.log('Мастер успешно удален')
        // Перезагружаем расписание для обновления данных
        await loadSchedule()
      } else {
        console.error('Ошибка удаления мастера:', response.status)
      }
    } catch (error) {
      console.error('Ошибка удаления мастера:', error)
    }
  }

  useEffect(() => {
    loadSalonProfile().then(profile => {
      if (profile) {
        loadServices()
        loadCategories()
        loadPlaces()
        loadMasters()
        loadSchedule()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleServiceCreated = () => {
    console.log('Service created, reloading data...')
    loadServices()
    loadCategories() // Добавляем загрузку категорий для обновления списка
  }

  const handleEditCategory = (category) => {
    setSelectedCategory(category)
    setCategoryEditModalOpen(true)
  }

  const handleDeleteCategory = (category) => {
    setSelectedCategory(category)
    setDeleteConfirmModalOpen(true)
  }

  const handleCategoryUpdated = () => {
    loadServices()
    loadCategories() // Добавляем загрузку категорий для обновления списка в модальных окнах
  }

  const handleCategorySave = async (categoryData) => {
    try {
      let response
      if (selectedCategory) {
        // Обновление существующей категории
        response = await fetch(`/salon/categories/${selectedCategory.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(categoryData)
        })
      } else {
        // Создание новой категории
        response = await fetch('/salon/categories', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(categoryData)
        })
      }
      
      if (response.ok) {
        handleCategoryUpdated()
        setCategoryEditModalOpen(false)
        setSelectedCategory(null)
        setProfileSaveSuccess('Категория успешно создана!')
        setTimeout(() => setProfileSaveSuccess(''), 2500)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения категории')
      }
    } catch {
      console.error('Ошибка сохранения категории:', err)
      throw err
    }
  }

  const handleCategoryDeleted = async () => {
    if (!selectedCategory) return
    
    try {
      const response = await fetch(`/salon/categories/${selectedCategory.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        loadServices()
        loadCategories() // Добавляем загрузку категорий
      } else {
        const errorText = await response.text()
        setError(`Ошибка удаления категории: ${errorText}`)
      }
    } catch {
      console.error('Ошибка удаления категории:', err)
      setError('Ошибка удаления категории')
    }
  }

  const handleEditService = (service) => {
    if (!service) {
      console.log('handleEditService called with null/undefined service')
      return
    }
    console.log('handleEditService called with service:', service)
    setSelectedService(service)
    setServiceEditModalOpen(true)
  }

  const handleDeleteService = (service) => {
    setSelectedService(service)
    setServiceDeleteModalOpen(true)
  }

  const handleServiceUpdated = () => {
    loadServices()
  }

  const handleServiceDeleted = async () => {
    if (!selectedService) return
    try {
      const response = await fetch(`/salon/services/${selectedService.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (response.ok) {
        loadServices()
      } else {
        const errorText = await response.text()
        setError(`Ошибка удаления услуги: ${errorText}`)
      }
    } catch {
      setError('Ошибка удаления услуги')
    }
  }

  const handleEditProfile = () => {
    setEditProfileForm({
      name: salonProfile?.name || '',
      description: salonProfile?.description || '',
      domain: salonProfile?.domain || '',
      phone: salonProfile?.phone || '',
      email: salonProfile?.email || '',
      website: salonProfile?.website || '',
      instagram: salonProfile?.instagram || '',
      logo: salonProfile?.logo || '',
      city: salonProfile?.city || 'Москва',
      timezone: salonProfile?.timezone || 'Europe/Moscow',
      is_active: salonProfile?.is_active !== false,
      payment_on_visit: salonProfile?.payment_on_visit !== false,
      payment_advance: salonProfile?.payment_advance || false,
    })
    setEditProfileMode(true)
    setProfileSaveError('')
    setProfileSaveSuccess('')
    setWebsiteSettingsChanged(false)
    console.log('Инициализация editProfileForm:', {
      domain: salonProfile?.domain
    })
  }

  const handleProfileInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setEditProfileForm(f => {
      const newForm = {
        ...f,
        [name]: type === 'checkbox' ? checked : value
      }
      
      // Если изменился город, автоматически обновляем таймзону
      if (name === 'city' && value) {
        newForm.timezone = getTimezoneByCity(value)
      }
      
      // Отслеживаем изменения в настройках сайта
      if (name === 'domain') {
        setWebsiteSettingsChanged(true)
        console.log('Изменение настройки сайта:', name, value)
      }
      
      return newForm
    })
  }

  const handlePaymentMethodsChange = (paymentOnVisit, paymentAdvance) => {
    setEditProfileForm(prev => ({
      ...prev,
      payment_on_visit: paymentOnVisit,
      payment_advance: paymentAdvance
    }))
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileSaveError('')
    setProfileSaveSuccess('')
    try {
      const formData = new FormData()
      
      // Добавляем все поля формы, кроме logo
      Object.keys(editProfileForm).forEach(key => {
        if (key !== 'logo' && editProfileForm[key] !== undefined && editProfileForm[key] !== '') {
          formData.append(key, editProfileForm[key])
        }
      })
      
      // Добавляем файл логотипа, если он выбран
      if (logoFile) {
        formData.append('logo', logoFile)
      }
      

      
      // Убираем поле name, если оно не изменилось
      if (editProfileForm.name === salonProfile?.name) {
        formData.delete('name')
      }
      
      const response = await fetch('/salon/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      })
      
      if (response.ok) {
        const data = await response.json()
        setSalonProfile(data)
        setEditProfileMode(false)
        setWebsiteSettingsChanged(false)
        setProfileSaveSuccess('Профиль успешно обновлён')
      } else {
        const errorData = await response.json()
        setProfileSaveError(`Ошибка сохранения: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch {
      console.error('Ошибка сохранения профиля:', err)
      setProfileSaveError('Ошибка сохранения профиля')
    }
  }

  const handleSaveWebsiteSettings = async () => {
    try {
      const formData = new FormData()
      
      // Добавляем настройки сайта (используем значения из формы или текущие значения)
      const domain = editProfileForm.domain !== undefined 
        ? editProfileForm.domain 
        : salonProfile.domain
      
      console.log('Сохраняем настройки сайта:', {
        domain,
        editProfileForm,
        salonProfile: {
          domain: salonProfile.domain
        }
      })
      
      formData.append('domain', domain || '')
      
      const response = await fetch('/salon/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      })
      
      if (response.ok) {
        const updatedProfile = await response.json()
        console.log('Ответ сервера после сохранения:', updatedProfile)
        setSalonProfile(updatedProfile)
        setWebsiteSettingsChanged(false)
        setProfileSaveSuccess('Настройки сайта успешно обновлены!')
        setProfileSaveError('')
        
        // Очищаем сообщение об успехе через 3 секунды
        setTimeout(() => {
          setProfileSaveSuccess('')
        }, 3000)
        
        // Принудительно перезагружаем данные профиля
        await loadSalonProfile()
        
        // Также обновляем данные в базе данных
        console.log('Обновляем данные в базе данных...')
        const dbResponse = await fetch(`/api/domain/${salonProfile.domain}/info`)
        if (dbResponse.ok) {
          const domainData = await dbResponse.json()
          console.log('Обновленные данные поддомена:', domainData)
        }
      } else {
        const errorData = await response.json()
        setProfileSaveError(`Ошибка обновления настроек сайта: ${errorData.detail || 'Неизвестная ошибка'}`)
        setProfileSaveSuccess('')
      }
    } catch {
      console.error('Ошибка обновления настроек сайта:', err)
      setProfileSaveError('Ошибка обновления настроек сайта')
      setProfileSaveSuccess('')
    }
  }



  // Функция для проверки недостающих данных
  const getMissingData = () => {
    if (!salonProfile) return ['Профиль салона']
    
    const missing = []
    
    if (!salonProfile.phone) missing.push('Телефон')
    if (!salonProfile.email) missing.push('Email')
    
    return missing
  }

  const handleCreateProfile = () => {
    setShowProfileForm(true)
    loadUserData()
  }

  const handleProfileFormInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setProfileForm(prev => {
      const newForm = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }
      
      // Если изменился город, автоматически обновляем таймзону
      if (name === 'city' && value) {
        newForm.timezone = getTimezoneByCity(value)
      }
      
      return newForm
    })
  }

  const handleCreateProfileSubmit = async (e) => {
    e.preventDefault()
    try {
      const formData = {
        ...profileForm,
        timezone: getTimezoneByCity(profileForm.city)
      }
      const response = await fetch('/salon/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      })
      if (response.ok) {
        const data = await response.json()
        setSalonProfile(data)
        setShowProfileForm(false)
        setProfileSaveSuccess('Профиль салона успешно создан!')
        setTimeout(() => setProfileSaveSuccess(''), 3000)
        loadServices()
        loadCategories()
      } else {
        const errorData = await response.json()
        setProfileSaveError(`Ошибка создания профиля: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch {
      console.error('Ошибка создания профиля салона:', err)
      setProfileSaveError('Ошибка создания профиля салона')
    }
  }

  const handleDeleteSalon = async () => {
    if (!window.confirm('Вы уверены, что хотите удалить салон? Это действие нельзя отменить.')) {
      return
    }
    
    try {
      const response = await fetch('/salon/profile', {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (response.ok) {
        setSalonProfile(null)
        setServices([])
        setCategories([])
        setProfileSaveSuccess('Салон успешно удален')
        setTimeout(() => setProfileSaveSuccess(''), 3000)
      } else {
        const errorData = await response.json()
        setProfileSaveError(`Ошибка удаления салона: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch {
      console.error('Ошибка удаления салона:', err)
      setProfileSaveError('Ошибка удаления салона')
    }
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6]">
      <Header />
      <div className="flex">
        <SalonSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 ml-64 pt-[140px] p-8 bg-[#F9F7F6]">
          <div>
            {activeTab === 'dashboard' && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-6">Дашборд</h1>
                <MissingDataNotification missingData={getMissingData()} setActiveTab={setActiveTab} />
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <h2 className="text-xl font-semibold mb-4">Обзор салона</h2>
                  <p className="text-gray-600">Здесь будет отображаться общая статистика и ключевые показатели салона.</p>
                </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-6">Аналитика</h1>
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <h2 className="text-xl font-semibold mb-4">Детальная аналитика</h2>
                  <p className="text-gray-600">Здесь будут графики, отчеты и детальная аналитика работы салона.</p>
                </div>
              </div>
            )}

            {activeTab === 'masters' && (
              <SalonMasters getAuthHeaders={getAuthHeaders} />
            )}

            {activeTab === 'branches' && (
              <BranchesDashboard />
            )}

            {activeTab === 'places' && (
              <PlacesDashboard />
            )}

            {activeTab === 'schedule' && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-6">Расписание</h1>
                <AdvancedScheduleView
                  schedule={scheduleData}
                  bookings={scheduleData?.bookings || []}
                  places={places}
                  masters={masters}
                  workingHours={workingHours}
                  onAssignMaster={handleAssignMaster}
                  onRemoveMaster={handleRemoveMaster}
                />
              </div>
            )}

            {activeTab === 'salon' && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-6">Управление салоном</h1>
                <div className="bg-white rounded-lg shadow-sm border p-6 w-full">
                  <h2 className="text-xl font-semibold mb-4">Профиль салона</h2>
                  {salonProfile && !editProfileMode && (
                    <>
                      <div className="space-y-2 mb-4">
                                      <div className="flex items-center space-x-3">
                <b>Название:</b> 
                {salonProfile.logo && (
                  <img 
                    src={getImageUrl(salonProfile.logo)}
                    alt="Логотип салона" 
                    className="w-8 h-8 rounded object-cover"
                  />
                )}
                <span>{salonProfile.name}</span>
              </div>
              <div><b>Телефон:</b> {salonProfile.phone || <span className="text-gray-400">—</span>}</div>
              <div><b>Email:</b> {salonProfile.email || <span className="text-gray-400">—</span>}</div>
              <div><b>Сайт:</b> {salonProfile.website || <span className="text-gray-400">—</span>}</div>
              <div><b>Instagram:</b> {salonProfile.instagram || <span className="text-gray-400">—</span>}</div>
              <div><b>Город:</b> {salonProfile.city || 'Москва'}</div>
              <div><b>Описание:</b> {salonProfile.description || <span className="text-gray-400">—</span>}</div>
              <div><b>Активен:</b> {salonProfile.is_active ? 'Да' : 'Нет'}</div>
              <div className="text-xs text-gray-400">Создан: {new Date(salonProfile.created_at).toLocaleString()}</div>
              <div className="text-xs text-gray-400">Обновлён: {new Date(salonProfile.updated_at).toLocaleString()}</div>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          onClick={handleEditProfile}
                        >
                          Редактировать
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleDeleteSalon}
                          className="text-[#4CAF50] hover:text-[#45A049]"
                        >
                          Удалить салон
                        </Button>
                      </div>
                      {profileSaveSuccess && <div className="text-green-600 mt-2">{profileSaveSuccess}</div>}
                      {profileSaveError && <div className="text-red-500 mt-2">{profileSaveError}</div>}
                    </>
                  )}
                  {salonProfile && editProfileMode && (
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Название <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="name" value={editProfileForm.name} onChange={handleProfileInputChange} className="border rounded px-3 py-2 w-full" required />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Телефон <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="phone" value={editProfileForm.phone} onChange={handleProfileInputChange} className="border rounded px-3 py-2 w-full" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input type="email" name="email" value={editProfileForm.email} onChange={handleProfileInputChange} className="border rounded px-3 py-2 w-full" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Сайт</label>
                        <input type="text" name="website" value={editProfileForm.website} onChange={handleProfileInputChange} className="border rounded px-3 py-2 w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Instagram</label>
                        <input type="text" name="instagram" value={editProfileForm.instagram} onChange={handleProfileInputChange} className="border rounded px-3 py-2 w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Логотип</label>
                        <div className="space-y-2">
                          {editProfileForm.logo && (
                            <div className="flex items-center space-x-3">
                              <img 
                                src={editProfileForm.logo.startsWith('data:') ? editProfileForm.logo : getImageUrl(editProfileForm.logo)}
                                alt="Текущий логотип" 
                                className="w-16 h-16 rounded-lg object-cover border"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setEditProfileForm(prev => ({ ...prev, logo: '' }))
                                }}
                                className="text-red-600 text-sm hover:text-red-700"
                              >
                                Удалить
                              </button>
                            </div>
                          )}
                          <div className="flex items-center space-x-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files[0]
                                if (file) {
                                  // Проверяем размер файла (1.5 МБ = 1572864 байт)
                                  if (file.size > 1572864) {
                                    alert('Размер файла не должен превышать 1.5 МБ')
                                    return
                                  }
                                  
                                  // Проверяем формат изображения
                                  if (!file.type.startsWith('image/')) {
                                    alert('Пожалуйста, выберите изображение')
                                    return
                                  }
                                  
                                  // Сохраняем файл для отправки
                                  setLogoFile(file)
                                  
                                  // Создаем временный URL для предпросмотра
                                  const reader = new FileReader()
                                  reader.onload = (e) => {
                                    setEditProfileForm(prev => ({ 
                                      ...prev, 
                                      logo: e.target.result 
                                    }))
                                  }
                                  reader.readAsDataURL(file)
                                }
                              }}
                              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            Рекомендуемый размер: 240x240 пикселей, формат: JPG, PNG. Максимальный размер: 1.5 МБ
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Описание</label>
                        <textarea name="description" value={editProfileForm.description} onChange={handleProfileInputChange} className="border rounded px-3 py-2 w-full h-20" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Город <span className="text-red-500">*</span>
                        </label>
                        <select 
                          name="city" 
                          value={editProfileForm.city} 
                          onChange={handleProfileInputChange} 
                          className="border rounded px-3 py-2 w-full" 
                          required
                        >
                          <option value="">Выберите город</option>
                          {cities.map(city => (
                            <option key={city.name} value={city.name}>
                              {city.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Способы оплаты */}
                      <PaymentMethodSelector
                        paymentOnVisit={editProfileForm.payment_on_visit}
                        paymentAdvance={editProfileForm.payment_advance}
                        onPaymentMethodsChange={handlePaymentMethodsChange}
                      />

                      <div className="flex items-center gap-2">
                        <input type="checkbox" name="is_active" checked={!!editProfileForm.is_active} onChange={handleProfileInputChange} id="is_active" />
                        <label htmlFor="is_active" className="text-sm">Салон активен</label>
                      </div>
                      {profileSaveError && <div className="text-red-500 text-sm">{profileSaveError}</div>}
                      <div className="flex gap-3">
                        <Button type="submit">Сохранить</Button>
                        <Button 
                          variant="secondary" 
                          onClick={() => setEditProfileMode(false)}
                        >
                          Отмена
                        </Button>
                      </div>
                    </form>
                  )}
                  {!salonProfile && (
                    <div className="text-center py-8">
                      <div className="text-gray-500 mb-4">Профиль салона не найден</div>
                      <p className="text-sm text-gray-400 mb-6">Для использования кабинета салона необходимо создать профиль салона</p>
                      <Button
                        onClick={handleCreateProfile}
                      >
                        Создать профиль салона
                      </Button>
                    </div>
                  )}
                </div>

                {/* Блок управления сайтом */}
                {salonProfile && salonProfile.is_active && (
                  <div className="bg-white rounded-lg shadow-sm border p-6 w-full mt-6">
                    <h2 className="text-xl font-semibold mb-4">Управление сайтом</h2>
                    <div className="space-y-6">
                      {/* Основной домен */}
                      <div>
                        <h3 className="text-lg font-medium mb-3">Основной домен</h3>
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Домен салона
                          </label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">https://</span>
                            <input
                              type="text"
                              name="domain"
                              value={editProfileForm.domain || salonProfile.domain || ''}
                              onChange={handleProfileInputChange}
                              placeholder="название-салона"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <span className="text-sm text-gray-500">.dedato.ru</span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          Этот домен будет использоваться как основная страница вашего салона
                        </p>
                      </div>

                      {/* Информация о филиалах */}
                      <div>
                        <h3 className="text-lg font-medium mb-3">Управление филиалами</h3>
                        <p className="text-sm text-gray-600 mb-3">
                          Для настройки цветов фона, логотипов и карт для отдельных филиалов перейдите в раздел "Филиалы"
                        </p>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800">
                            💡 <strong>Совет:</strong> Каждый филиал может иметь свой уникальный дизайн и настройки сайта
                          </p>
                        </div>
                      </div>

                      {/* Кнопки действий */}
                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          type="button"
                          onClick={handleSaveWebsiteSettings}
                          disabled={!websiteSettingsChanged}
                          className={websiteSettingsChanged ? '' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                        >
                          Сохранить настройки
                        </button>
                      </div>

                      {/* Сообщения об успехе/ошибке */}
                      {profileSaveSuccess && (
                        <div className="text-green-600 text-sm mt-2">{profileSaveSuccess}</div>
                      )}
                      {profileSaveError && (
                        <div className="text-red-500 text-sm mt-2">{profileSaveError}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'restrictions' && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-6">Ограничения клиентов</h1>
                <ClientRestrictionsManager
                  salonId={salonProfile?.id}
                  apiEndpoint="/salon/restrictions"
                  onRestrictionsChange={() => {
                    // Можно добавить обновление данных при необходимости
                  }}
                />
              </div>
            )}

            {activeTab === 'accounting' && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-6">Бухгалтерия</h1>
                <ClientRestrictionsManager
                  salonId={salonProfile?.id}
                  apiEndpoint="/salon/restrictions"
                  onRestrictionsChange={() => {
                    // Можно добавить обновление данных при необходимости
                  }}
                />
              </div>
            )}

            {activeTab === 'loyalty' && <LoyaltySystem getAuthHeaders={getAuthHeaders} />}
            {activeTab === 'tariff' && <SalonTariff />}
            {activeTab === 'services' && (
              <>
                <div className="mb-8">
                  <div>
                    <h1 className="text-3xl font-bold">Личный кабинет салона</h1>
                    {salonProfile && (
                      <p className="text-gray-600 mt-2">{salonProfile.name}</p>
                    )}
                  </div>
                </div>
                {/* Список услуг */}
                <div className="bg-white rounded-lg shadow-sm border p-6 w-full" style={{maxWidth: 'none', margin: 0, width: '100%'}}>
                  <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                    <h2 className="text-xl font-semibold">Услуги салона</h2>
                    <div className="flex gap-3">
                      <Button 
                        onClick={() => setCategoryEditModalOpen(true)}
                        className="bg-[#4CAF50] text-white hover:bg-[#45A049]"
                      >
                        Создать категорию
                      </Button>
                      <Button 
                        onClick={() => setServiceModalOpen(true)}
                      >
                        Создать услугу
                      </Button>
                    </div>
                  </div>
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="text-gray-500">Загрузка услуг...</div>
                    </div>
                  ) : error ? (
                    <div className="text-red-500 text-center py-8">{error}</div>
                  ) : categories.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-gray-500 mb-4">У вас пока нет категорий</div>
                      <p className="text-sm text-gray-400 mb-4">Сначала создайте категорию услуг, а затем добавьте услуги в неё</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {categories.map(category => {
                        const categoryServices = services.filter(s => s.category_id === category.id)
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
                                    onClick={() => handleEditCategory({ id: category.id, name: category.name })}
                                    className="text-[#4CAF50] hover:text-[#45A049] text-sm font-medium px-2 py-1 rounded hover:bg-[#DFF5EC]"
                                  >
                                    Редактировать
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCategory({ id: category.id, name: category.name })}
                                    className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50"
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="divide-y">
                              {categoryServices.length === 0 ? (
                                <div className="p-4 pl-8 text-gray-400 text-sm">Нет услуг в этой категории</div>
                              ) : (
                                categoryServices.map(service => (
                                  <div key={service.id} className="p-4 pl-8 hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1">
                                        <h4 className="font-medium text-lg">{service.name}</h4>
                                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                                          <span>Стоимость: {service.price} ₽</span>
                                          <span>Длительность: {service.duration} мин</span>
                                        </div>
                                      </div>
                                      <div className="flex gap-2 ml-4">
                                        <button
                                          onClick={() => handleEditService(service)}
                                          className="text-[#4CAF50] hover:text-[#45A049] text-sm font-medium"
                                        >
                                          Редактировать
                                        </button>
                                        <button
                                          onClick={() => handleDeleteService(service)}
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
              </>
            )}
          </div>
        </main>
      </div>

      <ServiceModal 
        open={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        onCreated={handleServiceCreated}
      />

      <CategoryEditModal
        open={categoryEditModalOpen}
        onClose={() => {
          setCategoryEditModalOpen(false)
          setSelectedCategory(null)
        }}
        onSave={handleCategorySave}
        category={selectedCategory}
      />

      <DeleteConfirmModal
        open={deleteConfirmModalOpen}
        onClose={() => setDeleteConfirmModalOpen(false)}
        onConfirm={handleCategoryDeleted}
        category={selectedCategory}
      />

      <ServiceEditModal
        open={serviceEditModalOpen && !!selectedService}
        onClose={() => {
          setServiceEditModalOpen(false)
          setSelectedService(null)
        }}
        onUpdated={handleServiceUpdated}
        onSave={handleServiceUpdated}
        service={selectedService}
        categories={categories}
      />

      <DeleteConfirmModal
        open={serviceDeleteModalOpen}
        onClose={() => setServiceDeleteModalOpen(false)}
        onConfirm={handleServiceDeleted}
        category={selectedService ? { name: selectedService.name, type: 'service' } : null}
      />

      {/* Модальное окно создания профиля салона */}
      {showProfileForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Создание профиля салона</h2>
              <button
                onClick={() => setShowProfileForm(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleCreateProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Название салона <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  name="name" 
                  value={profileForm.name} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  required 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Адрес <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  name="address" 
                  value={profileForm.address} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  required 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Телефон <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  name="phone" 
                  value={profileForm.phone} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  placeholder="+7XXXXXXXXXX"
                  required 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input 
                  type="email" 
                  name="email" 
                  value={profileForm.email} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  required 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Сайт</label>
                <input 
                  type="url" 
                  name="website" 
                  value={profileForm.website} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  placeholder="https://example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Instagram</label>
                <input 
                  type="text" 
                  name="instagram" 
                  value={profileForm.instagram} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  placeholder="@username"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Описание</label>
                <textarea 
                  name="description" 
                  value={profileForm.description} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full h-20" 
                  placeholder="Краткое описание салона..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Город <span className="text-red-500">*</span>
                </label>
                <select 
                  name="city" 
                  value={profileForm.city} 
                  onChange={handleProfileFormInputChange} 
                  className="border rounded px-3 py-2 w-full" 
                  required
                >
                  <option value="">Выберите город</option>
                  {cities.map(city => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
              

              
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  name="is_active" 
                  checked={profileForm.is_active} 
                  onChange={handleProfileFormInputChange} 
                  id="create_is_active" 
                />
                <label htmlFor="create_is_active" className="text-sm">Салон активен</label>
              </div>
              
              {profileSaveError && <div className="text-red-500 text-sm">{profileSaveError}</div>}
              {profileSaveSuccess && <div className="text-green-600 text-sm">{profileSaveSuccess}</div>}
              
              <div className="flex gap-3 pt-4">
                <Button type="submit">
                  Создать профиль
                </Button>
                <Button 
                  variant="secondary"
                  onClick={() => setShowProfileForm(false)}
                >
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
} 