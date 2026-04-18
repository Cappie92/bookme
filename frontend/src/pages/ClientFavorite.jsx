import React, { useState, useEffect } from 'react'
import { useNavigate } from "react-router-dom"
import { 
  HeartIcon, 
  TrashIcon, 
  StarIcon,
  MapPinIcon,
  ClockIcon,
  BanknotesIcon,
  UserIcon,
  BuildingStorefrontIcon
} from "@heroicons/react/24/outline"
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid"
import FavoriteButton from '../components/FavoriteButton'
import { useFavorites } from '../contexts/FavoritesContext'

export default function ClientFavorite() {
  const [favorites, setFavorites] = useState({
    salons: [],
    masters: [],
    services: []
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('salons')
  const navigate = useNavigate()
  const { changeCounter } = useFavorites()
  const [pointsSummary, setPointsSummary] = useState({})

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
    return headers
  }

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      navigate('/')
      return
    }

    loadFavorites()
    loadPointsSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // Автоматически перезагружаем список при изменении контекста избранного
  useEffect(() => {
    // Проверяем, есть ли изменения в контексте
    // Если контекст обновился (добавилось или удалилось избранное), перезагружаем список
    const checkForChanges = () => {
      // Простая проверка: если размер Map изменился, перезагружаем
      // Это не идеально, но работает для большинства случаев
      loadFavorites()
    }

    // Используем небольшую задержку, чтобы избежать лишних запросов
    const timeoutId = setTimeout(checkForChanges, 500)
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeCounter])

  const loadPointsSummary = async () => {
    try {
      const response = await fetch('/api/client/loyalty/points/summary', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        // Преобразуем в объект с master_id как ключ
        const summaryObj = {}
        data.forEach(item => {
          summaryObj[item.master_id] = item.total_points
        })
        setPointsSummary(summaryObj)
      }
    } catch (error) {
      console.error('Ошибка при загрузке баллов:', error)
    }
  }

  const loadFavorites = async () => {
    try {
      setLoading(true)
      
      // Загружаем избранные салоны
      const salonsResponse = await fetch('/api/client/favorites/salons', {
        headers: getAuthHeaders()
      })
      if (salonsResponse.ok) {
        const salonsData = await salonsResponse.json()
        setFavorites(prev => ({ ...prev, salons: salonsData }))
      }

      // Загружаем избранных мастеров
      const mastersResponse = await fetch('/api/client/favorites/masters', {
        headers: getAuthHeaders()
      })
      if (mastersResponse.ok) {
        const mastersData = await mastersResponse.json()
        setFavorites(prev => ({ ...prev, masters: mastersData }))
      }

      // Загружаем избранные услуги
      const servicesResponse = await fetch('/api/client/favorites/services', {
        headers: getAuthHeaders()
      })
      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json()
        setFavorites(prev => ({ ...prev, services: servicesData }))
      }

    } catch (error) {
      console.error('Ошибка при загрузке избранного:', error)
    } finally {
      setLoading(false)
    }
  }

  const removeFromFavorites = async (type, id) => {
    try {
      // Преобразуем тип для API
      const apiType = type
      
      const response = await fetch(`/api/client/favorites/${apiType}/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        // Обновляем локальное состояние
        setFavorites(prev => ({
          ...prev,
          [type]: prev[type].filter(item => {
            if (type === 'masters') {
              return item.master_id !== id
            } else if (type === 'salons') {
              return item.salon_id !== id
            } else if (type === 'services') {
              return item.service_id !== id
            }
            return (item.client_favorite_id || item.id) !== id
          })
        }))
      }
    } catch (error) {
      console.error('Ошибка при удалении из избранного:', error)
    }
  }

  // Обработчик изменения избранного через FavoriteButton
  const handleFavoriteChange = (type, itemId, isFavorite) => {
    if (!isFavorite) {
      // Удаление: фильтруем массив
      const localType =
        type === 'master'
          ? 'masters'
          : type === 'salon'
            ? 'salons'
            : type === 'service'
              ? 'services'
              : null
      if (!localType) return

      setFavorites(prev => ({
        ...prev,
        [localType]: prev[localType].filter(item => {
          if (type === 'master') {
            return item.master_id !== itemId
          } else if (type === 'salon') {
            return item.salon_id !== itemId
          } else if (type === 'service') {
            return item.service_id !== itemId
          }
          return (item.client_favorite_id || item.id) !== itemId
        })
      }))
    } else {
      // Добавление: перезагружаем список для получения полных данных
      loadFavorites()
    }
  }

  const navigateToItem = (type, item) => {
    switch (type) {
      case 'salons':
        navigate(`/profile/${item.domain}`)
        break
      case 'masters':
        navigate(`/profile/${item.domain}`)
        break
      case 'services':
        // Для услуг можно перейти к мастеру или салону
        if (item.indie_master_id) {
          navigate(`/profile/${item.indie_master?.domain}`)
        } else if (item.salon_id) {
          navigate(`/profile/${item.salon?.domain}`)
        }
        break
      default:
        break
    }
  }

  const tabs = [
    { id: 'salons', name: 'Салоны красоты', count: favorites.salons.length, icon: BuildingStorefrontIcon },
    { id: 'masters', name: 'Мастера', count: favorites.masters.length, icon: UserIcon },
    { id: 'services', name: 'Услуги', count: favorites.services.length, icon: StarIcon }
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto"></div>
            <p className="mt-4 text-gray-600">Загрузка избранного...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <HeartIconSolid className="h-8 w-8 text-red-500 mr-3" />
            Избранное
          </h1>
          <p className="mt-2 text-gray-600">
            Ваши любимые салоны, мастера и услуги
          </p>
        </div>

        {/* Табы */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-[#4CAF50] text-[#4CAF50]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.name}
                <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Контент табов */}
        <div className="space-y-6">
          {/* Салоны красоты */}
          {activeTab === 'salons' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.salons.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <BuildingStorefrontIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">У вас пока нет избранных салонов</p>
                </div>
              ) : (
                favorites.salons.map((salon) => (
                  <div key={salon.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {salon.name}
                          </h3>
                          {salon.city && (
                            <p className="text-gray-600 flex items-center mb-2">
                              <MapPinIcon className="h-4 w-4 mr-1" />
                              {salon.city}
                            </p>
                          )}
                          {salon.description && (
                            <p className="text-gray-500 text-sm line-clamp-2">
                              {salon.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromFavorites('salons', salon.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <button
                        onClick={() => navigateToItem('salons', salon)}
                        className="mt-4 w-full bg-[#4CAF50] text-white py-2 px-4 rounded-md hover:bg-[#45A049] transition-colors"
                      >
                        Перейти к салону
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Мастера */}
          {activeTab === 'masters' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.masters.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">У вас пока нет избранных мастеров</p>
                </div>
              ) : (
                favorites.masters.map((favorite) => {
                  const master = favorite.master
                  const masterId = favorite.master_id
                  return (
                    <div key={favorite.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                              <span>{master?.user?.full_name || favorite.favorite_name || 'Мастер'}</span>
                              <FavoriteButton
                                type="master"
                                itemId={masterId}
                                itemName={master?.user?.full_name || favorite.favorite_name || 'Мастер'}
                                size="sm"
                                onFavoriteChange={handleFavoriteChange}
                              />
                            </h3>
                            {master?.city && (
                              <p className="text-gray-600 flex items-center mb-2">
                                <MapPinIcon className="h-4 w-4 mr-1" />
                                {master.city}
                              </p>
                            )}
                            {pointsSummary[masterId] > 0 && (
                              <p className="text-[#4CAF50] font-medium text-sm mb-2">
                                🎁 {pointsSummary[masterId]} баллов
                              </p>
                            )}
                            {master?.bio && (
                              <p className="text-gray-500 text-sm line-clamp-2">
                                {master.bio}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removeFromFavorites('masters', masterId)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                        <button
                          onClick={() => navigateToItem('masters', { ...master, domain: master?.domain })}
                          className="mt-4 w-full bg-[#4CAF50] text-white py-2 px-4 rounded-md hover:bg-[#45A049] transition-colors"
                        >
                          Перейти к мастеру
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Услуги */}
          {activeTab === 'services' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.services.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <StarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">У вас пока нет избранных услуг</p>
                </div>
              ) : (
                favorites.services.map((service) => (
                  <div key={service.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {service.name}
                          </h3>
                          <div className="space-y-2 mb-3">
                            <p className="text-gray-600 flex items-center">
                              <BanknotesIcon className="h-4 w-4 mr-1" />
                              {service.price} ₽
                            </p>
                            <p className="text-gray-600 flex items-center">
                              <ClockIcon className="h-4 w-4 mr-1" />
                              {service.duration} мин
                            </p>
                          </div>
                          {service.description && (
                            <p className="text-gray-500 text-sm line-clamp-2">
                              {service.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromFavorites('services', service.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <button
                        onClick={() => navigateToItem('services', service)}
                        className="mt-4 w-full bg-[#4CAF50] text-white py-2 px-4 rounded-md hover:bg-[#45A049] transition-colors"
                      >
                        Перейти к услуге
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
