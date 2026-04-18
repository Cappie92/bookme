# Точные выжимки кода для проверки auth-guard

**Дата:** 2026-01-21

---

## 1. WEB: loadHistory() из MasterLoyalty.jsx

### Файл: `frontend/src/components/MasterLoyalty.jsx`

### useEffect, который триггерит историю (строки 49-54):

```javascript
// Загрузка истории при изменении appliedFilters или skip (отдельно от settings/stats)
useEffect(() => {
  if (!authLoading && isAuthenticated) {
    loadHistory()
  }
}, [appliedFilters, historySkip, authLoading, isAuthenticated])
```

### loadHistory (обёртка) и loadHistoryInternal (строки 93-125):

```javascript
const loadHistory = async () => {
  await loadHistoryInternal()
}

const loadHistoryInternal = async () => {
  const token = localStorage.getItem('access_token')
  if (!token || !isAuthenticated) {
    return []
  }

  try {
    setHistoryLoading(true)
    setHistoryError('')
    setHistoryErrorType('error')
    
    let url = `/api/master/loyalty/history?skip=${historySkip}&limit=${historyLimit}`
    if (appliedFilters.clientId) url += `&client_id=${appliedFilters.clientId}`
    if (appliedFilters.transactionType) url += `&transaction_type=${appliedFilters.transactionType}`
    if (appliedFilters.startDate) url += `&start_date=${appliedFilters.startDate}`
    if (appliedFilters.endDate) url += `&end_date=${appliedFilters.endDate}`
    
    const data = await apiGet(url)
    const transactions = data || []
    setHistory(transactions)
    setHistoryHasMore(transactions.length === historyLimit)
    return transactions
  } catch (err) {
    handleHistoryError(err, token)
    return []
  } finally {
    setHistoryLoading(false)
  }
}
```

### handleHistoryError (строки 173-198):

```javascript
const handleHistoryError = (err, token) => {
  console.error('Ошибка загрузки истории:', err)
  
  const status = err.response?.status || (err.message?.match(/status: (\d+)/)?.[1] ? parseInt(err.message.match(/status: (\d+)/)[1]) : null)
  const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
  const errorData = err.response?.data || {}
  
  if (status === 401 && token) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    setHistoryError('Сессия истекла. Пожалуйста, войдите снова.')
    setHistoryErrorType('error')
    setTimeout(() => {
      window.location.href = '/login'
    }, 2000)
  } else if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
    const detail = errorData.detail || 'Схема базы данных устарела'
    const hint = errorData.hint || 'Run alembic upgrade head'
    setHistoryError(`${detail}. ${hint}`)
    setHistoryErrorType('warning')
  } else if (status === 404) {
    const detail = errorData.detail || 'Ресурс не найден'
    setHistoryError(detail)
    setHistoryErrorType('error')
  } else if (status === 403 || err.message?.includes('403') || err.message?.includes('status: 403')) {
    setHistoryError('Доступ к программе лояльности доступен на плане Pro и выше')
    setHistoryErrorType('error')
  } else {
    setHistoryError('Ошибка загрузки истории операций')
    setHistoryErrorType('error')
  }
}
```

**Номера строк:**
- useEffect: `frontend/src/components/MasterLoyalty.jsx:49-54`
- loadHistory: `frontend/src/components/MasterLoyalty.jsx:93-95`
- loadHistoryInternal: `frontend/src/components/MasterLoyalty.jsx:97-125`
- handleHistoryError: `frontend/src/components/MasterLoyalty.jsx:173-198`

---

## 2. apiGet и apiRequest из api.js

### Файл: `frontend/src/utils/api.js`

### getAuthHeaders (строки 24-35):

```javascript
// Функция для получения заголовков авторизации
export const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  const headers = {
    'Content-Type': 'application/json'
  }
  
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  
  return headers
}
```

### apiRequest (строки 38-122):

