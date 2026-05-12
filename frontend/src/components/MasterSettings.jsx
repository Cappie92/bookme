import React, { useState, useEffect, useMemo } from 'react'
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { cities, getTimezoneByCity } from '../utils/cities'
import { getImageUrl, API_BASE_URL } from '../utils/config'
import { apiGet, apiPut, apiFetch } from '../utils/api'
import PaymentMethodSelector from './PaymentMethodSelector'
import Tooltip from './Tooltip'
import FreeSlotsShareCardModal from './FreeSlotsShareCardModal'
import { isSalonFeaturesEnabled } from '../config/features'
import { Link, useNavigate } from 'react-router-dom'

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

/** Визуальные токены страницы настроек (единый стиль read-only / edit, без новой логики) */
const SV = {
  pageWrap: 'mx-auto mt-3 max-w-7xl bg-[#FAF8F6] px-3 pb-8 sm:mt-5 sm:px-4',
  shell:
    'rounded-[16px] border border-[#E7E2DF]/95 bg-white/[0.98] p-4 shadow-[0_10px_26px_-20px_rgba(45,45,45,0.14)] sm:p-[17px]',
  ctl:
    'min-h-10 w-full rounded-[11px] border border-[#E7E2DF] bg-white px-3.5 py-2.5 text-sm text-[#2D2D2D] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition-[box-shadow,border-color] placeholder:text-[#9CA3AF] focus:border-[#4CAF50] focus:ring-2 focus:ring-[#4CAF50]/20',
  ctlArea:
    'min-h-[80px] w-full resize-y rounded-[11px] border border-[#E7E2DF] bg-white px-3.5 py-2.5 text-sm text-[#2D2D2D] outline-none focus:border-[#4CAF50] focus:ring-2 focus:ring-[#4CAF50]/20',
  readValue:
    'flex min-h-[42px] items-center rounded-[11px] border border-[#E7E2DF] bg-white px-3 py-2.5 text-sm text-[#2D2D2D] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
  btnPri:
    'inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#4CAF50] px-4 text-sm font-medium text-white transition-colors hover:bg-[#45A049] disabled:cursor-not-allowed disabled:opacity-50',
  btnSec:
    'inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#E7E2DF] bg-white px-4 text-sm font-medium text-[#2D2D2D] transition-colors hover:bg-[#F4F1EF]',
  btnAccent:
    'inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#E65100] px-4 text-sm font-medium text-white transition-colors hover:bg-[#EF6C00]',
  btnGhost:
    'inline-flex min-h-9 items-center justify-center gap-1 rounded-[10px] border border-[#E7E2DF] bg-white px-3 text-sm font-medium text-[#2D2D2D] transition-colors hover:bg-[#F4F1EF] hover:text-[#3D8B42]',
  check:
    'h-4 w-4 rounded border-[#E7E2DF] text-[#4CAF50] focus:ring-2 focus:ring-[#4CAF50]/25',
  radio:
    'h-4 w-4 border-[#E7E2DF] text-[#4CAF50] focus:ring-2 focus:ring-[#4CAF50]/25',
}

