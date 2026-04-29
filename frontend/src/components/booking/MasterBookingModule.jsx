import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarIcon, ClockIcon, TagIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { apiGet, apiPost } from '../../utils/api'
import { dateToISOString, formatTime, getMinDate, getSelectedCity } from '../../utils/dateUtils'
import { supportsReverseFlashCall } from '../../utils/deviceUtils'
import { useToast } from '../../contexts/ToastContext'
import PaymentModal from '../modals/PaymentModal'
import { metrikaGoal } from '../../analytics/metrika'
import { M } from '../../analytics/metrikaEvents'

export default function MasterBookingModule({ 
  masterId, 
  ownerType = 'master',
  onBookingSuccess, 
  onBookingError,
  onAuthRequired = null,
  showUserInfo = true,
  title = "Запись к мастеру",
  className = "",
  /** Для /m/:slug — slug и profile из public API */
  slug = null,
  publicProfile = null,
}) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    service_id: '',
    date: '',
    time: '',
    notes: '',
    client_phone: ''
  })
  
  const [services, setServices] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Состояние для фильтрации
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  
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
  
  // Состояние для обратного FlashCall
  const [reverseFlashCallLoading, setReverseFlashCallLoading] = useState(false)
  const [reverseFlashCallError, setReverseFlashCallError] = useState('')
  const [reverseFlashCallData, setReverseFlashCallData] = useState(null)
  const [checkingReverseStatus, setCheckingReverseStatus] = useState(false)
  
  // Состояние для баллов лояльности
  const [availablePoints, setAvailablePoints] = useState(0)
  const [maxPaymentPercent, setMaxPaymentPercent] = useState(null)
  const [isLoyaltyEnabled, setIsLoyaltyEnabled] = useState(false)
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false)
  const [pointsLoading, setPointsLoading] = useState(false)
  
  // Состояние для ограничений и оплаты
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [requiresAdvancePayment, setRequiresAdvancePayment] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [temporaryBookingId, setTemporaryBookingId] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [redirectCountdown, setRedirectCountdown] = useState(10)
  
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
  
  // Загрузка услуг при монтировании компонента (или из publicProfile)
  useEffect(() => {
    if (publicProfile?.services) {
      setServices(publicProfile.services)
      setError('')
      checkCurrentUser()
    } else if (masterId) {
      loadServices()
      checkCurrentUser()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterId, publicProfile])
  
  // Загрузка доступных слотов при изменении даты или услуги
  useEffect(() => {
    if (selectedDate && selectedService) {
      loadAvailableSlots()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedService])
  
  // Загрузка баллов при выборе услуги и если клиент авторизован
  useEffect(() => {
    if (selectedService && currentUser && currentUser.role === 'client' && masterId) {
      loadAvailablePoints()
    } else {
      setAvailablePoints(0)
      setIsLoyaltyEnabled(false)
      setUseLoyaltyPoints(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, currentUser, masterId])
  
  // Загрузка календаря при изменении услуги
  useEffect(() => {
    if (selectedService) {
      loadCalendarDates()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService])
  
  const loadServices = async () => {
    try {
      // Legacy subdomain parsing (/domain/:subdomain) удалён вместе с роутом.
      // Услуги мастера всегда грузим по masterId через публичный endpoint.
      if (masterId) {
        const data = await apiGet(`/api/domain/services?master_id=${masterId}`)
        setServices(data.services || data)
      } else {
        setError('Для бронирования необходимо указать ID мастера')
        setServices([])
      }
    } catch (error) {
      console.error('Ошибка загрузки услуг:', error)
      const status = error.response?.status
      
      if (status === 404) {
        setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
      } else if (status === 400 || status === 422) {
        // 400: некорректный запрос, 422: ошибка валидации (нет master_id или master_id <= 0)
        setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера.')
      } else {
        setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
      }
      setServices([])
    }
  }
  
  const checkCurrentUser = async () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const response = await fetch('/api/auth/users/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const user = await response.json()
          setCurrentUser(user)
        } else {
          // Стираем токен только если backend явно сказал «не авторизован».
          // Иначе случайные 404/5xx уносят валидную сессию (см. AUDIT_AND_HANDOFF.md).
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('access_token')
          }
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
  
  const loadAvailablePoints = async () => {
    if (!masterId || !currentUser) return
    
    try {
      setPointsLoading(true)
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/client/loyalty/points/${masterId}/available`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAvailablePoints(data.available_points || 0)
        setMaxPaymentPercent(data.max_payment_percent)
        setIsLoyaltyEnabled(data.is_loyalty_enabled)
        // Сбрасываем чекбокс, если баллов нет
        if (data.available_points === 0) {
          setUseLoyaltyPoints(false)
        }
      } else {
        setAvailablePoints(0)
        setIsLoyaltyEnabled(false)
      }
    } catch (error) {
      console.error('Ошибка загрузки баллов:', error)
      setAvailablePoints(0)
      setIsLoyaltyEnabled(false)
    } finally {
      setPointsLoading(false)
    }
  }
  
  const calculateMaxSpendable = () => {
    if (!selectedService || !isLoyaltyEnabled || availablePoints === 0) return 0
    
    const servicePrice = selectedService.price || 0
    let maxByPoints = availablePoints
    let maxByPrice = servicePrice
    
    if (maxPaymentPercent) {
      const maxByPercent = servicePrice * (maxPaymentPercent / 100)
      return Math.min(maxByPoints, maxByPercent, maxByPrice)
    }
    
    return Math.min(maxByPoints, maxByPrice)
  }
  
  const loadAvailableSlots = async () => {
    if (!selectedDate || !selectedService) return
    
    try {
      const city = getSelectedCity()
      const dateStr = selectedDate.split('T')[0]
      const [y, m, d] = dateStr.split('-').map(Number)
      
      let response
      if (slug) {
        response = await fetch(`/api/public/masters/${slug}/availability?from_date=${dateStr}&to_date=${dateStr}&service_id=${selectedService.id}&_t=${Date.now()}`)
      } else {
        const params = new URLSearchParams({
          year: y,
          month: m,
          day: d,
          service_duration: selectedService.duration,
          owner_type: ownerType === 'indie_master' ? 'indie_master' : 'master',
          owner_id: masterId
        })
        response = await fetch(`/api/bookings/available-slots-repeat?${params}&_t=${Date.now()}`)
      }
      
      if (response.ok) {
        const data = await response.json()
        const slots = slug ? (data.slots || []) : data
        const timeSlots = slots.map(slot => {
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
    
    setCalendarLoading(true)
    try {
      const dates = {}
      const today = new Date()
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(today.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        
        let response
        if (slug) {
          response = await fetch(`/api/public/masters/${slug}/availability?from_date=${dateStr}&to_date=${dateStr}&service_id=${selectedService.id}&_t=${Date.now()}`)
        } else {
          const [y, m, d] = dateStr.split('-').map(Number)
          const params = new URLSearchParams({
            year: y,
            month: m,
            day: d,
            service_duration: selectedService.duration,
            owner_type: ownerType === 'indie_master' ? 'indie_master' : 'master',
            owner_id: masterId
          })
          response = await fetch(`/api/bookings/available-slots-repeat?${params}&_t=${Date.now()}`)
        }
        
        if (response.ok) {
          const data = await response.json()
          const slots = slug ? (data.slots || []) : data
          dates[dateStr] = slots.length > 0
        } else {
          dates[dateStr] = false
        }
      }
      
      setCalendarDates(dates)
    } catch (error) {
      console.error('Ошибка загрузки календаря:', error)
    } finally {
      setCalendarLoading(false)
    }
  }
  
  const handleInputChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    
    if (name === 'client_phone') {
      formattedValue = formatPhone(value)
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
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
  
  const checkBookingEligibility = async () => {
    try {
      const clientPhone = currentUser?.phone || formData.client_phone
      if (!clientPhone) return null
      
      const token = localStorage.getItem('access_token')
      const requestBody = {
        client_phone: clientPhone,
        client_id: currentUser?.id || null
      }
      
      return await apiPost('/api/master/check-booking-eligibility', requestBody)
    } catch (error) {
      console.error('Ошибка проверки ограничений:', error)
      return null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setIsBlocked(false)
    setRequiresAdvancePayment(false)
    
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
      if (slug && onAuthRequired) {
        metrikaGoal(M.PUBLIC_BOOKING_AUTH_REQUIRED, { slug })
        onAuthRequired()
        setLoading(false)
        return
      }
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
    
    let response
    if (slug && currentUser) {
      const publicBody = {
        service_id: parseInt(formData.service_id),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      }
      response = await fetch(`/api/public/masters/${slug}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(publicBody)
      })
    } else {
      const bookingData = {
        service_id: parseInt(formData.service_id),
        master_id: ownerType === 'indie_master' ? null : parseInt(masterId),
        indie_master_id: ownerType === 'indie_master' ? parseInt(masterId) : null,
        salon_id: null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        notes: formData.notes,
        use_loyalty_points: useLoyaltyPoints && isLoyaltyEnabled && availablePoints > 0,
        client_name: currentUser?.full_name || currentUser?.phone || 'Клиент',
        service_name: selectedService?.name || '',
        service_duration: selectedService?.duration || 0,
        service_price: selectedService?.price || 0,
      }
      if (currentUser) {
        response = await fetch('/api/client/bookings/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify(bookingData)
        })
      } else {
        const params = new URLSearchParams({ client_phone: clientPhone })
        response = await fetch(`/api/bookings/public?${params}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bookingData)
        })
      }
    }
    
    if (response.ok) {
      const result = await response.json()
      
      if (currentUser) {
        metrikaGoal(M.PUBLIC_BOOKING_SUCCESS, {
          source: slug ? 'master_module' : 'master_module_internal',
          flow: 'logged_in',
          slug: slug || undefined,
        })
        setSuccess('Запись успешно создана!')
        resetForm()
        if (onBookingSuccess) {
          onBookingSuccess(result)
        }
      } else {
        if (result.access_token) {
          metrikaGoal(M.PUBLIC_BOOKING_SUCCESS, {
            source: slug ? 'master_module' : 'master_module_internal',
            flow: 'guest_with_token',
            slug: slug || undefined,
          })
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
    setIsBlocked(false)
    setRequiresAdvancePayment(false)
    
    // Проверяем ограничения перед созданием бронирования
    const eligibility = await checkBookingEligibility()
    
    if (eligibility) {
      if (eligibility.is_blocked) {
        setIsBlocked(true)
        setBlockReason(eligibility.reason || 'Запись к этому мастеру невозможна')
        setLoading(false)
        // Автоматический редирект через 10 секунд
        let countdown = 10
        setRedirectCountdown(countdown)
        const countdownInterval = setInterval(() => {
          countdown--
          setRedirectCountdown(countdown)
          if (countdown <= 0) {
            clearInterval(countdownInterval)
            navigate('/client')
          }
        }, 1000)
        return
      }
      
      if (eligibility.requires_advance_payment) {
        // Для незарегистрированных пользователей предоплата не поддерживается
        setError('Для бронирования с предоплатой необходимо войти в личный кабинет')
        setLoading(false)
        return
      }
    }
    
    try {
      await createBooking(formData.client_phone)
    } catch (error) {
      console.error('Ошибка создания записи:', error)
      setError('Ошибка сети при создании записи')
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneVerification = async (e) => {
    e.preventDefault()
    if (!phoneVerificationCode) {
      setPhoneVerificationError('Введите код из звонка')
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
      
      const result = await response.json()
      
      if (result.success) {
        setShowPhoneVerificationModal(false)
        setPhoneVerificationCode('')
        setCurrentClientPhone('')
        setSuccess('Телефон успешно верифицирован!')
        // Продолжаем процесс записи
        navigate('/client')
      } else {
        setPhoneVerificationError(result.message || 'Ошибка верификации')
      }
    } catch (error) {
      console.error('Ошибка верификации телефона:', error)
      setPhoneVerificationError('Ошибка сети при верификации')
    } finally {
      setPhoneVerificationLoading(false)
    }
  }
  
  const handleReverseFlashCall = async (phone) => {
    setReverseFlashCallLoading(true)
    setReverseFlashCallError('')
    
    try {
      const response = await fetch('/auth/request-reverse-phone-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setReverseFlashCallData({
          call_id: result.call_id,
          verification_number: result.verification_number,
          phone: phone
        })
        // Начинаем проверку статуса
        startReverseStatusCheck(result.call_id, phone)
      } else {
        setReverseFlashCallError(result.message || 'Ошибка инициации обратного FlashCall')
      }
    } catch (error) {
      console.error('Ошибка обратного FlashCall:', error)
      setReverseFlashCallError('Ошибка сети при инициации обратного FlashCall')
    } finally {
      setReverseFlashCallLoading(false)
    }
  }
  
  const startReverseStatusCheck = (call_id, phone) => {
    setCheckingReverseStatus(true)
    
    const checkStatus = async () => {
      try {
        const response = await fetch('/auth/check-reverse-phone-verification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ call_id, phone })
        })
        
        const result = await response.json()
        
        if (result.success) {
          setCheckingReverseStatus(false)
          setReverseFlashCallData(null)
          setSuccess('Телефон успешно верифицирован!')
          // Продолжаем процесс записи
          navigate('/client')
        } else {
          // Продолжаем проверку через 2 секунды
          setTimeout(checkStatus, 2000)
        }
      } catch (error) {
        console.error('Ошибка проверки статуса:', error)
        setCheckingReverseStatus(false)
        setReverseFlashCallError('Ошибка проверки статуса верификации')
      }
    }
    
    // Запускаем первую проверку через 5 секунд
    setTimeout(checkStatus, 5000)
  }
  
  const resetForm = () => {
    setFormData({
      service_id: '',
      date: '',
      time: '',
      notes: '',
      client_phone: ''
    })
    setSelectedDate('')
    setSelectedService(null)
    setAvailableSlots([])
    setShowPhoneModal(false)
  }

  const { showToast } = useToast()

  const handlePaymentCancel = () => {
    setShowPaymentModal(false)
    setTemporaryBookingId(null)
    setPaymentAmount(0)
    showToast('Оплата отменена', 'error')
  }

  const handlePaymentSuccess = (booking) => {
    setShowPaymentModal(false)
    setTemporaryBookingId(null)
    setPaymentAmount(0)
    metrikaGoal(M.PUBLIC_BOOKING_SUCCESS, {
      source: slug ? 'master_module' : 'master_module_internal',
      flow: 'prepayment',
      slug: slug || undefined,
    })
    setSuccess('Запись успешно создана!')
    resetForm()
    if (onBookingSuccess) {
      onBookingSuccess(booking)
    }
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
  
  if (!masterId) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">Ошибка: не указан ID мастера</p>
      </div>
    )
  }
  
  return (
    <div className={`bg-white rounded-lg shadow-lg p-8 ${className}`}>
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center" data-testid="public-master-name">
        {title}
      </h1>
      
      {/* Информация о пользователе */}
      {showUserInfo && currentUser && (
        <div className="mb-6 p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
          <p className="text-sm text-[#4CAF50]">
            <strong>Вы вошли как:</strong> {currentUser.full_name || currentUser.phone} 
            {currentUser.role !== 'client' && (
              <span className="text-red-600 ml-2">
                (Запись доступна только для клиентов)
              </span>
            )}
          </p>
        </div>
      )}
      
      {/* Сообщение о блокировке */}
      {isBlocked && (
        <div className="mb-6 p-6 bg-red-50 border-2 border-red-300 rounded-lg">
          <div className="flex items-start space-x-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 mb-2">Запись к этому мастеру невозможна</h3>
              <p className="text-red-700 mb-4">{blockReason}</p>
              <button
                onClick={() => navigate('/client')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Перейти в личный кабинет
              </button>
              <p className="text-sm text-red-600 mt-3">
                Автоматический переход через {redirectCountdown} {redirectCountdown === 1 ? 'секунду' : redirectCountdown < 5 ? 'секунды' : 'секунд'}...
              </p>
            </div>
          </div>
        </div>
      )}
      
      {error && !isBlocked && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{typeof error === 'string' ? error : 'Произошла ошибка'}</p>
        </div>
      )}
      
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" data-testid="booking-created-success">
          <p className="text-green-600">{success}</p>
          {currentUser?.role === 'client' && (
            <button
              type="button"
              onClick={() => navigate('/client')}
              className="mt-3 bg-[#4CAF50] text-white px-4 py-2 rounded-lg hover:bg-[#45A049] font-medium"
              data-testid="client-go-to-dashboard"
            >
              Перейти в личный кабинет
            </button>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Выбор услуги */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <TagIcon className="inline w-4 h-4 mr-2" />
            Выбор услуги <span className="text-red-500">*</span>
          </label>
          <select
            name="service_id"
            data-testid="service-select"
            value={formData.service_id}
            onChange={handleServiceChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
          >
            <option value="">Выберите услугу</option>
            {services.map(service => (
              <option key={service.id} value={service.id} data-testid={service.name?.includes('E2E Стрижка') ? 'service-item-e2e-haircut' : undefined}>
                {service.name} - {service.price} ₽ ({service.duration} мин)
              </option>
            ))}
          </select>
        </div>
        
        {/* Выбор даты */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <CalendarIcon className="inline w-4 h-4 mr-2" />
            Дата <span className="text-red-500">*</span>
            {calendarLoading && <span className="text-xs text-gray-500 ml-2">(Загрузка календаря...)</span>}
          </label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleDateChange}
            min={getMinDate()}
            required
            disabled={calendarLoading}
            className={formData.date ? getDateClassName(formData.date) : "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"}
          />
          {formData.date && !isDateAvailable(formData.date) && (
            <p className="text-xs text-red-500 mt-1">
              На выбранную дату нет доступных слотов
            </p>
          )}
        </div>
        
        {/* Выбор времени */}
        {selectedDate && selectedService && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <ClockIcon className="inline w-4 h-4 mr-2" />
              Время <span className="text-red-500">*</span>
            </label>
            
            {availableSlots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {availableSlots.map((slot, index) => (
                  <button
                    key={index}
                    type="button"
                    data-testid={index === 0 ? 'slot-time-first' : undefined}
                    onClick={() => handleTimeSlotSelect(slot)}
                    className={`p-3 text-sm border rounded-lg transition-colors ${
                      formData.time === slot
                        ? 'bg-[#4CAF50] text-white border-[#4CAF50]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {formatTime(slot)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-500 text-center">
                  Нет доступных слотов на выбранную дату
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Дополнительные заметки */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Дополнительные заметки
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            placeholder="Укажите дополнительную информацию..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
          />
        </div>
        
        {/* Информация о выбранной услуге */}
        {selectedService && (
          <div className="p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
            <h3 className="font-medium text-[#4CAF50] mb-2">Информация об услуге:</h3>
            <div className="text-sm text-[#4CAF50]">
              <p><strong>Название:</strong> {selectedService.name}</p>
              <p><strong>Длительность:</strong> {selectedService.duration} минут</p>
              <p><strong>Стоимость:</strong> {selectedService.price} ₽</p>
              {selectedService.category_name && (
                <p><strong>Категория:</strong> {selectedService.category_name}</p>
              )}
            </div>
          </div>
        )}
        
        {/* Баллы лояльности */}
        {currentUser && currentUser.role === 'client' && selectedService && isLoyaltyEnabled && availablePoints > 0 && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="use_loyalty_points"
                checked={useLoyaltyPoints}
                onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                className="mt-1 w-4 h-4 text-[#4CAF50] border-gray-300 rounded focus:ring-[#4CAF50]"
              />
              <div className="flex-1">
                <label htmlFor="use_loyalty_points" className="block text-sm font-medium text-gray-900 cursor-pointer">
                  Потратить баллы
                </label>
                <p className="text-sm text-gray-600 mt-1">
                  У вас {availablePoints} баллов. Можно потратить до {calculateMaxSpendable()} ₽
                  {maxPaymentPercent && ` (${maxPaymentPercent}% от стоимости услуги)`}
                </p>
                {useLoyaltyPoints && (
                  <p className="text-xs text-blue-700 mt-2">
                    Будет списано {calculateMaxSpendable()} баллов. К доплате: {Math.max(0, (selectedService.price || 0) - calculateMaxSpendable())} ₽
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Кнопка отправки */}
        <button
          type="submit"
          data-testid="public-book-button"
          disabled={loading || !formData.service_id || !formData.date || !formData.time || !isDateAvailable(formData.date)}
          className="w-full bg-[#4CAF50] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#45A049] focus:ring-2 focus:ring-[#4CAF50] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Создание записи...' : 'Записаться'}
        </button>
      </form>
      
      {/* Модальное окно для ввода телефона */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-6 text-center">
              Введите номер телефона
            </h2>
            <p className="text-gray-600 mb-6 text-center">
              Для завершения записи необходимо указать номер телефона
            </p>
            
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Номер телефона <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="client_phone"
                  value={formData.client_phone || '+7'}
                  onChange={handleInputChange}
                  placeholder={phonePlaceholder()}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                />
              </div>
              
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600">{typeof error === 'string' ? error : 'Произошла ошибка'}</p>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPhoneModal(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#4CAF50] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#45A049] transition-colors disabled:opacity-50"
                >
                  {loading ? 'Создание...' : 'Записаться'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Модальное окно для верификации телефона в CJM */}
      {showPhoneVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-6 text-center">
              Подтвердите номер телефона
            </h2>
            <p className="text-gray-600 mb-6 text-center">
              Мы отправили звонок на номер {currentClientPhone}. 
              Введите код, который прозвучит в звонке.
            </p>
            
            {/* Показываем разные формы для мобильных и десктопных устройств */}
            {supportsReverseFlashCall() ? (
              // Мобильная версия - обратный FlashCall
              <div className="space-y-4">
                <div className="p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
                  <p className="text-sm text-[#4CAF50] mb-3">
                    <strong>Мобильная верификация:</strong> Позвоните на номер для автоматической верификации
                  </p>
                  <button 
                    type="button"
                    onClick={() => handleReverseFlashCall(currentClientPhone)}
                    disabled={reverseFlashCallLoading || checkingReverseStatus}
                    className="w-full bg-[#4CAF50] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#45A049] transition-colors disabled:opacity-50"
                  >
                    {reverseFlashCallLoading ? 'Инициация...' : 
                     checkingReverseStatus ? 'Проверка звонка...' : 
                     'Позвонить для верификации'}
                  </button>
                </div>
                
                {reverseFlashCallData && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 mb-2">
                      <strong>Номер для звонка:</strong>
                    </p>
                    <p className="text-lg font-bold text-green-900 mb-2">
                      {reverseFlashCallData.verification_number}
                    </p>
                    <p className="text-xs text-green-600">
                      Позвоните на этот номер с вашего телефона для автоматической верификации
                    </p>
                  </div>
                )}
                
                {reverseFlashCallError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600">{reverseFlashCallError}</p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhoneVerificationModal(false)
                      setPhoneVerificationCode('')
                      setCurrentClientPhone('')
                      setReverseFlashCallData(null)
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              // Десктопная версия - ввод кода
              <form onSubmit={handlePhoneVerification} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Код из звонка <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={phoneVerificationCode}
                    onChange={(e) => setPhoneVerificationCode(e.target.value)}
                    placeholder="Введите код"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                  />
                </div>
                
                {phoneVerificationError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600">{phoneVerificationError}</p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhoneVerificationModal(false)
                      setPhoneVerificationCode('')
                      setCurrentClientPhone('')
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={phoneVerificationLoading}
                    className="flex-1 bg-[#4CAF50] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#45A049] transition-colors disabled:opacity-50"
                  >
                    {phoneVerificationLoading ? 'Проверка...' : 'Подтвердить'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      
      {/* Модальное окно оплаты */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={handlePaymentCancel}
        bookingData={{
          serviceName: selectedService?.name || '',
          startTime: formData.date && formData.time ? `${formData.date}T${formData.time}:00` : null,
          paymentAmount: paymentAmount,
          temporaryBookingId: temporaryBookingId
        }}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentCancel={handlePaymentCancel}
      />
    </div>
  )
} 