import { useState, useEffect } from 'react'
import { apiGet } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

export function useMasterSubscription() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [features, setFeatures] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Пока auth загружается — ничего не делаем
    if (authLoading) {
      return
    }

    // Если пользователь не авторизован — сбрасываем состояние
    if (!isAuthenticated) {
      setFeatures(null)
      setLoading(false)
      setError(null)
      return
    }

    // Если пользователь авторизован — загружаем features
    loadFeatures()
  }, [authLoading, isAuthenticated])

  const loadFeatures = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const data = await apiGet('/api/master/subscription/features')
      setFeatures(data)
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        // Токен недействителен - очищаем и не показываем ошибку (AuthContext обработает)
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        setLoading(false)
      } else if (status === 409) {
        // SCHEMA_OUTDATED
        const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
        if (errorCode === 'SCHEMA_OUTDATED') {
          const errorData = err.response?.data || {}
          const detail = errorData.detail || 'Схема базы данных устарела'
          const hint = errorData.hint || 'Run alembic upgrade head'
          setError(`${detail}. ${hint}`)
        } else {
          setError('Не удалось загрузить информацию о подписке')
        }
      } else {
        setError('Не удалось загрузить информацию о подписке')
      }
      console.error('Ошибка при загрузке функций подписки:', err)
    } finally {
      setLoading(false)
    }
  }

  return {
    features,
    loading,
    error,
    refresh: loadFeatures,
    hasBookingPage: features?.has_booking_page || false,
    hasUnlimitedBookings: features?.has_unlimited_bookings || false,
    hasExtendedStats: features?.has_extended_stats || false,
    hasLoyaltyAccess: features?.has_loyalty_access || false,
    hasFinanceAccess: features?.has_finance_access || false,
    hasClientRestrictions: features?.has_client_restrictions || false,
    hasClientsAccess: features?.has_clients_access || false,
    canCustomizeDomain: features?.can_customize_domain || false,
    maxPageModules: features?.max_page_modules || 0,
    currentPageModules: features?.current_page_modules || 0,
    canAddMoreModules: features?.can_add_more_modules || false,
    planName: features?.plan_name || null,
    // Обратная совместимость (можно удалить после обновления всех мест использования)
    canAddPageModules: false
  }
}

