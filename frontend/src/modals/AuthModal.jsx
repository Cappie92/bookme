import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getVerificationDeviceType, supportsReverseFlashCall } from '../utils/deviceUtils'
import { Button, Logo } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { isSalonFeaturesEnabled } from '../config/features'

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
    { name: 'fio', label: 'ФИО', type: 'text', required: true },
    { name: 'phone', label: 'Номер телефона', type: 'tel', required: true },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'dob', label: 'Дата рождения', type: 'date' },
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
  // Оставляем только цифры
  let digits = input.replace(/\D/g, '')
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

export default function AuthModal({ open = false, onClose = () => {}, defaultRegType = 'client' }) {
  const { login } = useAuth()
  const [tab, setTab] = useState('login')
  const [regType, setRegType] = useState(defaultRegType)
  
  // Обновляем тип регистрации при изменении defaultRegType
  useEffect(() => {
    setRegType(defaultRegType)
  }, [defaultRegType])
  const [agree, setAgree] = useState(false)
  const [infoAgree, setInfoAgree] = useState(false)
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
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', password2: '' })
  const [resetPasswordErrors, setResetPasswordErrors] = useState({})
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  
  // Состояние для обратного FlashCall
  const [reverseFlashCallLoading, setReverseFlashCallLoading] = useState(false)
  const [reverseFlashCallError, setReverseFlashCallError] = useState('')
  const [reverseFlashCallData, setReverseFlashCallData] = useState(null)
  const [checkingReverseStatus, setCheckingReverseStatus] = useState(false)
  
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

  if (!open) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleCloseClick = () => {
    onClose()
  }

  const handleChange = (e) => {
    let { name, value } = e.target
    if (name === 'phone') value = formatPhone(value)
    setForm(f => ({ ...f, [name]: value }))
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
      phone: form.phone || '',
      full_name,
      role: ROLE_MAP[regType],
      password: form.password || '',
    }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        // Получаем роль пользователя
        let role = null;
        // Пробуем декодировать JWT (access_token) чтобы узнать роль
        try {
          const payload = JSON.parse(atob(data.access_token.split('.')[1]))
          role = payload.role
        } catch (e) {}
        
        // Сохраняем токены в localStorage
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        
        // Обновляем состояние авторизации
        login(data)
        
        setForm({})
        onClose()
        
        // Редирект по роли
        if (role === 'ADMIN') navigate('/admin');
        else if (role === 'CLIENT') navigate('/client');
        else if (role === 'MASTER') navigate('/master');
        else if (role === 'SALON') navigate('/salon');
        else if (role === 'INDIE') navigate('/master');
        else if (role === 'MODERATOR') navigate('/admin');
        else navigate('/');
      } else {
        const err = await res.json()
        alert('Ошибка: ' + (err.detail || 'Не удалось зарегистрироваться'))
      }
    } catch (e) {
      alert('Ошибка сети или сервера')
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: loginForm.phone,
          password: loginForm.password,
        }),
      })
      if (res.ok) {
        const data = await res.json();
        // Получаем роль пользователя
        let role = null;
        // Пробуем декодировать JWT (access_token) чтобы узнать роль
        try {
          const payload = JSON.parse(atob(data.access_token.split('.')[1]))
          role = payload.role
        } catch (e) {}
        setLoginForm({ phone: '+7', password: '' })
        onClose()
        // Сохраняем токены в localStorage
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        
        // Обновляем состояние авторизации
        login(data)
        
        // Редирект по роли
        if (role === 'ADMIN') navigate('/admin');
        else if (role === 'CLIENT') navigate('/client');
        else if (role === 'MASTER') navigate('/master');
        else if (role === 'SALON') navigate('/salon');
        else if (role === 'INDIE') navigate('/master');
        else if (role === 'MODERATOR') navigate('/admin');
        else navigate('/');
      } else {
        const err = await res.json()
        alert('Ошибка: ' + (err.detail || 'Не удалось войти'))
      }
    } catch (e) {
      alert('Ошибка сети или сервера')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    const errs = validateForgotPassword()
    setForgotPasswordErrors(errs)
    if (Object.keys(errs).length > 0) return
    setForgotPasswordLoading(true)
    try {
      const payload = forgotPasswordMethod === 'phone' 
        ? { phone: forgotPasswordForm.phone }
        : { email: forgotPasswordForm.email }
      
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          const method = forgotPasswordMethod === 'phone' ? 'номер телефона' : 'email'
          alert(`Инструкции по восстановлению пароля отправлены на ваш ${method}`)
          setShowForgotPassword(false)
          setForgotPasswordForm({ phone: '+7', email: '' })
          setForgotPasswordMethod('phone')
        } else {
          alert('Ошибка: ' + (data.message || 'Не удалось отправить инструкции'))
        }
      } else if (res.status === 404) {
        alert('Функция восстановления пароля пока не реализована. Обратитесь к администратору.')
      } else {
        const err = await res.json()
        alert('Ошибка: ' + (err.detail || 'Не удалось отправить инструкции'))
      }
    } catch (e) {
      alert('Ошибка сети или сервера')
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
          setResetPasswordForm({ password: '', password2: '' })
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
    } catch (e) {
      alert('Ошибка сети или сервера')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  const handleReverseFlashCall = async (phone) => {
    setReverseFlashCallLoading(true)
    setReverseFlashCallError('')
    
    try {
      const response = await fetch('/api/auth/request-reverse-phone-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setReverseFlashCallData({
          call_id: result.call_id,
          verification_number: result.verification_number,
          phone: phone
        })
        // Начинаем проверку статуса
        startReverseStatusCheck(result.call_id, phone)
      } else {
        setReverseFlashCallError(result.message || 'Ошибка инициации обратного FlashCall')
      }
    } catch (error) {
      console.error('Ошибка обратного FlashCall:', error)
      setReverseFlashCallError('Ошибка сети при инициации обратного FlashCall')
    } finally {
      setReverseFlashCallLoading(false)
    }
  }
  
  const startReverseStatusCheck = (call_id, phone) => {
    setCheckingReverseStatus(true)
    
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/auth/check-reverse-phone-verification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ call_id, phone })
        })
        
        const result = await response.json()
        
        if (result.success) {
          setCheckingReverseStatus(false)
          setReverseFlashCallData(null)
          alert('Телефон успешно верифицирован!')
          // Закрываем модальное окно или переходим к следующему шагу
          onClose()
        } else {
          // Продолжаем проверку через 2 секунды
          setTimeout(checkStatus, 2000)
        }
      } catch (error) {
        console.error('Ошибка проверки статуса:', error)
        setCheckingReverseStatus(false)
        setReverseFlashCallError('Ошибка проверки статуса верификации')
      }
    }
    
    // Запускаем первую проверку через 5 секунд
    setTimeout(checkStatus, 5000)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 pt-16"
      onClick={handleBackdropClick}
    >
      <div className="bg-[#F9F7F6] rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-10 relative animate-fade-in my-8">
        <button onClick={handleCloseClick} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 text-lg z-10">✕</button>
        <div className="absolute left-0 right-0 top-6 flex justify-center pointer-events-none select-none">
          <Logo size="xl" />
        </div>
        <div className="pt-16">
          <div className="flex mb-6 border-b">
            <button 
              className={`flex-1 py-2 font-semibold ${tab==='login' ? 'border-b-2 border-[#4CAF50] text-[#4CAF50]' : 'text-gray-500'}`} 
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
              className={`flex-1 py-2 font-semibold ${tab==='register' ? 'border-b-2 border-[#4CAF50] text-[#4CAF50]' : 'text-gray-500'}`} 
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
          {tab === 'login' ? (
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
                      className="border rounded px-3 py-2 w-full"
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
                      className="border rounded px-3 py-2 w-full"
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
                    onClick={() => setShowForgotPassword(false)}
                  >
                    ← Назад к входу
                  </button>
                  <h3 className="text-lg font-semibold">Восстановление пароля</h3>
                </div>
                <form className="flex flex-col gap-4" onSubmit={handleForgotPassword}>
                  {/* Поле телефона */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Номер телефона</label>
                    <input
                      type="tel"
                      name="phone"
                      placeholder={phonePlaceholder()}
                      value={forgotPasswordForm.phone}
                      onChange={handleForgotPasswordChange}
                      className={`border rounded px-3 py-2 w-full ${forgotPasswordMethod === 'phone' ? 'border-[#4CAF50]' : 'border-gray-300'}`}
                      onClick={() => setForgotPasswordMethod('phone')}
                    />
                    {forgotPasswordErrors.phone && <span className="text-xs text-red-500 mt-1">{forgotPasswordErrors.phone}</span>}
                  </div>

                  {/* Разделитель */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-[#F9F7F6] text-gray-500">ИЛИ</span>
                    </div>
                  </div>

                  {/* Поле email */}
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
                      Введите номер телефона или email, указанные при регистрации. Мы отправим инструкции по восстановлению пароля.
                    </p>
                    
                    {/* Показываем кнопку обратного FlashCall только на мобильных устройствах */}
                    {supportsReverseFlashCall() && forgotPasswordMethod === 'phone' && (
                      <div className="mt-4 p-4 bg-[#E8F5E8] border border-[#4CAF50] rounded-lg">
                        <p className="text-sm text-[#2E7D32] mb-3">
                          <strong>Мобильная верификация:</strong> Позвоните на номер для автоматической верификации
                        </p>
                        <Button 
                          onClick={() => handleReverseFlashCall(forgotPasswordForm.phone)}
                          disabled={reverseFlashCallLoading || checkingReverseStatus}
                          className="w-full"
                        >
                          {reverseFlashCallLoading ? 'Инициация...' : 
                           checkingReverseStatus ? 'Проверка звонка...' : 
                           'Позвонить для верификации'}
                        </Button>
                        {reverseFlashCallData && (
                          <div className="mt-3 p-3 bg-[#E8F5E8] border border-[#4CAF50] rounded">
                            <p className="text-sm text-[#2E7D32]">
                              <strong>Номер для звонка:</strong> {reverseFlashCallData.verification_number}
                            </p>
                            <p className="text-xs text-[#388E3C] mt-1">
                              Позвоните на этот номер с вашего телефона для автоматической верификации
                            </p>
                          </div>
                        )}
                        {reverseFlashCallError && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                            <p className="text-sm text-red-800">{reverseFlashCallError}</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <Button type="submit" disabled={forgotPasswordLoading}>
                      {forgotPasswordLoading ? 'Отправка...' : 'Отправить инструкции'}
                    </Button>
                </form>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleLogin}>
                <label className="text-sm font-medium text-gray-700">Номер телефона</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder={phonePlaceholder()}
                  value={loginForm.phone}
                  onChange={handleLoginChange}
                  className="border rounded px-3 py-2"
                />
                {loginErrors.phone && <span className="text-xs text-red-500 mt-1">{loginErrors.phone}</span>}
                <label className="text-sm font-medium text-gray-700">Пароль</label>
                <input
                  type="password"
                  name="password"
                  placeholder="Пароль"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  className="border rounded px-3 py-2"
                />
                {loginErrors.password && <span className="text-xs text-red-500 mt-1">{loginErrors.password}</span>}
                <div className="flex justify-between items-center mt-2">
                  <Button type="submit" disabled={loginLoading}>
                    {loginLoading ? 'Вход...' : 'Войти'}
                  </Button>
                  <button 
                    type="button" 
                    className="text-[#4CAF50] text-sm hover:text-[#45A049] hover:underline"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Забыли пароль?
                  </button>
                </div>
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
              <form className="flex flex-col gap-4" onSubmit={handleRegister}>
                {REGISTER_FIELDS[regType].map(f => (
                  <div key={f.name} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                      {f.label}
                      {f.required && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type={f.type}
                      placeholder={f.name === 'phone' ? phonePlaceholder() : f.label}
                      aria-required={f.required}
                      required={f.required}
                      name={f.name}
                      value={f.name === 'phone' ? (form.phone || '+7') : (form[f.name] || '')}
                      onChange={handleChange}
                      className={`border rounded px-3 py-2 ${f.required ? 'border-[#4CAF50]' : ''}`}
                    />
                    {errors[f.name] && <span className="text-xs text-red-500 mt-1">{errors[f.name]}</span>}
                  </div>
                ))}
                <div className="flex items-start gap-2 mt-2">
                  <input id="agree" type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} required className="mt-1" />
                  <label htmlFor="agree" className="text-xs text-gray-700 select-none">
                    Нажимая на кнопку Зарегистрироваться, я подтверждаю свое согласие с{' '}
                    <a href="/user-agreement" target="_blank" rel="noopener noreferrer" className="underline text-[#4CAF50]">условиями пользовательского соглашения</a>
                    {' '}и даю согласие на обработку персональных данных <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <input id="infoAgree" type="checkbox" checked={infoAgree} onChange={e=>setInfoAgree(e.target.checked)} className="mt-1" />
                  <label htmlFor="infoAgree" className="text-xs text-gray-700 select-none">Я даю согласие на получение информационных сообщений</label>
                </div>
                <Button type="submit" disabled={!agree || loading}>
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