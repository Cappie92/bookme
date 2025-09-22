import React, { useState } from 'react'
import ConfirmCloseModal from './ConfirmCloseModal'

export default function PasswordSetupModal({ isOpen, onClose, onSuccess, mode = 'setup' }) {
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const isVerificationMode = mode === 'verification'

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.password) {
      setError('Введите пароль')
      return
    }
    
    if (isVerificationMode) {
      // Режим проверки пароля - только один пароль
      if (formData.password.length < 6) {
        setError('Пароль должен содержать минимум 6 символов')
        return
      }
    } else {
      // Режим установки пароля - проверяем подтверждение
      if (formData.password.length < 6) {
        setError('Пароль должен содержать минимум 6 символов')
        return
      }
      
      if (formData.password !== formData.confirmPassword) {
        setError('Пароли не совпадают')
        return
      }
    }
    
    setLoading(true)
    setError('')
    
    try {
      let response
      
      if (isVerificationMode) {
        // Проверяем пароль существующего пользователя
        response = await fetch('/auth/verify-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            password: formData.password
          })
        })
      } else {
        // Устанавливаем пароль нового пользователя
        response = await fetch('/auth/set-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            password: formData.password
          })
        })
      }
      
      if (response.ok) {
        // Удаляем соответствующие флаги
        if (isVerificationMode) {
          localStorage.removeItem('existing_client_verification')
        } else {
          localStorage.removeItem('new_client_setup')
        }
        
        // Вызываем только onSuccess, который сам закроет модальное окно
        onSuccess()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || (isVerificationMode ? 'Неверный пароль' : 'Ошибка при установке пароля'))
      }
    } catch (error) {
      console.error('Ошибка:', error)
      setError(isVerificationMode ? 'Ошибка сети при проверке пароля' : 'Ошибка сети при установке пароля')
    } finally {
      setLoading(false)
    }
  }

  const handleCloseAttempt = () => {
    setShowConfirmClose(true)
  }

  const handleConfirmCancel = async () => {
    try {
      // Удаляем пользователя и его бронирование
      const response = await fetch('/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        // Очищаем localStorage
        localStorage.removeItem('access_token')
        localStorage.removeItem('new_client_setup')
        
        // Закрываем модальные окна и редиректим на главную
        setShowConfirmClose(false)
        onClose()
        window.location.href = '/'
      } else {
        console.error('Ошибка при удалении аккаунта')
        // Даже если не удалось удалить на сервере, очищаем локально
        localStorage.removeItem('access_token')
        localStorage.removeItem('new_client_setup')
        setShowConfirmClose(false)
        onClose()
        window.location.href = '/'
      }
    } catch (error) {
      console.error('Ошибка сети при удалении аккаунта:', error)
      // В случае ошибки сети тоже очищаем локально
      localStorage.removeItem('access_token')
      localStorage.removeItem('new_client_setup')
      setShowConfirmClose(false)
      onClose()
      window.location.href = '/'
    }
  }

  const handleReturnToSetup = () => {
    setShowConfirmClose(false)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {isVerificationMode ? 'Введите пароль' : 'Бронирование создано!'}
            </h2>
            <p className="text-gray-600">
              {isVerificationMode 
                ? 'Введите пароль от вашей учетной записи для подтверждения бронирования'
                : 'Придумайте пароль чтобы управлять бронированием'
              }
            </p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Пароль <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={isVerificationMode ? "Введите пароль" : "Минимум 6 символов"}
              />
            </div>
            
            {!isVerificationMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Повторите пароль <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Повторите пароль"
                />
              </div>
            )}
            
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCloseAttempt}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isVerificationMode ? 'Отмена' : 'Отменить'}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading 
                  ? (isVerificationMode ? 'Проверка...' : 'Сохранение...') 
                  : (isVerificationMode ? 'Подтвердить' : 'Сохранить пароль')
                }
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Модальное окно подтверждения закрытия */}
      <ConfirmCloseModal
        isOpen={showConfirmClose}
        onConfirmCancel={handleConfirmCancel}
        onReturnToSetup={handleReturnToSetup}
      />
    </>
  )
} 