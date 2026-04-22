import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, Logo } from './ui'
import { useAuth } from '../contexts/AuthContext'

export default function Header({ compactPublicBooking = false }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { isAuthenticated, logout, openAuthModal, user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isPublicBooking = pathname.startsWith('/m/')
  const isClientUser =
    ((user?.role || localStorage.getItem('user_role') || '') + '').toLowerCase() === 'client'

  const handleLoginClick = () => {
    openAuthModal('client', 'login', { redirectMode: isPublicBooking ? 'stay' : 'default', flow: 'default' })
  }

  const handleRegisterClick = () => {
    openAuthModal('client', 'register', { redirectMode: isPublicBooking ? 'stay' : 'default', flow: 'default' })
  }

  const handleLogoutClick = () => {
    logout()
  }

  const handleDashboardClick = async () => {
    // Сначала проверяем роль из контекста
    let role = user?.role
    
    // Если роль не определена, проверяем localStorage
    if (!role) {
      role = localStorage.getItem('user_role')
    }
    
    // Если роль все еще не определена, запрашиваем с сервера
    if (!role && isAuthenticated) {
      try {
        const token = localStorage.getItem('access_token')
        const response = await fetch('/api/auth/users/me', {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        })
        if (response.ok) {
          const userData = await response.json()
          role = userData.role
          if (role) {
            localStorage.setItem('user_role', role)
          }
        }
      } catch (error) {
        console.error('Ошибка получения роли пользователя:', error)
      }
    }
    
    // Перенаправляем в зависимости от роли (нормализуем к нижнему регистру)
    const r = (role || '').toString().toLowerCase()
    if (r === 'client') {
      navigate('/client')
    } else if (r === 'master' || r === 'indie') {
      navigate('/master')
    } else if (r === 'salon') {
      navigate('/salon')
    } else if (r === 'admin' || r === 'moderator') {
      navigate('/admin')
    } else {
      // Если роль не определена, перенаправляем на главную
      navigate('/')
    }
  }

  return (
    <header className="bg-white/80 supports-[backdrop-filter]:bg-white/70 backdrop-blur-md border-b border-neutral-200 fixed top-0 left-0 right-0 z-50">
      <div className="container">
        {/* Десктоп версия */}
        <div className="hidden md:flex items-center justify-between h-24">
          {/* Логотип */}
          <Link to="/" className="flex items-center h-full">
            <div className="h-24 flex items-center">
              <Logo size="3xl" />
            </div>
          </Link>

          {/* Навигация для десктопа — якоря главной (см. design ref в docs/archive/design-references/) */}
          <nav className="flex items-center gap-4 lg:gap-6 xl:gap-8 flex-wrap justify-end">
            {pathname === '/' ? (
              <>
                <a href="#features" className="nav-link">
                  Возможности
                </a>
                <a href="#how" className="nav-link">
                  Как начать
                </a>
                <a href="#devices" className="nav-link">
                  Приложения
                </a>
              </>
            ) : (
              <>
                <Link to="/#features" className="nav-link">
                  Возможности
                </Link>
                <Link to="/#how" className="nav-link">
                  Как начать
                </Link>
                <Link to="/#devices" className="nav-link">
                  Приложения
                </Link>
              </>
            )}
            <Link to="/pricing" className="nav-link">
              Тарифы
            </Link>
            <Link to="/blog" className="nav-link">
              Блог
            </Link>
            <Link to="/about" className="nav-link">
              О нас
            </Link>
          </nav>

          {/* Кнопки для десктопа */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <Button variant="secondary" size="sm" onClick={handleDashboardClick}>
                  Личный кабинет
                </Button>
                <Button variant="primary" size="sm" onClick={handleLogoutClick}>
                  Выйти
                </Button>
              </div>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={handleLoginClick} data-testid="header-login">
                  Войти
                </Button>
                <Button variant="primary" size="sm" onClick={handleRegisterClick} data-testid="header-register">
                  Зарегистрироваться
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Мобильная версия: сетка 3×1 — логотип в средней колонке (истинный центр), края не влияют на центр */}
        <div
          className={
            compactPublicBooking
              ? 'md:hidden grid h-12 w-full grid-cols-3 items-center gap-1'
              : 'md:hidden grid h-24 w-full grid-cols-3 items-center gap-1'
          }
        >
          <div className="flex min-w-0 items-center justify-self-start justify-start">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(!isMenuOpen)
              }}
              className={
                compactPublicBooking
                  ? 'p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-200'
                  : 'p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-200'
              }
              aria-expanded={isMenuOpen}
              aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            >
              <svg
                className={compactPublicBooking ? 'w-5 h-5' : 'w-6 h-6'}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          <div className="flex min-w-0 justify-center justify-self-center">
            <Link to="/" className="flex items-center justify-center" aria-label="На главную">
              <Logo size={compactPublicBooking ? 'lg' : '2xl'} />
            </Link>
          </div>

          <div className="flex min-w-0 items-center justify-end justify-self-end min-h-[44px]">
            {!isAuthenticated && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors text-sm font-medium px-2 py-1.5"
                  data-testid="header-login"
                >
                  Войти
                </button>
                <button
                  type="button"
                  onClick={handleRegisterClick}
                  className="bg-[#4CAF50] text-white hover:bg-[#45A049] transition-colors text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-sm active:scale-[0.98]"
                  data-testid="header-register"
                >
                  Регистрация
                </button>
              </div>
            )}
            {isAuthenticated && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDashboardClick}
                  className="bg-[#4CAF50] text-white hover:bg-[#45A049] transition-colors text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-sm active:scale-[0.98]"
                >
                  Кабинет
                </button>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80 transition-colors text-xs font-medium px-2 py-1.5 rounded-md"
                  data-testid={isClientUser ? 'header-client-logout' : 'header-mobile-logout'}
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Мобильное меню */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-neutral-200 py-4 animate-slide-down" style={{zIndex: 999}}>
            <nav className="flex flex-col space-y-4">
              {pathname === '/' ? (
                <>
                  <a
                    href="#features"
                    className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Возможности
                  </a>
                  <a
                    href="#how"
                    className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Как начать
                  </a>
                  <a
                    href="#devices"
                    className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Приложения
                  </a>
                </>
              ) : (
                <>
                  <Link
                    to="/#features"
                    className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Возможности
                  </Link>
                  <Link
                    to="/#how"
                    className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Как начать
                  </Link>
                  <Link
                    to="/#devices"
                    className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Приложения
                  </Link>
                </>
              )}
              <Link 
                to="/pricing" 
                className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                onClick={() => setIsMenuOpen(false)}
              >
                Тарифы
              </Link>
              <Link 
                to="/blog" 
                className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                onClick={() => setIsMenuOpen(false)}
              >
                Блог
              </Link>
              <Link 
                to="/about" 
                className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                onClick={() => setIsMenuOpen(false)}
              >
                О нас
              </Link>
            </nav>
            
            <div className="flex flex-col space-y-2 mt-4 px-4">
              {isAuthenticated ? (
                !isClientUser ? (
                  <>
                    <Button variant="secondary" size="sm" className="w-full justify-start" onClick={handleDashboardClick}>
                      Личный кабинет
                    </Button>
                    <Button variant="primary" size="sm" className="w-full justify-start" onClick={handleLogoutClick}>
                      Выйти
                    </Button>
                  </>
                ) : null
              ) : (
                <>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={handleLoginClick} data-testid="header-login">
                    Войти
                  </Button>
                  <Button variant="primary" size="sm" className="w-full justify-start" onClick={handleRegisterClick} data-testid="header-register">
                    Зарегистрироваться
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
} 