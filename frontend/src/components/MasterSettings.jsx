import React, { useState, useEffect } from 'react'
import { cities, getTimezoneByCity } from '../utils/cities'
import { getImageUrl, API_BASE_URL } from '../utils/config'
import ColorPicker from './ColorPicker'
import AddressAutocomplete from './AddressAutocomplete'
import AddressValidator from './AddressValidator'
import ServerBasedAddressExtractor from './ServerBasedAddressExtractor'
import YandexGeocoder from './YandexGeocoder'
import PaymentMethodSelector from './PaymentMethodSelector'
import ClientRestrictionsManager from './ClientRestrictionsManager'
import { isSalonFeaturesEnabled } from '../config/features'

export default function MasterSettings({ onSettingsUpdate }) {
  const [profile, setProfile] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [passwordMode, setPasswordMode] = useState(false)
  const [form, setForm] = useState({})
  const [websiteSettings, setWebsiteSettings] = useState({
    logo: '',
    background_color: '#ffffff'
  })
  const [websiteSettingsChanged, setWebsiteSettingsChanged] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [usePhotoAsLogo, setUsePhotoAsLogo] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [addressMethod, setAddressMethod] = useState('autocomplete') // 'autocomplete' или 'link'

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/master/settings`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setForm({
          full_name: data.user.full_name || '',
          phone: data.user.phone || '',
          email: data.user.email || '',
          birth_date: data.user.birth_date || '',
          can_work_independently: data.master.can_work_independently || false,
          can_work_in_salon: data.master.can_work_in_salon || false,
          website: data.master.website || '',
          domain: data.master.domain || '',
          bio: data.master.bio || '',
          experience_years: data.master.experience_years || 0,
          city: data.master.city || '',
          address: data.master.address || '',
          timezone: data.master.timezone || 'Europe/Moscow',
          payment_on_visit: data.master.payment_on_visit !== false,
          payment_advance: data.master.payment_advance || false
        })
        setWebsiteSettings({
          logo: data.master.logo || '',
          background_color: data.master.background_color || '#ffffff'
        })
        // Устанавливаем состояние использования фото как логотипа
        setUsePhotoAsLogo(data.master.use_photo_as_logo || false)
        // Сбрасываем файлы при загрузке профиля
        setPhotoFile(null)
        setLogoFile(null)
      } else {
        setError('Ошибка загрузки профиля')
      }
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = e => {
    const { name, value, type, checked } = e.target
    setForm(f => {
      const newForm = { 
        ...f, 
        [name]: type === 'checkbox' ? checked : value 
      }
      
      // Если изменился город, автоматически обновляем таймзону
      if (name === 'city' && value) {
        newForm.timezone = getTimezoneByCity(value)
      }
      
      return newForm
    })
  }

  const handlePaymentMethodsChange = (paymentOnVisit, paymentAdvance) => {
    setForm(prev => ({
      ...prev,
      payment_on_visit: paymentOnVisit,
      payment_advance: paymentAdvance
    }))
  }

  const handlePasswordChange = e => {
    const { name, value } = e.target
    setPasswordForm(f => ({ ...f, [name]: value }))
  }

  const handleSave = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      
      // Добавляем все поля формы
      Object.keys(form).forEach(key => {
        if (form[key] !== undefined && form[key] !== '') {
          formData.append(key, form[key])
        }
      })
      
      // Добавляем файлы
      if (photoFile) {
        formData.append('photo', photoFile)
      }
      if (logoFile && !usePhotoAsLogo) {
        formData.append('logo', logoFile)
      }
      // Добавляем флаг использования фото как логотипа
      formData.append('use_photo_as_logo', usePhotoAsLogo ? 'true' : 'false')
      
      const res = await fetch(`${API_BASE_URL}/api/master/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      })
      if (res.ok) {
        setSuccess('Профиль успешно обновлен')
        setEditMode(false)
        loadProfile()
        if (onSettingsUpdate) {
          onSettingsUpdate()
        }
      } else {
        const data = await res.json()
        setError(data.detail || 'Ошибка обновления профиля')
      }
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSave = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    // Проверка совпадения паролей
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Новые пароли не совпадают')
      setLoading(false)
      return
    }

    // Проверка минимальной длины пароля
    if (passwordForm.newPassword.length < 6) {
      setError('Новый пароль должен содержать минимум 6 символов')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          old_password: passwordForm.oldPassword,
          new_password: passwordForm.newPassword
        })
      })
      if (res.ok) {
        setSuccess('Пароль успешно изменен')
        setPasswordMode(false)
        setPasswordForm({
          oldPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      } else {
        const data = await res.json()
        setError(data.detail || 'Ошибка изменения пароля')
      }
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveWebsiteSettings = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      
      // Добавляем настройки сайта
      formData.append('background_color', websiteSettings.background_color || '#ffffff')
      
      // Добавляем флаг использования фото как логотипа
      formData.append('use_photo_as_logo', usePhotoAsLogo ? 'true' : 'false')
      
      // Добавляем файл логотипа, если он выбран и не используется фото как логотип
      if (logoFile && !usePhotoAsLogo) {
        formData.append('logo', logoFile)
      }
      
      const res = await fetch(`${API_BASE_URL}/api/master/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      })
      if (res.ok) {
        setSuccess('Настройки сайта успешно сохранены')
        setWebsiteSettingsChanged(false)
        setLogoFile(null)
        loadProfile()
      } else {
        const data = await res.json()
        setError(data.detail || 'Ошибка сохранения настроек сайта')
      }
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU')
  }

  if (loading && !profile) return <div>Загрузка...</div>
  if (error && !profile) return <div className="text-red-500">{error}</div>
  if (!profile) return null

  return (
    <div className="max-w-xl mx-auto bg-white rounded-lg shadow p-6 mt-8">
      <h2 className="text-2xl font-bold mb-6">Настройки профиля</h2>
      {success && <div className="text-green-600 mb-4">{success}</div>}
      {error && <div className="text-red-500 mb-4">{error}</div>}
      
      {!editMode && !passwordMode ? (
        <>
          <div className="mb-4"><b>ФИО:</b> {profile.user.full_name}</div>
          <div className="mb-4"><b>Телефон:</b> {profile.user.phone}</div>
          <div className="mb-4"><b>Email:</b> {profile.user.email}</div>
          <div className="mb-4"><b>Дата рождения:</b> {formatDate(profile.user.birth_date)}</div>
          <div className="mb-4"><b>Город:</b> {profile.master.city || '—'}</div>
          {profile.user.is_always_free && (
            <div className="mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                ✨ Всегда бесплатно
              </span>
            </div>
          )}
          
          <div className="border-t pt-4 mt-6">
            <h3 className="text-lg font-semibold mb-4">Настройки работы</h3>
            <div className="mb-4">
              <b>Самостоятельная работа:</b> {profile.master.can_work_independently ? 'Да' : 'Нет'}
            </div>
            {isSalonFeaturesEnabled() && (
              <div className="mb-4">
                <b>Работа в салоне:</b> {profile.master.can_work_in_salon ? 'Да' : 'Нет'}
              </div>
            )}
            {profile.master.can_work_independently && (
              <div className="mb-4">
                <b>Мой сайт:</b> {profile.master.website || 'Не указан'}
              </div>
            )}
            <div className="mb-4">
              <b>О себе:</b> {profile.master.bio || 'Не указано'}
            </div>
            <div className="mb-4">
              <b>Опыт работы:</b> {profile.master.experience_years || 0} лет
            </div>
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => setEditMode(true)} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">
              Редактировать профиль
            </button>
            <button onClick={() => setPasswordMode(true)} className="bg-orange-600 text-white px-6 py-2 rounded hover:bg-orange-700 transition-colors">
              Изменить пароль
            </button>
          </div>
        </>
      ) : editMode ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              ФИО <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              name="full_name" 
              value={form.full_name} 
              onChange={handleChange} 
              className="border rounded px-3 py-2 w-full" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Телефон <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              name="phone" 
              value={form.phone} 
              onChange={handleChange} 
              className="border rounded px-3 py-2 w-full" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input 
              type="email" 
              name="email" 
              value={form.email} 
              onChange={handleChange} 
              className="border rounded px-3 py-2 w-full" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Дата рождения
            </label>
            <input 
              type="date" 
              name="birth_date" 
              value={form.birth_date} 
              onChange={handleChange} 
              className="border rounded px-3 py-2 w-full" 
            />
          </div>
          
          <div className="border-t pt-4 mt-6">
            <h3 className="text-lg font-semibold mb-4">Настройки работы</h3>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  name="can_work_independently" 
                  checked={form.can_work_independently} 
                  onChange={handleChange} 
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="text-sm font-medium">
                  Самостоятельная работа
                </label>
              </div>
              
              {isSalonFeaturesEnabled() && (
                <div className="flex items-center">
                  <input 
                    type="checkbox" 
                    name="can_work_in_salon" 
                    checked={form.can_work_in_salon} 
                    onChange={handleChange} 
                    className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="text-sm font-medium">
                    Работа в салоне
                  </label>
                </div>
              )}
              
              {form.can_work_independently && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Мой сайт
                  </label>
                  <input 
                    type="url" 
                    name="website" 
                    value={form.website} 
                    onChange={handleChange} 
                    placeholder="https://example.com"
                    className="border rounded px-3 py-2 w-full" 
                  />
                </div>
              )}
              
              {form.can_work_independently && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Адрес сайта для записи
                  </label>
                  <div className="flex">
                    <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-gray-500">
                      http://localhost:5174/domain/
                    </span>
                    <input 
                      type="text" 
                      name="domain" 
                      value={form.domain} 
                      onChange={handleChange} 
                      placeholder="moy-master"
                      className="flex-1 border rounded-r px-3 py-2" 
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Введите желаемый адрес для вашей страницы записи. Например: http://localhost:5174/domain/moy-master
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  О себе
                </label>
                <textarea 
                  name="bio" 
                  value={form.bio} 
                  onChange={handleChange} 
                  rows="3"
                  className="border rounded px-3 py-2 w-full" 
                  placeholder="Расскажите о себе и своем опыте..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Опыт работы (лет)
                </label>
                <input 
                  type="number" 
                  name="experience_years" 
                  value={form.experience_years} 
                  onChange={handleChange} 
                  min="0"
                  className="border rounded px-3 py-2 w-full" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Город
                </label>
                <select 
                  name="city" 
                  value={form.city} 
                  onChange={handleChange}
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="">Выберите город</option>
                  {cities.map(city => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {form.can_work_independently && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Адрес
                  </label>
                  
                  {/* Переключатель между методами ввода адреса */}
                  <div className="mb-3">
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="addressMethod"
                          value="autocomplete"
                          checked={addressMethod === 'autocomplete'}
                          onChange={(e) => setAddressMethod(e.target.value)}
                          className="mr-2"
                        />
                        <span className="text-sm">Автодополнение</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="addressMethod"
                          value="link"
                          checked={addressMethod === 'link'}
                          onChange={(e) => setAddressMethod(e.target.value)}
                          className="mr-2"
                        />
                        <span className="text-sm">Из ссылки Яндекс.Карт</span>
                      </label>
                    </div>
                  </div>

                  {/* Автодополнение адреса */}
                  {addressMethod === 'autocomplete' && (
                    <>
                      <AddressAutocomplete
                        value={form.address}
                        onChange={(value) => {
                          setForm(f => ({ ...f, address: value }))
                        }}
                        city={form.city}
                        placeholder="Укажите ваш адрес"
                        className="w-full"
                        apiKey={import.meta.env.VITE_YANDEX_MAPS_API_KEY}
                      />
                      <AddressValidator 
                        address={form.address}
                        city={form.city}
                        onValidationResult={(result) => {
                          console.log('Результат валидации адреса:', result)
                        }}
                        apiKey={import.meta.env.VITE_YANDEX_MAPS_API_KEY}
                      />
                    </>
                  )}

                  {/* Извлечение адреса из ссылки */}
                  {addressMethod === 'link' && (
                    <YandexGeocoder
                      onAddressExtracted={(address) => {
                        setForm(f => ({ ...f, address }))
                      }}
                      currentAddress={form.address}
                    />
                  )}

                  <p className="text-xs text-gray-500 mt-1">
                    Адрес будет отображаться на вашем сайте рядом с городом
                  </p>
                </div>
              )}
              
              {/* Загрузка фото мастера */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Мое фото
                </label>
                <div className="space-y-2">
                  {profile.master.photo && (
                    <div className="flex items-center space-x-2">
                      <img 
                        src={getImageUrl(profile.master.photo)}
                        alt="Фото мастера" 
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          setPhotoFile(null)
                          // Здесь можно добавить логику удаления фото
                        }}
                        className="text-red-600 text-sm hover:text-red-700"
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0]
                        if (file) {
                          // Проверяем размер файла (1.5 МБ = 1572864 байт)
                          if (file.size > 1572864) {
                            alert('Размер файла не должен превышать 1.5 МБ')
                            return
                          }
                          
                          // Проверяем формат изображения
                          if (!file.type.startsWith('image/')) {
                            alert('Пожалуйста, выберите изображение')
                            return
                          }
                          
                          // Сохраняем файл для отправки
                          setPhotoFile(file)
                        }
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Ваше фото для отображения в салоне. Рекомендуемый размер: 240x240 пикселей, формат: JPG, PNG. Максимальный размер: 1.5 МБ
                  </p>
                </div>
              </div>
              


            </div>
          </div>

          {/* Способы оплаты */}
          <div className="border-t pt-4 mt-6">
            <h3 className="text-lg font-semibold mb-4">Способы оплаты</h3>
            <PaymentMethodSelector
              paymentOnVisit={form.payment_on_visit}
              paymentAdvance={form.payment_advance}
              onPaymentMethodsChange={handlePaymentMethodsChange}
            />
          </div>
          
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">
              Сохранить
            </button>
            <button type="button" onClick={() => setEditMode(false)} className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300 transition-colors">
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Текущий пароль <span className="text-red-500">*</span>
            </label>
            <input 
              type="password" 
              name="oldPassword" 
              value={passwordForm.oldPassword} 
              onChange={handlePasswordChange} 
              className="border rounded px-3 py-2 w-full" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Новый пароль <span className="text-red-500">*</span>
            </label>
            <input 
              type="password" 
              name="newPassword" 
              value={passwordForm.newPassword} 
              onChange={handlePasswordChange} 
              className="border rounded px-3 py-2 w-full" 
              required 
              minLength={6}
            />
            <p className="text-xs text-gray-500 mt-1">Минимум 6 символов</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Подтвердите новый пароль <span className="text-red-500">*</span>
            </label>
            <input 
              type="password" 
              name="confirmPassword" 
              value={passwordForm.confirmPassword} 
              onChange={handlePasswordChange} 
              className="border rounded px-3 py-2 w-full" 
              required 
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-orange-600 text-white px-6 py-2 rounded hover:bg-orange-700 transition-colors">
              Изменить пароль
            </button>
            <button type="button" onClick={() => setPasswordMode(false)} className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300 transition-colors">
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Блок управления сайтом */}
      {profile.master.can_work_independently && (
        <div className="bg-white rounded-lg shadow-sm border p-6 w-full mt-6">
          <h2 className="text-xl font-semibold mb-4">Управление сайтом</h2>
          <div className="space-y-6">
            {/* Чекбокс для использования фото как логотипа */}
            <div className="flex items-center">
              <input 
                type="checkbox" 
                checked={usePhotoAsLogo} 
                onChange={(e) => {
                  setUsePhotoAsLogo(e.target.checked)
                  setWebsiteSettingsChanged(true)
                  // Сбрасываем файл логотипа при изменении флага
                  if (e.target.checked) {
                    setLogoFile(null)
                  }
                }} 
                className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="text-sm font-medium">
                Использовать мое фото на сайте
              </label>
            </div>
            
            {/* Фото для моего сайта (только если не используется фото как логотип) */}
            {!usePhotoAsLogo && (
              <div>
                <h3 className="text-lg font-medium mb-3">Фото для моего сайта</h3>
                <div className="space-y-2">
                  {profile.master.logo && (
                    <div className="flex items-center space-x-2">
                      <img 
                        src={getImageUrl(profile.master.logo)}
                        alt="Фото для сайта" 
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          setLogoFile(null)
                          // Здесь можно добавить логику удаления логотипа
                        }}
                        className="text-red-600 text-sm hover:text-red-700"
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0]
                        if (file) {
                          // Проверяем размер файла (1.5 МБ = 1572864 байт)
                          if (file.size > 1572864) {
                            alert('Размер файла не должен превышать 1.5 МБ')
                            return
                          }
                          
                          // Проверяем формат изображения
                          if (!file.type.startsWith('image/')) {
                            alert('Пожалуйста, выберите изображение')
                            return
                          }
                          
                          // Сохраняем файл для отправки
                          setLogoFile(file)
                        }
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Фото для отображения на вашем сайте. Рекомендуемый размер: 240x240 пикселей, формат: JPG, PNG. Максимальный размер: 1.5 МБ
                  </p>
                </div>
              </div>
            )}
            
            {/* Показываем информацию о том, что используется фото как логотип */}
            {usePhotoAsLogo && profile.master.photo && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  Используется ваше фото как логотип на сайте
                </p>
                <div className="mt-2">
                  <img 
                    src={getImageUrl(profile.master.photo)}
                    alt="Фото для сайта" 
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                </div>
              </div>
            )}

            {/* Цвет фона */}
            <div>
              <h3 className="text-lg font-medium mb-3">Цвет фона страницы</h3>
              <ColorPicker
                value={websiteSettings.background_color || '#ffffff'}
                onChange={(color) => {
                  setWebsiteSettings(prev => ({ ...prev, background_color: color }))
                  setWebsiteSettingsChanged(true)
                }}
                label="Выберите цвет фона для страницы мастера"
              />
              <p className="text-sm text-gray-500 mt-2">
                Этот цвет будет использоваться как фон для страницы мастера
              </p>
            </div>

            {/* Предварительный просмотр */}
            <div>
              <h3 className="text-lg font-medium mb-3">Предварительный просмотр</h3>
              <div 
                className="w-full h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center"
                style={{ backgroundColor: websiteSettings.background_color || '#ffffff' }}
              >
                <div className="text-center">
                  <div className="text-lg font-semibold mb-2">{profile.user.full_name}</div>
                  <div className="text-sm text-gray-600">Предварительный просмотр страницы</div>
                </div>
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={handleSaveWebsiteSettings}
                disabled={!websiteSettingsChanged}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                  websiteSettingsChanged
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Сохранить настройки
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ограничения клиентов (только для мастеров-индивидуалов) */}
      {profile?.master?.can_work_independently && (
        <div className="bg-white rounded-lg shadow-sm border p-6 w-full mt-6">
          <h2 className="text-xl font-semibold mb-4">Ограничения клиентов</h2>
          <ClientRestrictionsManager
            indieMasterId={profile.master.id}
            apiEndpoint="/api/master/restrictions"
            onRestrictionsChange={() => {
              // Можно добавить обновление данных при необходимости
            }}
          />
        </div>
      )}
    </div>
  )
} 