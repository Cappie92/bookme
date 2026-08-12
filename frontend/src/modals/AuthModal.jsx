import { useState, useEffect, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { isSalonFeaturesEnabled } from '../config/features'
import { useModal } from '../hooks/useModal'
import { cities, getTimezoneByCity } from '../utils/cities'
import { normalizeRussianPhoneForApi } from '../utils/normalizeRussianPhoneForApi'
import { reportAuthLoginSuccess, reportAuthRegisterSuccess } from '../analytics/authReachGoals'
import { API_BASE_URL } from '../utils/config'

const REGISTER_FIELDS = {
  client: [
    { name: 'name', label: 'Имя', type: 'text', required: true },
    { name: 'phone', label: 'Номер телефона', type: 'tel', required: true },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'dob', label: 'Дата рождения', type: 'date' },
    { name: 'password', label: 'Пароль', type: 'password', required: true },
    { name: 'password2', label: 'Повторный ввод пароля', type: 'password', required: true },
  ],
  master: [
    { name: 'fio', label: 'Имя', type: 'text', required: true },
    { name: 'phone', label: 'Номер телефона', type: 'tel', required: true },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'dob', label: 'Дата рождения', type: 'date' },
    { name: 'city', label: 'Город', type: 'select', required: true },
    { name: 'promo_code', label: 'Промокод', type: 'text' },
    { name: 'password', label: 'Пароль', type: 'password', required: true },
    { name: 'password2', label: 'Повторный ввод пароля', type: 'password', required: true },
  ],
  salon: [
    { name: 'fio', label: 'ФИО', type: 'text', required: true },
    { name: 'salon', label: 'Название салона/сети', type: 'text' },
    { name: 'phone', label: 'Номер телефона', type: 'tel', required: true },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'password', label: 'Пароль', type: 'password', required: true },
    { name: 'password2', label: 'Повторный ввод пароля', type: 'password', required: true },
  ],
}

const ROLE_MAP = { client: 'client', master: 'master', salon: 'salon' }

function validateEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
}
function validatePhone(phone) {
  return /^\+7\d{10}$/.test(phone)
}
function formatPhone(input) {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) {
    return '+7' + digits.slice(1)
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return '+7' + digits.slice(1)
  }
  if (digits.startsWith('7')) digits = digits.slice(1)
  if (digits.length > 10) digits = digits.slice(0, 10)
  return '+7' + digits
}
function phonePlaceholder() {
  return '+7 (999) 999 99 99'
}
function validateDob(dob) {
  if (!dob) return true
  const date = new Date(dob)
  const now = new Date()
  const min = new Date()
  min.setFullYear(now.getFullYear() - 100)
  return date <= now && date >= min
}

const REGISTER_API_ERROR_FALLBACK =
  'Не удалось завершить регистрацию. Проверьте данные и попробуйте ещё раз.'

/** Текст ошибки POST /api/auth/register для показа в модалке (без browser alert). */
function mapRegisterApiError(detail) {
  let raw = ''
  if (detail == null || detail === '') {
    return REGISTER_API_ERROR_FALLBACK
  }
  if (typeof detail === 'string') {
    raw = detail
  } else if (Array.isArray(detail)) {
    raw = detail
      .map((item) => {
        if (item && typeof item === 'object' && item.msg != null) return String(item.msg)
        return String(item)
      })
      .join(' ')
  } else if (typeof detail === 'object') {
    if (detail.msg != null) raw = String(detail.msg)
    else if (detail.message != null) raw = String(detail.message)
    else raw = ''
  } else {
    raw = String(detail)
  }
  const norm = raw.trim()
  if (!norm || norm === '[object Object]') return REGISTER_API_ERROR_FALLBACK
  if (/email\s+already\s+registered/i.test(norm)) {
    return 'Пользователь с таким e-mail уже зарегистрирован'
  }
  if (/phone\s+number\s+already\s+registered/i.test(norm)) {
    return 'Пользователь с таким номером телефона уже зарегистрирован'
  }
  return norm || REGISTER_API_ERROR_FALLBACK
}

