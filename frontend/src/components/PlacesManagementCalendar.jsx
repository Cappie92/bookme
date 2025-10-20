import React, { useState } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 10, 20, 30, 40, 50]

function getTimeLabel(hour, minute) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

export default function PlacesManagementCalendar({ 
  selectedDate, 
  places, 
  masters, 
  bookings, 
  workingHours,
  onAssignMaster,
  onRemoveMaster 
}) {
  const [currentDate, setCurrentDate] = useState(selectedDate || new Date())
  const [assignedMasters, setAssignedMasters] = useState({}) // { placeId: masterId }

  // Парсинг рабочих часов
  const parseWorkingHours = (workingHours) => {
    if (!workingHours) return null
    if (typeof workingHours === 'string') {
      try {
        return JSON.parse(workingHours)
      } catch {
        return null
      }
    }
    return workingHours
  }

  const parsedWorkingHours = parseWorkingHours(workingHours)
  const dayMapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

  // Генерация рабочих слотов для выбранной даты
  const getWorkingTimeSlots = () => {
    if (!parsedWorkingHours || !currentDate) return []
    
    const dayKey = dayMapping[currentDate.getDay()]
    const dayData = parsedWorkingHours[dayKey]
    
    if (!dayData || !dayData.enabled) return []
    
    const [startHour, startMinute] = dayData.open.split(":").map(Number)
    const [endHour, endMinute] = dayData.close.split(":").map(Number)
    
    const slots = []
    let currentHour = startHour
    let currentMinute = startMinute
    
    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
      slots.push({
        hour: currentHour,
        minute: currentMinute,
        time: getTimeLabel(currentHour, currentMinute)
      })
      
      currentMinute += 10
      if (currentMinute >= 60) {
        currentMinute = 0
        currentHour += 1
      }
    }
    
    return slots
  }

  // Получение бронирований для места и времени
  const getPlaceBookings = (placeId, time) => {
    if (!Array.isArray(bookings)) return []
    
    const dateStr = currentDate.toISOString().split('T')[0]
    
    return bookings.filter(booking => 
      booking.place_id === placeId && 
      booking.date === dateStr && 
      booking.time === time
    )
  }

  // Получение назначенного мастера для места на весь день
  const getAssignedMaster = (placeId) => {
    const masterId = assignedMasters[placeId]
    if (!masterId) return null
    
    return masters.find(master => master.id === masterId) || null
  }

  // Получение всех назначенных мастеров на текущий день
  const getAssignedMastersForDay = () => {
    return Object.values(assignedMasters).filter(id => id !== null)
  }

  // Получение доступных мастеров для места (исключая уже назначенных)
  const getAvailableMasters = (currentPlaceId) => {
    if (!Array.isArray(masters)) return []
    
    const assignedMasterIds = getAssignedMastersForDay()
    const currentPlaceMaster = assignedMasters[currentPlaceId]
    
    return masters.filter(master => {
      // Если мастер уже назначен на это место, показываем его
      if (currentPlaceMaster === master.id) return true
      // Иначе показываем только тех, кто не назначен на другие места
      return !assignedMasterIds.includes(master.id)
    })
  }

  // Получение записей мастера на текущий день
  const getMasterBookings = (masterId) => {
    if (!Array.isArray(bookings)) return []
    
    const dateStr = currentDate.toISOString().split('T')[0]
    
    return bookings.filter(booking => 
      booking.master_id === masterId && 
      booking.date === dateStr
    )
  }

  // Получение места, на которое назначен мастер
  const getAssignedPlace = (masterId) => {
    const placeId = Object.keys(assignedMasters).find(id => assignedMasters[id] === masterId)
    if (!placeId) return null
    
    return places.find(place => place.id === parseInt(placeId))
  }

  // Навигация по датам
  const navigateDate = (direction) => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + direction)
    setCurrentDate(newDate)
  }

  // Обработка изменения назначения мастера
  const handleMasterChange = async (placeId, masterId) => {
    const dateStr = currentDate.toISOString().split('T')[0]
    
    if (masterId) {
      // Назначаем мастера
      setAssignedMasters(prev => ({
        ...prev,
        [placeId]: parseInt(masterId)
      }))
      await onAssignMaster(placeId, dateStr, parseInt(masterId))
    } else {
      // Убираем мастера
      setAssignedMasters(prev => {
        const newState = { ...prev }
        delete newState[placeId]
        return newState
      })
      await onRemoveMaster(placeId, dateStr)
    }
  }

  const timeSlots = getWorkingTimeSlots()

  if (!currentDate) {
    return (
      <div className="border rounded-lg bg-white p-6">
        <div className="text-center text-gray-500">
          Выберите дату для управления местами
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateDate(-1)}
            className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition-colors"
          >
            ←
          </button>
          <div className="font-semibold text-lg">
            {currentDate.toLocaleDateString('ru-RU', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          <button
            onClick={() => navigateDate(1)}
            className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition-colors"
          >
            →
          </button>
        </div>
        <div className="text-sm text-gray-600">
          {places?.length || 0} мест, {timeSlots.length} рабочих слотов
          {Array.isArray(masters) && (
            <span className="ml-2 text-blue-600">
              • {masters.length} мастеров, {getAssignedMastersForDay().length} назначено
            </span>
          )}
        </div>
      </div>
      
      {timeSlots.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          В этот день салон не работает
        </div>
      ) : !Array.isArray(places) || places.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          Места не загружены
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Место</th>
                <th className="px-4 py-2 text-center font-semibold text-gray-700">
                  Назначенный мастер
                  <div className="text-xs font-normal text-gray-500 mt-1">
                    Мастер может быть назначен только на одно место в день
                  </div>
                </th>
                {timeSlots.map(slot => (
                  <th key={slot.time} className="px-2 py-2 text-center text-sm font-semibold text-gray-700">
                    {slot.time}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.isArray(places) && places.map(place => {
                const assignedMaster = getAssignedMaster(place.id)
                
                return (
                  <tr key={place.id} className="border-b">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="p-2">
                        {place.name}
                        {place.branch_name && (
                          <div className="text-xs text-gray-500">Филиал: {place.branch_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getAvailableMasters(place.id).length === 0 && !assignedMaster ? (
                        <div className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                          Нет доступных мастеров
                        </div>
                      ) : (
                        <select 
                          value={assignedMaster ? assignedMaster.id.toString() : ''}
                          onChange={(e) => handleMasterChange(place.id, e.target.value)}
                          className={`w-full border rounded px-3 py-2 text-sm ${
                            assignedMaster ? 'bg-green-50 border-green-200' : 'bg-white'
                          }`}
                        >
                          <option value="">Не назначен</option>
                          {getAvailableMasters(place.id).map(master => (
                            <option key={master.id} value={master.id.toString()}>
                              {master.name} {master.specialization && `(${master.specialization})`}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    {timeSlots.map(slot => {
                      const bookings = getPlaceBookings(place.id, slot.time)
                      const hasBookings = bookings.length > 0
                      
                      return (
                        <td 
                          key={`${place.id}_${slot.time}`}
                          className="px-2 py-2 text-center border-l"
                        >
                          <div className="min-h-[40px] flex flex-col justify-center">
                            {hasBookings && (
                              <div className="text-xs bg-red-100 text-red-800 px-1 py-0.5 rounded">
                                {bookings.length} записей
                              </div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Таблица мастеров с записями */}
      {Array.isArray(masters) && masters.length > 0 && (
        <div className="mt-8 border rounded-lg bg-white">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">Мастера салона</h3>
            <p className="text-sm text-gray-600 mt-1">
              Мастера с активными записями на {currentDate.toLocaleDateString('ru-RU')}
            </p>
            {Array.isArray(masters) && (
              <div className="text-xs text-gray-500 mt-2">
                Всего мастеров: {masters.length} • 
                С записями: {masters.filter(m => getMasterBookings(m.id).length > 0).length} • 
                Назначено: {getAssignedMastersForDay().length} • 
                Требуют назначения: {masters.filter(m => getMasterBookings(m.id).length > 0 && !getAssignedMastersForDay().includes(m.id)).length}
              </div>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Мастер</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700">Записи на день</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700">Назначен на место</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700">Статус</th>
                </tr>
              </thead>
              <tbody>
                {masters
                  .map(master => {
                    const masterBookings = getMasterBookings(master.id)
                    const isAssigned = getAssignedMastersForDay().includes(master.id)
                    const assignedPlace = getAssignedPlace(master.id)
                    
                    return {
                      master,
                      masterBookings,
                      isAssigned,
                      assignedPlace,
                      hasBookings: masterBookings.length > 0
                    }
                  })
                  .sort((a, b) => {
                    // Сначала мастера с записями, потом без
                    if (a.hasBookings && !b.hasBookings) return -1
                    if (!a.hasBookings && b.hasBookings) return 1
                    // Затем по имени
                    return a.master.name.localeCompare(b.master.name)
                  })
                  .map(({ master, masterBookings, isAssigned, assignedPlace }) => (
                    <tr key={master.id} className={`border-b ${
                      masterBookings.length > 0 && !isAssigned 
                        ? 'bg-red-50' 
                        : masterBookings.length > 0 && isAssigned 
                        ? 'bg-green-50' 
                        : ''
                    }`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {master.name}
                          {master.specialization && (
                            <div className="text-xs text-gray-500">
                              {master.specialization}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {masterBookings.length > 0 ? (
                          <div className="text-sm">
                            <div className="font-medium text-blue-600">
                              {masterBookings.length} записей
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {masterBookings.map(booking => (
                                <div key={booking.id}>
                                  {booking.time} - {booking.service_name}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">
                            Нет записей
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isAssigned ? (
                          <div className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                            {assignedPlace?.name || 'Место'}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">
                            Не назначен
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {masterBookings.length > 0 && !isAssigned ? (
                          <div className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded">
                            Требует назначения
                          </div>
                        ) : masterBookings.length > 0 && isAssigned ? (
                          <div className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                            Назначен
                          </div>
                        ) : (
                          <div className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            Свободен
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
} 