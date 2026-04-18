# Stage 2: WEB "Баллы" Audit - Parity с MOBILE

**Дата:** 2026-01-21  
**Цель:** Проверить полноту и единообразие WEB "Баллы" с MOBILE

---

## 🔍 Найденные проблемы

### 1. Auth-gating ❌

**Проблема:** WEB делает запросы без проверки токена

**Файлы:**
- `frontend/src/hooks/useMasterSubscription.js` - делает запрос к `/api/master/subscription/features` без проверки токена
- `frontend/src/components/MasterLoyalty.jsx` - делает запросы в `useEffect(() => { loadSettings() }, [])` без проверки токена
- `frontend/src/components/MasterLoyaltyStats.jsx` - делает запросы в `useEffect(() => { loadStats() }, [])` без проверки токена
- `frontend/src/components/MasterLoyaltyHistory.jsx` - делает запросы в `useEffect(() => { loadHistory() }, [skip, ...])` без проверки токена

**Текущий код:**
```javascript
// useMasterSubscription.js
useEffect(() => {
  loadFeatures()  // ❌ Нет проверки токена
}, [])

// MasterLoyalty.jsx
useEffect(() => {
  loadSettings()  // ❌ Нет проверки токена
}, [])
```

**Требуется:**
- Проверка `localStorage.getItem('access_token')` перед запросами
- Использование `useAuth()` из `AuthContext` для проверки `isAuthenticated` и `loading`

---

### 2. Форма настроек ✅ (уже полная, но нужно проверить видимость)

**Текущее состояние:**
- Форма уже содержит все поля:
  - `is_enabled` (чекбокс) ✅
  - `accrual_percent` (input number, 1-100) ✅
  - `max_payment_percent` (input number, 1-100) ✅
  - `points_lifetime_days` (select: 14/30/60/90/180/365/∞) ✅

**Проблема:** Поля `accrual_percent`, `max_payment_percent`, `points_lifetime_days` показываются только если `settings.is_enabled === true` (строка 183).

**В MOBILE:** Все поля видны всегда, но валидация требует их заполнения только если `is_enabled === true`.

**Требуется:** Проверить, что в WEB поведение соответствует MOBILE (поля видны всегда, валидация условная).

---

### 3. Обработка ошибок ❌

**Проблема:** Нет обработки 401, 409, 404

**Текущее состояние:**
- `MasterLoyalty.jsx`: только проверка 403 (строка 27-31)
- `MasterLoyaltyStats.jsx`: только проверка 403 (строка 22-26)
- `MasterLoyaltyHistory.jsx`: только проверка 403 (строка 41-45)

**Требуется:**
- **401 при наличии токена:** очистить токен, показать "Сессия истекла", перенаправить на логин
- **403:** locked state + CTA "Управление подпиской" (уже есть частично)
- **409 SCHEMA_OUTDATED:** жёлтый warning блок с hint
- **404:** понятный error block

---

### 4. History: фильтры и пагинация ✅ (уже есть!)

**Текущее состояние:**
- `MasterLoyaltyHistory.jsx` уже имеет:
  - Фильтры: `clientId`, `transactionType`, `startDate`, `endDate` ✅
  - Пагинация: `skip`, `limit` (50) ✅
  - Кнопки "Назад"/"Вперед" ✅

**Проверка:** Соответствует MOBILE (skip/limit параметры).

---

## 📋 План исправлений

### Файл 1: `frontend/src/hooks/useMasterSubscription.js`

**Добавить:**
- Проверку токена перед запросом
- Обработку 401 (очистка токена)
- Обработку 409 SCHEMA_OUTDATED

---

### Файл 2: `frontend/src/components/MasterLoyalty.jsx`

**Добавить:**
- Импорт `useAuth()` из `AuthContext`
- Проверку `isAuthenticated` и `loading` перед запросами
- Обработку 401 (очистка токена, перенаправление)
- Обработку 409 SCHEMA_OUTDATED (warning блок)
- Обработку 404 (error блок)
- Улучшить обработку 403 (locked state с CTA)

