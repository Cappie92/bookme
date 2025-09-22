import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPut, apiDelete } from '../utils/api'
import ClientLayout from "../layouts/ClientLayout"
import { PencilIcon, TrashIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"

export default function ClientProfile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Состояния для редактирования
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  
  // Состояния для смены пароля
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  
  // Состояния для удаления аккаунта
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)

  // Загружаем профиль клиента
  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const data = await apiGet('client/profile')
      setProfile(data)
      setEditForm({
        email: data.email || '',
        phone: data.phone || ''
      })
    } catch (error) {
      console.error('Ошибка загрузки профиля:', error)
      setError('Не удалось загрузить профиль')
    } finally {
      setLoading(false)
    }
  }

  // Обработка изменения полей формы
  const handleInputChange = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Сохранение изменений профиля
  const handleSaveProfile = async () => {
    try {
      setError('')
      setSuccess('')
      
      await apiPut('client/profile', editForm)
      setSuccess('Профиль успешно обновлен')
      setIsEditing(false)
      loadProfile() // Перезагружаем профиль
    } catch (error) {
      console.error('Ошибка обновления профиля:', error)
      setError('Не удалось обновить профиль')
    }
  }

  // Смена пароля
  const handleChangePassword = async () => {
    try {
      setError('')
      setSuccess('')
      
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setError('Новые пароли не совпадают')
        return
      }
      
      if (passwordForm.newPassword.length < 6) {
        setError('Новый пароль должен содержать минимум 6 символов')
        return
      }
      
      await apiPut('client/change-password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword
      })
      
      setSuccess('Пароль успешно изменен')
      setShowPasswordForm(false)
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      console.error('Ошибка смены пароля:', error)
      setError('Не удалось сменить пароль')
    }
  }

  // Удаление аккаунта
  const handleDeleteAccount = async () => {
    try {
      setError('')
      
      await apiDelete('client/account', {
        password: deletePassword
      })
      
      // Удаляем токен и перенаправляем на главную
      localStorage.removeItem('access_token')
      navigate('/')
    } catch (error) {
      console.error('Ошибка удаления аккаунта:', error)
      setError('Не удалось удалить аккаунт. Проверьте пароль.')
    }
  }

  // Отмена редактирования
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditForm({
      email: profile?.email || '',
      phone: profile?.phone || ''
    })
    setError('')
  }

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]"></div>
        </div>
      </ClientLayout>
    )
  }

  if (!profile) {
    return (
      <ClientLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Профиль не найден</p>
            <button
              onClick={() => navigate('/client/dashboard')}
              className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049]"
            >
              Вернуться в личный кабинет
            </button>
          </div>
        </div>
      </ClientLayout>
    )
  }

  return (
    <ClientLayout>
      <main className="pt-[140px] p-8">
        <div className="max-w-4xl mx-auto">
          {/* Заголовок */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Редактирование профиля</h1>
            <p className="text-gray-600 mt-2">Управляйте своими личными данными и настройками аккаунта</p>
          </div>

          {/* Сообщения об ошибках и успехе */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-6 p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg">
              <p className="text-[#2E7D32]">{success}</p>
            </div>
          )}

          {/* Основная информация профиля */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Основная информация</h2>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors flex items-center gap-2"
                >
                  <PencilIcon className="w-4 h-4" />
                  Редактировать
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Имя */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Имя</label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-900">{profile.name || 'Не указано'}</span>
                </div>
              </div>

              {/* Статус "всегда бесплатно" */}
              {profile.is_always_free && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                      ✨ Всегда бесплатно
                    </span>
                  </div>
                </div>
              )}

              {/* Номер телефона */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Номер телефона</label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                    placeholder="+7 (999) 123-45-67"
                  />
                ) : (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-gray-900">{profile.phone || 'Не указано'}</span>
                  </div>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                    placeholder="example@email.com"
                  />
                ) : (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-gray-900">{profile.email || 'Не указано'}</span>
                  </div>
                )}
              </div>

              {/* День рождения */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">День рождения</label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-900">
                    {profile.birth_date ? new Date(profile.birth_date).toLocaleDateString('ru-RU') : 'Не указано'}
                  </span>
                </div>
              </div>
            </div>

            {/* Кнопки редактирования */}
            {isEditing && (
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveProfile}
                  className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors"
                >
                  Сохранить
                </button>
              </div>
            )}
          </div>

          {/* Смена пароля */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Смена пароля</h2>
              <button
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {showPasswordForm ? 'Скрыть' : 'Сменить пароль'}
              </button>
            </div>

            {showPasswordForm && (
              <div className="space-y-4">
                {/* Текущий пароль */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Текущий пароль</label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                      placeholder="Введите текущий пароль"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.current ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Новый пароль */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Новый пароль</label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                      placeholder="Введите новый пароль"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.new ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Подтверждение пароля */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Подтвердите новый пароль</label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
                      placeholder="Повторите новый пароль"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.confirm ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleChangePassword}
                    className="px-6 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors"
                  >
                    Сменить пароль
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Удаление аккаунта */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-red-600">Удаление аккаунта</h2>
                <p className="text-gray-600 text-sm mt-1">Это действие нельзя отменить. Все ваши данные будут удалены навсегда.</p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4" />
                Удалить аккаунт
              </button>
            </div>

            {showDeleteConfirm && (
              <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                <p className="text-red-800 mb-4">
                  <strong>Внимание!</strong> Для подтверждения удаления аккаунта введите ваш пароль:
                </p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-red-700 mb-2">Пароль</label>
                  <div className="relative">
                    <input
                      type={showDeletePassword ? 'text' : 'password'}
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="w-full p-3 pr-10 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Введите пароль для подтверждения"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-400 hover:text-red-600"
                    >
                      {showDeletePassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeletePassword('')
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={!deletePassword}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Удалить аккаунт навсегда
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Кнопка возврата */}
          <div className="mt-8 text-center">
            <button
              onClick={() => navigate('/client/dashboard')}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Вернуться в личный кабинет
            </button>
          </div>
        </div>
      </main>
    </ClientLayout>
  )
} 