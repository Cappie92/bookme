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

export default function ClientFavorite() {
  const [favorites, setFavorites] = useState({
    salons: [],
    masters: [],
    indieMasters: [],
    services: []
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('salons')
  const navigate = useNavigate()

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
  }, [navigate])

  const loadFavorites = async () => {
    try {
      setLoading(true)
      
      // Загружаем избранные салоны
      const salonsResponse = await fetch('/client/favorites/salons', {
        headers: getAuthHeaders()
      })
      if (salonsResponse.ok) {
        const salonsData = await salonsResponse.json()
        setFavorites(prev => ({ ...prev, salons: salonsData }))
      }

      // Загружаем избранных мастеров
      const mastersResponse = await fetch('/client/favorites/masters', {
        headers: getAuthHeaders()
      })
      if (mastersResponse.ok) {
        const mastersData = await mastersResponse.json()
        setFavorites(prev => ({ ...prev, masters: mastersData }))
      }

      // Загружаем избранных индивидуальных мастеров
      const indieMastersResponse = await fetch('/client/favorites/indie-masters', {
        headers: getAuthHeaders()
      })
      if (indieMastersResponse.ok) {
        const indieMastersData = await indieMastersResponse.json()
        setFavorites(prev => ({ ...prev, indieMasters: indieMastersData }))
      }

      // Загружаем избранные услуги
      const servicesResponse = await fetch('/client/favorites/services', {
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
      const response = await fetch(`/client/favorites/${type}/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        // Обновляем локальное состояние
        setFavorites(prev => ({
          ...prev,
          [type]: prev[type].filter(item => item.id !== id)
        }))
      }
    } catch (error) {
      console.error('Ошибка при удалении из избранного:', error)
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
      case 'indieMasters':
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
    { id: 'indieMasters', name: 'Индивидуальные мастера', count: favorites.indieMasters.length, icon: UserIcon },
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
                favorites.masters.map((master) => (
                  <div key={master.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {master.user?.full_name || 'Мастер'}
                          </h3>
                          {master.city && (
                            <p className="text-gray-600 flex items-center mb-2">
                              <MapPinIcon className="h-4 w-4 mr-1" />
                              {master.city}
                            </p>
                          )}
                          {master.bio && (
                            <p className="text-gray-500 text-sm line-clamp-2">
                              {master.bio}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromFavorites('masters', master.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <button
                        onClick={() => navigateToItem('masters', master)}
                        className="mt-4 w-full bg-[#4CAF50] text-white py-2 px-4 rounded-md hover:bg-[#45A049] transition-colors"
                      >
                        Перейти к мастеру
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Индивидуальные мастера */}
          {activeTab === 'indieMasters' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.indieMasters.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">У вас пока нет избранных индивидуальных мастеров</p>
                </div>
              ) : (
                favorites.indieMasters.map((master) => (
                  <div key={master.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {master.user?.full_name || 'Индивидуальный мастер'}
                          </h3>
                          {master.city && (
                            <p className="text-gray-600 flex items-center mb-2">
                              <MapPinIcon className="h-4 w-4 mr-1" />
                              {master.city}
                            </p>
                          )}
                          {master.bio && (
                            <p className="text-gray-500 text-sm line-clamp-2">
                              {master.bio}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromFavorites('indieMasters', master.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <button
                        onClick={() => navigateToItem('indieMasters', master)}
                        className="mt-4 w-full bg-[#4CAF50] text-white py-2 px-4 rounded-md hover:bg-[#45A049] transition-colors"
                      >
                        Перейти к мастеру
                      </button>
                    </div>
                  </div>
                ))
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
