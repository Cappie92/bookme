import React, { useState } from 'react'

const Calendar = ({ 
  selectedDate, 
  onDateSelect, 
  availableDates = [], 
  className = '' 
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [selectedDateState, setSelectedDateState] = useState(selectedDate ? new Date(selectedDate) : null)

  const today = new Date()

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay()
    // Преобразуем воскресенье (0) в 6, остальные дни уменьшаем на 1
    return day === 0 ? 6 : day - 1
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'long' 
    })
  }

  const isToday = (date) => {
    return date.toDateString() === today.toDateString()
  }

  const isSelected = (date) => {
    return selectedDateState && date.toDateString() === selectedDateState.toDateString()
  }

  const isAvailable = (date) => {
    return availableDates.some(availableDate => 
      new Date(availableDate).toDateString() === date.toDateString()
    )
  }

  const isPast = (date) => {
    return date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
  }

  const handleDateClick = (date) => {
    if (!isPast(date) && isAvailable(date)) {
      setSelectedDateState(date)
      onDateSelect(date)
    }
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth)
    const firstDayOfMonth = getFirstDayOfMonth(currentMonth)
    const days = []

    // Добавляем пустые ячейки для выравнивания
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="w-10 h-10"></div>)
    }

    // Добавляем дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
      const isTodayDate = isToday(date)
      const isSelectedDate = isSelected(date)
      const isAvailableDate = isAvailable(date)
      const isPastDate = isPast(date)

      let dayClasses = "w-8 h-8 flex items-center justify-center text-xs rounded cursor-pointer transition-colors"
      
      if (isSelectedDate) {
        dayClasses += " bg-[#4CAF50] text-white font-semibold"
      } else if (isTodayDate) {
        dayClasses += " bg-[#E8F5E8] text-[#4CAF50] font-semibold border-2 border-[#4CAF50]"
      } else if (isAvailableDate && !isPastDate) {
        dayClasses += " bg-white text-[#4CAF50] font-semibold border border-[#4CAF50] hover:bg-[#E8F5E8] hover:border-[#45A049]"
      } else if (isPastDate) {
        dayClasses += " text-gray-400 cursor-not-allowed bg-gray-50"
      } else {
        // Дата без доступных слотов
        dayClasses += " text-gray-400 cursor-not-allowed bg-gray-100"
      }

      days.push(
        <div
          key={day}
          className={dayClasses}
          onClick={() => handleDateClick(date)}
        >
          {day}
        </div>
      )
    }

    return days
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-3 ${className}`}>
      {/* Заголовок календаря */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPreviousMonth}
          className="p-1 hover:bg-neutral-100 rounded transition-colors"
        >
          <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <h3 className="text-sm font-semibold text-neutral-900">
          {formatDate(currentMonth)}
        </h3>
        
        <button
          onClick={goToNextMonth}
          className="p-1 hover:bg-neutral-100 rounded transition-colors"
        >
          <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Дни недели */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
          <div key={day} className="w-8 h-8 flex items-center justify-center text-xs font-medium text-neutral-500">
            {day}
          </div>
        ))}
      </div>

      {/* Календарная сетка */}
      <div className="grid grid-cols-7 gap-1">
        {renderCalendar()}
      </div>
      
      {/* Легенда календаря */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-[#4CAF50] rounded"></div>
            <span>Выбрано</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-[#E8F5E8] border-2 border-[#4CAF50] rounded"></div>
            <span>Сегодня</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-white border border-[#4CAF50] rounded"></div>
            <span>Доступно</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-100 rounded"></div>
            <span>Недоступно</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Calendar 