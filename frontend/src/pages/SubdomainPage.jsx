import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSubdomain, getOwnerTypeBySubdomain, getOwnerIdBySubdomain } from '../utils/domainUtils'
import { WorkingHoursShort, WorkingHoursFull, WorkingHoursCompact } from '../components/WorkingHours'
import AuthModal from '../modals/AuthModal'
import { getImageUrl } from '../utils/config'
import SalonBookingModule from '../components/booking/SalonBookingModule'
import MasterBookingModule from '../components/booking/MasterBookingModule'

export default function SubdomainPage() {
  const { subdomain } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ownerInfo, setOwnerInfo] = useState(null)
  const [ownerType, setOwnerType] = useState(null)
  const [ownerId, setOwnerId] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    loadOwnerInfo()
    checkCurrentUser()
    
    // Очищаем цвет при размонтировании компонента
    return () => {
      document.body.style.backgroundColor = ''
      document.body.style.background = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain])

  const checkCurrentUser = () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const exp = payload.exp * 1000
        const now = Date.now()
        
        if (now < exp) {
          // Токен действителен, получаем информацию о пользователе
          fetch('/auth/users/me', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          .then(res => res.json())
          .then(data => {
            console.log('Получены данные пользователя:', data)
            if (data.id) {
              setCurrentUser(data)
            }
          })
          .catch(() => {
            localStorage.removeItem('access_token')
            setCurrentUser(null)
          })
        } else {
          localStorage.removeItem('access_token')
          setCurrentUser(null)
        }
      } catch {
        localStorage.removeItem('access_token')
        setCurrentUser(null)
      }
    }
  }

  const loadOwnerInfo = async () => {
    setLoading(true)
    setError(null)

    try {
      console.log('Загружаем информацию для поддомена:', subdomain)
      const url = `/api/domain/${subdomain}/info`
      console.log('URL запроса:', url)
      
      // Получаем информацию о владельце поддомена
      const response = await fetch(url)
      console.log('Статус ответа:', response.status)
      
      if (!response.ok) {
        console.error('Ошибка HTTP:', response.status, response.statusText)
        if (response.status === 404) {
          setError('Поддомен не найден')
        } else {
          setError(`Ошибка загрузки информации о поддомене: ${response.status}`)
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      console.log('Полученные данные для поддомена:', data)
      console.log('background_color в данных:', data.background_color)
      setOwnerInfo(data)
      setOwnerType(data.owner_type)
      setOwnerId(data.owner_id)
      
      // Применяем цвет к body элементу
      if (data.background_color) {
        document.body.style.backgroundColor = data.background_color
        document.body.style.background = data.background_color
        console.log('Применен цвет к body:', data.background_color)
      }

    } catch (error) {
      console.error('Ошибка загрузки информации о поддомене:', error)
      setError(`Ошибка сети при загрузке информации: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleBookingSuccess = (result) => {
    console.log('Запись успешно создана:', result)
    // Можно показать уведомление или сделать редирект
  }

  const handleBookingError = (error) => {
    console.error('Ошибка при создании записи:', error)
    // Можно показать уведомление об ошибке
  }

  const handleLogin = () => {
    setShowAuthModal(true)
  }

  const getDashboardPath = () => {
    if (!currentUser) return '/'
    switch (currentUser.role) {
      case 'CLIENT': return '/client'
      case 'MASTER': return '/master'
      case 'SALON': return '/salon'
      case 'ADMIN': return '/admin'
      case 'INDIE': return '/master'
      case 'MODERATOR': return '/admin'
      default: return '/'
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setCurrentUser(null)
  }

  const handleAuthClose = () => {
    setShowAuthModal(false)
    // Принудительно проверяем пользователя после закрытия модального окна
    setTimeout(() => {
      checkCurrentUser()
    }, 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F7F6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка информации о поддомене...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F9F7F6] flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg max-w-md">
            <h2 className="text-xl font-bold mb-2">Ошибка</h2>
            <p className="mb-4">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!ownerInfo) {
    return (
      <div className="min-h-screen bg-[#F9F7F6] flex items-center justify-center">
        <div className="text-center">
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg max-w-md">
            <h2 className="text-xl font-bold mb-2">Поддомен не найден</h2>
            <p className="mb-4">Поддомен "{subdomain}" не зарегистрирован в системе</p>
            <button
              onClick={() => navigate('/')}
              className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen"
      style={{ 
        backgroundColor: ownerInfo.background_color || '#ffffff'
      }}
    >
      {console.log('Рендер SubdomainPage, background_color:', ownerInfo.background_color)}
      {/* Кнопки авторизации в правом верхнем углу */}
      <div className="absolute top-4 right-4 z-10">
        <div className="flex items-center space-x-2">
          {console.log('currentUser в рендере:', currentUser)}
          {currentUser ? (
            <>
              <button
                onClick={() => navigate(getDashboardPath())}
                className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition whitespace-nowrap"
              >
                Личный кабинет
              </button>
              <button 
                onClick={handleLogout} 
                className="bg-red-500 text-white px-3 py-2 rounded text-sm font-semibold hover:bg-red-600 transition"
              >
                Выход
              </button>
            </>
          ) : (
            <button 
              className="bg-gray-200 text-blue-700 px-3 py-2 rounded text-sm font-semibold hover:bg-blue-100 transition whitespace-nowrap" 
              onClick={handleLogin}
            >
              Вход / Регистрация
            </button>
          )}
        </div>
      </div>

      {/* Заголовок с информацией о владельце */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              {ownerInfo.logo && (
                <img 
                  src={getImageUrl(ownerInfo.logo)}
                  alt={`Логотип ${ownerInfo.name}`}
                  className="w-16 h-16 rounded-lg object-cover mr-4"
                />
              )}
              <h1 className="text-3xl font-bold text-gray-900">
                {ownerInfo.name}
              </h1>
            </div>
            {ownerInfo.description && (
              <p className="text-gray-600 text-lg mb-4">
                {ownerInfo.description}
              </p>
            )}
            {ownerInfo.city && (
              <p className="text-gray-500">
                📍 {ownerInfo.city}
                {ownerInfo.address && ownerType === 'master' && (
                  <span className="ml-2">• {ownerInfo.address}</span>
                )}
              </p>
            )}
            {ownerInfo.working_hours && (
              <div className="mt-2">
                <WorkingHoursShort 
                  workingHours={ownerInfo.working_hours}
                  showStatus={true}
                  showSchedule={false}
                  className="text-sm"
                  timezone={ownerInfo.timezone || 'Europe/Moscow'}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модуль записи */}
      <div className="py-8">
        <div className="max-w-2xl mx-auto px-4">
          {ownerType === 'salon' && ownerId && (
            <SalonBookingModule
              salonId={ownerId}
              onBookingSuccess={handleBookingSuccess}
              onBookingError={handleBookingError}
              title={`Запись в ${ownerInfo.name}`}
              showUserInfo={true}
            />
          )}
          
          {ownerType === 'master' && ownerId && (
            <MasterBookingModule
              masterId={ownerId}
              onBookingSuccess={handleBookingSuccess}
              onBookingError={handleBookingError}
              title={`Запись к ${ownerInfo.name}`}
              showUserInfo={true}
            />
          )}
        </div>
      </div>

      {/* Виджет Яндекс.Карт */}
      {ownerInfo.yandex_maps_widget && (
        <div>
          <div className="max-w-4xl mx-auto px-4 py-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Отзывы
            </h3>
            <div 
              className="w-full h-96 rounded-lg overflow-hidden"
              dangerouslySetInnerHTML={{ __html: ownerInfo.yandex_maps_widget }}
            />
          </div>
        </div>
      )}

      {/* Дополнительная информация */}
      <div className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Контактная информация */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Контактная информация
              </h3>
              <div className="space-y-2 text-gray-600">
                {ownerInfo.phone && (
                  <p>📞 {ownerInfo.phone}</p>
                )}
                {ownerInfo.email && (
                  <p>✉️ {ownerInfo.email}</p>
                )}
                {ownerInfo.website && (
                  <p>🌐 <a href={ownerInfo.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {ownerInfo.website}
                  </a></p>
                )}
                {ownerInfo.instagram && (
                  <p>📷 <a href={`https://instagram.com/${ownerInfo.instagram}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    @{ownerInfo.instagram}
                  </a></p>
                )}
              </div>
            </div>

            {/* Часы работы */}
            {ownerInfo.working_hours && (
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  Часы работы
                </h3>
                <WorkingHoursCompact 
                  workingHours={ownerInfo.working_hours}
                  showStatus={true}
                  className="text-gray-600"
                  timezone={ownerInfo.timezone || 'Europe/Moscow'}
                />
              </div>
            )}

            {/* Как нас найти */}
            {(ownerInfo.address || (ownerInfo.city && ownerType === 'master')) && (
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  Как нас найти
                </h3>
                <div className="space-y-2 text-gray-600">
                  {ownerInfo.address && (
                    <p>📍 {ownerInfo.address}</p>
                  )}
                  {ownerInfo.city && ownerType === 'master' && !ownerInfo.address && (
                    <p>📍 {ownerInfo.city}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно авторизации */}
      <AuthModal open={showAuthModal} onClose={handleAuthClose} />
    </div>
  )
} 