**Проверить форму:**
- Убедиться, что все поля видны (или показываются условно, как в MOBILE)

---

### Файл 3: `frontend/src/components/MasterLoyaltyStats.jsx`

**Добавить:**
- Импорт `useAuth()` из `AuthContext`
- Проверку `isAuthenticated` и `loading` перед запросами
- Обработку 401 (очистка токена)
- Обработку 409 SCHEMA_OUTDATED (warning блок)
- Обработку 404 (error блок)

---

### Файл 4: `frontend/src/components/MasterLoyaltyHistory.jsx`

**Добавить:**
- Импорт `useAuth()` из `AuthContext`
- Проверку `isAuthenticated` и `loading` перед запросами
- Обработку 401 (очистка токена)
- Обработку 409 SCHEMA_OUTDATED (warning блок)
- Обработку 404 (error блок)

**Проверить:**
- Фильтры и пагинация уже есть ✅

---

## 🔧 Детальные изменения

### 1. Auth-gating в useMasterSubscription.js

**Текущий код:**
```javascript
useEffect(() => {
  loadFeatures()
}, [])

const loadFeatures = async () => {
  try {
    setLoading(true)
    setError(null)
    const token = localStorage.getItem('access_token')
    
    const response = await fetch(`${API_BASE_URL}/api/master/subscription/features`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    // ...
  }
}
```

**Исправление:**
```javascript
useEffect(() => {
  const token = localStorage.getItem('access_token')
  if (!token) {
    setLoading(false)
    return
  }
  loadFeatures()
}, [])

const loadFeatures = async () => {
  const token = localStorage.getItem('access_token')
  if (!token) {
    setLoading(false)
    return
  }
  
  try {
    // ... existing code ...
  } catch (err) {
    // Обработка 401, 409, 404
  }
}
```

---

### 2. Auth-gating в MasterLoyalty.jsx

**Текущий код:**
```javascript
useEffect(() => {
  loadSettings()
}, [])

const loadSettings = async () => {
  try {
    setLoading(true)
    setError('')
    const data = await apiGet('/api/master/loyalty/settings')
    // ...
  }
}
```

**Исправление:**
```javascript
import { useAuth } from '../contexts/AuthContext'

export default function MasterLoyalty() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  // ...
  
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      setLoading(false)
      return
    }
    loadSettings()
  }, [authLoading, isAuthenticated])
  
  const loadSettings = async () => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated) {
      setLoading(false)
      return
    }
    
    try {
      // ... existing code ...
    } catch (err) {
      // Обработка 401, 409, 404
    }
  }
}
```

---

### 3. Обработка ошибок (универсальная функция)

**Добавить в каждый компонент:**
```javascript
const handleApiError = (err, setError) => {
  const status = err.response?.status || err.message?.match(/status: (\d+)/)?.[1]
  const errorCode = err.response?.headers?.['x-error-code']
  const errorData = err.response?.data
  
  // 401 при наличии токена
  if (status === 401 && localStorage.getItem('access_token')) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    setError('Сессия истекла. Пожалуйста, войдите снова.')
    // Перенаправление на логин (через window.location или navigate)
    setTimeout(() => {
      window.location.href = '/login'
    }, 2000)
    return
  }
  
  // 409 SCHEMA_OUTDATED
  if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
    const detail = errorData?.detail || 'Схема базы данных устарела'
    const hint = errorData?.hint || 'Run alembic upgrade head'
    setError(`${detail}. ${hint}`)
    setErrorType('warning')  // Для warning блока
    return
  }
  
  // 404
  if (status === 404) {
    const detail = errorData?.detail || 'Ресурс не найден'
    setError(detail)
    return
  }
  
  // 403
  if (status === 403) {
    const detail = errorData?.detail || 'Доступ запрещён'
    setError(detail)
    return
  }
  
  // Другие ошибки
  setError(errorData?.detail || err.message || 'Ошибка загрузки данных')
}
```

---

## 📝 Следующие шаги

1. Применить исправления к файлам
2. Создать unified diff
3. Создать smoke checklist
