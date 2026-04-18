import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSubdomain, getOwnerTypeBySubdomain, getOwnerIdBySubdomain } from '../utils/domainUtils'
import { WorkingHoursShort, WorkingHoursFull, WorkingHoursCompact } from '../components/WorkingHours'
import AuthModal from '../modals/AuthModal'
import Header from '../components/Header'
import Footer from '../components/Footer'
import SalonBookingModule from '../components/booking/SalonBookingModule'
import MasterBookingModule from '../components/booking/MasterBookingModule'
import MasterBookingSidebar from '../components/booking/MasterBookingSidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import YandexMap from '../components/YandexMap'


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
  const [bookingsLimit, setBookingsLimit] = useState(null)
  const [loadingLimit, setLoadingLimit] = useState(true)

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

  useEffect(() => {
    if (subdomain && (ownerType === 'master' || ownerType === 'indie_master')) {
      loadBookingsLimit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain, ownerType])

  const loadBookingsLimit = async () => {
    if (!subdomain) return
    
    setLoadingLimit(true)
    try {
      const response = await fetch(`/api/domain/${subdomain}/bookings-limit`)
      if (response.ok) {
        const data = await response.json()
        setBookingsLimit(data)
      }
    } catch (err) {
      console.error('Ошибка загрузки лимита записей:', err)
    } finally {
      setLoadingLimit(false)
    }
  }

  const checkCurrentUser = () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const exp = payload.exp * 1000
        const now = Date.now()
        
        if (now < exp) {
          // Токен действителен, получаем информацию о пользователе
          fetch('/api/auth/users/me', {
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
      console.log('owner_type:', data.owner_type)
      console.log('owner_id:', data.owner_id)
      console.log('name:', data.name)
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
    // Перенаправляем на страницу 404
    navigate('/404', { replace: true })
    return null
  }

  if (!ownerInfo) {
    // Перенаправляем на страницу 404
    navigate('/404', { replace: true })
    return null
  }

  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{ 
        backgroundColor: ownerInfo.background_color || '#ffffff'
      }}
    >
      {/* Стандартный Header */}
      <Header />

      {/* Основной контент */}
      <main className="flex-grow pt-24 flex">
        {/* Сайдбар (только для мастеров) */}
        {(ownerType === 'master' || ownerType === 'indie_master') && (
          <MasterBookingSidebar
            ownerInfo={ownerInfo}
            ownerType={ownerType}
            ownerId={ownerId}
            currentUser={currentUser}
          />
        )}

        {/* Модуль записи и дополнительная информация */}
        <div className="flex-1 flex flex-col">
          {/* Модуль записи */}
          <div className={`py-8 ${(ownerType === 'master' || ownerType === 'indie_master') ? 'md:ml-64' : ''}`}>
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
              
              {(ownerType === 'master' || ownerType === 'indie_master') && ownerId && (
                <>
                  {!loadingLimit && bookingsLimit && bookingsLimit.is_limit_exceeded ? (
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                      <div className="text-center py-8">
                        <div className="mb-4">
                          <svg className="w-16 h-16 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          У мастера нет доступных слотов для записи
                        </h3>
                        <p className="text-gray-600">
                          Достигнут лимит активных записей. Попробуйте записаться позже.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ErrorBoundary
                      fallbackTestId="public-error"
                      message="Ошибка загрузки формы записи. Попробуйте обновить страницу."
                      fallback={
                        <div data-testid="public-error" className="bg-white rounded-lg shadow-lg p-8">
                          <h1 className="text-3xl font-bold text-gray-900 mb-4" data-testid="public-master-name">
                            Запись к {ownerInfo?.name || 'мастеру'}
                          </h1>
                          <p className="text-amber-800">Ошибка загрузки формы записи. Попробуйте обновить страницу.</p>
                        </div>
                      }
                    >
                      <MasterBookingModule
                        masterId={ownerId}
                        ownerType={ownerType}
                        onBookingSuccess={handleBookingSuccess}
                        onBookingError={handleBookingError}
                        title={`Запись к ${ownerInfo.name}`}
                        showUserInfo={true}
                      />
                    </ErrorBoundary>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Карта Яндекс.Карт */}
          {ownerInfo.address && (
            <YandexMap 
              address={ownerInfo.address} 
              name={ownerInfo.name}
            />
          )}
        </div>
      </main>

      {/* Footer - заходит на сайдбар как Header */}
      <Footer />

      {/* Модальное окно авторизации */}
      <AuthModal open={showAuthModal} onClose={handleAuthClose} />
    </div>
  )
} 