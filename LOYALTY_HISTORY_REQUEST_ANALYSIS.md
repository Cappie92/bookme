# Анализ риска ранних запросов истории без токена (WEB)

**Дата:** 2026-01-21  
**Файлы:** `frontend/src/components/MasterLoyalty.jsx`, `frontend/src/utils/api.js`

---

## 1. Реализация loadHistory() в WEB

### Файл: `frontend/src/components/MasterLoyalty.jsx`

```javascript
// Строки 50-54: useEffect для истории
useEffect(() => {
  if (!authLoading && isAuthenticated) {
    loadHistory()
  }
}, [appliedFilters, historySkip, authLoading, isAuthenticated])

// Строки 93-95: обёртка
const loadHistory = async () => {
  await loadHistoryInternal()
}

// Строки 97-125: внутренняя реализация
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

**Ключевые моменты:**
- ✅ Проверка токена: `const token = localStorage.getItem('access_token')` (строка 98)
- ✅ Early return: `if (!token || !isAuthenticated) return []` (строки 99-101)
- ✅ Вызов API: `await apiGet(url)` (строка 114)
- ✅ Обработка ошибок: `handleHistoryError(err, token)` (строка 120)

---

## 2. Реализация apiGet

### Файл: `frontend/src/utils/api.js`

```javascript
// Строка 12-23: получение заголовков авторизации
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

// Строки 26-85: базовый запрос
export const apiRequest = async (endpoint, options = {}) => {
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
    const response = await fetch(url, config)  // ⚠️ ЗАПРОС ВСЕГДА ОТПРАВЛЯЕТСЯ
    
    if (!response.ok) {
      // ... обработка ошибок
      throw error
    }
    
    return await response.json()
  } catch (error) {
    // ... обработка ошибок
    throw error
  }
}