/** Прочитать тело ответа как JSON один раз (без второго res.json()). */
async function readResponseJsonSafe(res) {
  try {
    const text = await res.text()
    if (!text || !text.trim()) return {}
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function pickRegisterApiDetail(body) {
  if (!body || typeof body !== 'object') return null
  if (body.detail !== undefined && body.detail !== null) return body.detail
  if (body.message !== undefined && body.message !== null) return body.message
  return null
}

/** Единый стиль пароля: компромисс по размеру буллетов iOS vs Android; desktop через sm: */
const AUTH_PASSWORD_INPUT_CLASS =
  'border rounded px-3 py-2 w-full min-h-[44px] text-[15px] leading-5 tracking-normal sm:text-sm sm:leading-normal'

const LOGIN_REQUEST_TIMEOUT_MS = 25000
const LOGIN_ME_TIMEOUT_MS = 15000
const YANDEX_LOGO_SRC = '/YaLogo.webp'

function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs text-gray-500">или</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  )
}

function YandexAuthButton({ onClick, testId = 'auth-yandex-login', label = 'Войти через Яндекс' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[#E0D8CF] bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-[#CFC5BA] hover:bg-[#FFFDFB] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/35"
    >
      <img
        src={YANDEX_LOGO_SRC}
        alt=""
        aria-hidden="true"
        data-testid={`${testId}-logo`}
        className="h-5 w-5 flex-shrink-0 object-contain"
      />
      <span className="min-w-0 whitespace-nowrap">{label}</span>
    </button>
  )
}

/** fetch с таймаутом: иначе зависший login или /users/me оставляет кнопку в «Вход...» без выхода из async-функции и без finally. */
async function fetchWithTimeout(resource, options = {}, timeoutMs = 20000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(resource, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export default function AuthModal() {
  const {
    login,
    authModalOpen,
    authModalType,
    authModalInitialTab,
    setAuthModalInitialTab,
    authModalRedirectMode,
    authModalReturnToPath,
    authModalInitialForm,
    setAuthModalRedirectMode,
    setAuthModalReturnToPath,
    setAuthModalInitialForm,
    closeAuthModal,
  } = useAuth()
  const open = authModalOpen
  const defaultRegType = authModalType
  const [tab, setTab] = useState('login')
  const [regType, setRegType] = useState(defaultRegType)

  // При каждом открытии модалки выставить вкладку из initialTab, затем сбросить
  useEffect(() => {
    if (open && authModalInitialTab) {
      setTab(authModalInitialTab === 'register' ? 'register' : 'login')
      setAuthModalInitialTab(null)
    }
  }, [open, authModalInitialTab, setAuthModalInitialTab])

  useEffect(() => {
    if (!open || tab !== 'register' || regType !== 'master') return
    const query = new URLSearchParams(window.location.search)
    const queryPromo = (query.get('promo_code') || query.get('ref') || '').trim()
    const initialPromo = (authModalInitialForm?.promo_code || queryPromo || '').trim()
    if (!initialPromo) return
    setForm((f) => ({ ...f, promo_code: f.promo_code || initialPromo.toUpperCase() }))
    if (authModalInitialForm?.promo_code) setAuthModalInitialForm(null)
  }, [open, tab, regType, authModalInitialForm, setAuthModalInitialForm])

  useEffect(() => {
    if (!open) {
      setAgreeTerms(false)
      setAgreePersonalData(false)
      setMarketingOptIn(false)
    }
  }, [open])
  
  // Обновляем тип регистрации при изменении defaultRegType
  useEffect(() => {
    setRegType(defaultRegType)
  }, [defaultRegType])
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePersonalData, setAgreePersonalData] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [loginForm, setLoginForm] = useState({ phone: '+7', password: '' })
  const [loginErrors, setLoginErrors] = useState({})
  const [loginLoading, setLoginLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ phone: '+7', email: '' })
  const [forgotPasswordErrors, setForgotPasswordErrors] = useState({})
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [forgotPasswordMethod, setForgotPasswordMethod] = useState('phone') // 'phone' или 'email'
  const [forgotPasswordStep, setForgotPasswordStep] = useState('phone') // 'phone' | 'enter_digits' | 'new_password'
  const [forgotPasswordCallId, setForgotPasswordCallId] = useState('')
  const [forgotPasswordChallengeToken, setForgotPasswordChallengeToken] = useState('')
  const [forgotPasswordDigits, setForgotPasswordDigits] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', password2: '' })
  const [resetPasswordErrors, setResetPasswordErrors] = useState({})
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  
  // Состояние для верификации телефона через Zvonok
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(false)
  const [phoneVerificationError, setPhoneVerificationError] = useState('')
  const [phoneVerificationData, setPhoneVerificationData] = useState(null)
  const [phoneVerificationStep, setPhoneVerificationStep] = useState('none') // 'none', 'calling', 'enter_digits'
  const [verificationDigits, setVerificationDigits] = useState('')
  const [verificationDigitsError, setVerificationDigitsError] = useState('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [signupVerificationToken, setSignupVerificationToken] = useState('')
  const [signupVerificationOrigin, setSignupVerificationOrigin] = useState('')
  const [signupVerificationKind, setSignupVerificationKind] = useState('')
  const verificationTokenRef = useRef('')

  const clearSignupVerificationState = () => {
    verificationTokenRef.current = ''
    setSignupVerificationToken('')
    setSignupVerificationOrigin('')
    setSignupVerificationKind('')
    setPhoneVerificationLoading(false)
    setPhoneVerificationError('')
    setPhoneVerificationData(null)
    setPhoneVerificationStep('none')
    setVerificationDigits('')
    setVerificationDigitsError('')
    setShowSuccessMessage(false)
  }

  const handleAuthModalClose = () => {
    const restrictedToken = verificationTokenRef.current
    const wasRestrictedFlow = Boolean(restrictedToken)
    clearSignupVerificationState()
    if (wasRestrictedFlow) {
      void fetch('/api/auth/cancel-signup-phone-verification', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${restrictedToken}` },
      }).catch(() => {})
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_role')
    }
    closeAuthModal()
  }

  const onClose = handleAuthModalClose
  const { handleBackdropClick, handleMouseDown } = useModal(onClose)
  
  const navigate = useNavigate();

  // Проверяем токен сброса пароля из URL при загрузке
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('reset_token')
    if (token) {
      setResetToken(token)
      setShowResetPassword(true)
      setTab('login')
    }
  }, [])

  // Удаляем логотип из модального окна если он есть
  useEffect(() => {
    if (!open) return

    const removeLogo = () => {
      // Ищем логотип по различным селекторам
      const logoSelectors = [
        '[class*="absolute"][class*="left-0"][class*="right-0"][class*="top-6"]',
        '.absolute.left-0.right-0.top-6',
        'img[src="/dedato_trnsp.png"]',
        'img[alt="Dedato"]',
        '[class*="w-16"][class*="h-16"][class*="flex-shrink-0"]'
      ]

      logoSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector)
        elements.forEach(element => {
          // Проверяем, что элемент находится в модальном окне
          const modal = element.closest('[class*="fixed"][class*="inset-0"][class*="z-50"]')
          if (modal) {
            console.log('Удаляем логотип:', element)
            element.remove()
          }
        })
      })
    }

    // Удаляем логотип сразу и через небольшую задержку
    removeLogo()
    const timeout = setTimeout(removeLogo, 100)

    return () => clearTimeout(timeout)
  }, [open])

  if (!open) return null

  const handleCloseClick = () => {
    onClose()
  }

  const handleChange = (e) => {
    let { name, value } = e.target
    if (name === 'phone') value = formatPhone(value)
    setForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'city' && value) next.timezone = getTimezoneByCity(value)
      return next
    })
  }

  const handleLoginChange = (e) => {
    let { name, value } = e.target
    if (name === 'phone') value = formatPhone(value)
    setLoginForm(f => ({ ...f, [name]: value }))
  }

  const handleForgotPasswordChange = (e) => {
    let { name, value } = e.target
    if (name === 'phone') value = formatPhone(value)
    setForgotPasswordForm(f => ({ ...f, [name]: value }))
  }

  const handleResetPasswordChange = (e) => {
    const { name, value } = e.target
    setResetPasswordForm(f => ({ ...f, [name]: value }))
  }

  const handlePhonePaste = (e) => {
    e.preventDefault()
    const pastedText = (e.clipboardData || window.clipboardData).getData('text')
    
    // Извлекаем все цифры
    let digits = pastedText.replace(/\D/g, '')
    
    // Если вставлен полный номер (начинается с 7 и содержит 11 цифр)
    if (digits.startsWith('7') && digits.length === 11) {
      // Берем только 10 цифр после первой 7
      digits = digits.slice(1, 11)
    } else if (digits.length > 10) {
      // Если цифр больше 10, берем последние 10
      digits = digits.slice(-10)
    }
    // Если цифр меньше 10, оставляем как есть (пользователь может вставлять неполный номер)
    
    // Формируем финальное значение
    const formattedPhone = '+7' + digits
    
    // Обновляем соответствующее поле в зависимости от контекста
    const fieldName = e.target.name
    
    if (tab === 'login' && fieldName === 'phone') {
      setLoginForm(f => ({ ...f, phone: formattedPhone }))
    } else if (showForgotPassword && fieldName === 'phone') {
      setForgotPasswordForm(f => ({ ...f, phone: formattedPhone }))
    } else if (tab === 'register' && fieldName === 'phone') {
      setForm(f => ({ ...f, phone: formattedPhone }))
    }
  }

  const validate = () => {
    const errs = {}
    // Пароль и повторный пароль
    if ((form.password || form.password2) && form.password !== form.password2) {
      errs.password2 = 'Пароли не совпадают'
    }
    // Повторный пароль обязателен
    if (!form.password2) {
      errs.password2 = 'Повторный ввод пароля обязателен'
    }
    // Дата рождения
    if (form.dob && !validateDob(form.dob)) {
      errs.dob = 'Дата рождения должна быть не позже сегодня и не раньше 100 лет назад'
    }
    // Телефон
    if (!validatePhone(form.phone || '')) {
      errs.phone = 'Телефон должен быть в формате +7XXXXXXXXXX (10 цифр после +7)'
    }
    // Email
    if (form.email && !validateEmail(form.email)) {
      errs.email = 'Некорректный e-mail (только латиница, @ и точка)'
    }
    // Город обязателен для мастера
    if (regType === 'master' && (!(form.city || '').trim())) {
      errs.city = 'Выберите город'
    }
    if (!agreeTerms) {
      errs.agreeTerms = 'Нужно принять пользовательское соглашение'
    }
    if (!agreePersonalData) {
      errs.agreePersonalData = 'Нужно дать согласие на обработку персональных данных'
    }
    return errs
  }

  const validateLogin = () => {
    const errs = {}
    if (!validatePhone(loginForm.phone)) {
      errs.phone = 'Телефон должен быть в формате +7XXXXXXXXXX (10 цифр после +7)'
    }
    if (!loginForm.password) {
      errs.password = 'Пароль обязателен'
    }
    return errs
  }

  const validateForgotPassword = () => {
    const errs = {}
    if (forgotPasswordMethod === 'phone') {
      if (!validatePhone(forgotPasswordForm.phone)) {
        errs.phone = 'Телефон должен быть в формате +7XXXXXXXXXX (10 цифр после +7)'
      }
    } else {
      if (!forgotPasswordForm.email) {
        errs.email = 'Email обязателен'
      } else if (!validateEmail(forgotPasswordForm.email)) {
        errs.email = 'Некорректный e-mail (только латиница, @ и точка)'
      }
    }
    return errs
  }

  const validateResetPassword = () => {
    const errs = {}
    if (!resetPasswordForm.password) {
      errs.password = 'Пароль обязателен'
    } else if (resetPasswordForm.password.length < 6) {
      errs.password = 'Пароль должен содержать минимум 6 символов'
    }
    if (!resetPasswordForm.password2) {
      errs.password2 = 'Повторный ввод пароля обязателен'
    } else if (resetPasswordForm.password !== resetPasswordForm.password2) {
      errs.password2 = 'Пароли не совпадают'
    }
    return errs
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    let full_name = ''
    if (regType === 'client') full_name = form.name || ''
    if (regType === 'master' || regType === 'salon') full_name = form.fio || ''
    const payload = {
      email: form.email || '',
      phone: normalizeRussianPhoneForApi(form.phone || ''),
      full_name,
      role: ROLE_MAP[regType],
      password: form.password || '',
    }
    if (regType === 'master') {
      const city = (form.city || '').trim()
      const tz = (form.timezone || '').trim()
      const promoCode = (form.promo_code || '').trim()
      if (city) payload.city = city
      if (tz) payload.timezone = tz
      if (promoCode) payload.promo_code = promoCode
    }
    payload.accept_terms = Boolean(agreeTerms)
    payload.accept_personal_data = Boolean(agreePersonalData)
    payload.marketing_opt_in = Boolean(marketingOptIn)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        if (
          data.status !== 'phone_verification_required' ||
          !data.verification_token ||
          !data.phone ||
          data.verification_kind !== 'new_registration'
        ) {
          setErrors({ general: 'Сервер вернул неожиданный ответ регистрации' })
          return
        }

        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        verificationTokenRef.current = data.verification_token
        setSignupVerificationToken(data.verification_token)
        setSignupVerificationOrigin('register')
        setSignupVerificationKind(data.verification_kind)
        setPhoneVerificationData({ phone: data.phone, call_id: null })
        await initiatePhoneVerification(data.verification_token, data.phone)
        setForm({})
      } else {
        const body = await readResponseJsonSafe(res)
        const detail = pickRegisterApiDetail(body)
        setErrors({ general: mapRegisterApiError(detail) })
      }
    } catch {
      setErrors({ general: 'Ошибка сети или сервера' })
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const errs = validateLogin()
    setLoginErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoginLoading(true)
    try {
      const res = await fetchWithTimeout(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: normalizeRussianPhoneForApi(loginForm.phone),
            password: loginForm.password,
          }),
        },
        LOGIN_REQUEST_TIMEOUT_MS
      )
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'phone_verification_required') {
          if (
            !data.verification_token ||
            !data.phone ||
            data.verification_kind !== 'existing_account'
          ) {
            setLoginErrors({ general: 'Сервер вернул неожиданный ответ входа' })
            return
          }
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('user_role')
          verificationTokenRef.current = data.verification_token
          setSignupVerificationToken(data.verification_token)
          setSignupVerificationOrigin('login')
          setSignupVerificationKind(data.verification_kind)
          setPhoneVerificationData({ phone: data.phone, call_id: null })
          await initiatePhoneVerification(data.verification_token, data.phone)
          return
        }

        let role = null
        try {
          const payload = JSON.parse(atob(data.access_token.split('.')[1]))
          role = payload.role
        } catch { /* ignore */ }
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        if (role) localStorage.setItem('user_role', role)

        let userData = null
        try {
          const userResponse = await fetchWithTimeout(
            '/api/auth/users/me',
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.access_token}`,
              },
            },
            LOGIN_ME_TIMEOUT_MS
          )
          if (userResponse.ok) {
            userData = await userResponse.json()
            if (userData.role) {
              localStorage.setItem('user_role', userData.role)
              role = userData.role
            }
          }
        } catch (err) {
          const aborted = err?.name === 'AbortError'
          if (aborted) {
            // Таймаут / отмена /me после успешного login — не блокируем вход (роль уже из JWT при наличии)
            console.warn('[auth] GET /api/auth/users/me aborted (timeout); continuing login with JWT')
          } else {
            console.error('Ошибка получения данных пользователя:', err)
            setLoginErrors({ general: 'Не удалось загрузить профиль. Попробуйте обновить страницу.' })
            return
          }
        }

        login(userData || data)
        reportAuthLoginSuccess({ role: (role || userData?.role || '').toString() })
        setLoginForm({ phone: '+7', password: '' })
        onClose()
        const stayOrReturn = authModalRedirectMode === 'stay' || authModalRedirectMode === 'returnTo'
        let postLoginRoute = ''
        if (stayOrReturn) {
          setAuthModalRedirectMode('default')
          setAuthModalReturnToPath(null)
          if (authModalReturnToPath) {
            const current = window.location.pathname + window.location.search
            if (current !== authModalReturnToPath) {
              postLoginRoute = authModalReturnToPath
              navigate(authModalReturnToPath)
            } else {
              postLoginRoute = 'stay (already on return path)'
            }
          } else {
            postLoginRoute = 'stay'
          }
        } else {
          setAuthModalRedirectMode('default')
          setAuthModalReturnToPath(null)
          const r = (role || '').toString().toLowerCase()
          if (r === 'admin' || r === 'moderator') postLoginRoute = '/admin'
          else if (r === 'client') postLoginRoute = '/client'
          else if (r === 'master' || r === 'indie') postLoginRoute = '/master'
          else if (r === 'salon') postLoginRoute = '/salon'
          else postLoginRoute = '/'
          navigate(postLoginRoute)
        }
        console.warn('[auth] post-login route:', postLoginRoute)
      } else {
        const err = await res.json()
        setLoginErrors({ general: err.detail || 'Не удалось войти' })
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        console.warn('[auth] POST /api/auth/login aborted (timeout)')
        setLoginErrors({
          general: 'Превышено время ожидания ответа сервера. Проверьте сеть и попробуйте снова.',
        })
      } else {
        setLoginErrors({ general: 'Ошибка сети или сервера' })
      }
    } finally {
      setLoginLoading(false)
    }
  }

  const handleYandexLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/yandex/login`
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    const errs = validateForgotPassword()
    setForgotPasswordErrors(errs)
    if (Object.keys(errs).length > 0) return
    setForgotPasswordLoading(true)
    try {
      const isPhoneRecovery = forgotPasswordMethod === 'phone'
      const payload = isPhoneRecovery
        ? { phone: normalizeRussianPhoneForApi(forgotPasswordForm.phone) }
        : { email: forgotPasswordForm.email }

      const endpoint = isPhoneRecovery
        ? '/api/auth/request-password-reset-phone'
        : '/api/auth/request-password-reset'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        if (isPhoneRecovery && data.status === 'verification_required' && data.call_id && data.challenge_token) {
          setForgotPasswordStep('enter_digits')
          setForgotPasswordCallId(data.call_id)
          setForgotPasswordChallengeToken(data.challenge_token)
          setForgotPasswordDigits('')
          setForgotPasswordErrors({})
        } else if (!isPhoneRecovery && data.success) {
          alert('Инструкции по восстановлению пароля отправлены на ваш email')
          setShowForgotPassword(false)
          setForgotPasswordForm({ phone: '+7', email: '' })
          setForgotPasswordMethod('phone')
          setForgotPasswordStep('phone')
        } else {
          alert('Ошибка: ' + (data.message || 'Не удалось отправить инструкции'))
        }
      } else if (res.status === 404) {
        alert('Функция восстановления пароля пока не реализована. Обратитесь к администратору.')
      } else {
        const err = await res.json()
        alert('Ошибка: ' + (err.detail || 'Не удалось отправить инструкции'))
      }
    } catch {
      alert('Ошибка сети или сервера')
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordVerifyDigits = async (e) => {
    e.preventDefault()
    if (!forgotPasswordDigits || forgotPasswordDigits.length !== 4) {
      setForgotPasswordErrors({ ...forgotPasswordErrors, digits: 'Введите 4 цифры' })
      return
    }
    setForgotPasswordLoading(true)
    try {
      const res = await fetch('/api/auth/confirm-password-reset-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_token: forgotPasswordChallengeToken,
          call_id: forgotPasswordCallId,
          phone_digits: forgotPasswordDigits,
        }),
      })
      const data = await res.json()
      if (res.ok && data.status === 'reset_token_issued' && data.reset_token) {
        setResetToken(data.reset_token)
        setForgotPasswordErrors({})
        setForgotPasswordStep('new_password')
      } else {
        setForgotPasswordErrors({ ...forgotPasswordErrors, digits: data.detail || 'Неверный код' })
      }
    } catch {
      setForgotPasswordErrors({ ...forgotPasswordErrors, digits: 'Ошибка сети' })
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    const errs = validateResetPassword()
    setResetPasswordErrors(errs)
    if (Object.keys(errs).length > 0) return
    setResetPasswordLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          new_password: resetPasswordForm.password,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          alert('Пароль успешно изменен! Теперь вы можете войти с новым паролем.')
          setShowResetPassword(false)
          setShowForgotPassword(false)
          setForgotPasswordForm({ phone: '+7', email: '' })
          setForgotPasswordMethod('phone')
          setForgotPasswordStep('phone')
          setForgotPasswordCallId('')
          setForgotPasswordChallengeToken('')
          setForgotPasswordDigits('')
          setForgotPasswordErrors({})
          setResetPasswordForm({ password: '', password2: '' })
          setResetPasswordErrors({})
          setResetToken('')
          onClose()
        } else {
          alert('Ошибка: ' + (data.message || 'Не удалось изменить пароль'))
        }
      } else if (res.status === 404) {
        alert('Функция сброса пароля пока не реализована. Обратитесь к администратору.')
      } else {
        const err = await res.json()
        alert('Ошибка: ' + (err.detail || 'Не удалось изменить пароль'))
      }
    } catch {
      alert('Ошибка сети или сервера')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  const initiatePhoneVerification = async (verificationToken, phone) => {
    if (!verificationToken || verificationTokenRef.current !== verificationToken) return
    setPhoneVerificationLoading(true)
    setPhoneVerificationError('')
    setPhoneVerificationStep('calling')

    try {
      const response = await fetch('/api/auth/request-signup-phone-verification', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${verificationToken}`,
        },
      })

      const result = await readResponseJsonSafe(response)
      if (verificationTokenRef.current !== verificationToken) return

      if (import.meta.env.DEV && result?.verification_number) {
        console.info('[dev] verification_number (stub):', result.verification_number)
      }

      if (response.ok && result.success && result.call_id) {
        setPhoneVerificationData({
          call_id: result.call_id,
          phone,
        })
        setPhoneVerificationStep('enter_digits')
      } else {
        setPhoneVerificationData({ phone, call_id: null })
        setPhoneVerificationError(
          result.detail || result.message || 'Ошибка инициации верификации телефона'
        )
        setPhoneVerificationStep('enter_digits')
      }
    } catch {
      if (verificationTokenRef.current !== verificationToken) return
      setPhoneVerificationData({ phone, call_id: null })
      setPhoneVerificationError('Ошибка сети при инициации верификации телефона')
      setPhoneVerificationStep('enter_digits')
    } finally {
      if (verificationTokenRef.current === verificationToken) {
        setPhoneVerificationLoading(false)
      }
    }
  }
  
  const verifyPhoneDigits = async () => {
    if (!verificationDigits || verificationDigits.length !== 4) {
      setVerificationDigitsError('Введите 4 цифры номера телефона')
      return
    }
    
    const verificationToken = signupVerificationToken
    if (!verificationToken || verificationTokenRef.current !== verificationToken) {
      setVerificationDigitsError('Сессия подтверждения истекла. Войдите снова.')
      return
    }
    const expectedKind = signupVerificationOrigin === 'register'
      ? 'new_registration'
      : 'existing_account'
    if (signupVerificationKind !== expectedKind) {
      setVerificationDigitsError('Сессия подтверждения имеет неверный тип. Начните заново.')
      return
    }

    setPhoneVerificationLoading(true)
    setVerificationDigitsError('')

    try {
      const response = await fetch('/api/auth/confirm-signup-phone-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${verificationToken}`,
        },
        body: JSON.stringify({
          call_id: phoneVerificationData.call_id,
          phone_digits: verificationDigits,
        }),
      })

      const result = await readResponseJsonSafe(response)
      if (verificationTokenRef.current !== verificationToken) return

      if (response.ok && result.access_token && result.refresh_token) {
        const userResponse = await fetchWithTimeout(
          '/api/auth/users/me',
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${result.access_token}`,
            },
          },
          LOGIN_ME_TIMEOUT_MS
        )
        if (!userResponse.ok) {
          throw new Error('profile_hydration_failed')
        }
        const userData = await userResponse.json()
        if (verificationTokenRef.current !== verificationToken) return

        localStorage.setItem('access_token', result.access_token)
        localStorage.setItem('refresh_token', result.refresh_token)
        if (userData.role) localStorage.setItem('user_role', userData.role)
        login(userData)
        if (signupVerificationOrigin === 'register') {
          reportAuthRegisterSuccess({ role: (userData.role || regType).toString() })
        } else {
          reportAuthLoginSuccess({ role: (userData.role || '').toString() })
        }

        const redirectMode = authModalRedirectMode
        const returnToPath = authModalReturnToPath
        const verifiedRole = userData.role
        const verifiedKind = signupVerificationKind
        clearSignupVerificationState()
        setSignupVerificationKind(verifiedKind)
        setShowSuccessMessage(true)
        setTimeout(() => {
          setShowSuccessMessage(false)
          closeAuthModal()
          setAuthModalRedirectMode('default')
          setAuthModalReturnToPath(null)
          const stayOrReturn = redirectMode === 'stay' || redirectMode === 'returnTo'
          if (stayOrReturn && returnToPath) {
            const current = window.location.pathname + window.location.search
            if (current !== returnToPath) navigate(returnToPath)
          } else if (!stayOrReturn) {
            const r = (verifiedRole || '').toString().toLowerCase()
            if (r === 'admin' || r === 'moderator') navigate('/admin')
            else if (r === 'client') navigate('/client')
            else if (r === 'master' || r === 'indie') navigate('/master')
            else if (r === 'salon') navigate('/salon')
            else navigate('/')
          }
        }, 3000)
      } else {
        setVerificationDigitsError(
          result.detail || result.message || 'Неверные цифры номера телефона'
        )
      }
    } catch (error) {
      if (verificationTokenRef.current !== verificationToken) return
      if (error?.message === 'profile_hydration_failed') {
        const phone = phoneVerificationData?.phone || '+7'
        clearSignupVerificationState()
        setTab('login')
        setLoginForm({ phone, password: '' })
        setLoginErrors({ general: 'Телефон подтверждён. Войдите снова, чтобы загрузить профиль.' })
      } else {
        setVerificationDigitsError('Ошибка сети при верификации')
      }
    } finally {
      if (verificationTokenRef.current === verificationToken) {
        setPhoneVerificationLoading(false)
      }
    }
  }

  return (
    <div 
      data-testid="auth-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+24px))] sm:items-center sm:pb-[env(safe-area-inset-bottom,0px)] sm:pt-8"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="relative max-h-[min(86dvh,calc(100dvh-6rem))] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl bg-[#F9F7F6] p-3 pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+36px))] pt-3 shadow-xl animate-fade-in sm:my-8 sm:max-h-[85vh] sm:rounded-xl sm:p-8 sm:pb-8 sm:pt-8 lg:p-10 lg:pb-10">
        <button
          type="button"
          onClick={handleCloseClick}
          className="absolute top-2 right-2 sm:top-6 sm:right-6 text-gray-500 hover:text-gray-800 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
          data-testid="auth-login-close"
          aria-label="Закрыть"
        >
          <XMarkIcon className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <div className="pt-1 sm:pt-6 pr-12 sm:pr-0">
          <div className="flex mb-3 sm:mb-6 border-b">
            <button 
              className={`flex-1 py-2 sm:py-2 text-sm sm:text-base font-semibold min-h-[40px] sm:min-h-0 ${tab==='login' ? 'border-b-2 border-[#4CAF50] text-[#4CAF50]' : 'text-gray-500'}`} 
              onClick={() => {
                setTab('login')
                setShowForgotPassword(false)
                setForgotPasswordForm({ phone: '+7', email: '' })
                setForgotPasswordErrors({})
                setForgotPasswordMethod('phone')
              }}
            >
              Вход
            </button>
            <button 
              className={`flex-1 py-2 sm:py-2 text-sm sm:text-base font-semibold min-h-[40px] sm:min-h-0 ${tab==='register' ? 'border-b-2 border-[#4CAF50] text-[#4CAF50]' : 'text-gray-500'}`} 
              onClick={() => {
                setTab('register')
                setShowForgotPassword(false)
                setForgotPasswordForm({ phone: '+7', email: '' })
                setForgotPasswordErrors({})
                setForgotPasswordMethod('phone')
              }}
            >
              Регистрация
            </button>
          </div>
          {phoneVerificationStep === 'enter_digits' ? (
            <div>
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Верификация телефона</h3>
                <p className="text-sm text-gray-600">
                  На ваш номер{' '}
                  <span data-testid="signup-phone-readonly" className="font-medium">
                    {phoneVerificationData?.phone}
                  </span>{' '}
                  поступит звонок.
                  Введите последние 4 цифры номера, с которого вам звонят.
                </p>
              </div>

              {phoneVerificationError && (
                <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {phoneVerificationError}
                </div>
              )}
              
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Последние 4 цифры номера
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength="4"
                    placeholder="1234"
                    data-testid="signup-phone-digits"
                    value={verificationDigits}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '')
                      setVerificationDigits(value)
                      setVerificationDigitsError('')
                    }}
                    className="border rounded px-3 py-2 w-full text-center text-lg tracking-widest"
                    style={{ letterSpacing: '0.5em' }}
                  />
                  {verificationDigitsError && (
                    <span className="text-xs text-red-500 mt-1 block">{verificationDigitsError}</span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    className="flex-1"
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    onClick={verifyPhoneDigits}
                    disabled={phoneVerificationLoading || !phoneVerificationData?.call_id || verificationDigits.length !== 4}
                    className="flex-1"
                  >
                    {phoneVerificationLoading ? 'Проверка...' : 'Подтвердить'}
                  </Button>
                </div>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => initiatePhoneVerification(signupVerificationToken, phoneVerificationData?.phone)}
                    disabled={phoneVerificationLoading}
                    className="text-sm text-[#4CAF50] hover:underline"
                  >
                    Отправить звонок повторно
                  </button>
                </div>
              </div>
            </div>
          ) : showSuccessMessage ? (
            <div className="text-center py-8">
              {console.log('🎯 Рендерим окно успешной регистрации, showSuccessMessage =', showSuccessMessage)}
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {signupVerificationKind === 'new_registration'
                  ? 'Регистрация успешна!'
                  : 'Телефон подтверждён!'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {signupVerificationKind === 'new_registration'
                  ? 'Ваш аккаунт создан и телефон верифицирован.'
                  : 'Ваш существующий аккаунт подтверждён.'}<br/>
                Перенаправляем в личный кабинет...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-[#4CAF50] h-2 rounded-full animate-pulse" style={{width: '100%'}}></div>
              </div>
            </div>
          ) : phoneVerificationStep === 'calling' ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Отправка звонка</h3>
              <p className="text-sm text-gray-600">
                Инициируем звонок на номер {phoneVerificationData?.phone}...
              </p>
            </div>
          ) : tab === 'login' ? (
            showResetPassword ? (
              <div>
                <div className="flex items-center mb-4">
                  <button 
                    type="button" 
                    className="text-[#4CAF50] text-sm hover:text-[#45A049] hover:underline mr-4"
                    onClick={() => setShowResetPassword(false)}
                  >
                    ← Назад к восстановлению
                  </button>
                  <h3 className="text-lg font-semibold">Установка нового пароля</h3>
                </div>
                <form className="flex flex-col gap-4" onSubmit={handleResetPassword}>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Новый пароль</label>
                    <input
                      type="password"
                      name="password"
                      placeholder="Введите новый пароль"
                      value={resetPasswordForm.password}
                      onChange={handleResetPasswordChange}
                      autoComplete="new-password"
                      className={AUTH_PASSWORD_INPUT_CLASS}
                    />
                    {resetPasswordErrors.password && <span className="text-xs text-red-500 mt-1">{resetPasswordErrors.password}</span>}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Повторите новый пароль</label>
                    <input
                      type="password"
                      name="password2"
                      placeholder="Повторите новый пароль"
                      value={resetPasswordForm.password2}
                      onChange={handleResetPasswordChange}
                      autoComplete="new-password"
                      className={AUTH_PASSWORD_INPUT_CLASS}
                    />
                    {resetPasswordErrors.password2 && <span className="text-xs text-red-500 mt-1">{resetPasswordErrors.password2}</span>}
                  </div>
                  <p className="text-sm text-gray-600">
                    Введите новый пароль. Минимум 6 символов.
                  </p>
                  <Button type="submit" disabled={resetPasswordLoading}>
                    {resetPasswordLoading ? 'Сохранение...' : 'Сохранить новый пароль'}
                  </Button>
                </form>
              </div>
            ) : showForgotPassword ? (
              <div>
                <div className="flex items-center mb-4">
                  <button 
                    type="button" 
                    className="text-[#4CAF50] text-sm hover:text-[#45A049] hover:underline mr-4"
                    onClick={() => {
                      setShowForgotPassword(false)
                      setForgotPasswordStep('phone')
                      setForgotPasswordCallId('')
                      setForgotPasswordChallengeToken('')
                      setForgotPasswordDigits('')
                      setResetToken('')
                      setForgotPasswordErrors({})
                      setResetPasswordErrors({})
                    }}
                  >
                    ← Назад к входу
                  </button>
                  <h3 className="text-lg font-semibold">Восстановление пароля</h3>
                </div>

                {forgotPasswordStep === 'phone' ? (
                  <form className="flex flex-col gap-4" onSubmit={handleForgotPassword}>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Номер телефона</label>
                      <input
                        type="tel"
                        name="phone"
                        placeholder={phonePlaceholder()}
                        value={forgotPasswordForm.phone}
                        onChange={handleForgotPasswordChange}
                        onPaste={handlePhonePaste}
                        className={`border rounded px-3 py-2 w-full ${forgotPasswordMethod === 'phone' ? 'border-[#4CAF50]' : 'border-gray-300'}`}
                        onClick={() => setForgotPasswordMethod('phone')}
                      />
                      {forgotPasswordErrors.phone && <span className="text-xs text-red-500 mt-1">{forgotPasswordErrors.phone}</span>}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-[#F9F7F6] text-gray-500">ИЛИ</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Email</label>
                      <input
                        type="email"
                        name="email"
                        placeholder="your@email.com"
                        value={forgotPasswordForm.email}
                        onChange={handleForgotPasswordChange}
                        className={`border rounded px-3 py-2 w-full ${forgotPasswordMethod === 'email' ? 'border-[#4CAF50]' : 'border-gray-300'}`}
                        onClick={() => setForgotPasswordMethod('email')}
                      />
                      {forgotPasswordErrors.email && <span className="text-xs text-red-500 mt-1">{forgotPasswordErrors.email}</span>}
                    </div>
                    <p className="text-sm text-gray-600">
                      Введите номер телефона или email. При указании телефона придёт звонок — введите последние 4 цифры.
                    </p>
                    <Button type="submit" disabled={forgotPasswordLoading}>
                      {forgotPasswordLoading ? 'Отправка...' : 'Отправить инструкции'}
                    </Button>
                  </form>
                ) : forgotPasswordStep === 'enter_digits' ? (
                  <form className="flex flex-col gap-4" onSubmit={handleForgotPasswordVerifyDigits}>
                    <p className="text-sm text-gray-600">
                      На номер {forgotPasswordForm.phone} идёт звонок. Введите последние 4 цифры номера звонящего.
                    </p>
                    <div>
                      <label className="text-sm font-medium text-gray-700">4 цифры</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="1234"
                        value={forgotPasswordDigits}
                        onChange={(e) => setForgotPasswordDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="border rounded px-3 py-2 w-full font-mono text-lg tracking-widest"
                      />
                      {forgotPasswordErrors.digits && <span className="text-xs text-red-500 mt-1">{forgotPasswordErrors.digits}</span>}
                    </div>
                    <Button type="submit" disabled={forgotPasswordLoading || forgotPasswordDigits.length !== 4}>
                      {forgotPasswordLoading ? 'Проверка...' : 'Подтвердить'}
                    </Button>
                  </form>
                ) : forgotPasswordStep === 'new_password' ? (
                  <form className="flex flex-col gap-4" onSubmit={handleResetPassword}>
                    <p className="text-sm text-gray-600">Придумайте новый пароль (минимум 6 символов)</p>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Новый пароль</label>
                      <input
                        type="password"
                        name="password"
                        placeholder="Введите новый пароль"
                        value={resetPasswordForm.password}
                        onChange={handleResetPasswordChange}
                        autoComplete="new-password"
                        className={AUTH_PASSWORD_INPUT_CLASS}
                      />
                      {resetPasswordErrors.password && <span className="text-xs text-red-500 mt-1">{resetPasswordErrors.password}</span>}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Повторите пароль</label>
                      <input
                        type="password"
                        name="password2"
                        placeholder="Повторите новый пароль"
                        value={resetPasswordForm.password2}
                        onChange={handleResetPasswordChange}
                        autoComplete="new-password"
                        className={AUTH_PASSWORD_INPUT_CLASS}
                      />
                      {resetPasswordErrors.password2 && <span className="text-xs text-red-500 mt-1">{resetPasswordErrors.password2}</span>}
                    </div>
                    <Button type="submit" disabled={resetPasswordLoading}>
                      {resetPasswordLoading ? 'Сохранение...' : 'Сохранить пароль'}
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : (
              <form className="flex flex-col gap-3 sm:gap-4" onSubmit={handleLogin}>
                {loginErrors.general && (
                  <div data-testid="auth-login-error" className="p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {loginErrors.general}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Номер телефона</label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder={phonePlaceholder()}
                    value={loginForm.phone}
                    onChange={handleLoginChange}
                    onPaste={handlePhonePaste}
                    autoComplete="tel"
                    className="border rounded px-3 py-2 w-full min-h-[44px] text-[15px] leading-5 sm:text-sm sm:leading-normal"
                  />
                  {loginErrors.phone && <span className="text-xs text-red-500">{loginErrors.phone}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Пароль</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Пароль"
                    value={loginForm.password}
                    onChange={handleLoginChange}
                    autoComplete="current-password"
                    className={AUTH_PASSWORD_INPUT_CLASS}
                  />
                  {loginErrors.password && <span className="text-xs text-red-500">{loginErrors.password}</span>}
                </div>
                <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-between sm:items-center sm:mt-0 mt-1">
                  <Button type="submit" disabled={loginLoading} data-testid="auth-login-submit" className="w-full sm:w-auto">
                    {loginLoading ? 'Вход...' : 'Войти'}
                  </Button>
                  <button 
                    type="button" 
                    className="text-[#4CAF50] text-sm hover:text-[#45A049] hover:underline text-center sm:text-left py-0.5"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Забыли пароль?
                  </button>
                </div>
                <AuthDivider />
                <YandexAuthButton onClick={handleYandexLogin} />
              </form>
            )
          ) : (
            <div>
              <div className="flex gap-2 mb-4">
                <button type="button" className={`px-3 py-1 rounded ${regType==='client' ? 'bg-[#4CAF50] text-white' : 'bg-gray-100'}`} onClick={()=>setRegType('client')}>Клиент</button>
                <button type="button" className={`px-3 py-1 rounded ${regType==='master' ? 'bg-[#4CAF50] text-white' : 'bg-gray-100'}`} onClick={()=>setRegType('master')}>Мастер</button>
                {isSalonFeaturesEnabled() && (
                  <button type="button" className={`px-3 py-1 rounded ${regType==='salon' ? 'bg-[#4CAF50] text-white' : 'bg-gray-100'}`} onClick={()=>setRegType('salon')}>Салон</button>
                )}
              </div>
              <div className="mb-4 rounded-lg border border-[#E8E2DD] bg-white px-3 py-3 text-sm text-gray-700">
                Можно продолжить через Яндекс — после входа выберите роль и завершите регистрацию.
              </div>
              <div className="mb-4 flex flex-col gap-3">
                <YandexAuthButton onClick={handleYandexLogin} testId="auth-yandex-register" label="Зарегистрироваться через Яндекс" />
                <AuthDivider />
              </div>
              <form className="flex flex-col gap-4" onSubmit={handleRegister}>
                {errors.general && (
                  <div
                    data-testid="auth-register-error"
                    className="p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700"
                  >
                    {errors.general}
                  </div>
                )}
                {REGISTER_FIELDS[regType].map(f => (
                  <div key={f.name} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                      {f.label}
                      {f.required && <span className="text-red-500">*</span>}
                    </label>
                    {f.type === 'select' && f.name === 'city' ? (
                      <select
                        name="city"
                        value={form.city || ''}
                        onChange={handleChange}
                        aria-required={f.required}
                        required={f.required}
                        className={`border rounded px-3 py-2 ${f.required ? 'border-[#4CAF50]' : ''}`}
                      >
                        <option value="">Выберите город</option>
                        {cities.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type}
                        placeholder={f.name === 'phone' ? phonePlaceholder() : f.label}
                        aria-required={f.required}
                        required={f.required}
                        name={f.name}
                        value={f.name === 'phone' ? (form.phone || '+7') : (form[f.name] || '')}
                        onChange={handleChange}
                        onPaste={f.name === 'phone' ? handlePhonePaste : undefined}
                        autoComplete={f.type === 'password' ? 'new-password' : undefined}
                        className={
                          f.type === 'password'
                            ? `${AUTH_PASSWORD_INPUT_CLASS} ${f.required ? 'border-[#4CAF50]' : ''}`
                            : `border rounded px-3 py-2 min-h-[44px] text-[15px] leading-5 sm:text-sm sm:leading-normal ${f.required ? 'border-[#4CAF50]' : ''}`
                        }
                      />
                    )}
                    {errors[f.name] && <span className="text-xs text-red-500 mt-1">{errors[f.name]}</span>}
                  </div>
                ))}
                <div className="flex items-start gap-2 mt-2">
                  <input
                    id="agreeTerms"
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => {
                      setAgreeTerms(e.target.checked)
                      if (errors.agreeTerms) setErrors((er) => ({ ...er, agreeTerms: undefined }))
                    }}
                    className="mt-1"
                  />
                  <label htmlFor="agreeTerms" className="text-xs text-gray-700 select-none">
                    Я принимаю{' '}
                    <a href="/user-agreement" target="_blank" rel="noopener noreferrer" className="underline text-[#4CAF50]">
                      пользовательское соглашение
                    </a>{' '}
                    <span className="text-red-500">*</span>
                  </label>
                </div>
                {errors.agreeTerms && <span className="text-xs text-red-500 -mt-1">{errors.agreeTerms}</span>}
                <div className="flex items-start gap-2 mt-2">
                  <input
                    id="agreePersonalData"
                    type="checkbox"
                    checked={agreePersonalData}
                    onChange={(e) => {
                      setAgreePersonalData(e.target.checked)
                      if (errors.agreePersonalData) setErrors((er) => ({ ...er, agreePersonalData: undefined }))
                    }}
                    className="mt-1"
                  />
                  <label htmlFor="agreePersonalData" className="text-xs text-gray-700 select-none">
                    Я даю{' '}
                    <a
                      href="/personal-data-consent"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-[#4CAF50]"
                    >
                      согласие на обработку персональных данных
                    </a>{' '}
                    <span className="text-red-500">*</span>
                  </label>
                </div>
                {errors.agreePersonalData && (
                  <span className="text-xs text-red-500 -mt-1">{errors.agreePersonalData}</span>
                )}
                <div className="flex items-start gap-2 mt-2">
                  <input
                    id="marketingOptIn"
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                    className="mt-1"
                  />
                  <label htmlFor="marketingOptIn" className="text-xs text-gray-700 select-none">
                    Я даю{' '}
                    <a
                      href="/marketing-consent"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-[#4CAF50]"
                    >
                      согласие на получение рекламных и информационных рассылок
                    </a>{' '}
                    (опционально)
                  </label>
                </div>
                {phoneVerificationError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded">
                    <p className="text-sm text-red-800">{phoneVerificationError}</p>
                  </div>
                )}
                
                <Button type="submit" disabled={!agreeTerms || !agreePersonalData || loading}>
                  {loading ? 'Регистрация...' : 'Зарегистрироваться'}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
