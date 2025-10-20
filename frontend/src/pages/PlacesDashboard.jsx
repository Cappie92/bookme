import { useState, useEffect } from "react"
import { cities, getTimezoneByCity } from "../utils/cities"
import PlaceCreateModal from "../modals/PlaceCreateModal"
import PlaceCalendarModal from "../modals/PlaceCalendarModal"
import PlacesList from "../components/PlacesList"
import AdvancedScheduleView from "../components/AdvancedScheduleView"
import { Button } from "../components/ui"

// Компонент для отображения схемы салона
const SalonLayout = ({ places, branches, onPlaceClick }) => {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 3))
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.5))

  return (
          <div className="bg-white rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Схема салона</h3>
            <p className="text-sm text-gray-600">
              Все места привязаны к филиалам
            </p>
          </div>
        <div className="flex gap-2">
          <button
            onClick={handleZoomOut}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            -
          </button>
          <span className="px-3 py-1 bg-gray-100 rounded">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            +
          </button>
        </div>
      </div>
      <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden" style={{ height: '400px' }}>
        <div
          className="absolute inset-0"
          style={{
            transform: `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`,
            transformOrigin: 'top left'
          }}
        >
          {/* Филиалы */}
          {branches.map((branch, index) => (
            <div
              key={branch.id}
              className="absolute bg-[#DFF5EC] border-2 border-[#4CAF50] rounded p-2"
              style={{
                top: 4 + (index * 80),
                left: 4
              }}
            >
              <div className="text-sm font-medium text-[#2E7D32]">{branch.name}</div>
              <div className="text-xs text-[#4CAF50]">
                {places.filter(p => p.branch_id === branch.id).length} мест
              </div>
            </div>
          ))}
          


          {/* Места */}
          {places.map((place, index) => {
            // Определяем, к какому филиалу относится место
            const branch = branches.find(b => b.id === place.branch_id)
            
            // Вычисляем позицию в сетке 3x3
            const gridSize = 120 // размер ячейки сетки
            const cols = 3 // количество колонок
            const row = Math.floor(index / cols)
            const col = index % cols
            
            const left = 120 + (col * gridSize) // отступ от левого края + позиция в колонке
            const top = 120 + (row * gridSize)  // отступ от верха + позиция в строке
            
            return (
              <div
                key={place.id}
                onClick={() => onPlaceClick(place)}
                className="absolute bg-white border-2 border-[#4CAF50] rounded cursor-pointer hover:border-[#4CAF50] hover:shadow-md transition-all"
                style={{
                  left: left,
                  top: top,
                  width: place.width || 100,
                  height: place.height || 100
                }}
              >
                <div className="p-2 text-xs">
                  <div className="font-medium truncate">{place.name}</div>
                  <div className="text-gray-500">Вместимость: {place.capacity}</div>
                  <div className="text-[#4CAF50] text-xs font-medium">
                    {branch?.name || 'Неизвестный филиал'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}



export default function PlacesDashboard() {
  const [user, setUser] = useState(null)
  const [salon, setSalon] = useState(null)
  const [branches, setBranches] = useState([])
  const [places, setPlaces] = useState([])
  const [scheduleData, setScheduleData] = useState(null)
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [branchPlacesCount, setBranchPlacesCount] = useState({})
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [calendarModalOpen, setCalendarModalOpen] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState(null)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  const loadUserData = async () => {
    try {
      const response = await fetch('/auth/users/me', {
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

  const loadPlaces = async () => {
    try {
      const url = selectedBranch 
        ? `/salon/places?branch_id=${selectedBranch}`
        : '/salon/places'
      const response = await fetch(url, {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const placesData = await response.json()
        // Фильтруем места без филиала - их быть не должно
        const validPlaces = placesData.filter(place => place.branch_id)
        setPlaces(validPlaces)
      }
    } catch (error) {
      console.error('Ошибка загрузки мест:', error)
    }
  }

  const loadSchedule = async () => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0]
      const url = selectedBranch 
        ? `/salon/places/schedule/${dateStr}?branch_id=${selectedBranch}`
        : `/salon/places/schedule/${dateStr}`
      const response = await fetch(url, {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const scheduleData = await response.json()
        setScheduleData(scheduleData)
      }
    } catch (error) {
      console.error('Ошибка загрузки расписания:', error)
    }
  }

  useEffect(() => {
    loadUserData()
    loadSalonProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (salon) {
      loadBranches()
      loadPlaces()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon, selectedBranch])

  useEffect(() => {
    if (places.length > 0 && places.every(place => place.branch_id)) {
      loadSchedule()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, selectedDate, selectedBranch])

  // Инициализация количества мест по филиалам
  useEffect(() => {
    if (branches.length > 0 && places.length > 0) {
      const counts = {}
      branches.forEach(branch => {
        const branchPlaces = places.filter(place => place.branch_id === branch.id)
        counts[branch.id] = branchPlaces.length
      })
      setBranchPlacesCount(counts)
      
      // Проверяем, что все места имеют филиал
      const placesWithoutBranch = places.filter(place => !place.branch_id)
      if (placesWithoutBranch.length > 0) {
        console.warn('Обнаружены места без филиала:', placesWithoutBranch)
      }
    }
  }, [branches, places])

  // Функции для управления количеством мест по филиалам
  const handleBranchPlacesChange = (branchId, count) => {
    setBranchPlacesCount(prev => ({
      ...prev,
      [branchId]: count
    }))
  }

  const handleSaveBranchPlaces = async (branchId) => {
    const targetCount = branchPlacesCount[branchId] || 0
    const currentPlaces = places.filter(place => place.branch_id === branchId)
    const currentCount = currentPlaces.length

    try {
      if (targetCount > currentCount) {
        // Нужно добавить места
        const placesToAdd = targetCount - currentCount
        for (let i = 0; i < placesToAdd; i++) {
          const placeData = {
            name: `Место ${currentCount + i + 1}`,
            description: `Автоматически созданное место для филиала`,
            branch_id: branchId,
            position_x: 0,
            position_y: 0,
            width: 100,
            height: 100,
            capacity: 1,
            is_active: true
          }
          
          const response = await fetch('/salon/places', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(placeData)
          })
          
          if (!response.ok) {
            throw new Error(`Ошибка создания места ${i + 1}`)
          }
        }
      } else if (targetCount < currentCount) {
        // Нужно удалить места
        const placesToRemove = currentCount - targetCount
        const placesToDelete = currentPlaces.slice(-placesToRemove)
        
        for (const place of placesToDelete) {
          const response = await fetch(`/salon/places/${place.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          })
          
          if (!response.ok) {
            throw new Error(`Ошибка удаления места ${place.name}`)
          }
        }
      }
      
      // Перезагружаем места
      await loadPlaces()
      alert(`Количество мест для филиала обновлено: ${targetCount}`)
      
    } catch (error) {
      console.error('Ошибка обновления количества мест:', error)
      alert(`Ошибка: ${error.message}`)
    }
  }



  // Создание места
  const handleCreatePlace = async ({ name, branch_id }) => {
    setCreating(true)
    try {
      // Проверяем, что филиал указан
      if (!branch_id) {
        throw new Error('Филиал обязателен для создания места')
      }
      
      // Проверяем, что филиал существует
      const branchExists = branches.find(b => b.id === branch_id)
      if (!branchExists) {
        throw new Error('Выбран несуществующий филиал')
      }
      
      const placeData = {
        name,
        branch_id: branch_id,
        position_x: 0,
        position_y: 0,
        width: 100,
        height: 100,
        capacity: 1,
        is_active: true
      }
      const response = await fetch('/salon/places', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(placeData)
      })
      if (!response.ok) throw new Error('Ошибка создания места')
      setCreateModalOpen(false)
      await loadPlaces()
    } catch (e) {
      alert(e.message || 'Ошибка')
    } finally {
      setCreating(false)
    }
  }

  // Обработчики для списка мест
  const handleViewSchedule = (place) => {
    setSelectedPlace(place)
    setCalendarModalOpen(true)
  }

  const handleEditPlace = (place) => {
    // TODO: Реализовать редактирование места
    alert(`Редактирование места: ${place.name}`)
  }

  const handleDeletePlace = async (place) => {
    if (!confirm(`Удалить место "${place.name}"?`)) return
    
    try {
      const response = await fetch(`/salon/places/${place.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (!response.ok) throw new Error('Ошибка удаления места')
      await loadPlaces()
      setCalendarModalOpen(false)
      setSelectedPlace(null)
    } catch (e) {
      alert(e.message || 'Ошибка удаления')
    }
  }

  // Обработчик клика по месту на схеме
  const handlePlaceClick = (place) => {
    setSelectedPlace(place)
    setCalendarModalOpen(true)
  }

  if (!user || !salon) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Управление местами</h1>
            <p className="text-gray-600">
              {selectedBranch 
                ? `Места в филиале "${branches.find(b => b.id === selectedBranch)?.name}"`
                : 'Все места салона'
              }
            </p>
          </div>
          <Button
            onClick={() => setCreateModalOpen(true)}
          >
            Создать место
          </Button>
        </div>

        {/* Фильтры */}
        <div className="mb-6 flex gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Выберите филиал:
            </label>
            <select
              value={selectedBranch || ''}
              onChange={(e) => setSelectedBranch(e.target.value ? parseInt(e.target.value) : null)}
              className="border rounded-lg px-3 py-2 min-w-[200px]"
            >
              <option value="">Все филиалы</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          {selectedBranch && (
            <Button
              onClick={() => setSelectedBranch(null)}
              variant="secondary"
              size="sm"
            >
              Сбросить фильтр
            </Button>
          )}
        </div>

        {/* Статистика и управление местами по филиалам */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Статистика мест по филиалам</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="space-y-4">
              {branches.map((branch, index) => (
                <div key={branch.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-[#DFF5EC] rounded-full flex items-center justify-center">
                      <span className="text-[#4CAF50] font-semibold">{index + 1}</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{branch.name}</h3>
                      <p className="text-sm text-gray-500">{branch.address}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-700">
                      Количество мест: <span className="text-[#4CAF50] font-semibold">{branchPlacesCount[branch.id] || 0}</span>
                    </span>
                  </div>
                </div>
              ))}
              

            </div>
          </div>
        </div>

        {/* Список мест */}
        <div className="mb-6">
          <PlacesList 
            places={places}
            onViewSchedule={handleViewSchedule}
            onEdit={handleEditPlace}
            onDelete={handleDeletePlace}
            selectedBranch={selectedBranch}
            branches={branches}
          />
        </div>

        {/* Схема салона */}
        <div className="mb-6">
          <SalonLayout 
            places={places} 
            branches={branches} 
            onPlaceClick={handlePlaceClick}
          />
        </div>


      </div>
      <PlaceCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreatePlace}
        branches={branches}
      />
      <PlaceCalendarModal
        isOpen={calendarModalOpen}
        onClose={() => {
          setCalendarModalOpen(false)
          setSelectedPlace(null)
        }}
        place={selectedPlace}
        onEdit={handleEditPlace}
        onDelete={handleDeletePlace}
        salonScheduleData={scheduleData}
        workingHours={salon?.working_hours ? JSON.parse(salon.working_hours) : null}
      />
    </div>
  )
} 