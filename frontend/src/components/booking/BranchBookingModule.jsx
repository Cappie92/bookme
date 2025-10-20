import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarIcon, ClockIcon, UserIcon, TagIcon } from '@heroicons/react/24/outline'
import { dateToISOString, formatTime, getMinDate, getSelectedCity } from '../../utils/dateUtils'

export default function BranchBookingModule({ 
  salonId, 
  branchId,
  onBookingSuccess, 
  onBookingError,
  showUserInfo = true,
  title = "Запись на услугу",
  className = ""
}) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    master_id: '',
    service_id: '',
    branch_id: branchId, // Предустановленный филиал
    date: '',
    time: '',
    notes: '',
    client_phone: ''
  })
  
  const [masters, setMasters] = useState([])
  const [services, setServices] = useState([])
  const [branch, setBranch] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Состояние для фильтрации
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [selectedMaster, setSelectedMaster] = useState(null)
  
  // Состояние для календаря
  const [calendarDates, setCalendarDates] = useState({})
  const [calendarLoading, setCalendarLoading] = useState(false)
  
  // Состояние для авторизации
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  
  // Состояние для верификации телефона в CJM
  const [showPhoneVerificationModal, setShowPhoneVerificationModal] = useState(false)
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('')
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(false)
  const [phoneVerificationError, setPhoneVerificationError] = useState('')
  const [currentClientPhone, setCurrentClientPhone] = useState('')
  
  // Функции валидации телефона
  const validatePhone = (phone) => {
    return /^\+7\d{10}$/.test(phone)
  }
  
  const formatPhone = (input) => {
    let digits = input.replace(/\D/g, '')
    if (digits.startsWith('7')) digits = digits.slice(1)
    if (digits.length > 10) digits = digits.slice(0, 10)
    return '+7' + digits
  }
  
  const phonePlaceholder = () => {
    return '+7 (999) 999 99 99'
  }
  
  // Загрузка мастеров и услуг при монтировании компонента
  useEffect(() => {
    if (salonId && branchId) {
      loadMasters()
      loadServices()
      loadBranch()
      checkCurrentUser()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, branchId])
  
  // Загрузка доступных слотов при изменении даты или услуги
  useEffect(() => {
    if (selectedDate && selectedService) {
      loadAvailableSlots()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedService, selectedMaster])
  
  // Загрузка календаря при изменении услуги или мастера
  useEffect(() => {
    if (selectedService) {
      loadCalendarDates()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, selectedMaster])
  
  const loadBranch = async () => {
    try {
      const response = await fetch(`/salon/branches/public?salon_id=${salonId}`)
      if (response.ok) {
        const data = await response.json()
        const currentBranch = data.branches.find(b => b.id === parseInt(branchId))
        setBranch(currentBranch)
      }
    } catch (error) {
      console.error('Ошибка загрузки филиала:', error)
    }
  }
  
  const loadMasters = async () => {
    try {
      const response = await fetch(`/salon/masters/list?salon_id=${salonId}`)
      if (response.ok) {
        const data = await response.json()
        setMasters(data.masters || data)
      } else {
        console.error('Ошибка загрузки мастеров:', response.status)
      }
    } catch (error) {
      console.error('Ошибка загрузки мастеров:', error)
    }
  }
  
  const loadServices = async () => {
    try {
      const response = await fetch(`/salon/services/public?salon_id=${salonId}`)
      if (response.ok) {
        const data = await response.json()
        setServices(data.services || data)
      } else {
        console.error('Ошибка загрузки услуг:', response.status)
      }
    } catch (error) {
      console.error('Ошибка загрузки услуг:', error)
    }
  }
  
  const checkCurrentUser = async () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const response = await fetch('/auth/users/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const user = await response.json()
          setCurrentUser(user)
        } else {
          localStorage.removeItem('access_token')
          setCurrentUser(null)
        }
      } catch (error) {
        console.error('Ошибка проверки пользователя:', error)
        setCurrentUser(null)
      }
    } else {
      setCurrentUser(null)
    }
  }
  
  const loadAvailableSlots = async () => {
    if (!selectedDate || !selectedService) return
    
    try {
      const dateISO = dateToISOString(selectedDate)
      
      const params = new URLSearchParams({
        date: dateISO,
        service_duration: selectedService.duration,
        owner_type: selectedMaster ? 'master' : 'salon',
        owner_id: selectedMaster ? selectedMaster.id : salonId,
        branch_id: branchId // Всегда передаем branch_id
      })
      
      const response = await fetch(`/bookings/available-slots/public?${params}&_t=${Date.now()}`)
      
      if (response.ok) {
        const data = await response.json()
        
        const timeSlots = data.map(slot => {
          const startTime = new Date(slot.start_time)
          return startTime.toTimeString().slice(0, 5)
        })
        
        setAvailableSlots(timeSlots)
      } else {
        console.error('Ошибка загрузки слотов:', response.status)
      }
    } catch (error) {
      console.error('Ошибка загрузки слотов:', error)
    }
  }
  
  const loadCalendarDates = async () => {
    if (!selectedService) return
    
    try {
      setCalendarLoading(true)
      const city = getSelectedCity()
      const startDate = getMinDate()
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 30)
      
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        service_duration: selectedService.duration,
        owner_type: selectedMaster ? 'master' : 'salon',
        owner_id: selectedMaster ? selectedMaster.id : salonId,
        branch_id: branchId
      })
      
      const response = await fetch(`/bookings/calendar-dates/public?${params}`)
      
      if (response.ok) {
        const data = await response.json()
        setCalendarDates(data)
      } else {
        console.error('Ошибка загрузки календаря:', response.status)
      }
    } catch (error) {
      console.error('Ошибка загрузки календаря:', error)
    } finally {
      setCalendarLoading(false)
    }
  }
  
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }
  
  const handleMasterChange = (e) => {
    const masterId = e.target.value
    const master = masters.find(m => m.id === parseInt(masterId))
    setSelectedMaster(master)
    setFormData(prev => ({
      ...prev,
      master_id: masterId
    }))
    
    setAvailableSlots([])
    setFormData(prev => ({
      ...prev,
      time: ''
    }))
  }
  
  const handleServiceChange = (e) => {
    const serviceId = e.target.value
    const service = services.find(s => s.id === parseInt(serviceId))
    setSelectedService(service)
    setFormData(prev => ({
      ...prev,
      service_id: serviceId
    }))
    
    setAvailableSlots([])
    setFormData(prev => ({
      ...prev,
      time: ''
    }))
  }
  
  const handleDateChange = (e) => {
    const date = e.target.value
    setSelectedDate(date)
    setFormData(prev => ({
      ...prev,
      date: date
    }))
    
    setAvailableSlots([])
    setFormData(prev => ({
      ...prev,
      time: ''
    }))
  }
  
  const handleTimeSlotSelect = (slot) => {
    setFormData(prev => ({
      ...prev,
      time: slot
    }))
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    
    if (!formData.service_id || !formData.date || !formData.time) {
      setError('Пожалуйста, заполните все обязательные поля')
      setLoading(false)
      return
    }
    
    if (!isDateAvailable(formData.date)) {
      setError('Выбранная дата недоступна для записи')
      setLoading(false)
      return
    }
    
    if (currentUser) {
      if (currentUser.role !== 'client') {
        setError('Запись не удалась, войдите под аккаунтом клиента')
        setLoading(false)
        return
      }
    } else {
      setFormData(prev => ({
        ...prev,
        client_phone: '+7'
      }))
      setShowPhoneModal(true)
      setLoading(false)
      return
    }
    
    try {
      await createBooking()
    } catch (error) {
      console.error('Ошибка создания записи:', error)
      setError('Ошибка сети при создании записи')
    } finally {
      setLoading(false)
    }
  }
  
  const createBooking = async (clientPhone = null) => {
    const [hours, minutes] = formData.time.split(':')
    const startTimeStr = `${formData.date}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`
    const startTime = new Date(startTimeStr)
    
    const endTime = new Date(startTime)
    endTime.setMinutes(endTime.getMinutes() + selectedService.duration)
    
    const bookingData = {
      service_id: parseInt(formData.service_id),
      master_id: formData.master_id ? parseInt(formData.master_id) : null,
      salon_id: formData.master_id ? null : parseInt(salonId),
      branch_id: parseInt(branchId), // Всегда передаем branch_id
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: formData.notes
    }
    
    let response
    if (currentUser) {
      response = await fetch('/client/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(bookingData)
      })
    } else {
      const params = new URLSearchParams({ client_phone: clientPhone })
      response = await fetch(`/bookings/public?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bookingData)
      })
    }
    
    if (response.ok) {
      const result = await response.json()
      
      if (currentUser) {
        setSuccess('Запись успешно создана!')
        resetForm()
        if (onBookingSuccess) {
          onBookingSuccess(result)
        }
      } else {
        if (result.access_token) {
          localStorage.setItem('access_token', result.access_token)
          
          if (result.needs_phone_verification) {
            setCurrentClientPhone(clientPhone)
            setShowPhoneVerificationModal(true)
            return
          }
          
          if (result.needs_password_setup) {
            localStorage.setItem('new_client_setup', 'true')
          }
          
          if (result.needs_password_verification) {
            localStorage.setItem('existing_client_verification', 'true')
          }
          
          navigate('/client')
        }
      }
    } else {
      const errorData = await response.json()
      let errorMessage = 'Ошибка при создании записи'
      if (errorData.detail) {
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(err => err.msg || 'Ошибка валидации').join(', ')
        } else if (typeof errorData.detail === 'object') {
          errorMessage = errorData.detail.msg || 'Ошибка валидации'
        }
      }
      setError(errorMessage)
      if (onBookingError) {
        onBookingError(errorMessage)
      }
    }
  }
  
  const handlePhoneSubmit = async (e) => {
    e.preventDefault()
    if (!formData.client_phone) {
      setError('Введите номер телефона')
      return
    }
    
    if (!validatePhone(formData.client_phone)) {
      setError('Телефон должен быть в формате +7XXXXXXXXXX (10 цифр после +7)')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch('/bookings/verify-phone-cjm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: formData.client_phone,
          code: phoneVerificationCode
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          await createBooking(formData.client_phone)
        } else {
          setError(result.message || 'Ошибка верификации')
        }
      } else {
        setError('Ошибка верификации телефона')
      }
    } catch (error) {
      console.error('Ошибка верификации:', error)
      setError('Ошибка сети при верификации')
    } finally {
      setLoading(false)
    }
  }
  
  const handlePhoneVerification = async (e) => {
    e.preventDefault()
    if (!phoneVerificationCode) {
      setPhoneVerificationError('Введите код подтверждения')
      return
    }
    
    setPhoneVerificationLoading(true)
    setPhoneVerificationError('')
    
    try {
      const response = await fetch('/bookings/verify-phone-cjm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: currentClientPhone,
          code: phoneVerificationCode
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setShowPhoneVerificationModal(false)
          setSuccess('Телефон подтвержден! Запись создана.')
          resetForm()
        } else {
          setPhoneVerificationError(result.message || 'Неверный код')
        }
      } else {
        setPhoneVerificationError('Ошибка подтверждения')
      }
    } catch (error) {
      console.error('Ошибка подтверждения:', error)
      setPhoneVerificationError('Ошибка сети')
    } finally {
      setPhoneVerificationLoading(false)
    }
  }
  
  const resetForm = () => {
    setFormData({
      master_id: '',
      service_id: '',
      branch_id: branchId, // Сохраняем branch_id
      date: '',
      time: '',
      notes: '',
      client_phone: ''
    })
    setSelectedDate('')
    setSelectedService(null)
    setSelectedMaster(null)
    setAvailableSlots([])
    setShowPhoneModal(false)
  }
  
  const isDateAvailable = (dateStr) => {
    return calendarDates[dateStr] === true
  }
  
  const getDateClassName = (dateStr) => {
    const baseClass = "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
    
    if (calendarDates[dateStr] === true) {
      // Дата с доступными слотами - жирный шрифт, зеленый текст
      return `${baseClass} bg-white text-[#4CAF50] font-semibold border-[#4CAF50]`
    } else if (calendarDates[dateStr] === false) {
      // Дата без доступных слотов - серый фон, серый текст
      return `${baseClass} bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300`
    } else {
      // Дата еще не проверена - обычный стиль
      return `${baseClass} bg-white text-gray-700 border-gray-300`
    }
  }
  
  if (!salonId || !branchId) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">Ошибка: не указан ID салона или филиала</p>
      </div>
    )
  }
  
  if (!branch) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-600">Загрузка информации о филиале...</p>
      </div>
    )
  }
  
  return (
    <div className={`bg-white rounded-lg shadow-lg p-8 ${className}`}>
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
        {title}
      </h1>
      
      {/* Информация о филиале */}
      <div className="mb-6 p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
        <h2 className="text-lg font-semibold text-[#2E7D32] mb-2">
          Филиал: {branch.name}
        </h2>
        {branch.address && (
          <p className="text-sm text-[#2E7D32]">
            <strong>Адрес:</strong> {branch.address}
          </p>
        )}
        {branch.phone && (
          <p className="text-sm text-[#2E7D32]">
            <strong>Телефон:</strong> {branch.phone}
          </p>
        )}
      </div>
      
      {/* Информация о пользователе */}
      {showUserInfo && currentUser && (
        <div className="mb-6 p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
          <p className="text-sm text-[#2E7D32]">
            <strong>Вы вошли как:</strong> {currentUser.full_name || currentUser.phone} 
            {currentUser.role !== 'client' && (
              <span className="text-red-600 ml-2">
                (Запись доступна только для клиентов)
              </span>
            )}
          </p>
        </div>
      )}
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{typeof error === 'string' ? error : 'Произошла ошибка'}</p>
        </div>
      )}
      
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600">{success}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Выбор мастера */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <UserIcon className="inline w-4 h-4 mr-2" />
            Выбор мастера
          </label>
          <select
            name="master_id"
            value={formData.master_id}
            onChange={handleMasterChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
          >
            <option value="">Любой мастер</option>
            {masters.map(master => (
              <option key={master.id} value={master.id}>
                {master.user?.full_name || master.name || `Мастер ${master.id}`}
              </option>
            ))}
          </select>
        </div>
        
        {/* Выбор услуги */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <TagIcon className="inline w-4 h-4 mr-2" />
            Выбор услуги <span className="text-red-500">*</span>
          </label>
          <select
            name="service_id"
            value={formData.service_id}
            onChange={handleServiceChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
          >
            <option value="">Выберите услугу</option>
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.price} ₽ ({service.duration} мин)
              </option>
            ))}
          </select>
        </div>
        
        {/* Выбор даты */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <CalendarIcon className="inline w-4 h-4 mr-2" />
            Выбор даты <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleDateChange}
            min={getMinDate().toISOString().split('T')[0]}
            required
            className={getDateClassName(formData.date)}
          />
        </div>
        
        {/* Выбор времени */}
        {availableSlots.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <ClockIcon className="inline w-4 h-4 mr-2" />
              Выбор времени <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {availableSlots.map((slot, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleTimeSlotSelect(slot)}
                  className={`px-3 py-2 border rounded-lg text-sm ${
                    formData.time === slot
                      ? 'bg-[#4CAF50] text-white border-[#4CAF50]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#4CAF50]'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Дополнительная информация */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Дополнительная информация
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
            placeholder="Укажите любые пожелания или особенности..."
          />
        </div>
        
        {/* Кнопка отправки */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#4CAF50] text-white py-3 px-4 rounded-lg hover:bg-[#45A049] disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Создание записи...' : 'Записаться'}
        </button>
      </form>
      
      {/* Модальное окно для ввода телефона */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Введите номер телефона</h3>
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Номер телефона
                </label>
                <input
                  type="tel"
                  value={formData.client_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, client_phone: formatPhone(e.target.value) }))}
                  placeholder={phonePlaceholder()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                  required
                />
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#4CAF50] text-white py-2 px-4 rounded-lg hover:bg-[#45A049] disabled:bg-gray-400"
                >
                  {loading ? 'Отправка...' : 'Отправить'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPhoneModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Модальное окно для верификации телефона */}
      {showPhoneVerificationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Подтвердите номер телефона</h3>
            <p className="text-sm text-gray-600 mb-4">
              Введите код подтверждения, отправленный на номер {currentClientPhone}
            </p>
            <form onSubmit={handlePhoneVerification} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Код подтверждения
                </label>
                <input
                  type="text"
                  value={phoneVerificationCode}
                  onChange={(e) => setPhoneVerificationCode(e.target.value)}
                  placeholder="0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                  required
                />
                {phoneVerificationError && (
                  <p className="text-red-600 text-sm mt-1">{phoneVerificationError}</p>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  disabled={phoneVerificationLoading}
                  className="flex-1 bg-[#4CAF50] text-white py-2 px-4 rounded-lg hover:bg-[#45A049] disabled:bg-gray-400"
                >
                  {phoneVerificationLoading ? 'Проверка...' : 'Подтвердить'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPhoneVerificationModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
} 