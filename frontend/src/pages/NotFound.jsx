import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useEffect } from 'react'

export default function NotFound() {
  const navigate = useNavigate()

  useEffect(() => {
    // Проверяем роль пользователя и перенаправляем на правильный дашборд
    const role = localStorage.getItem('user_role')
    const token = localStorage.getItem('access_token')
    
    if (token && role) {
      // Если пользователь авторизован, перенаправляем на его дашборд
      if (role === 'MASTER') {
        navigate('/master', { replace: true })
      } else if (role === 'CLIENT') {
        navigate('/client', { replace: true })
      } else if (role === 'SALON') {
        navigate('/salon', { replace: true })
      } else if (role === 'ADMIN') {
        navigate('/admin', { replace: true })
      }
    }
  }, [navigate])

  return (
    <>
      <Helmet>
        <title>404 - Страница не найдена | DeDato</title>
        <meta name="description" content="Страница не найдена" />
      </Helmet>
      
      <div className="min-h-screen flex items-center justify-center bg-white px-4 py-4">
        <div className="max-w-6xl w-full">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6">
            {/* Видео слева */}
            <div className="flex-shrink-0 w-full lg:w-1/2 max-w-md" style={{ maxWidth: '50%' }}>
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-auto rounded-lg"
                style={{ transform: 'scale(0.5)' }}
              >
                <source src="/Dedato_404.mp4" type="video/mp4" />
                Ваш браузер не поддерживает видео.
              </video>
            </div>
            
            {/* Текст справа */}
            <div className="flex-shrink-0 w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
              <h1 className="text-3xl lg:text-4xl font-bold text-neutral-900 mb-4">
                Упс... Что-то пошло не так, такой страницы не существует
              </h1>
              
              <p className="text-base text-neutral-600 mb-6">
                Возможно, страница была перемещена или удалена. 
                Попробуйте вернуться на главную страницу.
              </p>
              
              <Link
                to="/"
                className="inline-flex items-center px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors duration-200 font-medium"
              >
                Вернуться на главную
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

