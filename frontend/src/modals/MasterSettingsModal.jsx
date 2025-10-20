import React, { useState, useEffect } from 'react'
import ConfirmCloseModal from './ConfirmCloseModal'

export default function MasterSettingsModal({ 
  open, 
  onClose, 
  master, 
  getAuthHeaders,
  onSave 
}) {
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [masterServices, setMasterServices] = useState({})
  const [collapsedCategories, setCollapsedCategories] = useState({})
  const [collapsedServices, setCollapsedServices] = useState(true)
  const [collapsedSchedule, setCollapsedSchedule] = useState(true)
  const [scheduleType, setScheduleType] = useState('fixed')
  const [fixedSchedule, setFixedSchedule] = useState({
    type: 'shift_schedule',
    startDate: '',
    workDays: 2,
    restDays: 2,
    weekdays: [],
    workStartTime: '09:00',
    workEndTime: '18:00',
    weekdayTimes: {}
  })
  const [individualSchedule, setIndividualSchedule] = useState({})
  const [salonWorkingHours, setSalonWorkingHours] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [initialData, setInitialData] = useState(null)
  const [branches, setBranches] = useState([])
  const [masterBranchId, setMasterBranchId] = useState('')

  // Загрузка услуг и категорий салона
  useEffect(() => {
    if (open && master) {
      loadSalonData()
      loadMasterSettings()
      loadSalonWorkingHours()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, master])

  const loadSalonData = async () => {
    try {
      setLoading(true)
      const [servicesResponse, categoriesResponse, branchesResponse] = await Promise.all([
        fetch('/salon/services', { headers: getAuthHeaders() }),
        fetch('/salon/categories', { headers: getAuthHeaders() }),
        fetch('/salon/branches', { headers: getAuthHeaders() })
      ])

      if (servicesResponse.ok && categoriesResponse.ok && branchesResponse.ok) {
        const servicesData = await servicesResponse.json()
        const categoriesData = await categoriesResponse.json()
        const branchesData = await branchesResponse.json()
        
        setServices(servicesData)
        setCategories(categoriesData)
        setBranches(branchesData)
        
        const initialCollapsedState = {}
        categoriesData.forEach(category => {
          initialCollapsedState[category.id] = true
        })
        setCollapsedCategories(initialCollapsedState)
      } else {
        setError('Ошибка загрузки данных салона')
      }
    } catch (err) {
      console.error('Ошибка загрузки данных салона:', err)
      setError('Ошибка загрузки данных салона')
    } finally {
      setLoading(false)
    }
  }

  const loadSalonWorkingHours = async () => {
    try {
      // Получаем профиль салона для получения working_hours
      const response = await fetch('/salon/profile', { headers: getAuthHeaders() })
      if (response.ok) {
        const data = await response.json()
        setSalonWorkingHours(data)
      }
    } catch (err) {
      console.error('Ошибка загрузки графика работы салона:', err)
    }
  }

  const loadMasterSettings = async () => {
    if (!master) return
    
    try {
      const response = await fetch(`/salon/masters/${master.id}/settings`, {
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        const data = await response.json()
        const servicesMap = {}
        data.services.forEach(service => {
          servicesMap[service.service_id] = {
            isActive: service.is_active,
            paymentType: service.master_payment_type || 'rub',
            paymentValue: service.master_payment_value || 0
          }
        })
        setMasterServices(servicesMap)
        
        // Устанавливаем филиал мастера
        setMasterBranchId(data.branch_id || '')
        
        // Сохраняем начальные данные для сравнения
        setInitialData({
          services: servicesMap,
          schedule: data.schedule,
          branch_id: data.branch_id || ''
        })
        setHasUnsavedChanges(false)
        
        if (data.schedule) {
          setScheduleType(data.schedule.type || 'fixed')
          if (data.schedule.fixed) {
            setFixedSchedule(prev => ({
              ...prev,
              ...data.schedule.fixed,
              weekdayTimes: data.schedule.fixed.weekdayTimes || {}
            }))
          }
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки настроек мастера:', err)
    }
  }

  const checkForChanges = () => {
    if (!initialData) return false
    
    // Проверяем изменения в услугах
    const currentServices = masterServices
    const initialServices = initialData.services
    
    // Сравниваем услуги
    for (const serviceId in currentServices) {
      const current = currentServices[serviceId]
      const initial = initialServices[serviceId]
      
      if (!initial || 
          current.isActive !== initial.isActive ||
          current.paymentType !== initial.paymentType ||
          current.paymentValue !== initial.paymentValue) {
        return true
      }
    }
    
    // Проверяем изменения в расписании
    const currentSchedule = {
      type: scheduleType,
      fixed: fixedSchedule
    }
    const initialSchedule = initialData.schedule
    
    if (JSON.stringify(currentSchedule) !== JSON.stringify(initialSchedule)) {
      return true
    }
    
    // Проверяем изменения в филиале
    if (masterBranchId !== initialData.branch_id) {
      return true
    }
    
    return false
  }

  const handleServiceToggle = (serviceId) => {
    setMasterServices(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        isActive: !prev[serviceId]?.isActive
      }
    }))
    setHasUnsavedChanges(true)
  }

  const toggleCategoryCollapse = (categoryId) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }))
  }

  const toggleAllServicesInCategory = (categoryId, isActive) => {
    const categoryServices = services.filter(service => service.category_id === categoryId)
    
    setMasterServices(prev => {
      const updated = { ...prev }
      categoryServices.forEach(service => {
        updated[service.id] = {
          ...updated[service.id],
          isActive: isActive,
          paymentType: updated[service.id]?.paymentType || 'rub',
          paymentValue: updated[service.id]?.paymentValue || 0
        }
      })
      return updated
    })
    setHasUnsavedChanges(true)
  }

  const areAllServicesInCategoryActive = (categoryId) => {
    const categoryServices = services.filter(service => service.category_id === categoryId)
    return categoryServices.length > 0 && categoryServices.every(service => 
      masterServices[service.id]?.isActive
    )
  }

  const hasAnyActiveServiceInCategory = (categoryId) => {
    const categoryServices = services.filter(service => service.category_id === categoryId)
    return categoryServices.some(service => masterServices[service.id]?.isActive)
  }

  const handlePaymentTypeChange = (serviceId, type) => {
    setMasterServices(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        paymentType: type,
        paymentValue: 0
      }
    }))
    setHasUnsavedChanges(true)
  }

  const handlePaymentValueChange = (serviceId, value) => {
    const numValue = parseFloat(value) || 0
    const service = services.find(s => s.id === serviceId)
    
    if (!service) return

    let validValue = numValue
    const currentSettings = masterServices[serviceId]
    
    if (currentSettings?.paymentType === 'rub') {
      validValue = Math.min(numValue, service.price)
    } else if (currentSettings?.paymentType === 'percent') {
      validValue = Math.min(numValue, 100)
    }

    setMasterServices(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        paymentValue: validValue
      }
    }))
    setHasUnsavedChanges(true)
  }

  const handleBranchChange = (branchId) => {
    setMasterBranchId(branchId)
    setHasUnsavedChanges(true)
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    
    try {
      const servicesData = Object.entries(masterServices).map(([serviceId, settings]) => ({
        service_id: parseInt(serviceId),
        is_active: settings.isActive,
        master_payment_type: settings.paymentType,
        master_payment_value: settings.paymentValue
      }))

      const scheduleData = {
        type: scheduleType,
        fixed: scheduleType === 'fixed' ? fixedSchedule : null,
        individual: scheduleType === 'individual' ? individualSchedule : null
      }

      const response = await fetch(`/salon/masters/${master.id}/settings`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          services: servicesData,
          schedule: scheduleData,
          branch_id: masterBranchId || null
        })
      })

      if (response.ok) {
        // Обновляем начальные данные и сбрасываем флаг изменений
        setInitialData({
          services: masterServices,
          schedule: scheduleData,
          branch_id: masterBranchId || ''
        })
        setHasUnsavedChanges(false)
        onSave()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка сохранения настроек')
      }
    } catch (err) {
      console.error('Ошибка сохранения настроек:', err)
      setError('Ошибка сети при сохранении настроек')
    } finally {
      setLoading(false)
    }
  }

  const getServiceById = (id) => services.find(s => s.id === id)
  const getCategoryById = (id) => categories.find(c => c.id === id)

  const generateTimeOptions = (earliestTime = '00:00', latestTime = '23:59') => {
    const options = []
    const [earliestHour, earliestMinute] = earliestTime.split(':').map(Number)
    const [latestHour, latestMinute] = latestTime.split(':').map(Number)
    
    for (let hour = earliestHour; hour <= latestHour; hour++) {
      const startMinute = hour === earliestHour ? earliestMinute : 0
      const endMinute = hour === latestHour ? latestMinute : 59
      
      for (let minute = startMinute; minute <= endMinute; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        options.push(timeString)
      }
    }
    
    return options
  }

  const getTimeConstraintsForWeekday = (weekday) => {
    if (!salonWorkingHours?.working_hours) return { earliest: '00:00', latest: '23:59' }
    
    const dayMapping = {
      1: 'monday',
      2: 'tuesday', 
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday',
      0: 'sunday'
    }
    
    const dayKey = dayMapping[weekday]
    const dayData = salonWorkingHours.working_hours[dayKey]
    
    if (dayData?.enabled) {
      return {
        earliest: dayData.open,
        latest: dayData.close
      }
    }
    
    return {
      earliest: salonWorkingHours.earliest_open,
      latest: salonWorkingHours.latest_close
    }
  }

  if (!open) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      if (hasUnsavedChanges) {
        setShowConfirmClose(true)
      } else {
        onClose()
      }
    }
  }

  const handleCloseClick = () => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true)
    } else {
      onClose()
    }
  }

  const handleConfirmClose = () => {
    setShowConfirmClose(false)
    onClose()
  }

  const handleCancelClose = () => {
    setShowConfirmClose(false)
  }

  // Группируем услуги по категориям
  const servicesByCategory = categories.map(category => ({
    ...category,
    services: services.filter(service => service.category_id === category.id)
  })).filter(category => category.services.length > 0)

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={handleBackdropClick}
      >
        <div 
          className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Настройки мастера</h2>
              {hasUnsavedChanges && (
                <span className="text-sm text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                  Есть несохраненные изменения
                </span>
              )}
            </div>
            <button
              onClick={handleCloseClick}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {master && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-lg">{master.name}</h3>
                  <p className="text-gray-600">{master.phone}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Филиал
                  </label>
                  <select
                    value={masterBranchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 w-full"
                  >
                    <option value="">Основной салон</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">Загрузка...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Блок услуг */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCollapsedServices(!collapsedServices)}
                      className="text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      {collapsedServices ? '▶' : '▼'}
                    </button>
                    <h3 className="text-xl font-semibold">Услуги</h3>
                  </div>
                </div>
                
                {!collapsedServices && (
                  <div className="p-4 space-y-4">
                    {servicesByCategory.map(category => (
                      <div key={category.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleCategoryCollapse(category.id)}
                              className="text-gray-600 hover:text-gray-800 transition-colors"
                            >
                              {collapsedCategories[category.id] ? '▶' : '▼'}
                            </button>
                            <h4 className="font-medium">{category.name}</h4>
                            <button
                              onClick={() => toggleAllServicesInCategory(
                                category.id, 
                                !areAllServicesInCategoryActive(category.id)
                              )}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {areAllServicesInCategoryActive(category.id) ? 'Снять все' : 'Отметить все'}
                            </button>
                          </div>
                          <div className="text-sm text-gray-600 font-medium">
                            Заработок мастера
                          </div>
                        </div>
                        {!collapsedCategories[category.id] && (
                          <div className="divide-y">
                            {category.services.map(service => {
                              const serviceSettings = masterServices[service.id] || { isActive: false, paymentType: 'rub', paymentValue: 0 }
                              return (
                                <div key={service.id} className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={serviceSettings.isActive}
                                          onChange={() => handleServiceToggle(service.id)}
                                          className="rounded"
                                        />
                                        <div>
                                          <h5 className="font-medium">{service.name}</h5>
                                          <p className="text-sm text-gray-600">
                                            {service.price} ₽ • {service.duration} мин
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {serviceSettings.isActive && (
                                      <div className="flex items-center gap-3">
                                        <select
                                          value={serviceSettings.paymentType}
                                          onChange={(e) => handlePaymentTypeChange(service.id, e.target.value)}
                                          className="border rounded px-2 py-1 text-sm"
                                        >
                                          <option value="rub">руб.</option>
                                          <option value="percent">%</option>
                                        </select>
                                        
                                        <input
                                          type="number"
                                          value={serviceSettings.paymentValue}
                                          onChange={(e) => handlePaymentValueChange(service.id, e.target.value)}
                                          className="border rounded px-2 py-1 text-sm w-20"
                                          min="0"
                                          max={serviceSettings.paymentType === 'percent' ? 100 : service.price}
                                          step={serviceSettings.paymentType === 'percent' ? 1 : 10}
                                        />
                                        
                                        <span className="text-sm text-gray-600">
                                          {serviceSettings.paymentType === 'percent' ? '%' : '₽'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Блок расписания */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCollapsedSchedule(!collapsedSchedule)}
                      className="text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      {collapsedSchedule ? '▶' : '▼'}
                    </button>
                    <h3 className="text-xl font-semibold">Расписание</h3>
                  </div>
                </div>
                
                {!collapsedSchedule && (
                  <div className="p-4">
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2">Тип расписания</label>
                      <select
                        value={scheduleType}
                        onChange={(e) => {
                          setScheduleType(e.target.value)
                          setHasUnsavedChanges(true)
                        }}
                        className="border rounded px-3 py-2 w-full"
                      >
                        <option value="fixed">Фиксированное</option>
                        <option value="individual">Индивидуальное</option>
                      </select>
                    </div>

                    {scheduleType === 'fixed' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Правило</label>
                          <select
                            value={fixedSchedule.type}
                            onChange={(e) => {
                              setFixedSchedule(prev => ({ ...prev, type: e.target.value }))
                              setHasUnsavedChanges(true)
                            }}
                            className="border rounded px-3 py-2 w-full"
                          >
                            <option value="shift_schedule">Сменный график</option>
                            <option value="weekdays">Дни недели</option>
                          </select>
                        </div>

                        {fixedSchedule.type === 'shift_schedule' && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-2">Дата начала работы</label>
                              <input
                                type="date"
                                value={fixedSchedule.startDate}
                                onChange={(e) => {
                                  setFixedSchedule(prev => ({ ...prev, startDate: e.target.value }))
                                  setHasUnsavedChanges(true)
                                }}
                                className="border rounded px-3 py-2 w-full"
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium mb-2">Рабочие дни</label>
                                <input
                                  type="number"
                                  value={fixedSchedule.workDays}
                                  onChange={(e) => {
                                    setFixedSchedule(prev => ({ ...prev, workDays: parseInt(e.target.value) || 1 }))
                                    setHasUnsavedChanges(true)
                                  }}
                                  className="border rounded px-3 py-2 w-full"
                                  min="1"
                                  max="7"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-2">Выходные дни</label>
                                <input
                                  type="number"
                                  value={fixedSchedule.restDays}
                                  onChange={(e) => {
                                    setFixedSchedule(prev => ({ ...prev, restDays: parseInt(e.target.value) || 1 }))
                                    setHasUnsavedChanges(true)
                                  }}
                                  className="border rounded px-3 py-2 w-full"
                                  min="1"
                                  max="7"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium mb-2">Время начала работы</label>
                                <select
                                  value={fixedSchedule.workStartTime}
                                  onChange={(e) => {
                                    setFixedSchedule(prev => ({ ...prev, workStartTime: e.target.value }))
                                    setHasUnsavedChanges(true)
                                  }}
                                  className="border rounded px-3 py-2 w-full"
                                >
                                  {generateTimeOptions(
                                    salonWorkingHours?.earliest_open || '00:00',
                                    salonWorkingHours?.latest_close || '23:59'
                                  ).map(time => (
                                    <option key={time} value={time}>{time}</option>
                                  ))}
                                </select>
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium mb-2">Время окончания работы</label>
                                <select
                                  value={fixedSchedule.workEndTime}
                                  onChange={(e) => {
                                    setFixedSchedule(prev => ({ ...prev, workEndTime: e.target.value }))
                                    setHasUnsavedChanges(true)
                                  }}
                                  className="border rounded px-3 py-2 w-full"
                                >
                                  {generateTimeOptions(
                                    fixedSchedule.workStartTime,
                                    salonWorkingHours?.latest_close || '23:59'
                                  ).map(time => (
                                    <option key={time} value={time}>{time}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            
                            {fixedSchedule.startDate && (
                              <div className="p-3 bg-blue-50 rounded-lg">
                                <p className="text-sm text-blue-800">
                                  <strong>Пример расписания:</strong><br />
                                  Начало: {new Date(fixedSchedule.startDate).toLocaleDateString('ru-RU')}<br />
                                  Рабочие дни: {fixedSchedule.workDays}, Выходные: {fixedSchedule.restDays}<br />
                                  Время работы: {fixedSchedule.workStartTime} - {fixedSchedule.workEndTime}<br />
                                  Цикл: {fixedSchedule.workDays} дня работы → {fixedSchedule.restDays} дня отдыха
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {fixedSchedule.type === 'weekdays' && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-2">Дни недели и время работы</label>
                              <div className="space-y-3">
                                {[
                                  { value: 1, label: 'Понедельник' },
                                  { value: 2, label: 'Вторник' },
                                  { value: 3, label: 'Среда' },
                                  { value: 4, label: 'Четверг' },
                                  { value: 5, label: 'Пятница' },
                                  { value: 6, label: 'Суббота' },
                                  { value: 0, label: 'Воскресенье' }
                                ].map(day => {
                                  const isSelected = fixedSchedule.weekdays.includes(day.value)
                                  const dayTimes = fixedSchedule.weekdayTimes[day.value] || { start: '09:00', end: '18:00' }
                                  
                                  return (
                                    <div key={day.value} className="flex items-center gap-3 p-3 border rounded-lg">
                                      <div className="flex items-center gap-2 min-w-[120px]">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setFixedSchedule(prev => ({
                                                ...prev,
                                                weekdays: [...prev.weekdays, day.value],
                                                weekdayTimes: {
                                                  ...prev.weekdayTimes,
                                                  [day.value]: { start: '09:00', end: '18:00' }
                                                }
                                              }))
                                            } else {
                                              setFixedSchedule(prev => ({
                                                ...prev,
                                                weekdays: prev.weekdays.filter(d => d !== day.value)
                                              }))
                                            }
                                            setHasUnsavedChanges(true)
                                          }}
                                          className="rounded"
                                        />
                                        <span className="font-medium">{day.label}</span>
                                      </div>
                                      
                                      {isSelected && (
                                        <div className="flex items-center gap-3 flex-1">
                                          <div className="text-gray-400">|</div>
                                          <div className="flex-1">
                                            <label className="block text-xs text-gray-600 mb-1">Начало</label>
                                            <select
                                              value={dayTimes.start}
                                              onChange={(e) => {
                                                setFixedSchedule(prev => ({
                                                  ...prev,
                                                  weekdayTimes: {
                                                    ...prev.weekdayTimes,
                                                    [day.value]: { ...dayTimes, start: e.target.value }
                                                  }
                                                }))
                                                setHasUnsavedChanges(true)
                                              }}
                                              className="border rounded px-2 py-1 text-sm w-full"
                                            >
                                              {generateTimeOptions(
                                                salonWorkingHours?.earliest_open || '00:00',
                                                salonWorkingHours?.latest_close || '23:59'
                                              ).map(time => (
                                                <option key={time} value={time}>{time}</option>
                                              ))}
                                            </select>
                                          </div>
                                          
                                          <div className="flex-1">
                                            <label className="block text-xs text-gray-600 mb-1">Окончание</label>
                                            <select
                                              value={dayTimes.end}
                                              onChange={(e) => {
                                                setFixedSchedule(prev => ({
                                                  ...prev,
                                                  weekdayTimes: {
                                                    ...prev.weekdayTimes,
                                                    [day.value]: { ...dayTimes, end: e.target.value }
                                                  }
                                                }))
                                                setHasUnsavedChanges(true)
                                              }}
                                              className="border rounded px-2 py-1 text-sm w-full"
                                            >
                                              {generateTimeOptions(
                                                dayTimes.start,
                                                salonWorkingHours?.latest_close || '23:59'
                                              ).map(time => (
                                                <option key={time} value={time}>{time}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                <p className="text-xs text-blue-700">
                                  <strong>Подсказка:</strong> Отметьте нужные дни недели, чтобы настроить время работы для каждого дня отдельно. 
                                  Время работы ограничено графиком салона: {salonWorkingHours?.earliest_open || '09:00'} - {salonWorkingHours?.latest_close || '18:00'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {scheduleType === 'individual' && (
                      <div>
                        <p className="text-gray-600 mb-4">
                          Индивидуальное расписание будет реализовано в следующем этапе разработки.
                        </p>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-500">
                            Здесь будет календарь для выбора конкретных дат и времени работы мастера.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-6">
            <button
              onClick={handleSave}
              disabled={loading || !hasUnsavedChanges}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={handleCloseClick}
              disabled={loading}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
      <ConfirmCloseModal
        isOpen={showConfirmClose}
        onClose={handleCancelClose}
        onConfirmCancel={handleConfirmClose}
        onReturnToSetup={handleCancelClose}
        type="unsaved"
      />
    </>
  )
} 