import { useState } from "react"
import { Button } from "./ui"

export default function PlacesList({ places, onViewSchedule, onEdit, onDelete, selectedBranch, branches }) {
  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const displayedPlaces = expanded ? places : places.slice(0, 3)

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold">
            Список мест ({places.length})
            {selectedBranch && branches && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                в филиале "{branches.find(b => b.id === selectedBranch)?.name}"
              </span>
            )}
          </h2>
        </div>
        <div className="flex gap-2">
          {places.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[#4CAF50] hover:text-[#45A049] text-sm"
            >
              {expanded ? 'Скрыть' : `Показать все (${places.length})`}
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-600 hover:text-gray-800 text-sm"
          >
            {collapsed ? 'Развернуть' : 'Свернуть'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {displayedPlaces.map((place) => (
            <div key={place.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#DFF5EC] rounded-full flex items-center justify-center">
                    <span className="text-[#4CAF50] font-semibold text-sm">
                      {place.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{place.name}</h3>
                    <p className="text-sm text-gray-500">
                      Вместимость: {place.capacity} мастеров
                      • Филиал: {branches?.find(b => b.id === place.branch_id)?.name || 'Неизвестный филиал'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onViewSchedule(place)}
                  className="px-3 py-1 border border-[#4CAF50] text-[#4CAF50] rounded hover:bg-[#DFF5EC] transition-colors text-sm"
                  title="Просмотр загруженности"
                >
                  📅
                </button>
                <button
                  onClick={() => onEdit(place)}
                  className="px-3 py-1 border border-[#4CAF50] text-[#4CAF50] rounded hover:bg-[#DFF5EC] transition-colors text-sm"
                  title="Редактировать"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(place)}
                  className="px-3 py-1 border border-red-600 text-red-600 rounded hover:bg-red-50 transition-colors text-sm"
                  title="Удалить"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!collapsed && !expanded && places.length > 3 && (
        <div className="text-center mt-4">
          <button
            onClick={() => setExpanded(true)}
            className="text-[#4CAF50] hover:text-[#45A049] text-sm"
          >
            Показать еще {places.length - 3} мест...
          </button>
        </div>
      )}
    </div>
  )
} 