```javascript
// Функция для выполнения API запросов
export const apiRequest = async (endpoint, options = {}) => {
  // Проверка авторизации для защищённых эндпоинтов
  if (requiresAuth(endpoint)) {
    const token = localStorage.getItem('access_token')
    if (!token) {
      // Выбрасываем ошибку в формате, совместимом с обработкой 401
      const error = new Error('HTTP error! status: 401')
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
          get: () => null
        },
        data: {
          detail: 'Missing access token',
          message: 'Missing access token'
        }
      }
      throw error
    }
  }
  
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()
  
  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  }
  
  try {
    const response = await fetch(url, config)
    
    if (!response.ok) {
      // Сохраняем response для доступа к status и headers
      const error = new Error(`HTTP error! status: ${response.status}`)
      
      // Пытаемся получить JSON из ответа (клонируем response, так как body можно прочитать только один раз)
      let errorData = null
      try {
        const clonedResponse = response.clone()
        errorData = await clonedResponse.json()
      } catch {
        // Если не JSON, оставляем errorData = null
      }
      
      // Создаём объект headers для удобного доступа
      const headersObj = {}
      if (response.headers && response.headers.forEach) {
        response.headers.forEach((value, key) => {
          headersObj[key.toLowerCase()] = value
        })
      }
      
      error.response = {
        status: response.status,
        statusText: response.statusText,
        headers: {
          get: (name) => {
            // Пробуем сначала с оригинальным регистром, потом lowercase
            const lowerName = name.toLowerCase()
            return response.headers.get(name) || response.headers.get(lowerName) || headersObj[lowerName] || null
          },
          ...headersObj
        },
        data: errorData
      }
      
      throw error
    }
    
    return await response.json()
  } catch (error) {
    // Если это уже наш error с response - пробрасываем как есть
    if (error.response) {
      throw error
    }
    // Иначе логируем и пробрасываем
    console.error(`API request failed for ${endpoint}:`, error)
    throw error
  }
}
```

### apiGet (строка 207):

```javascript
export const apiGet = (endpoint) => apiRequest(endpoint, { method: 'GET' })
```

**Номера строк:**
- getAuthHeaders: `frontend/src/utils/api.js:24-35`
- apiRequest: `frontend/src/utils/api.js:38-122`
- apiGet: `frontend/src/utils/api.js:207`

---

## 3. Ручная проверка (3 пункта)

### Тест 1: Без токена

**Что сделать:**
1. Открыть DevTools (F12) → вкладка **Network**
2. В консоли браузера:
   ```javascript
   localStorage.removeItem('access_token')
   localStorage.removeItem('refresh_token')
   location.reload()
   ```
3. Перейти на `/master?tab=loyalty` (или перезагрузить страницу)

**Что увидеть в Network:**
- ✅ **0 запросов** к `/api/loyalty/*`
- ✅ **0 запросов** к `/api/master/loyalty/*`
- Guard блокирует ДО отправки в сеть (запросов нет в Network)

---

### Тест 2: С токеном

**Что сделать:**
1. Залогиниться мастером
2. Открыть `/master?tab=loyalty`
3. DevTools → Network → фильтр `/api/loyalty`
4. Создать быструю скидку (POST запрос)

**Что увидеть в headers/body у POST/PUT:**

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Payload (для POST):**
```json
{
  "discount_type": "quick",
  "name": "Скидка 10%",
  "discount_percent": 10,
  ...
}
```
✅ **НЕ** `[object Object]`, а JSON строка

**Проверка:**
- Открыть запрос `POST /api/loyalty/quick-discounts` в Network
- Вкладка **Payload** → должен быть JSON объект (не строка `[object Object]`)

---

### Тест 3: Invalid token

**Что сделать:**
1. Залогиниться мастером
2. В консоли:
   ```javascript
   localStorage.setItem('access_token', 'invalid_token_12345')
   location.reload()
   ```
3. Открыть `/master?tab=loyalty`

**Ожидаемое поведение по 401:**
- ✅ Запрос `GET /api/loyalty/status` уходит с `Authorization: Bearer invalid_token_12345`
- ✅ Сервер возвращает `401 Unauthorized`
- ✅ В консоли: сообщение "Сессия истекла. Пожалуйста, войдите снова."
- ✅ Токены очищены из localStorage:
   ```javascript
   localStorage.getItem('access_token') // null
   ```
- ✅ Редирект на `/login` через 2 секунды

**Проверка:**
1. Network → запрос `GET /api/loyalty/status` → статус `401`
2. Console → сообщение об ошибке
3. localStorage → токены удалены
4. URL → через 2 секунды меняется на `/login`

---

## Итог

**Файлы и строки:**
- `frontend/src/components/MasterLoyalty.jsx:49-54` (useEffect)
- `frontend/src/components/MasterLoyalty.jsx:93-125` (loadHistory + loadHistoryInternal)
- `frontend/src/components/MasterLoyalty.jsx:173-198` (handleHistoryError)
- `frontend/src/utils/api.js:24-35` (getAuthHeaders)
- `frontend/src/utils/api.js:38-122` (apiRequest)
- `frontend/src/utils/api.js:207` (apiGet)

**Статус:** ✅ Код готов для проверки
