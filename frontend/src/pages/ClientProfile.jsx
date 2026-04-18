import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPut, apiDelete } from '../utils/api'
import { PencilIcon, TrashIcon, EyeIcon, EyeSlashIcon, ChevronRightIcon } from "@heroicons/react/24/outline"
import { getContactPreferences, updateContactPreference } from '../services/contactPreferences'

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
  const [showPasswordModal, setShowPasswordModal] = useState(false)
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
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)
  const [showNotificationsModal, setShowNotificationsModal] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState({
    push: true,
    sms: false,
    email: true
  })

  // Загружаем профиль клиента
  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const prefs = await getContactPreferences()
      if (!cancelled) {
        setNotificationPrefs((prev) => ({ ...prev, ...prefs, push: false }))
      }
    })()
    return () => { cancelled = true }
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
      setShowPasswordModal(false)
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

  const toggleNotificationPref = (key) => {
    if (key === 'push') return
    updateContactPreference(key, !notificationPrefs[key], 'web').then((next) => {
      setNotificationPrefs((prev) => ({ ...prev, ...next, push: false }))
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex justify-center items-center py-16 px-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Профиль не найден</p>
          <button
            type="button"
            onClick={() => navigate('/client/dashboard')}
            className="px-4 py-2.5 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] text-sm font-medium min-h-[44px]"
          >
            Вернуться в личный кабинет
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
          {/* Заголовок */}
          <div className="mb-4 lg:mb-8">
            <h1 className="text-xl lg:text-3xl font-bold text-gray-900">Настройки профиля</h1>
            <p className="text-gray-600 mt-1 lg:mt-2 text-sm lg:text-base">Данные аккаунта и действия</p>
          </div>

          {/* Сообщения об ошибках и успехе */}
          {error && (
            <div className="mb-4 lg:mb-6 p-3 lg:p-4 bg-red-50 border border-red-200 rounded-lg text-sm">
              <p className="text-red-800">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-4 lg:mb-6 p-3 lg:p-4 bg-[#DFF5EC] border border-[#4CAF50] rounded-lg text-sm">
              <p className="text-[#2e7d32] font-medium">{success}</p>
            </div>
          )}

          {/* Основная информация профиля */}
          <div className="relative bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-4 lg:p-6 mb-4 lg:mb-6">
            <div className="mb-4 lg:mb-6 pr-11 lg:pr-12">
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Основная информация</h2>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="absolute top-4 right-4 lg:top-6 lg:right-6 p-2 rounded-lg text-[#2e7d32] hover:bg-[#DFF5EC] border border-transparent hover:border-[#4CAF50]/25 transition-colors min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                  aria-label="Редактировать основную информацию"
                  title="Редактировать"
                >
                  <PencilIcon className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              {/* Имя */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Имя</label>
                <div className="p-2.5 lg:p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm lg:text-base">
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
                    className="w-full p-2.5 lg:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] text-base lg:text-sm min-h-[44px]"
                    placeholder="+7 (999) 123-45-67"
                  />
                ) : (
                  <div className="p-2.5 lg:p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm lg:text-base">
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
                  <div className="p-2.5 lg:p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm lg:text-base">
                    <span className="text-gray-900">{profile.email || 'Не указано'}</span>
                  </div>
                )}
              </div>

              {/* День рождения */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">День рождения</label>
                <div className="p-2.5 lg:p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm lg:text-base">
                  <span className="text-gray-900">
                    {profile.birth_date ? new Date(profile.birth_date).toLocaleDateString('ru-RU') : 'Не указано'}
                  </span>
                </div>
              </div>
            </div>

            {/* Кнопки редактирования */}
            {isEditing && (
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 lg:mt-6">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium min-h-[44px]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-4 py-2.5 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors text-sm font-medium min-h-[44px]"
                >
                  Сохранить
                </button>
              </div>
            )}
          </div>

          {/* Компактный список действий: детали только в модалках */}
          <div className="rounded-lg border border-gray-100 bg-white overflow-hidden shadow-sm mb-2">
            <h2 className="sr-only">Действия</h2>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100/80 border-b border-gray-100 min-h-[52px]"
            >
              <span className="text-sm font-medium text-gray-900">Сменить пароль</span>
              <ChevronRightIcon className="w-5 h-5 text-gray-400 shrink-0" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setShowNotificationsModal(true)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100/80 border-b border-gray-100 min-h-[52px]"
            >
              <span className="text-sm font-medium text-gray-900">Уведомления</span>
              <ChevronRightIcon className="w-5 h-5 text-gray-400 shrink-0" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-red-50/80 active:bg-red-50 min-h-[52px]"
            >
              <span className="text-sm font-medium text-red-700">Удалить аккаунт</span>
              <ChevronRightIcon className="w-5 h-5 text-red-300 shrink-0" aria-hidden />
            </button>
          </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-4 sm:p-6 max-h-[90dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 id="password-modal-title" className="text-lg font-semibold text-gray-900 pr-2">
                Смена пароля
              </h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Укажите текущий пароль и новый (не короче 6 символов).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Текущий пароль</label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full p-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] text-base min-h-[44px]"
                    placeholder="Текущий пароль"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords.current ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Новый пароль</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full p-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] text-base min-h-[44px]"
                    placeholder="Новый пароль"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords.new ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Подтвердите новый пароль</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full p-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] text-base min-h-[44px]"
                    placeholder="Повторите новый пароль"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords.confirm ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-sm font-medium min-h-[44px]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleChangePassword}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] text-sm font-medium min-h-[44px]"
                >
                  Сохранить пароль
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-4 sm:p-6 max-h-[90dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 id="delete-modal-title" className="text-lg font-semibold text-red-700 pr-2">
                Удаление аккаунта
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeletePassword('')
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              Это действие <strong>необратимо</strong>: записи, избранное и данные профиля будут удалены. Для подтверждения введите пароль.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-red-800 mb-2">Пароль</label>
              <div className="relative">
                <input
                  type={showDeletePassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full p-3 pr-10 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-base min-h-[44px]"
                  placeholder="Ваш пароль"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 hover:text-red-600"
                >
                  {showDeletePassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeletePassword('')
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium min-h-[44px]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!deletePassword}
                className="w-full sm:w-auto px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[44px]"
              >
                Удалить навсегда
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-4 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Управление уведомлениями</h3>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <p className="text-gray-600 mb-4">Выберите, как мастера могут с вами связываться</p>
            <p className="text-xs text-gray-500 mb-3">Push можно включить только в мобильном приложении.</p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {}}
                disabled
                className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-100 cursor-not-allowed opacity-80"
              >
                <span className="text-gray-800 font-medium">Пуш</span>
                <span className="text-gray-500 text-xs">Только с телефона</span>
              </button>
              <button
                type="button"
                onClick={() => toggleNotificationPref('sms')}
                className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="text-gray-800 font-medium">СМС</span>
                <span className="text-[#4CAF50] font-bold">{notificationPrefs.sms ? '✓' : ''}</span>
              </button>
              <button
                type="button"
                onClick={() => toggleNotificationPref('email')}
                className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="text-gray-800 font-medium">E-mail</span>
                <span className="text-[#4CAF50] font-bold">{notificationPrefs.email ? '✓' : ''}</span>
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Закрыть
              </button>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 