import React, { useState, useEffect, useMemo } from 'react'
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { cities, getTimezoneByCity } from '../utils/cities'
import { getImageUrl, API_BASE_URL } from '../utils/config'
import { apiGet, apiPut, apiFetch } from '../utils/api'
import PaymentMethodSelector from './PaymentMethodSelector'
import Tooltip from './Tooltip'
import FreeSlotsShareCardModal from './FreeSlotsShareCardModal'
import { isSalonFeaturesEnabled } from '../config/features'
import { Link } from 'react-router-dom'

const getFrontendBaseUrl = () => {
  // Приоритетно используем явный адрес из env, если он задан
  const envUrl = import.meta.env.VITE_PUBLIC_FRONTEND_URL?.replace(/\/$/, '')
  if (envUrl) {
    return envUrl
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const origin = window.location.origin
  if (origin.includes(':8000')) {
    return origin.replace(':8000', ':5173')
  }
  if (origin.includes(':8001')) {
    return origin.replace(':8001', ':5173')
  }
  return origin
}

/** Как в API публичного профиля: ссылка на карты только из города и основного адреса */
function buildYandexMapsUrlFromParts(city, addressMain) {
  const parts = []
  if (city && String(city).trim()) parts.push(String(city).trim())
  if (addressMain && String(addressMain).trim()) parts.push(String(addressMain).trim())
  if (parts.length === 0) return null
  return `https://yandex.ru/maps/?text=${encodeURIComponent(parts.join(', '))}`
}

export default function MasterSettings({
  onSettingsUpdate,
  featuresLoading,
  canCustomizeDomain,
  hasClientRestrictions,
  hasExtendedStats = false,
  planName,
}) {
  const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('demo_mode') === '1'
  const canCustomizeDomainEffective = isDemoMode || canCustomizeDomain
  const hasExtendedStatsEffective = isDemoMode || hasExtendedStats
  
  const [profile, setProfile] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [passwordMode, setPasswordMode] = useState(false)
  const [editWorkMode, setEditWorkMode] = useState(false)
  const [form, setForm] = useState({})
  const [paymentSettings, setPaymentSettings] = useState({
    accepts_online_payment: false
  })
  const [websiteSettings, setWebsiteSettings] = useState({
    logo: '',
    background_color: '#ffffff'
  })
  const [websiteSettingsChanged, setWebsiteSettingsChanged] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saveSuccessForE2E, setSaveSuccessForE2E] = useState(false) // устойчивый маркер для E2E
  const [editPublicPageMode, setEditPublicPageMode] = useState(false)
  const [showFreeSlotsCardModal, setShowFreeSlotsCardModal] = useState(false)

  const frontendBaseUrl = getFrontendBaseUrl()

  const slugChanged = useMemo(() => {
    const current = (websiteSettings?.domain || '').toString().trim()
    const saved = (profile?.master?.domain || '').toString().trim()
    return current !== saved
  }, [websiteSettings?.domain, profile?.master?.domain])

  /** Публичная страница записи: /m/:slug (slug = masters.domain) */
  const buildPublicBookingUrl = (slug) => {
    if (!slug || !String(slug).trim()) return null
    const base = frontendBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
    return `${base}/m/${String(slug).trim()}`
  }

  const copyPublicBookingUrl = async (slug) => {
    const url = buildPublicBookingUrl(slug)
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setSuccess('Ссылка скопирована')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Не удалось скопировать ссылку')
      setTimeout(() => setError(''), 3000)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet('/api/master/settings')
      setProfile(data)
      setForm({
        full_name: data.user.full_name || '',
        phone: data.user.phone || '',
        email: data.user.email || '',
        birth_date: data.user.birth_date || '',
        can_work_independently: isSalonFeaturesEnabled() ? (data.master.can_work_independently || false) : true,
        can_work_in_salon: isSalonFeaturesEnabled() ? (data.master.can_work_in_salon || false) : false,
        auto_confirm_bookings: data.master.auto_confirm_bookings || false,
        website: data.master.website || '',
        domain: data.master.domain || '',
        bio: data.master.bio || '',
        experience_years: data.master.experience_years || 0,
        city: data.master.city || '',
        address: data.master.address || '',
        address_detail: data.master.address_detail || '',
        timezone: data.master.timezone || '',
        payment_on_visit: data.master.payment_on_visit !== false,
        payment_advance: data.master.payment_advance || false
      })
      setWebsiteSettings({
        logo: data.master.logo || '',
        background_color: data.master.background_color || '#ffffff',
        site_description: data.master.site_description || '',
        domain: data.master.domain || ''
      })
      setPhotoFile(null)
      await loadPaymentSettings()
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }
  
  const loadPaymentSettings = async () => {
    try {
      const data = await apiGet('/api/master/payment-settings')
      setPaymentSettings({
        accepts_online_payment: data.accepts_online_payment || false
      })
    } catch (error) {
      console.error('Ошибка загрузки настроек оплаты:', error)
    }
  }
  
  const savePaymentSettings = async () => {
    try {
      await apiPut('/api/master/payment-settings', paymentSettings)
      setSuccess('Настройки оплаты сохранены')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      const errorData = err.response?.data || {}
      setError(errorData.detail || 'Ошибка сохранения настроек оплаты')
    }
  }
  
  const savePaymentSettingsSync = async (settings) => {
    try {
      await apiPut('/api/master/payment-settings', settings)
      // Успешно сохранено
    } catch (err) {
      const errorData = err.response?.data || {}
      console.error('Ошибка сохранения настроек оплаты:', errorData.detail || 'Неизвестная ошибка')
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

  /** Рабочие настройки: без bio/фото (они в блоке «Личная страница»). */
  const handleSaveWork = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()

      if (!isSalonFeaturesEnabled()) {
        form.can_work_independently = true
        form.can_work_in_salon = false
      }

      const workKeys = [
        'can_work_independently',
        'can_work_in_salon',
        'auto_confirm_bookings',
        'website',
        'city',
        'timezone',
        'payment_on_visit',
        'payment_advance',
      ]
      workKeys.forEach(key => {
        const v = form[key]
        if (v === undefined || v === '') return
        if ((key === 'city' || key === 'timezone') && !String(v).trim()) return
        if (typeof v === 'boolean') {
          formData.append(key, v ? 'true' : 'false')
        } else {
          formData.append(key, v)
        }
      })

      const res = await apiFetch('/api/master/profile', {
        method: 'PUT',
        body: formData
      })
      if (res.ok) {
        setSuccess('Настройки работы сохранены')
        setSaveSuccessForE2E(true)
        setTimeout(() => setSaveSuccessForE2E(false), 5000)
        setEditWorkMode(false)
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

  /** Фото / о себе / опыт — публичная часть профиля */
  const handleSavePublicProfile = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('bio', form.bio ?? '')
      formData.append('experience_years', String(form.experience_years ?? 0))
      if (photoFile) {
        formData.append('photo', photoFile)
      }
      const res = await apiFetch('/api/master/profile', {
        method: 'PUT',
        body: formData
      })
      if (res.ok) {
        setSuccess('Данные для страницы записи сохранены')
        setSaveSuccessForE2E(true)
        setTimeout(() => setSaveSuccessForE2E(false), 5000)
        setEditPublicPageMode(false)
        setPhotoFile(null)
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

  /** Адрес для публичной страницы записи и Яндекс.Карт */
  const handleSaveAddress = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('address', (form.address ?? '').toString())
      formData.append('address_detail', (form.address_detail ?? '').toString())
      const res = await apiFetch('/api/master/profile', {
        method: 'PUT',
        body: formData
      })
      if (res.ok) {
        setSuccess('Адрес сохранён')
        setTimeout(() => setSuccess(''), 3000)
        loadProfile()
        if (onSettingsUpdate) onSettingsUpdate()
      } else {
        const data = await res.json()
        setError(data.detail || 'Ошибка сохранения адреса')
      }
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  /** Личные данные: ФИО, контакты, город (экран «Редактировать профиль») */
  const handleSaveProfile = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      const profileKeys = ['full_name', 'phone', 'email', 'birth_date', 'city', 'timezone']
      profileKeys.forEach(key => {
        const v = form[key]
        if (v === undefined || v === '') return
        if ((key === 'city' || key === 'timezone') && !String(v).trim()) return
        formData.append(key, v)
      })
      const res = await apiFetch('/api/master/profile', {
        method: 'PUT',
        body: formData
      })
      if (res.ok) {
        setSuccess('Профиль успешно обновлен')
        setSaveSuccessForE2E(true)
        setTimeout(() => setSaveSuccessForE2E(false), 5000)
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
            formData.append('background_color', websiteSettings.background_color || '#ffffff')
            formData.append('site_description', websiteSettings.site_description || '')
            if (websiteSettings.domain !== undefined && websiteSettings.domain !== '') {
              formData.append('domain', websiteSettings.domain)
            }
      
      const res = await apiFetch('/api/master/profile', {
        method: 'PUT',
        body: formData
      })
      if (res.ok) {
        setSuccess('Текст страницы записи сохранён')
        setWebsiteSettingsChanged(false)
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

  const effectiveDomainSlug = (websiteSettings.domain || profile.master.domain || '').trim()
  const publicBookingUrl = buildPublicBookingUrl(effectiveDomainSlug || profile.master.domain)

  // Если открыт режим редактирования профиля или пароля, показываем на весь экран
  if (editMode || passwordMode) {
    return (
      <div className="mx-auto mt-4 max-w-2xl rounded-lg bg-white p-4 shadow sm:mt-8 sm:p-6">
        {success && <div className="text-green-600 mb-4 bg-green-50 border border-green-200 rounded-lg p-4" data-testid="settings-save-success">{success}</div>}
        {error && <div className="text-red-500 mb-4 bg-red-50 border border-red-200 rounded-lg p-4">{error}</div>}
        
        {editMode ? (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Редактирование профиля</h2>
            <div>
              <label className="block text-sm font-medium mb-1">
                ФИО <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                name="full_name" 
                value={form.full_name} 
                onChange={handleChange} 
                className="min-h-10 w-full rounded border px-3 py-2" 
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
                className="min-h-10 w-full rounded border px-3 py-2" 
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
                className="min-h-10 w-full rounded border px-3 py-2" 
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
                className="min-h-10 w-full rounded border px-3 py-2" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Город
              </label>
              <select 
                name="city" 
                value={form.city || ''} 
                onChange={handleChange}
                className="min-h-10 w-full rounded border px-3 py-2"
                aria-label="Город"
              >
                <option value="" disabled hidden>Выберите город</option>
                {cities.map(city => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={!form.city?.trim()}
                className="min-h-11 rounded bg-[#4CAF50] px-6 py-3 text-white transition-colors hover:bg-[#43a047] disabled:cursor-not-allowed disabled:opacity-50 sm:py-2"
              >
                Сохранить
              </button>
              <button type="button" onClick={() => setEditMode(false)} className="min-h-11 rounded bg-gray-200 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-300 sm:py-2">
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePasswordSave} className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Изменение пароля</h2>
            <div>
              <label className="block text-sm font-medium mb-1">
                Текущий пароль <span className="text-red-500">*</span>
              </label>
              <input 
                type="password" 
                name="oldPassword" 
                value={passwordForm.oldPassword} 
                onChange={handlePasswordChange} 
                className="min-h-10 w-full rounded border px-3 py-2" 
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
                className="min-h-10 w-full rounded border px-3 py-2" 
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
                className="min-h-10 w-full rounded border px-3 py-2" 
                required 
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="submit" className="min-h-11 rounded bg-orange-600 px-6 py-3 text-white transition-colors hover:bg-orange-700 sm:py-2">
                Изменить пароль
              </button>
              <button type="button" onClick={() => setPasswordMode(false)} className="min-h-11 rounded bg-gray-200 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-300 sm:py-2">
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto mt-4 max-w-7xl px-3 pb-8 sm:mt-8 sm:px-4">
      {saveSuccessForE2E && <span data-testid="settings-save-success" aria-hidden="true" className="sr-only" />}
      {/* Сообщения об успехе/ошибке */}
      {success && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-600">{success}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-500">{error}</div>}
      
      {/* Grid 2x2 для настроек */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        
        {/* Верхний левый угол - Настройка профиля */}
        <div className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-lg font-semibold sm:mb-4 sm:text-xl">Настройка профиля</h2>
          
          {/* Блок информации о подписке */}
          {!featuresLoading && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-green-900">
                    {isDemoMode ? (
                      <>Демо-режим: <span className="font-bold">Показан полный функционал</span></>
                    ) : (
                      <>Ваша подписка: <span className="font-bold">{planName || 'Free'}</span></>
                    )}
                  </div>
                  {!isDemoMode && planName && planName !== 'Free' && (
                    <div className="text-xs text-green-700 mt-1">
                      Доступны расширенные функции
                    </div>
                  )}
                </div>
                {!isDemoMode && planName && planName !== 'Free' && (
                  <Link
                    to="/master?tab=tariff"
                    className="inline-flex min-h-10 items-center text-xs text-[#4CAF50] underline hover:text-[#43a047]"
                  >
                    Обновить подписку
                  </Link>
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            <div><b>ФИО:</b> {profile.user.full_name}</div>
            <div><b>Телефон:</b> {profile.user.phone}</div>
            <div><b>Email:</b> {profile.user.email}</div>
            <div><b>Дата рождения:</b> {formatDate(profile.user.birth_date)}</div>
            <div><b>Город:</b> {profile.master.city || '—'}</div>
            {profile.user.is_always_free && (
              <div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                  ✨ Всегда бесплатно
                </span>
              </div>
            )}
          </div>
          
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => setEditMode(true)} className="min-h-11 rounded bg-[#4CAF50] px-4 py-3 text-sm text-white transition-colors hover:bg-[#43a047] sm:py-2">
              Редактировать профиль
            </button>
            <button type="button" onClick={() => setPasswordMode(true)} className="min-h-11 rounded bg-orange-600 px-4 py-3 text-sm text-white transition-colors hover:bg-orange-700 sm:py-2">
              Изменить пароль
            </button>
          </div>
        </div>

        {/* Верхний правый угол - Настройки работы */}
        <div className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-1 text-lg font-semibold sm:text-xl">Настройки работы</h2>
          <p className="text-xs text-gray-500 mb-4">Расписание, подтверждение записей, способы оплаты</p>
          
          {!editWorkMode ? (
            <>
              <div className="space-y-3">
                {isSalonFeaturesEnabled() && (
                  <>
                    <div><b>Самостоятельная работа:</b> {profile.master.can_work_independently ? 'Да' : 'Нет'}</div>
                    <div><b>Работа в салоне:</b> {profile.master.can_work_in_salon ? 'Да' : 'Нет'}</div>
                  </>
                )}
                {!isSalonFeaturesEnabled() && (
                  <div className="text-sm text-gray-600">Мастер работает только индивидуально</div>
                )}
                <div className="text-sm text-gray-600">
                  <b>Подтверждение записей:</b> {profile.master.auto_confirm_bookings ? 'Автоматически' : 'Вручную'}
                </div>
                {hasExtendedStatsEffective && !profile.master.auto_confirm_bookings && (
                  <div className="text-xs text-gray-600">
                    Подтверждение будущих записей до визита включено вместе с ручным режимом
                  </div>
                )}
                <div><b>Оплата при визите:</b> {profile.master.payment_on_visit !== false ? 'Да' : 'Нет'}</div>
                <div><b>Предоплата:</b> {profile.master.payment_advance ? 'Да' : 'Нет'}</div>
              </div>
              
              <button type="button" onClick={() => setEditWorkMode(true)} className="mt-6 min-h-11 rounded bg-[#4CAF50] px-4 py-3 text-sm text-white transition-colors hover:bg-[#43a047] sm:py-2" data-testid="settings-edit">
                Редактировать настройки
              </button>
            </>
          ) : (
            <form onSubmit={handleSaveWork} className="space-y-4">
              <div className="space-y-4">
                {isSalonFeaturesEnabled() ? (
                  <>
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        name="can_work_independently" 
                        checked={form.can_work_independently} 
                        onChange={handleChange} 
                        className="mr-3 h-4 w-4 text-[#4CAF50] focus:ring-[#4CAF50] border-gray-300 rounded"
                      />
                      <label className="text-sm font-medium">
                        Самостоятельная работа
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        name="can_work_in_salon" 
                        checked={form.can_work_in_salon} 
                        onChange={handleChange} 
                        className="mr-3 h-4 w-4 text-[#4CAF50] focus:ring-[#4CAF50] border-gray-300 rounded"
                      />
                      <label className="text-sm font-medium">
                        Работа в салоне
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    Мастер работает только индивидуально. Функции работы в салоне отключены в настройках администратора.
                  </div>
                )}
                
                {/* Настройка автоматического подтверждения записей */}
                <div className="border-t pt-4 mt-4">
                  <label className="block text-sm font-medium mb-3">
                    Подтверждение записей
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        name="auto_confirm_bookings" 
                        id="manual_confirm"
                        data-testid="toggle-auto-confirm"
                        checked={!form.auto_confirm_bookings} 
                        onChange={() => setForm({...form, auto_confirm_bookings: false})}
                        className="mr-3 h-4 w-4 text-[#4CAF50] focus:ring-[#4CAF50] border-gray-300"
                      />
                      <label htmlFor="manual_confirm" className="text-sm font-medium cursor-pointer">
                        Подтверждать каждую запись вручную
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        name="auto_confirm_bookings" 
                        id="auto_confirm"
                        checked={form.auto_confirm_bookings} 
                        onChange={() => setForm({...form, auto_confirm_bookings: true})}
                        className="mr-3 h-4 w-4 text-[#4CAF50] focus:ring-[#4CAF50] border-gray-300"
                      />
                      <label htmlFor="auto_confirm" className="text-sm font-medium cursor-pointer">
                        Автоматически подтверждать записи
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 ml-7 mt-1">
                      При автоматическом подтверждении записи, которые соответствуют рабочему времени и не вызывают конфликтов, будут сразу отображаться как подтвержденные
                    </p>
                    {hasExtendedStatsEffective && (
                      <p className="text-xs text-gray-500 ml-7 mt-2">
                        В режиме ручного подтверждения доступно предварительное подтверждение будущих записей (до визита), где это поддерживает тариф
                      </p>
                    )}
                  </div>
                </div>

                {/* Способы оплаты */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Способы оплаты</h3>
                  <PaymentMethodSelector
                    paymentOnVisit={form.payment_on_visit}
                    paymentAdvance={form.payment_advance}
                    onPaymentMethodsChange={handlePaymentMethodsChange}
                  />
                  
                  {/* Настройки онлайн оплаты */}
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Онлайн оплата через систему DeDato</h4>
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="accepts_online_payment"
                        checked={paymentSettings.accepts_online_payment}
                        disabled
                        className="mt-1 h-4 w-4 text-[#4CAF50] focus:ring-[#4CAF50] border-gray-300 rounded opacity-60 cursor-not-allowed"
                      />
                      <label htmlFor="accepts_online_payment" className="ml-3 text-sm text-gray-700">
                        <span className="font-medium">Принимаю оплату через систему DeDato</span>
                        <span className="block text-xs text-amber-600 mt-1">Функция в разработке</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  data-testid="settings-save"
                  disabled={!form.city?.trim()}
                  className="min-h-11 rounded bg-[#4CAF50] px-4 py-3 text-sm text-white transition-colors hover:bg-[#43a047] disabled:cursor-not-allowed disabled:opacity-50 sm:py-2"
                >
                  Сохранить
                </button>
                <button type="button" onClick={() => setEditWorkMode(false)} className="min-h-11 rounded bg-gray-200 px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-300 sm:py-2">
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Личная страница / публичная запись (на всю ширину) */}
        {profile.master.can_work_independently && (
          <div className="rounded-lg border bg-white p-4 shadow-sm sm:p-6 md:col-span-2">
            <h2 className="mb-1 text-lg font-semibold sm:text-xl">Личная страница и запись клиентов</h2>
            <p className="text-xs text-gray-500 mb-6">Ссылка на запись, текст и оформление — то, что видит клиент</p>
            <div className="space-y-8">
              {/* Ссылка на страницу записи: канонический URL /m/:slug */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Ссылка на страницу записи</h3>
                <div
                  className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${
                    slugChanged ? 'relative pb-16' : ''
                  }`}
                >
                  {canCustomizeDomainEffective ? (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
                          <span className="text-sm text-gray-600 whitespace-nowrap">
                            {(frontendBaseUrl || window.location.origin)}/m/
                          </span>
                          <input
                            type="text"
                            value={websiteSettings.domain || ''}
                            onChange={(e) => {
                              setWebsiteSettings(s => ({ ...s, domain: e.target.value }))
                              setWebsiteSettingsChanged(true)
                            }}
                            placeholder="ваш-адрес"
                            className="border rounded px-3 py-2 flex-1 min-w-[8rem] text-sm"
                            data-testid="settings-master-domain-input"
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Tooltip text="Открыть страницу записи">
                            <button
                              type="button"
                              onClick={() => {
                                const u = buildPublicBookingUrl((websiteSettings.domain || profile.master.domain || '').trim())
                                if (u) window.open(u, '_blank', 'noopener,noreferrer')
                              }}
                              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-green-50 hover:text-[#4CAF50]"
                            >
                              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                              Открыть
                            </button>
                          </Tooltip>
                          <Tooltip text="Копировать ссылку">
                            <button
                              type="button"
                              onClick={() => copyPublicBookingUrl((websiteSettings.domain || profile.master.domain || '').trim())}
                              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-green-50 hover:text-[#4CAF50]"
                              data-testid="settings-copy-public-url"
                            >
                              <ClipboardDocumentIcon className="h-5 w-5" />
                              Копировать
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowFreeSlotsCardModal(true)}
                          disabled={!(websiteSettings.domain || profile.master.domain || '').toString().trim()}
                          className="text-sm font-medium text-[#2f7d32] hover:text-[#4CAF50] disabled:opacity-40 disabled:cursor-not-allowed underline decoration-dotted underline-offset-2"
                          data-testid="settings-free-slots-card-open"
                        >
                          Картинка со свободными часами
                        </button>
                      </div>
                      {slugChanged ? (
                        <button
                          type="button"
                          onClick={handleSaveWebsiteSettings}
                          disabled={!websiteSettingsChanged || loading}
                          className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg bg-[#4CAF50] px-3 py-2 text-sm font-semibold text-white hover:bg-[#43a047] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="settings-save-domain-inline"
                        >
                          Сохранить адрес
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {publicBookingUrl ? (
                            <a
                              href={publicBookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-[#4CAF50] hover:underline break-all"
                            >
                              {publicBookingUrl}
                            </a>
                          ) : (
                            <span className="text-sm text-gray-600">
                              Ссылка появится после сохранения настроек (домен генерируется автоматически)
                            </span>
                          )}
                        </div>
                        {publicBookingUrl && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Tooltip text="Открыть страницу записи">
                              <button
                                type="button"
                                onClick={() => window.open(publicBookingUrl, '_blank', 'noopener,noreferrer')}
                                className="p-1.5 text-gray-600 hover:text-[#4CAF50] hover:bg-green-50 rounded transition-colors"
                              >
                                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                              </button>
                            </Tooltip>
                            <Tooltip text="Копировать ссылку">
                              <button
                                type="button"
                                onClick={() => copyPublicBookingUrl(profile.master.domain)}
                                className="p-1.5 text-gray-600 hover:text-[#4CAF50] hover:bg-green-50 rounded transition-colors"
                                data-testid="settings-copy-public-url"
                              >
                                <ClipboardDocumentIcon className="h-5 w-5" />
                              </button>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Это полная ссылка на онлайн-запись. Отправьте её клиентам в мессенджере или соцсетях.
                      </p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowFreeSlotsCardModal(true)}
                          disabled={!profile.master.domain || !String(profile.master.domain).trim()}
                          className="text-sm font-medium text-[#2f7d32] hover:text-[#4CAF50] disabled:opacity-40 disabled:cursor-not-allowed underline decoration-dotted underline-offset-2"
                          data-testid="settings-free-slots-card-open"
                        >
                          Картинка со свободными часами
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <FreeSlotsShareCardModal
                open={showFreeSlotsCardModal}
                onClose={() => setShowFreeSlotsCardModal(false)}
                slug={(websiteSettings.domain || profile.master.domain || '').toString().trim()}
                bookingUrl={buildPublicBookingUrl((websiteSettings.domain || profile.master.domain || '').toString().trim())}
              />

              {/* Адрес на странице записи (публично + Яндекс.Карты) */}
              <div className="border-t border-gray-100 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Адрес на странице записи</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Видят клиенты; ссылка на карты строится по городу (профиль) и основному адресу
                </p>
                <form onSubmit={handleSaveAddress} className="space-y-3 max-w-2xl">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-sm font-medium">Адрес</label>
                      <Tooltip
                        compact
                        position="top"
                        maxWidthClass="max-w-sm"
                        content={
                          <span className="text-xs leading-snug">
                            Лучше скопировать точный адрес из Яндекс.Карт — так ссылка на карту будет точнее совпадать с
                            нужным местом.
                          </span>
                        }
                      >
                        <button
                          type="button"
                          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-gray-300 px-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
                          aria-label="Подсказка по полю адреса"
                          data-testid="settings-address-hint"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                    <textarea
                      name="address"
                      value={form.address || ''}
                      onChange={handleChange}
                      rows={2}
                      className="border rounded px-3 py-2 w-full text-sm"
                      placeholder="Улица, дом — для карты и страницы записи"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const u = buildYandexMapsUrlFromParts(form.city, form.address)
                          if (u) window.open(u, '_blank', 'noopener,noreferrer')
                        }}
                        disabled={!buildYandexMapsUrlFromParts(form.city, form.address)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-green-50 hover:text-[#4CAF50] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        Проверить на карте
                      </button>
                      <span className="text-xs text-gray-500">
                        Город задаётся в «Редактировать профиль»
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Уточнение к адресу</label>
                    <textarea
                      name="address_detail"
                      value={form.address_detail || ''}
                      onChange={handleChange}
                      rows={2}
                      className="border rounded px-3 py-2 w-full text-sm"
                      placeholder="Этаж, подъезд, домофон — только текст, не в ссылку на карты"
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-[#4CAF50] text-white px-4 py-2 rounded hover:bg-[#43a047] text-sm"
                    data-testid="settings-save-address"
                  >
                    Сохранить адрес
                  </button>
                </form>
              </div>

              {/* Профиль на публичной странице */}
              <div className="border-t border-gray-100 pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Профиль на странице записи</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Фото, описание и опыт — для клиентов</p>
                  </div>
                  {!editPublicPageMode && (
                    <button
                      type="button"
                      onClick={() => setEditPublicPageMode(true)}
                      className="bg-[#4CAF50] text-white px-4 py-2 rounded hover:bg-[#43a047] transition-colors text-sm self-start"
                      data-testid="settings-edit-public-profile"
                    >
                      Редактировать
                    </button>
                  )}
                </div>

                {!editPublicPageMode ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex gap-4 items-start">
                      <div className="shrink-0" data-testid="settings-public-photo-preview">
                        {profile.master.photo ? (
                          <img
                            src={getImageUrl(profile.master.photo)}
                            alt=""
                            className="w-20 h-20 rounded-xl object-cover border border-gray-100 shadow-sm"
                          />
                        ) : (
                          <div
                            className="w-20 h-20 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400 gap-0.5"
                            aria-label="Фото не загружено"
                          >
                            <UserCircleIcon className="w-9 h-9 opacity-60" />
                            <span className="text-[10px] leading-tight px-1 text-center text-gray-400">Нет фото</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div><span className="text-gray-500">О себе:</span> {profile.master.bio || '—'}</div>
                        <div><span className="text-gray-500">Опыт:</span> {profile.master.experience_years ?? 0} лет</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSavePublicProfile} className="space-y-4 max-w-2xl">
                    <div>
                      <label className="block text-sm font-medium mb-1">О себе</label>
                      <textarea
                        name="bio"
                        value={form.bio}
                        onChange={handleChange}
                        rows={3}
                        className="border rounded px-3 py-2 w-full text-sm"
                        placeholder="Расскажите о себе — это увидят клиенты"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Опыт работы (лет)</label>
                      <input
                        type="number"
                        name="experience_years"
                        value={form.experience_years}
                        onChange={handleChange}
                        min="0"
                        className="border rounded px-3 py-2 w-full max-w-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Фото для страницы записи</label>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="shrink-0">
                          {photoFile ? (
                            <img
                              src={URL.createObjectURL(photoFile)}
                              alt="Новое фото"
                              className="w-24 h-24 rounded-xl object-cover border border-gray-100 shadow-sm"
                            />
                          ) : profile.master.photo ? (
                            <img
                              src={getImageUrl(profile.master.photo)}
                              alt="Фото мастера"
                              className="w-24 h-24 rounded-xl object-cover border border-gray-100 shadow-sm"
                            />
                          ) : (
                            <div className="w-24 h-24 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                              <UserCircleIcon className="w-10 h-10 opacity-60" />
                              <span className="text-[10px] mt-1 px-1 text-center">Нет фото</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-2 w-full">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (file) {
                                if (file.size > 1572864) {
                                  alert('Размер файла не должен превышать 1.5 МБ')
                                  return
                                }
                                if (!file.type.startsWith('image/')) {
                                  alert('Пожалуйста, выберите изображение')
                                  return
                                }
                                setPhotoFile(file)
                              }
                            }}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                          />
                          <p className="text-xs text-gray-500">До 1.5 МБ, JPG или PNG. Рекомендуется квадрат 240×240</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="bg-[#4CAF50] text-white px-4 py-2 rounded hover:bg-[#43a047] text-sm"
                        data-testid="settings-save-public-profile"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditPublicPageMode(false)
                          setPhotoFile(null)
                          loadProfile()
                        }}
                        className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Оформление страницы — только дополнительный текст (описание страницы записи) */}
              <div className="border-t border-gray-100 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Оформление страницы</h3>
                <p className="text-xs text-gray-500 mb-4">Дополнительный текст на странице записи</p>
                <div>
                  <label className="block text-sm font-medium mb-2">Текстовый блок для страницы записи</label>
                  <textarea
                    value={websiteSettings.site_description || ''}
                    onChange={(e) => {
                      setWebsiteSettings(prev => ({ ...prev, site_description: e.target.value }))
                      setWebsiteSettingsChanged(true)
                    }}
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Кратко опишите формат приёма или что важно знать клиенту..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Отображается на публичной странице записи вместе с профилем
                  </p>
                </div>
              </div>

              {/* Кнопки действий — текст страницы и домен (если меняли в блоках выше) */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleSaveWebsiteSettings}
                  disabled={!websiteSettingsChanged}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${
                    websiteSettingsChanged
                      ? 'bg-[#4CAF50] text-white hover:bg-[#43a047]'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Сохранить настройки
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
