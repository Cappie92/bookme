import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
// AUTH_LOGIN_SUCCESS / AUTH_REGISTER_SUCCESS не вызывать здесь — только authReachGoals.js из AuthModal
import { metrikaGoal } from '../analytics/metrika'
import { M } from '../analytics/metrikaEvents'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalType, setAuthModalType] = useState('client')
  /** 'login' | 'register' — начальная вкладка при открытии. После применения сбрасывается. */
  const [authModalInitialTab, setAuthModalInitialTab] = useState(null)
  /** Режим редиректа после логина: 'default' — в кабинет по роли, 'stay'|'returnTo' — остаться / перейти на returnToPath. Сбрасывается после применения. */
  const [authModalRedirectMode, setAuthModalRedirectMode] = useState('default')
  const [authModalReturnToPath, setAuthModalReturnToPath] = useState(null)
  /** Контекст открытия (аналитика/будущее); автосоздание брони на /m/:slug решает по sessionStorage draft + TTL в PublicBookingWizard, не по этому полю. Сбрасывается при закрытии модалки. */
  const [authModalFlow, setAuthModalFlow] = useState('default')
  const navigate = useNavigate()
  const wasAuthModalOpen = useRef(false)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  }

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('access_token')
    
    if (!token) {
      setIsAuthenticated(false)
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/users/me', {
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setIsAuthenticated(true)
        if (userData.role) localStorage.setItem('user_role', userData.role)
        if (userData.phone !== '+79990009999') {
          localStorage.removeItem('demo_mode')
        }
      } else {
        // 401/403 — не авторизован, не логируем и не ретраим
        if (response.status !== 401 && response.status !== 403) {
          console.error('checkAuthStatus:', response.status, response.statusText)
        }
        localStorage.removeItem('access_token')
        setIsAuthenticated(false)
        setUser(null)
      }
    } catch (error) {
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('demo_mode')
    localStorage.removeItem('new_client_setup')
    localStorage.removeItem('existing_client_verification')
    setIsAuthenticated(false)
    setUser(null)
    navigate('/')
  }

  const login = (userData) => {
    setUser(userData)
    setIsAuthenticated(true)
  }

  /**
   * @param {string} type - 'client' | 'master' | 'salon'
   * @param {string|null} initialTab - 'login' | 'register' для начальной вкладки
   * @param {{ redirectMode?: 'default'|'stay'|'returnTo', returnToPath?: string, flow?: 'default'|'publicBookingConfirm' }} options - redirectMode после логина; flow — метка сценария (см. PublicBookingWizard + draft TTL)
   */
  const openAuthModal = (type = 'client', initialTab = null, options = {}) => {
    setAuthModalType(type)
    setAuthModalInitialTab(initialTab ?? null)
    setAuthModalRedirectMode(options.redirectMode ?? 'default')
    setAuthModalReturnToPath(options.returnToPath ?? null)
    setAuthModalFlow(options.flow ?? 'default')
    setAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setAuthModalOpen(false)
    setAuthModalFlow('default')
  }

  useEffect(() => {
    checkAuthStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (authModalOpen && !wasAuthModalOpen.current) {
      metrikaGoal(M.AUTH_MODAL_OPEN, {
        type: authModalType,
        tab: authModalInitialTab,
        flow: authModalFlow,
      })
    }
    wasAuthModalOpen.current = authModalOpen
  }, [authModalOpen, authModalType, authModalInitialTab, authModalFlow])

  const value = {
    isAuthenticated,
    user,
    loading,
    getAuthHeaders,
    logout,
    login,
    checkAuthStatus,
    openAuthModal,
    closeAuthModal,
    authModalOpen,
    authModalType,
    authModalInitialTab,
    setAuthModalInitialTab,
    authModalRedirectMode,
    authModalReturnToPath,
    setAuthModalRedirectMode,
    setAuthModalReturnToPath,
    authModalFlow,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 