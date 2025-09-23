import { useState, useEffect } from 'react'
import { XMarkIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { API_BASE_URL } from '../utils/config'
import { useModal } from '../hooks/useModal'

// Функции валидации
function validateEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
}

function validatePhone(phone) {
  return /^\+7\d{10}$/.test(phone)
}

function formatPhone(input) {
  // Оставляем только цифры
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('7')) digits = digits.slice(1)
  if (digits.length > 10) digits = digits.slice(0, 10)
  return '+7' + digits
}

export default function ModeratorModal({ moderator, onClose, onSave }) {
  const [form, setForm] = useState({
    email: '',
    phone: '+7',
    full_name: '',
    password: '',
    password2: ''
  })
  
  const [permissions, setPermissions] = useState({
    // Права на управление пользователями
    can_view_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_ban_users: false,
    
    // Права на управление блогом
    can_view_blog: false,
    can_create_blog: false,
    can_edit_blog: false,
    can_delete_blog: false,
    can_publish_blog: false,
    
    // Права на управление салонами
    can_view_salons: false,
    can_edit_salons: false,
    can_delete_salons: false,
    
    // Права на управление мастерами
    can_view_masters: false,
    can_edit_masters: false,
    can_delete_masters: false,
    
    // Права на управление бронированиями
    can_view_bookings: false,
    can_edit_bookings: false,
    can_delete_bookings: false,
    
    // Права на просмотр статистики
    can_view_stats: false,
    
    // Права на управление настройками
    can_view_settings: false,
    can_edit_settings: false,
    
    // Права на управление промо-кодами
    can_create_promo_codes: false,
    can_view_promo_codes: false,
    can_edit_promo_codes: false,
    can_delete_promo_codes: false
  })
  
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)

  useEffect(() => {
    if (moderator) {
      setIsEdit(true)
      setForm({
        email: moderator.email || '',
        phone: moderator.phone || '+7',
        full_name: moderator.full_name || '',
        password: '',
        password2: ''
      })
      
      if (moderator.permissions) {
        setPermissions(moderator.permissions)
      }
    } else {
      setIsEdit(false)
      setForm({
        email: '',
        phone: '+7',
        full_name: '',
        password: '',
        password2: ''
      })
      setPermissions({
        can_view_users: false,
        can_edit_users: false,
        can_delete_users: false,
        can_ban_users: false,
        can_view_blog: false,
        can_create_blog: false,
        can_edit_blog: false,
        can_delete_blog: false,
        can_publish_blog: false,
        can_view_salons: false,
        can_edit_salons: false,
        can_delete_salons: false,
        can_view_masters: false,
        can_edit_masters: false,
        can_delete_masters: false,
        can_view_bookings: false,
        can_edit_bookings: false,
        can_delete_bookings: false,
        can_view_stats: false,
        can_view_settings: false,
        can_edit_settings: false,
        can_create_promo_codes: false,
        can_view_promo_codes: false,
        can_edit_promo_codes: false,
        can_delete_promo_codes: false
      })
    }
  }, [moderator])

  const validate = () => {
    const errs = {}
    
    // Email
    if (!form.email) {
      errs.email = 'Email обязателен'
    } else if (!validateEmail(form.email)) {
      errs.email = 'Некорректный e-mail (только латиница, @ и точка)'
    }
    
    // Телефон
    if (!form.phone) {
      errs.phone = 'Телефон обязателен'
    } else if (!validatePhone(form.phone)) {
      errs.phone = 'Телефон должен быть в формате +7XXXXXXXXXX (10 цифр после +7)'
    }
    
    // ФИО
    if (!form.full_name) {
      errs.full_name = 'ФИО обязательно'
    }
    
    // Пароль
    if (!isEdit) {
      if (!form.password) {
        errs.password = 'Пароль обязателен'
      } else if (form.password.length < 6) {
        errs.password = 'Пароль должен быть не менее 6 символов'
      }
      
      if (!form.password2) {
        errs.password2 = 'Повторите пароль'
      } else if (form.password !== form.password2) {
        errs.password2 = 'Пароли не совпадают'
      }
    } else if (form.password) {
      if (form.password.length < 6) {
        errs.password = 'Пароль должен быть не менее 6 символов'
      } else if (form.password !== form.password2) {
        errs.password2 = 'Пароли не совпадают'
      }
    }
    
    return errs
  }

  const checkAndRefreshToken = async () => {
    const token = localStorage.getItem('access_token')
    console.log('Проверяем токен:', token ? 'найден' : 'не найден')
    
    if (!token) {
      alert('Токен авторизации не найден. Пожалуйста, войдите в систему заново.')
      window.location.href = '/'
      return null
    }
    
    // Проверяем, не истек ли токен
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const exp = payload.exp * 1000 // конвертируем в миллисекунды
      const now = Date.now()
      console.log('Токен истекает:', new Date(exp), 'Текущее время:', new Date(now))
      
      if (now >= exp) {
        alert('Токен авторизации истек. Пожалуйста, войдите в систему заново.')
        window.location.href = '/'
        return null
      }
    } catch (error) {
      console.error('Ошибка при проверке токена:', error)
      alert('Токен авторизации недействителен. Пожалуйста, войдите в систему заново.')
      window.location.href = '/'
      return null
    }
    
    return token
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    
    if (Object.keys(errs).length > 0) {
      alert('Проверьте введенные данные')
      return
    }
    
    setLoading(true)
    
    try {
      const token = await checkAndRefreshToken()
      if (!token) return
      
      const payload = {
        email: form.email,
        phone: form.phone,
        full_name: form.full_name,
        permissions: permissions
      }
      
      if (form.password) {
        payload.password = form.password
      }
      
      const url = isEdit 
        ? `${API_BASE_URL}/api/admin/moderators/${moderator.id}`
        : `${API_BASE_URL}/api/admin/moderators`
      
      const method = isEdit ? 'PUT' : 'POST'
      
      console.log('Отправляем запрос:', {
        url: url,
        method: method,
        payload: payload,
        token: token ? `${token.substring(0, 20)}...` : 'null'
      })
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      
      console.log('Получен ответ:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })
      
      if (response.ok) {
        onSave()
        alert(isEdit ? 'Модератор обновлен' : 'Модератор создан')
      } else {
        if (response.status === 401) {
          alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.')
          // Перенаправляем на главную страницу для повторного входа
          window.location.href = '/'
          return
        }
        const error = await response.json()
        alert('Ошибка: ' + (error.detail || 'Не удалось сохранить модератора'))
      }
    } catch (error) {
      console.error('Ошибка при сохранении модератора:', error)
      alert('Ошибка сети или сервера')
    } finally {
      setLoading(false)
    }
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    
    // Форматируем телефон
    if (name === 'phone') {
      formattedValue = formatPhone(value)
    }
    
    setForm(prev => ({
      ...prev,
      [name]: formattedValue
    }))
    
    // Очищаем ошибку при изменении поля
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const handlePermissionChange = (permission, value) => {
    setPermissions(prev => ({
      ...prev,
      [permission]: value
    }))
  }

  const handleSelectAll = (category, value) => {
    const categoryPermissions = {
      users: ['can_view_users', 'can_edit_users', 'can_delete_users', 'can_ban_users'],
      blog: ['can_view_blog', 'can_create_blog', 'can_edit_blog', 'can_delete_blog', 'can_publish_blog'],
      salons: ['can_view_salons', 'can_edit_salons', 'can_delete_salons'],
      masters: ['can_view_masters', 'can_edit_masters', 'can_delete_masters'],
      bookings: ['can_view_bookings', 'can_edit_bookings', 'can_delete_bookings'],
      settings: ['can_view_settings', 'can_edit_settings'],
      promo_codes: ['can_create_promo_codes', 'can_view_promo_codes', 'can_edit_promo_codes', 'can_delete_promo_codes']
    }
    
    const newPermissions = { ...permissions }
    categoryPermissions[category].forEach(perm => {
      newPermissions[perm] = value
    })
    setPermissions(newPermissions)
  }

  const permissionGroups = [
    {
      title: 'Управление пользователями',
      key: 'users',
      permissions: [
        { key: 'can_view_users', label: 'Просмотр пользователей' },
        { key: 'can_edit_users', label: 'Редактирование пользователей' },
        { key: 'can_delete_users', label: 'Удаление пользователей' },
        { key: 'can_ban_users', label: 'Блокировка пользователей' }
      ]
    },
    {
      title: 'Управление блогом',
      key: 'blog',
      permissions: [
        { key: 'can_view_blog', label: 'Просмотр блога' },
        { key: 'can_create_blog', label: 'Создание статей' },
        { key: 'can_edit_blog', label: 'Редактирование статей' },
        { key: 'can_delete_blog', label: 'Удаление статей' },
        { key: 'can_publish_blog', label: 'Публикация статей' }
      ]
    },
    {
      title: 'Управление салонами',
      key: 'salons',
      permissions: [
        { key: 'can_view_salons', label: 'Просмотр салонов' },
        { key: 'can_edit_salons', label: 'Редактирование салонов' },
        { key: 'can_delete_salons', label: 'Удаление салонов' }
      ]
    },
    {
      title: 'Управление мастерами',
      key: 'masters',
      permissions: [
        { key: 'can_view_masters', label: 'Просмотр мастеров' },
        { key: 'can_edit_masters', label: 'Редактирование мастеров' },
        { key: 'can_delete_masters', label: 'Удаление мастеров' }
      ]
    },
    {
      title: 'Управление бронированиями',
      key: 'bookings',
      permissions: [
        { key: 'can_view_bookings', label: 'Просмотр бронирований' },
        { key: 'can_edit_bookings', label: 'Редактирование бронирований' },
        { key: 'can_delete_bookings', label: 'Удаление бронирований' }
      ]
    },
    {
      title: 'Система',
      key: 'settings',
      permissions: [
        { key: 'can_view_stats', label: 'Просмотр статистики' },
        { key: 'can_view_settings', label: 'Просмотр настроек' },
        { key: 'can_edit_settings', label: 'Редактирование настроек' }
      ]
    },
    {
      title: 'Управление промо-кодами',
      key: 'promo_codes',
      permissions: [
        { key: 'can_create_promo_codes', label: 'Создание промо-кодов' },
        { key: 'can_view_promo_codes', label: 'Просмотр промо-кодов' },
        { key: 'can_edit_promo_codes', label: 'Редактирование промо-кодов' },
        { key: 'can_delete_promo_codes', label: 'Удаление промо-кодов' }
      ]
    }
  ]

  const { handleBackdropClick, handleMouseDown } = useModal(onClose)

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <ShieldCheckIcon className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">
              {isEdit ? 'Редактировать модератора' : 'Создать модератора'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Основная информация */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleFormChange}
                className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isEdit}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Телефон *
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleFormChange}
                className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isEdit}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ФИО *
              </label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleFormChange}
                className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.full_name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.full_name && <p className="text-red-500 text-sm mt-1">{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пароль {!isEdit && '*'}
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleFormChange}
                className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder={isEdit ? 'Оставьте пустым, чтобы не изменять' : ''}
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>

            {form.password && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Повторите пароль *
                </label>
                <input
                  type="password"
                  name="password2"
                  value={form.password2}
                  onChange={handleFormChange}
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.password2 ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.password2 && <p className="text-red-500 text-sm mt-1">{errors.password2}</p>}
              </div>
            )}
          </div>

          {/* Права модератора */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Права модератора</h3>
            <div className="space-y-6">
              {permissionGroups.map((group) => (
                <div key={group.key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-md font-medium text-gray-900">{group.title}</h4>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAll(group.key, true)}
                        className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200"
                      >
                        Все
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAll(group.key, false)}
                        className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200"
                      >
                        Ничего
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.permissions.map((permission) => (
                      <label key={permission.key} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={permissions[permission.key] || false}
                          onChange={(e) => handlePermissionChange(permission.key, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">{permission.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : (isEdit ? 'Обновить' : 'Создать')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 