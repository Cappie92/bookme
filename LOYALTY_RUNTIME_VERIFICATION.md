# Логическая проверка auth-guard (без runtime)

**Дата:** 2026-01-21  
**Ограничение:** Я не могу выполнить реальную runtime проверку в браузере, но могу проверить код логически.

---

## Логический анализ кода

### Тест 1: Без токена (guard должен блокировать)

**Код в `apiRequest` (строки 39-57):**
```javascript
if (requiresAuth(endpoint)) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    // Выбрасываем ошибку ДО fetch
    const error = new Error('HTTP error! status: 401')
    error.response = { status: 401, ... }
    throw error  // ✅ Запрос НЕ отправляется
  }
}
```

**Код в `LoyaltySystem.jsx` (строки 51-60):**
```javascript
const token = localStorage.getItem('access_token')
if (!token || !isAuthenticated) {
  setLoading(false)
  return  // ✅ loadData() НЕ вызывается
}
```

**Вывод:**
- ✅ Guard в `apiRequest` выбрасывает ошибку ДО `fetch()` (строка 56)
- ✅ `LoyaltySystem` проверяет токен ДО вызова `loadData()` (строка 52-59)
- ✅ **Двойная защита:** даже если `loadData()` вызовется, guard в `apiRequest` заблокирует запрос

**Ожидаемый результат:**
- В Network **НЕТ** запросов к `/api/loyalty/*`
- Guard блокирует ДО отправки в сеть

---

### Тест 2: С токеном (запросы должны уходить)

**Код в `apiPost` (строки 205-208):**
```javascript
export const apiPost = (endpoint, data) => apiRequest(endpoint, { 
  method: 'POST', 
  body: JSON.stringify(data)  // ✅ Сериализация JSON
})
```

**Код в `getAuthHeaders` (строки 24-35):**
```javascript
export const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  const headers = {
    'Content-Type': 'application/json'  // ✅ Устанавливается автоматически
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`  // ✅ Добавляется если есть
  }
  return headers
}
```

**Код в `apiRequest` (строки 60-72):**
```javascript
const headers = getAuthHeaders()  // ✅ Включает Content-Type и Authorization
const config = {
  ...options,
  headers: {
    ...headers,        // ✅ Content-Type и Authorization здесь
    ...options.headers
  }
}
const response = await fetch(url, config)  // ✅ Запрос отправляется
```

**Вывод:**
- ✅ `JSON.stringify(data)` сериализует объект в JSON строку
- ✅ `Content-Type: application/json` устанавливается автоматически
- ✅ `Authorization: Bearer <token>` добавляется если токен есть
- ✅ Запрос отправляется через `fetch()` с правильными headers и body

**Ожидаемый результат:**
- Запросы к `/api/loyalty/*` уходят с `Authorization: Bearer <token>`
- POST/PUT запросы имеют `Content-Type: application/json`
- Body в POST/PUT — это JSON строка (не `[object Object]`)

---

### Тест 3: Invalid token (401 обработка)

**Код в `LoyaltySystem.jsx` (строки 141-157):**
```javascript
} else if (status === 401) {
  const token = localStorage.getItem('access_token')
  if (token) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    setError('Сессия истекла. Пожалуйста, войдите снова.')
    setTimeout(() => {
      window.location.href = '/login'  // ✅ Редирект
    }, 2000)
  }
}
```

**Вывод:**
- ✅ Запрос уходит с invalid token (guard пропускает, т.к. токен есть)
- ✅ Сервер возвращает 401
- ✅ Обработчик очищает токены (строки 145-147)
- ✅ Устанавливается сообщение об ошибке (строка 148)
- ✅ Редирект на `/login` через 2 секунды (строки 154-156)

**Ожидаемый результат:**
- Запрос уходит с `Authorization: Bearer invalid_token`
- Сервер возвращает `401 Unauthorized`
- Токены очищаются из localStorage
- Показывается сообщение "Сессия истекла..."
- Редирект на `/login` через 2 секунды

---

## Инструкции для ручной проверки

### Тест 1: Без токена

**В консоли браузера:**
```javascript
localStorage.removeItem('access_token')
localStorage.removeItem('refresh_token')
location.reload()
```

**Проверить:**
- DevTools → Network → фильтр `/api/loyalty`
- **Ожидаемо:** 0 запросов

---

### Тест 2: С токеном

**Шаги:**
1. Залогиниться мастером
2. Открыть `/master?tab=loyalty`
3. DevTools → Network

**Проверить:**
- Запросы `GET /api/loyalty/templates` и `GET /api/loyalty/status`
- Headers: `Authorization: Bearer <token>`
- Для POST: Payload должен быть JSON (не `[object Object]`)

**Пример POST запроса:**
1. Создать быструю скидку
2. В Network найти `POST /api/loyalty/quick-discounts`
3. Проверить Payload: `{"discount_type":"quick","name":"...",...}`

---

### Тест 3: Invalid token

**В консоли браузера:**
```javascript
localStorage.setItem('access_token', 'invalid_token_12345')
location.reload()
```

**Проверить:**
- Network: запрос уходит с `Authorization: Bearer invalid_token_12345`
- Response: статус `401`
- localStorage: токены очищены
- UI: сообщение "Сессия истекла..."
- Редирект на `/login` через 2 секунды

---

## Вывод

### ✅ **OK** (логически)

**Код проверен:**
1. ✅ Guard блокирует запросы без токена ДО `fetch()`
2. ✅ JSON сериализация корректна (`JSON.stringify` в `apiPost`/`apiPut`)
3. ✅ `Content-Type: application/json` устанавливается автоматически
4. ✅ `Authorization` header добавляется если токен есть
5. ✅ Обработка 401 корректна (очистка токенов, редирект)

**Для финальной верификации:**
- Выполните ручные тесты по инструкциям выше
- Заполните результаты в `LOYALTY_RUNTIME_CHECK_INSTRUCTIONS.md`

**Статус:** ✅ **READY FOR MANUAL TESTING**
