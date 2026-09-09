import React, { createContext, useContext, useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
// AUTH_LOGIN_SUCCESS / AUTH_REGISTER_SUCCESS не вызывать здесь — только authReachGoals.js из AuthModal
import { metrikaGoal } from '../analytics/metrika'
import { M } from '../analytics/metrikaEvents'

import { authPermissions, createAuthSession } from '../utils/authSession'

const AuthContext = createContext()
const serverStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

export function AuthProvider({ children }) {
  const sessionRef = useRef(null)
  if (!sessionRef.current) sessionRef.current = createAuthSession({
    storage: typeof window === 'undefined' ? serverStorage : window.localStorage,
    tabStorage: typeof window === 'undefined' ? serverStorage : window.sessionStorage,
    fetcher: (...args) => fetch(...args),
    path: typeof window === 'undefined' ? '/' : window.location.pathname,
    search: typeof window === 'undefined' ? '' : window.location.search,
  })
  const session = sessionRef.current
  const authState = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const { isAuthenticated, loading, isIosAppWebSession, isIosRestrictedContext, commerceAllowed } = authPermissions(authState)
  const user = authState.user
  const webSessionOrigin = user?.web_session_origin || null
  const checkAuthStatus = session.check
  const login = session.login
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalType, setAuthModalType] = useState('client')
  /** 'login' | 'register' — начальная вкладка при открытии. После применения сбрасывается. */
  const [authModalInitialTab, setAuthModalInitialTab] = useState(null)
  /** Режим редиректа после логина: 'default' — в кабинет по роли, 'stay'|'returnTo' — остаться / перейти на returnToPath. Сбрасывается после применения. */
  const [authModalRedirectMode, setAuthModalRedirectMode] = useState('default')
  const [authModalReturnToPath, setAuthModalReturnToPath] = useState(null)
  /** Контекст открытия (аналитика/будущее); автосоздание брони на /m/:slug решает по sessionStorage draft + TTL в PublicBookingWizard, не по этому полю. Сбрасывается при закрытии модалки. */
  const [authModalFlow, setAuthModalFlow] = useState('default')
  const [authModalInitialForm, setAuthModalInitialForm] = useState(null)
  const navigate = useNavigate()
  const wasAuthModalOpen = useRef(false)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('demo_mode')
    localStorage.removeItem('new_client_setup')
    localStorage.removeItem('existing_client_verification')
    sessionStorage.removeItem('dedato_web_session_origin')
    session.logout()
    navigate('/')
  }

  /**
   * @param {string} type - 'client' | 'master' | 'salon'
   * @param {string|null} initialTab - 'login' | 'register' для начальной вкладки
   * @param {{ redirectMode?: 'default'|'stay'|'returnTo', returnToPath?: string, flow?: 'default'|'publicBookingConfirm' }} options - redirectMode после логина; flow — метка сценария (см. PublicBookingWizard + draft TTL)
   */
  const openAuthModal = (type = 'client', initialTab = null, options = {}) => {
    if (isIosRestrictedContext) return
    setAuthModalType(type)
    setAuthModalInitialTab(initialTab ?? null)
    setAuthModalRedirectMode(options.redirectMode ?? 'default')
    setAuthModalReturnToPath(options.returnToPath ?? null)
    setAuthModalFlow(options.flow ?? 'default')
    setAuthModalInitialForm(options.initialForm ?? null)
    setAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setAuthModalOpen(false)
    setAuthModalFlow('default')
  }

  useEffect(() => {
    if (window.location.pathname !== '/auth/mobile-handoff') session.check()
    const onStorage = (event) => {
      if (event.key === 'access_token' || event.key === null) session.sync()
    }
    const onFocus = () => session.sync()
    const onLogout = () => session.check()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    window.addEventListener('auth:logout', onLogout)
    return () => {
      session.dispose()
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('auth:logout', onLogout)
    }
  }, [session])

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
    webSessionOrigin,
    isIosAppWebSession,
    isIosRestrictedContext,
    commerceAllowed,
    authStatus: authState.status,
    handoffPending: authState.marker?.kind === 'ios_app_pending',
    beginHandoff: session.beginHandoff,
    prepareLogin: session.prepareLogin,
    loading,
    getAuthHeaders,
    logout,
    login,
    checkAuthStatus,
    openAuthModal,
    closeAuthModal,
    authModalOpen: authModalOpen && !isIosRestrictedContext,
    authModalType,
    authModalInitialTab,
    setAuthModalInitialTab,
    authModalRedirectMode,
    authModalReturnToPath,
    setAuthModalRedirectMode,
    setAuthModalReturnToPath,
    authModalFlow,
    authModalInitialForm,
    setAuthModalInitialForm,
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