// Строка 134: apiGet
export const apiGet = (endpoint) => apiRequest(endpoint, { method: 'GET' })
```

**Ключевые моменты:**
- ✅ `getAuthHeaders()` получает токен из `localStorage` (строка 13)
- ⚠️ Если токена нет, `Authorization` header не добавляется (строки 18-20)
- ❌ **НО запрос всё равно отправляется** (строка 39: `await fetch(url, config)`)
- ❌ Нет early-return, если токена нет
- ❌ Нет redirect при 401

---

## 3. Ответы на вопросы

### ❓ Может ли loadHistory() вызвать запрос без токена?

**Ответ: НЕТ (частично защищено)**

- ✅ `loadHistoryInternal()` проверяет `if (!token || !isAuthenticated) return []` (строка 99)
- ✅ Если токена нет, функция возвращает `[]` ДО вызова `apiGet()`
- ⚠️ **НО:** Есть race condition:
  - `useEffect` проверяет `isAuthenticated` (строка 51)
  - `loadHistoryInternal()` проверяет токен из `localStorage` (строка 98)
  - Если `isAuthenticated === true`, но токен ещё не записан в `localStorage` (или был удалён между проверками), запрос НЕ отправится (early return), но это не идеально

### ❓ Может ли apiGet отправить запрос без Authorization header?

**Ответ: ДА**

- ⚠️ `apiGet()` → `apiRequest()` → `getAuthHeaders()`
- ⚠️ Если токена нет в `localStorage`, `Authorization` header не добавляется
- ❌ **НО запрос всё равно отправляется** через `fetch(url, config)` (строка 39 в api.js)
- ❌ Нет проверки наличия токена перед отправкой запроса

### ❓ Есть ли сценарий, когда useEffect вызывает loadHistory(), но токен ещё не готов?

**Ответ: ДА (теоретически возможен)**

**Сценарий 1: Race condition между isAuthenticated и localStorage**
- `useEffect` проверяет `isAuthenticated === true` (строка 51)
- `loadHistoryInternal()` проверяет токен из `localStorage` (строка 98)
- Если `AuthContext` установил `isAuthenticated = true`, но токен ещё не записан в `localStorage`, запрос НЕ отправится (early return в строке 99-101)
- **Риск:** НИЗКИЙ (early return защищает)

**Сценарий 2: Токен удалён между проверками**
- `useEffect` сработал с `isAuthenticated === true`
- Пользователь удалил токен из `localStorage` (или он истёк)
- `loadHistoryInternal()` проверит токен и вернёт `[]` (early return)
- **Риск:** НИЗКИЙ (early return защищает)

**Сценарий 3: apiGet вызывается напрямую (обход loadHistoryInternal)**
- Если где-то в коде вызывается `apiGet('/api/master/loyalty/history')` напрямую
- `apiGet` НЕ проверяет токен перед отправкой
- Запрос уйдёт БЕЗ `Authorization` header
- **Риск:** СРЕДНИЙ (но в текущем коде такого нет)

---

## 4. Анализ рисков

### ✅ Защита есть:
1. `useEffect` проверяет `!authLoading && isAuthenticated` (строка 51)
2. `loadHistoryInternal()` проверяет `!token || !isAuthenticated` (строка 99)
3. Early return предотвращает вызов `apiGet()` без токена

### ⚠️ Потенциальные проблемы:

**Проблема #1: Двойная проверка токена (не критично)**
- `useEffect` не проверяет токен напрямую, только `isAuthenticated`
- `loadHistoryInternal()` проверяет токен из `localStorage`
- Это может привести к лишним проверкам, но не к запросам без токена

**Проблема #2: apiGet не защищён (если вызывается напрямую)**
- `apiGet()` не проверяет токен перед отправкой
- Если где-то вызывается напрямую, запрос уйдёт без токена
- В текущем коде такого нет, но это архитектурная уязвимость

**Проблема #3: Нет проверки токена в useEffect (не критично)**
- `useEffect` проверяет только `isAuthenticated`, но не токен
- Это может привести к лишним вызовам `loadHistoryInternal()`, но early return защищает

---

## 5. Рекомендации

### ✅ Текущая реализация достаточно безопасна

**Почему:**
- `loadHistoryInternal()` имеет early return при отсутствии токена
- `useEffect` проверяет `isAuthenticated`
- Двойная защита предотвращает запросы без токена

### 🔧 Минимальный фикс (опционально, для большей надёжности)

**Вариант 1: Добавить проверку токена в useEffect**

```javascript
// Строки 50-54: текущая реализация
useEffect(() => {
  if (!authLoading && isAuthenticated) {
    loadHistory()
  }
}, [appliedFilters, historySkip, authLoading, isAuthenticated])

// Предлагаемый фикс:
useEffect(() => {
  const token = localStorage.getItem('access_token')
  if (!authLoading && isAuthenticated && token) {
    loadHistory()
  }
}, [appliedFilters, historySkip, authLoading, isAuthenticated])
```

**Плюсы:**
- ✅ Предотвращает лишние вызовы `loadHistoryInternal()` при отсутствии токена
- ✅ Устраняет race condition между `isAuthenticated` и `localStorage`
- ✅ Минимальное изменение

**Минусы:**
- ⚠️ Дублирует проверку токена (но это не критично)

**Вариант 2: Оставить как есть (рекомендуется)**

Текущая реализация достаточно безопасна:
- `loadHistoryInternal()` имеет early return
- Двойная проверка (`isAuthenticated` + токен) защищает от запросов без токена
- Нет реальных рисков в текущем коде

---

## Итоговый вердикт

### ✅ РИСК НИЗКИЙ

**Причины:**
1. `loadHistoryInternal()` имеет early return при отсутствии токена
2. `useEffect` проверяет `isAuthenticated`
3. Нет прямых вызовов `apiGet()` для истории без проверки токена

**Рекомендация:**
- ✅ **Оставить как есть** — текущая реализация безопасна
- 🔧 **Опционально:** Добавить проверку токена в `useEffect` для устранения лишних вызовов (но не критично)

---

**Статус:** ✅ **БЕЗОПАСНО** (с опциональным улучшением)