export default function MasterSettings({
  onSettingsUpdate,
  featuresLoading,
  canCustomizeDomain,
  hasClientRestrictions,
  hasExtendedStats = false,
  planName,
  subscriptionStatus = null,
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
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [deleteAccountPhase, setDeleteAccountPhase] = useState('call')
  const [deleteAccountCode, setDeleteAccountCode] = useState('')

  // Pending phone/email подтверждения (минимально, без редизайна)
  const [phoneChangeStep, setPhoneChangeStep] = useState('none') // none | enter_digits
  const [phoneChangeCallId, setPhoneChangeCallId] = useState('')
  const [phoneChangeDigits, setPhoneChangeDigits] = useState('')
  const [phoneChangeError, setPhoneChangeError] = useState('')
  const [emailChangeInfo, setEmailChangeInfo] = useState('')

  const navigate = useNavigate()
  const frontendBaseUrl = getFrontendBaseUrl()

  const slugChanged = useMemo(() => {
    const current = (websiteSettings?.domain || '').toString().trim()
    const saved = (profile?.master?.domain || '').toString().trim()
    return current !== saved
  }, [websiteSettings?.domain, profile?.master?.domain])

  const profileFormDirty = useMemo(() => {
    if (!profile) return false
    const u = profile.user
    const m = profile.master
    return (
      (form.full_name ?? '') !== (u.full_name ?? '') ||
      (form.phone ?? '') !== (u.phone ?? '') ||
      (form.email ?? '') !== (u.email ?? '') ||
      String(form.birth_date ?? '') !== String(u.birth_date ?? '') ||
      (form.city ?? '') !== (m.city ?? '')
    )
  }, [profile, form.full_name, form.phone, form.email, form.birth_date, form.city])

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
      setWebsiteSettingsChanged(false)
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

  /** Фото, опыт, текст страницы записи (site_description) — публичная часть; bio в API не трогаем из этого сценария */
  const handleSavePublicProfile = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('bio', (profile?.master?.bio ?? '').toString())
      formData.append('experience_years', String(form.experience_years ?? 0))
      formData.append('site_description', websiteSettings.site_description ?? '')
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

  /** Личные данные: ФИО, контакты, город (inline в блоке «Настройка профиля») */
  const handleSaveProfile = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setPhoneChangeError('')
    setEmailChangeInfo('')
    try {
      const prevPhone = profile?.user?.phone || ''
      const prevEmail = profile?.user?.email || ''
      const nextPhone = form.phone || ''
      const nextEmail = form.email || ''

      const formData = new FormData()
      // phone/email не отправляем через PUT /master/profile — только pending + auth-эндпоинты
      const profileKeys = ['full_name', 'birth_date', 'city', 'timezone']
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

        const token = localStorage.getItem('access_token')
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

        // Если меняли телефон — инициируем pending flow (звонок + 4 цифры)
        if (nextPhone && nextPhone !== prevPhone) {
          const r = await fetch(`/api/auth/request-phone-change`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ phone: nextPhone }),
          })
          const data = await r.json().catch(() => ({}))
          if (r.ok && data?.success && data?.call_id) {
            setPhoneChangeCallId(data.call_id)
            setPhoneChangeStep('enter_digits')
            setSuccess(data?.message || 'Подтвердите новый телефон: введите 4 цифры из звонка.')
          } else {
            setPhoneChangeError(data?.message || data?.detail || 'Не удалось инициировать подтверждение телефона')
          }
        }

        // Если меняли email — инициируем pending flow (письмо со ссылкой)
        if (nextEmail && nextEmail !== prevEmail) {
          const r = await fetch(`/api/auth/request-email-change`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ email: nextEmail }),
          })
          const data = await r.json().catch(() => ({}))
          setEmailChangeInfo(
            (r.ok && data?.success)
              ? (data?.message || 'Письмо отправлено на новый email. Перейдите по ссылке из письма.')
              : (data?.message || data?.detail || 'Не удалось отправить письмо подтверждения.')
          )
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

  const confirmPhoneChange = async () => {
    setPhoneChangeError('')
    if (!phoneChangeDigits || phoneChangeDigits.length !== 4) {
      setPhoneChangeError('Введите 4 цифры')
      return
    }
    try {
      const token = localStorage.getItem('access_token')
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
      const r = await fetch(`/api/auth/confirm-phone-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          phone: form.phone,
          call_id: phoneChangeCallId,
          phone_digits: phoneChangeDigits,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && data?.success) {
        setSuccess(data?.message || 'Телефон подтверждён')
        setPhoneChangeStep('none')
        setPhoneChangeCallId('')
        setPhoneChangeDigits('')
        loadProfile()
      } else {
        setPhoneChangeError(data?.message || data?.detail || 'Неверный код')
      }
    } catch {
      setPhoneChangeError('Ошибка сети')
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
      const res = await fetch(`/api/auth/change-password`, {
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

  /** Существующий backend: DELETE /api/auth/delete-account → звонок с кодом → POST /api/auth/confirm-delete-account */
  const openDeleteAccountModal = () => {
    if (isDemoMode) {
      setError('В демо-режиме удаление аккаунта недоступно')
      setTimeout(() => setError(''), 4000)
      return
    }
    setDeleteAccountPhase('call')
    setDeleteAccountCode('')
    setShowDeleteAccountModal(true)
  }

  const closeDeleteAccountModal = () => {
    setShowDeleteAccountModal(false)
    setDeleteAccountPhase('call')
    setDeleteAccountCode('')
  }

  const requestDeleteAccountCall = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/delete-account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : data.message || 'Не удалось отправить запрос')
        return
      }
      if (data.success === false) {
        setError(data.message || 'Ошибка отправки звонка')
        return
      }
      setDeleteAccountPhase('code')
      setSuccess(data.message || 'Звонок с кодом отправлен')
      setTimeout(() => setSuccess(''), 5000)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const confirmDeleteAccount = async () => {
    const code = deleteAccountCode.trim()
    if (!code) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/auth/confirm-delete-account?code=${encodeURIComponent(code)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : data.message || 'Ошибка удаления')
        return
      }
      if (data.success === false) {
        setError(data.message || 'Неверный код или код истёк')
        return
      }
      if (data.message === 'Аккаунт успешно удален') {
        localStorage.removeItem('access_token')
        closeDeleteAccountModal()
        navigate('/')
        return
      }
      setError(data.detail || data.message || 'Не удалось удалить аккаунт')
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
        setSuccess('Сохранено')
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

  const formatEndDateShort = (dt) => {
    if (!dt) return null
    try {
      return new Date(dt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return null
    }
  }

  const subscriptionPillLabel = () => {
    if (isDemoMode) return 'Демо'
    if (subscriptionStatus?.is_frozen) return 'Заморозка'
    if (subscriptionStatus?.status === 'no_subscription') return 'Нет подписки'
    if (
      subscriptionStatus &&
      !subscriptionStatus.can_continue &&
      subscriptionStatus.status !== 'no_subscription' &&
      !subscriptionStatus.is_unlimited
    ) {
      return 'Внимание'
    }
    if (profile?.user?.is_always_free || subscriptionStatus?.is_always_free) return 'Бесплатно'
    return 'Активна'
  }

  const displayPlanName = () =>
    subscriptionStatus?.plan_display_name ||
    subscriptionStatus?.plan_name ||
    planName ||
    'Free'

  if (loading && !profile) return <div>Загрузка...</div>
  if (error && !profile) return <div className="text-red-500">{error}</div>
  if (!profile) return null

  const effectiveDomainSlug = (websiteSettings.domain || profile.master.domain || '').trim()
  const publicBookingUrl = buildPublicBookingUrl(effectiveDomainSlug || profile.master.domain)

  // Только смена пароля — отдельный экран; профиль редактируется inline в блоке «Настройка профиля»
  if (passwordMode) {
    return (
      <div className={`${SV.pageWrap} pb-10`}>
        {success && (
          <div
            className="mb-4 rounded-[11px] border border-green-200 bg-green-50 p-3 text-sm text-green-800"
            data-testid="settings-save-success"
          >
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-[11px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <div className={`${SV.shell} mx-auto max-w-2xl`}>
            <form onSubmit={handlePasswordSave} className="space-y-4">
              <h2 className="m-0 text-lg font-semibold tracking-tight text-[#2D2D2D]">Изменение пароля</h2>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">
                  Текущий пароль <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="oldPassword"
                  value={passwordForm.oldPassword}
                  onChange={handlePasswordChange}
                  className={SV.ctl}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">
                  Новый пароль <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  className={SV.ctl}
                  required
                  minLength={6}
                />
                <p className="mt-1.5 text-xs text-[#6B6B6B]">Минимум 6 символов</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">
                  Подтвердите новый пароль <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  className={SV.ctl}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <button type="submit" className={SV.btnAccent}>
                  Изменить пароль
                </button>
                <button type="button" onClick={() => setPasswordMode(false)} className={SV.btnSec}>
                  Отмена
                </button>
              </div>
            </form>
        </div>
      </div>
    )
  }

  const panelShell = SV.shell
  const inputLike = SV.readValue
  const textareaLike = SV.ctlArea
  const workPill = 'shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
  const workPillGreen = `${workPill} bg-[#DFF5EC] text-[#3D8B42]`
  const workPillNeutral = `${workPill} bg-[#F4F1EF] text-[#6B6B6B]`

  const subscriptionMetaSecondary = () => {
    const end = formatEndDateShort(subscriptionStatus?.end_date)
    const dr = subscriptionStatus?.days_remaining
    const paidish =
      subscriptionStatus &&
      !subscriptionStatus.is_unlimited &&
      (subscriptionStatus.plan_name || '').toLowerCase() !== 'free'
    if (end) {
      return { label: 'Окончание', value: end }
    }
    if (typeof dr === 'number' && paidish) {
      return { label: 'Дней доступа', value: String(dr) }
    }
    if (subscriptionStatus && typeof subscriptionStatus.balance === 'number') {
      return {
        label: 'Баланс',
        value: `${subscriptionStatus.balance.toLocaleString('ru-RU')} ₽`,
      }
    }
    if (subscriptionStatus?.is_unlimited) {
      return { label: 'Период', value: 'Без ограничения' }
    }
    return { label: 'Период', value: '—' }
  }

  const showSubscriptionDaysBar =
    typeof subscriptionStatus?.days_remaining === 'number' &&
    subscriptionStatus &&
    !subscriptionStatus.is_unlimited &&
    (subscriptionStatus.plan_name || '').toLowerCase() !== 'free'

  const subscriptionSecondaryMeta = subscriptionMetaSecondary()

  return (
    <div className={`${SV.pageWrap} pb-10`}>
      {saveSuccessForE2E && <span data-testid="settings-save-success" aria-hidden="true" className="sr-only" />}
      {success && <div className="mb-3 rounded-[11px] border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</div>}
      {error && <div className="mb-3 rounded-[11px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {emailChangeInfo && (
        <div className="mb-3 rounded-[11px] border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {emailChangeInfo}
        </div>
      )}

      {phoneChangeStep === 'enter_digits' && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-4 sm:p-6 max-h-[90dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-gray-900 pr-2">Подтверждение телефона</h3>
              <button
                type="button"
                onClick={() => {
                  setPhoneChangeStep('none')
                  setPhoneChangeCallId('')
                  setPhoneChangeDigits('')
                  setPhoneChangeError('')
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              Введите последние 4 цифры номера, с которого вам звонят.
            </p>
            <label className="mb-2 block text-sm font-medium text-gray-700">4 цифры</label>
            <input
              value={phoneChangeDigits}
              onChange={(e) => setPhoneChangeDigits((e.target.value || '').replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className={SV.ctl}
              placeholder="1234"
            />
            {phoneChangeError && (
              <div className="mt-3 rounded-[11px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {phoneChangeError}
              </div>
            )}
            <div className="mt-4 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhoneChangeStep('none')
                  setPhoneChangeCallId('')
                  setPhoneChangeDigits('')
                  setPhoneChangeError('')
                }}
                className={SV.btnSec}
              >
                Отмена
              </button>
              <button type="button" onClick={confirmPhoneChange} className={SV.btnPri}>
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="mb-2 flex flex-row flex-wrap items-center gap-3 sm:mb-3">
        <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.03em] text-[#2D2D2D] sm:text-[28px]">Настройки</h1>
      </header>

      <div
        className={
          profile.master.can_work_independently
            ? 'flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_min(390px,100%)] lg:items-stretch lg:gap-4'
            : 'flex flex-col gap-3'
        }
      >
        <div className="flex min-w-0 flex-col gap-3 lg:h-full lg:min-h-0">
          <section className={panelShell}>
            <div className="mb-3">
              <h2 className="m-0 text-base font-semibold tracking-tight text-[#2D2D2D]">Настройка профиля</h2>
            </div>
            {!editMode ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-[#6B6B6B]">ФИО</div>
                    <div className={`${inputLike} flex min-h-[44px] items-center`}>{profile.user.full_name}</div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-[#6B6B6B]">Телефон</div>
                    <div className={`${inputLike} flex min-h-[44px] items-center`}>{profile.user.phone}</div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-[#6B6B6B]">Email</div>
                    <div className={`${inputLike} flex min-h-[44px] items-center`}>{profile.user.email}</div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-[#6B6B6B]">Дата рождения</div>
                    <div className={`${inputLike} flex min-h-[44px] items-center`}>{formatDate(profile.user.birth_date)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="mb-1.5 text-xs font-semibold text-[#6B6B6B]">Город</div>
                    <div className={`${inputLike} flex min-h-[44px] items-center`}>{profile.master.city || '—'}</div>
                  </div>
                </div>
                {profile.user.is_always_free && (
                  <div className="mt-3">
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                      ✨ Всегда бесплатно
                    </span>
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" onClick={() => setEditMode(true)} className={SV.btnPri}>
                    Редактировать профиль
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">
                      ФИО <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      value={form.full_name}
                      onChange={handleChange}
                      className={SV.ctl}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">
                      Телефон <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      className={SV.ctl}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      className={SV.ctl}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">Дата рождения</label>
                    <input
                      type="date"
                      name="birth_date"
                      value={form.birth_date}
                      onChange={handleChange}
                      className={SV.ctl}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-[#6B6B6B]">Город</label>
                    <select
                      name="city"
                      value={form.city || ''}
                      onChange={handleChange}
                      className={SV.ctl}
                      aria-label="Город"
                    >
                      <option value="" disabled hidden>
                        Выберите город
                      </option>
                      {cities.map(city => (
                        <option key={city.name} value={city.name}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {profileFormDirty ? (
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <button type="submit" disabled={!form.city?.trim()} className={SV.btnPri}>
                      Сохранить
                    </button>
                    <button
                      type="button"
                      className={SV.btnSec}
                      onClick={() => {
                        setEditMode(false)
                        if (profile) {
                          setForm(f => ({
                            ...f,
                            full_name: profile.user.full_name || '',
                            phone: profile.user.phone || '',
                            email: profile.user.email || '',
                            birth_date: profile.user.birth_date || '',
                            city: profile.master.city || '',
                            timezone: profile.master.timezone || f.timezone,
                          }))
                        }
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                ) : null}
              </form>
            )}
          </section>

          {!featuresLoading && (
            <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-[#1F2B23] via-[#2D4732] to-[#4CAF50] p-3.5 text-white shadow-[0_14px_36px_-16px_rgba(61,139,66,0.42)] sm:p-4">
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_68%)]"
                aria-hidden
              />
              <div className="relative text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">Текущая подписка</div>
              <div className="relative mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[22px] font-bold leading-[1.15] tracking-[-0.03em] sm:text-2xl">{displayPlanName()}</div>
                  {isDemoMode ? (
                    <div className="mt-1 text-[12px] leading-snug text-white/82">Демо-режим: показан полный функционал</div>
                  ) : (
                    planName &&
                    planName !== 'Free' && (
                      <div className="mt-1 text-[12px] leading-snug text-white/82">Доступны расширенные функции</div>
                    )
                  )}
                </div>
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/14 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white sm:text-[11px]">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[#8EF0AA] shadow-[0_0_0_2px_rgba(142,240,170,0.12)]"
                    aria-hidden
                  />
                  {subscriptionPillLabel()}
                </div>
              </div>
              <div className="relative mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-[8px]">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-white/65">Тариф</div>
                  <div className="mt-0.5 text-sm font-semibold leading-tight">{displayPlanName()}</div>
                </div>
                <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-[8px]">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-white/65">
                    {subscriptionSecondaryMeta.label}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold leading-tight">{subscriptionSecondaryMeta.value}</div>
                </div>
              </div>
              <div className="relative mt-3">
                {showSubscriptionDaysBar ? (
                  <>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-white/75">
                      <span>Дней доступа (оценка по балансу)</span>
                      <span>{subscriptionStatus.days_remaining}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/18">
                      <div className="h-full max-w-[10rem] rounded-full bg-gradient-to-r from-[#DFF5EC] to-white" />
                    </div>
                  </>
                ) : (
                  <div className="h-1 overflow-hidden rounded-full bg-white/18" aria-hidden>
                    <div className="h-full max-w-[10rem] rounded-full bg-gradient-to-r from-white/45 to-white/75 opacity-90" />
                  </div>
                )}
              </div>
              {!isDemoMode && planName && planName !== 'Free' && (
                <div className="relative mt-3">
                  <Link
                    to="/master?tab=tariff"
                    className="inline-flex min-h-9 w-full items-center justify-center rounded-[10px] bg-white px-4 py-2 text-center text-[13px] font-semibold text-[#3D8B42] transition-colors hover:bg-white/95 sm:w-auto"
                  >
                    Обновить подписку
                  </Link>
                </div>
              )}
            </div>
          )}

        <section className={panelShell}>
          <div className="mb-3">
            <h2 className="m-0 text-base font-semibold tracking-tight text-[#2D2D2D]">Настройки работы</h2>
          </div>

          {!editWorkMode ? (
            <>
              <div className="space-y-2">
                {isSalonFeaturesEnabled() && (
                  <>
                    <div className="work-item flex items-start justify-between gap-3 rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] px-3 py-2.5">
                      <span className="text-sm font-medium text-[#2D2D2D]">Самостоятельная работа</span>
                      <span className={profile.master.can_work_independently ? workPillGreen : workPillNeutral}>
                        {profile.master.can_work_independently ? 'Да' : 'Нет'}
                      </span>
                    </div>
                    <div className="work-item flex items-start justify-between gap-3 rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] px-3 py-2.5">
                      <span className="text-sm font-medium text-[#2D2D2D]">Работа в салоне</span>
                      <span className={profile.master.can_work_in_salon ? workPillGreen : workPillNeutral}>
                        {profile.master.can_work_in_salon ? 'Да' : 'Нет'}
                      </span>
                    </div>
                  </>
                )}
                {!isSalonFeaturesEnabled() && (
                  <div className="rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] px-3 py-2.5 text-sm text-[#6B6B6B]">
                    Мастер работает только индивидуально
                  </div>
                )}
                <div className="work-item flex items-start justify-between gap-3 rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] px-3 py-2.5">
                  <span className="text-sm font-medium text-[#2D2D2D]">Подтверждение записей</span>
                  <span className={workPillGreen}>
                    {profile.master.auto_confirm_bookings ? 'Автоматически' : 'Вручную'}
                  </span>
                </div>
                {hasExtendedStatsEffective && !profile.master.auto_confirm_bookings && (
                  <div className="text-xs leading-snug text-[#6B6B6B]">
                    Подтверждение будущих записей до визита включено вместе с ручным режимом
                  </div>
                )}
                <div className="work-item flex items-start justify-between gap-3 rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] px-3 py-2.5">
                  <span className="text-sm font-medium text-[#2D2D2D]">Оплата при визите</span>
                  <span className={profile.master.payment_on_visit !== false ? workPillGreen : workPillNeutral}>
                    {profile.master.payment_on_visit !== false ? 'Да' : 'Нет'}
                  </span>
                </div>
                <div className="work-item flex items-start justify-between gap-3 rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] px-3 py-2.5">
                  <span className="text-sm font-medium text-[#2D2D2D]">Предоплата</span>
                  <span className={profile.master.payment_advance ? workPillGreen : workPillNeutral}>
                    {profile.master.payment_advance ? 'Да' : 'Нет'}
                  </span>
                </div>
              </div>

              <div className="panel-actions mt-4">
                <button type="button" onClick={() => setEditWorkMode(true)} className={SV.btnPri} data-testid="settings-edit">
                  Редактировать настройки
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSaveWork} className="space-y-4">
              <div className="space-y-4">
                {isSalonFeaturesEnabled() ? (
                  <>
                    <div className="flex items-center rounded-[11px] border border-[#E7E2DF]/90 bg-[#FAFAF8] px-3 py-2.5">
                      <input
                        type="checkbox"
                        name="can_work_independently"
                        checked={form.can_work_independently}
                        onChange={handleChange}
                        className={`${SV.check} mr-3`}
                      />
                      <label className="cursor-pointer text-sm font-medium text-[#2D2D2D]">Самостоятельная работа</label>
                    </div>

                    <div className="flex items-center rounded-[11px] border border-[#E7E2DF]/90 bg-[#FAFAF8] px-3 py-2.5">
                      <input
                        type="checkbox"
                        name="can_work_in_salon"
                        checked={form.can_work_in_salon}
                        onChange={handleChange}
                        className={`${SV.check} mr-3`}
                      />
                      <label className="cursor-pointer text-sm font-medium text-[#2D2D2D]">Работа в салоне</label>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[11px] border border-[#E7E2DF]/90 bg-[#FAFAF8] px-3 py-2.5 text-sm leading-snug text-[#6B6B6B]">
                    Мастер работает только индивидуально. Функции работы в салоне отключены в настройках администратора.
                  </div>
                )}

                <div className="mt-1 border-t border-[#E7E2DF]/80 pt-4">
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wide text-[#6B6B6B]">
                    Подтверждение записей
                  </label>
                  <div className="space-y-2 rounded-[11px] border border-[#E7E2DF]/90 bg-white p-3">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="auto_confirm_bookings"
                        id="manual_confirm"
                        data-testid="toggle-auto-confirm"
                        checked={!form.auto_confirm_bookings}
                        onChange={() => setForm({ ...form, auto_confirm_bookings: false })}
                        className={`${SV.radio} mr-3`}
                      />
                      <label htmlFor="manual_confirm" className="cursor-pointer text-sm font-medium text-[#2D2D2D]">
                        Подтверждать каждую запись вручную
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="auto_confirm_bookings"
                        id="auto_confirm"
                        checked={form.auto_confirm_bookings}
                        onChange={() => setForm({ ...form, auto_confirm_bookings: true })}
                        className={`${SV.radio} mr-3`}
                      />
                      <label htmlFor="auto_confirm" className="cursor-pointer text-sm font-medium text-[#2D2D2D]">
                        Автоматически подтверждать записи
                      </label>
                    </div>
                    <p className="ml-7 mt-1 text-xs leading-snug text-[#6B6B6B]">
                      При автоматическом подтверждении записи, которые соответствуют рабочему времени и не вызывают конфликтов, будут сразу отображаться как подтвержденные
                    </p>
                    {hasExtendedStatsEffective && (
                      <p className="ml-7 mt-2 text-xs leading-snug text-[#6B6B6B]">
                        В режиме ручного подтверждения доступно предварительное подтверждение будущих записей (до визита), где это поддерживает тариф
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t border-[#E7E2DF]/80 pt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B6B6B]">Способы оплаты</h3>
                  <PaymentMethodSelector
                    variant="settings"
                    paymentOnVisit={form.payment_on_visit}
                    paymentAdvance={form.payment_advance}
                    onPaymentMethodsChange={handlePaymentMethodsChange}
                    rootClassName="rounded-[12px] border border-[#E7E2DF] bg-[#FAFAF8] p-3.5"
                  />

                  <div className="mt-4 border-t border-[#E7E2DF]/80 pt-4">
                    <h4 className="mb-2.5 text-sm font-medium text-[#2D2D2D]">Онлайн оплата через систему DeDato</h4>
                    <div className="flex items-start rounded-[11px] border border-[#E7E2DF]/90 bg-white px-3 py-2.5">
                      <input
                        type="checkbox"
                        id="accepts_online_payment"
                        checked={paymentSettings.accepts_online_payment}
                        disabled
                        className={`${SV.check} mt-0.5 cursor-not-allowed opacity-50`}
                      />
                      <label htmlFor="accepts_online_payment" className="ml-3 text-sm text-[#2D2D2D]">
                        <span className="font-medium">Принимаю оплату через систему DeDato</span>
                        <span className="mt-1 block text-xs text-amber-700">Функция в разработке</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="panel-actions mt-5 flex flex-col gap-2 sm:flex-row">
                <button type="submit" data-testid="settings-save" disabled={!form.city?.trim()} className={SV.btnPri}>
                  Сохранить
                </button>
                <button type="button" onClick={() => setEditWorkMode(false)} className={SV.btnSec}>
                  Отмена
                </button>
              </div>
            </form>
          )}
        </section>

          <div
            className="mt-3 flex w-fit max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start sm:gap-3 lg:mt-auto lg:shrink-0"
            role="group"
            aria-label="Действия с аккаунтом"
          >
            <button type="button" onClick={() => setPasswordMode(true)} className={SV.btnSec}>
              Изменить пароль
            </button>
            <button
              type="button"
              onClick={openDeleteAccountModal}
              disabled={isDemoMode}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="settings-delete-account"
            >
              Удалить аккаунт
            </button>
          </div>

        </div>

        {profile.master.can_work_independently && (
          <div className="flex min-w-0 flex-col gap-3">
            <section className={panelShell}>
              <div className="mb-3">
                <h2 className="m-0 text-base font-semibold tracking-tight text-[#2D2D2D]">Личная страница</h2>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#2D2D2D]">Ссылка на страницу записи</h3>
                <div className="link-shell rounded-[12px] border border-[#E7E2DF] bg-[#FAF8F6] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  {canCustomizeDomainEffective ? (
                    <div className="space-y-3">
                      <div className="min-w-0 space-y-2">
                        <div className="text-xs font-semibold text-[#6B6B6B]">Адрес страницы</div>
                        <div className="flex min-w-0 flex-col gap-2">
                          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                            <span className="shrink-0 break-all text-xs leading-snug text-[#6B6B6B] sm:text-sm sm:whitespace-nowrap">
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
                              className={`${SV.ctl} min-h-[42px] w-full min-w-0 sm:flex-1`}
                              data-testid="settings-master-domain-input"
                            />
                          </div>
                          <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-nowrap">
                            <Tooltip compact text="Открыть страницу записи">
                              <button
                                type="button"
                                onClick={() => {
                                  const u = buildPublicBookingUrl((websiteSettings.domain || profile.master.domain || '').trim())
                                  if (u) window.open(u, '_blank', 'noopener,noreferrer')
                                }}
                                className={SV.btnGhost}
                              >
                                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                                Открыть
                              </button>
                            </Tooltip>
                            <Tooltip compact text="Копировать ссылку">
                              <button
                                type="button"
                                onClick={() => copyPublicBookingUrl((websiteSettings.domain || profile.master.domain || '').trim())}
                                className={SV.btnGhost}
                                data-testid="settings-copy-public-url"
                              >
                                <ClipboardDocumentIcon className="h-5 w-5" />
                                Копировать
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowFreeSlotsCardModal(true)}
                          disabled={!(websiteSettings.domain || profile.master.domain || '').toString().trim()}
                          className="text-sm font-medium text-[#2f7d32] underline decoration-dotted underline-offset-2 hover:text-[#4CAF50] disabled:cursor-not-allowed disabled:opacity-40"
                          data-testid="settings-free-slots-card-open"
                        >
                          Создать историю
                        </button>
                      </div>
                      {slugChanged ? (
                        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E7E2DF]/70 pt-3">
                          <button
                            type="button"
                            onClick={handleSaveWebsiteSettings}
                            disabled={!websiteSettingsChanged || loading}
                            className={`${SV.btnPri} min-h-10`}
                            data-testid="settings-save-domain-inline"
                          >
                            Сохранить адрес
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="min-w-0">
                        {publicBookingUrl ? (
                          <a
                            href={publicBookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-sm font-medium text-[#4CAF50] hover:underline"
                          >
                            {publicBookingUrl}
                          </a>
                        ) : (
                          <span className="text-sm text-[#6B6B6B]">
                            Ссылка появится после сохранения настроек (домен генерируется автоматически)
                          </span>
                        )}
                      </div>
                      {publicBookingUrl ? (
                        <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-nowrap">
                          <Tooltip compact text="Открыть страницу записи">
                            <button
                              type="button"
                              onClick={() => window.open(publicBookingUrl, '_blank', 'noopener,noreferrer')}
                              className={SV.btnGhost}
                            >
                              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                              Открыть
                            </button>
                            </Tooltip>
                          <Tooltip compact text="Копировать ссылку">
                            <button
                              type="button"
                              onClick={() => copyPublicBookingUrl(profile.master.domain)}
                              className={SV.btnGhost}
                              data-testid="settings-copy-public-url"
                            >
                              <ClipboardDocumentIcon className="h-5 w-5" />
                              Копировать
                            </button>
                          </Tooltip>
                        </div>
                      ) : null}
                      <p className="text-xs leading-snug text-[#6B6B6B]">
                        Это полная ссылка на онлайн-запись. Отправьте её клиентам в мессенджере или соцсетях.
                      </p>
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowFreeSlotsCardModal(true)}
                          disabled={!profile.master.domain || !String(profile.master.domain).trim()}
                          className="text-sm font-medium text-[#2f7d32] underline decoration-dotted underline-offset-2 hover:text-[#4CAF50] disabled:cursor-not-allowed disabled:opacity-40"
                          data-testid="settings-free-slots-card-open"
                        >
                          Создать историю
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <FreeSlotsShareCardModal
              open={showFreeSlotsCardModal}
              onClose={() => setShowFreeSlotsCardModal(false)}
              slug={(websiteSettings.domain || profile.master.domain || '').toString().trim()}
              bookingUrl={buildPublicBookingUrl((websiteSettings.domain || profile.master.domain || '').toString().trim())}
            />

            <section className={panelShell}>
              <div className="mb-2.5">
                <h3 className="m-0 text-sm font-semibold text-[#2D2D2D]">Адрес на странице записи</h3>
                <p className="mt-1 text-xs leading-snug text-[#6B6B6B]">
                  Видят клиенты; ссылка на карты строится по городу (профиль) и основному адресу
                </p>
              </div>
              <form onSubmit={handleSaveAddress} className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <label className="text-sm font-medium text-[#2D2D2D]">Адрес</label>
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
                          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-[#E7E2DF] px-1 text-[11px] font-semibold text-[#6B6B6B] hover:bg-[#F4F1EF]"
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
                      className={textareaLike}
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
                        className="inline-flex min-h-9 items-center justify-center rounded-[10px] border border-[#E7E2DF] bg-white px-3 text-sm font-medium text-[#2D2D2D] transition-colors hover:bg-[#F4F1EF] hover:text-[#4CAF50] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                      >
                        Проверить на карте
                      </button>
                      <span className="text-xs text-[#6B6B6B]">
                        Город задаётся в блоке «Настройка профиля»
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#2D2D2D]">Уточнение к адресу</label>
                    <textarea
                      name="address_detail"
                      value={form.address_detail || ''}
                      onChange={handleChange}
                      rows={2}
                      className={textareaLike}
                      placeholder="Этаж, подъезд, домофон — только текст, не в ссылку на карты"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#4CAF50] px-4 text-sm font-medium text-white transition-colors hover:bg-[#45A049]"
                    data-testid="settings-save-address"
                  >
                    Сохранить адрес
                  </button>
                </form>
            </section>

            <section className={panelShell}>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="panel-head min-w-0">
                    <h3 className="m-0 text-sm font-semibold text-[#2D2D2D]">Профиль на странице записи</h3>
                    <p className="desc mt-1 text-xs text-[#6B6B6B]">Фото, опыт и текст на странице записи — для клиентов</p>
                  </div>
                  {!editPublicPageMode && (
                    <button
                      type="button"
                      onClick={() => setEditPublicPageMode(true)}
                      className={`${SV.btnPri} shrink-0 self-start`}
                      data-testid="settings-edit-public-profile"
                    >
                      Редактировать
                    </button>
                  )}
                </div>

                {!editPublicPageMode ? (
                  <div className="space-y-3 text-sm">
                    <div className="media-row flex gap-3 items-start rounded-[12px] border border-[#E7E2DF]/85 bg-[#FAFAF8] p-3">
                      <div className="shrink-0" data-testid="settings-public-photo-preview">
                        {profile.master.photo ? (
                          <img
                            src={getImageUrl(profile.master.photo)}
                            alt=""
                            className="h-24 w-24 rounded-2xl border border-[#E7E2DF] object-cover shadow-sm"
                          />
                        ) : (
                          <div
                            className="flex h-24 w-24 flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-[#E7E2DF] bg-white text-gray-400"
                            aria-label="Фото не загружено"
                          >
                            <UserCircleIcon className="h-10 w-10 opacity-60" />
                            <span className="px-1 text-center text-[10px] leading-tight text-gray-400">Нет фото</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="text-base font-semibold leading-snug text-[#2D2D2D]">{profile.user.full_name}</div>
                        <div className="rounded-[12px] border border-[#E7E2DF]/80 bg-white px-3.5 py-2.5 text-sm text-[#2D2D2D]">
                          <div className="text-xs font-semibold text-[#6B6B6B]">Опыт</div>
                          <div className="mt-1">{profile.master.experience_years ?? 0} лет</div>
                        </div>
                        <div className="rounded-[12px] border border-[#E7E2DF]/80 bg-white px-3 py-2.5 text-sm text-[#2D2D2D]">
                          <div className="text-xs font-semibold text-[#6B6B6B]">Текст на странице записи</div>
                          <div className="mt-1 whitespace-pre-wrap break-words leading-snug">
                            {profile.master.site_description?.trim() ? profile.master.site_description : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSavePublicProfile} className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[#2D2D2D]">Опыт работы (лет)</label>
                      <input
                        type="number"
                        name="experience_years"
                        value={form.experience_years}
                        onChange={handleChange}
                        min="0"
                        className={`${SV.ctl} max-w-xs`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[#2D2D2D]">Текст на странице записи</label>
                      <textarea
                        value={websiteSettings.site_description || ''}
                        onChange={e => {
                          setWebsiteSettings(prev => ({ ...prev, site_description: e.target.value }))
                        }}
                        rows={4}
                        className={textareaLike}
                        placeholder="Кратко опишите формат приёма или что важно знать клиенту..."
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#2D2D2D]">Фото для страницы записи</label>
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
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className={SV.btnPri} data-testid="settings-save-public-profile">
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditPublicPageMode(false)
                          setPhotoFile(null)
                          setWebsiteSettings(s => ({
                            ...s,
                            site_description: profile.master.site_description || '',
                          }))
                          loadProfile()
                        }}
                        className={SV.btnSec}
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}
            </section>
          </div>
        )}

      </div>

      {showDeleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-delete-account-title"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 id="master-delete-account-title" className="pr-2 text-lg font-semibold text-red-700">
                Удаление аккаунта
              </h3>
              <button
                type="button"
                onClick={closeDeleteAccountModal}
                className="shrink-0 text-2xl leading-none text-[#6B6B6B] hover:text-[#2D2D2D]"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            {deleteAccountPhase === 'call' ? (
              <>
                <p className="mb-4 text-sm leading-snug text-[#2D2D2D]">
                  Это действие <strong>необратимо</strong>: будут удалены профиль мастера и данные аккаунта. На телефон из профиля можно запросить звонок с кодом подтверждения — тот же сценарий, что использует приложение для удаления аккаунта.
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeDeleteAccountModal} className={SV.btnSec}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={requestDeleteAccountCall}
                    disabled={loading}
                    className={`${SV.btnPri} disabled:opacity-50`}
                  >
                    Получить звонок с кодом
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-[#6B6B6B]">
                  Введите код из звонка. После подтверждения вы будете разлогинены.
                </p>
                <label className="mb-2 block text-xs font-semibold text-[#6B6B6B]">Код подтверждения</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={deleteAccountCode}
                  onChange={e => setDeleteAccountCode(e.target.value)}
                  className={`${SV.ctl} mb-4`}
                  placeholder="Код из звонка"
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setDeleteAccountPhase('call')} className={SV.btnSec}>
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteAccount}
                    disabled={loading || !deleteAccountCode.trim()}
                    className="inline-flex min-h-10 items-center justify-center rounded-[10px] bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Удалить навсегда
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
