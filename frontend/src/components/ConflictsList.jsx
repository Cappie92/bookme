import React from 'react'

const ConflictsList = ({ conflicts = [], isOpen, onClose }) => {
  if (!isOpen || conflicts.length === 0) {
    return null
  }

  const handleResolveConflict = async (conflictId, action) => {
    // TODO: Реализовать разрешение конфликтов через API
    console.log(`Resolving conflict ${conflictId} with action: ${action}`)
    alert('Функция разрешения конфликтов будет реализована позже')
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getConflictTypeText = (conflictType) => {
    switch (conflictType) {
      case 'personal_schedule':
        return 'Конфликт в личном расписании'
      case 'salon_work':
        return 'Конфликт с работой в салоне'
      case 'booking':
        return 'Конфликт с записью клиента'
      default:
        return 'Неизвестный конфликт'
    }
  }

  const getWorkTypeText = (workType) => {
    switch (workType) {
      case 'personal':
        return 'Личная работа'
      case 'salon':
        return 'Работа в салоне'
      default:
        return 'Неизвестный тип работы'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-orange-600">Конфликты расписания</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="mb-4 text-sm text-gray-600">
          Найдено {conflicts.length} конфликтов. Нажмите на конфликт для его разрешения.
        </div>

        <div className="space-y-3">
          {conflicts.map((conflict, index) => (
            <div 
              key={`${conflict.date}_${conflict.start_time}_${index}`} 
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {formatDate(conflict.date)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {conflict.start_time} - {conflict.end_time}
                  </div>
                  <div className="text-sm text-orange-600 mt-1">
                    {getConflictTypeText(conflict.conflict_type)}
                  </div>
                  <div className="text-sm text-blue-600 mt-1">
                    {getWorkTypeText(conflict.work_type)}
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleResolveConflict(`${conflict.date}_${conflict.start_time}`, 'keep')}
                    className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200 transition-colors"
                    title="Оставить запись"
                  >
                    Оставить
                  </button>
                  <button
                    onClick={() => handleResolveConflict(`${conflict.date}_${conflict.start_time}`, 'remove')}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors"
                    title="Удалить запись"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConflictsList
