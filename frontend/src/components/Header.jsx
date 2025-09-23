import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Logo } from './ui'
import { useAuth } from '../contexts/AuthContext'

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { isAuthenticated, user, logout, openAuthModal } = useAuth()
  const navigate = useNavigate()

  const handleLoginClick = () => {
    openAuthModal('client')
  }

  const handleLogoutClick = () => {
    logout()
  }

  const handleDashboardClick = () => {
    const role = localStorage.getItem('user_role')
    if (role === 'CLIENT') {
      navigate('/client')
    } else if (role === 'MASTER') {
      navigate('/master')
    } else if (role === 'SALON') {
      navigate('/salon')
    } else if (role === 'ADMIN') {
      navigate('/admin')
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <header className="bg-[#F5F5F5] shadow-sm border-b border-neutral-200 fixed top-0 left-0 right-0 z-50">
      <div className="container">
        <div className="flex items-center justify-between h-24">
          {/* Логотип */}
          <Link to="/" className="flex items-center h-full">
            <div className="h-24 flex items-center"> {/* Логотип по высоте хедера */}
              <Logo size="3xl" />
            </div>
          </Link>

          {/* Навигация для десктопа */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link to="/" className="nav-link">Главная</Link>
            <Link to="/pricing" className="nav-link">Тарифы</Link>
            <Link to="/blog" className="nav-link">Блог</Link>
            <Link to="/about" className="nav-link">О нас</Link>
          </nav>

          {/* Кнопки для десктопа */}
          <div className="hidden md:flex items-center space-x-4">
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
              <Button variant="primary" size="sm" onClick={handleLoginClick}>
                Войти/Зарегистрироваться
              </Button>
            )}
          </div>

          {/* Мобильное меню */}
          <div className="md:hidden">
            <button
              onClick={() => {
                console.log('Mobile menu clicked, current state:', isMenuOpen);
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-200"
              style={{zIndex: 1000}}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Мобильное меню */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-neutral-200 py-4 animate-slide-down" style={{zIndex: 999}}>
            <nav className="flex flex-col space-y-4">
              <Link 
                to="/" 
                className="nav-link px-4 py-2 rounded-lg hover:bg-neutral-100"
                onClick={() => setIsMenuOpen(false)}
              >
                Главная
              </Link>
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
                <>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={handleDashboardClick}>
                    Личный кабинет
                  </Button>
                  <Button variant="primary" size="sm" className="w-full justify-start" onClick={handleLogoutClick}>
                    Выйти
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" className="w-full justify-start" onClick={handleLoginClick}>
                  Войти/Зарегистрироваться
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
} 