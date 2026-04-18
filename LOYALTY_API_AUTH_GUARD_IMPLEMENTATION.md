# API Auth Guard Implementation (WEB)

**Дата:** 2026-01-21  
**Файлы:** `frontend/src/utils/api.js`

---

## ШАГ 1 — Инвентаризация вызовов

### Найденные вызовы к защищённым эндпоинтам:

#### ✅ `/api/master/loyalty/*` (с проверками):
1. **`frontend/src/components/MasterLoyalty.jsx`** (строки 70, 74, 220)
   - ✅ Проверка токена: `const token = localStorage.getItem('access_token')` (строка 58)
   - ✅ Проверка `isAuthenticated` в `useEffect` (строка 51)
   - ✅ Early return в `loadHistoryInternal()` (строка 99)

#### ⚠️ `/api/master/*` (без явных проверок):
2. **`frontend/src/components/MasterAccounting.jsx`** (строка 122)
   - ❌ Нет проверки токена перед `apiGet('/api/master/tax-rates/current')`
   - ⚠️ Обработка 401 есть в `handleUnauthorized()` (строка 50)

3. **`frontend/src/modals/TaxRateModal.jsx`** (строка 23)
   - ❌ Нет проверки токена перед `apiGet('/api/master/tax-rates/current')`

4. **`frontend/src/modals/ExpenseModal.jsx`** (строка 51)
   - ❌ Нет проверки токена перед `apiGet('/api/master/services')`

5. **`frontend/src/components/AllBookingsModal.jsx`** (строка 31)
   - ❌ Нет проверки токена перед `apiGet('/api/master/settings')`

6. **`frontend/src/components/BookingConfirmations.jsx`** (строки 15, 85, 103)
   - ❌ Нет проверки токена перед `apiGet('/api/master/accounting/pending-confirmations')`
   - ❌ Нет проверки токена перед `apiPost('/api/master/accounting/confirm-all')`
   - ❌ Нет проверки токена перед `apiPost('/api/master/accounting/cancel-all')`

#### ⚠️ `/api/loyalty/*` (использует fetch напрямую):
7. **`frontend/src/components/LoyaltySystem.jsx`** (строки 81, 102, 227, 269, 303, 345, 414, 474)
   - ⚠️ Использует `fetch()` напрямую, а не `apiGet()`/`apiRequest()`
   - ✅ Проверка токена есть в `useEffect` (строки 52-60)
   - ✅ Проверка токена есть в `loadData()` (строки 67-71)
   - ⚠️ **Проблема:** Не использует централизованный guard из `api.js`

### Итог:
- **Подозрительные вызовы:** 6 файлов с вызовами `/api/master/*` без явных проверок токена
- **Критично:** `LoyaltySystem.jsx` использует `fetch()` напрямую, обходя guard

---

## ШАГ 2 — Реализация guard (Вариант A)

### Изменения в `frontend/src/utils/api.js`:

1. **Добавлены константы для защищённых префиксов:**
```javascript
const AUTH_REQUIRED_PREFIXES = [
  '/api/master/',
  '/api/loyalty/',
  '/api/master/loyalty/'
]
```

2. **Добавлена функция проверки:**
```javascript
const requiresAuth = (endpoint) => {
  return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
}
```

3. **Добавлен guard в `apiRequest()`:**
```javascript
if (requiresAuth(endpoint)) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    // Выбрасываем ошибку в формате, совместимом с обработкой 401
    const error = new Error('HTTP error! status: 401')
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => null },
      data: { detail: 'Missing access token', message: 'Missing access token' }
    }
    throw error
  }
}
```

4. **Добавлен guard в `apiRequestSilent()`** (аналогично)

5. **Добавлен guard в `apiFetch()`** (возвращает Response с 401)

### Почему это не ломает публичные эндпоинты:
- ✅ Guard срабатывает только для префиксов `/api/master/`, `/api/loyalty/`, `/api/master/loyalty/`
- ✅ Публичные эндпоинты (например, `/api/public/*`, `/api/auth/*`) не затрагиваются
- ✅ Проверка делается ДО отправки запроса, предотвращая лишние сетевые вызовы

---

## ШАГ 3 — Error handling

### Текущая обработка 401 в приложении:

1. **`MasterLoyalty.jsx`** (строки 134, 173):
   - Очищает токены из `localStorage`
   - Устанавливает сообщение об ошибке
   - Редирект на `/login` через 2 секунды

2. **`MasterAccounting.jsx`** (строки 159-162):
   - Вызывает `handleUnauthorized()`
   - Очищает токены
   - Редирект на `/`

3. **`LoyaltySystem.jsx`** (множественные места):
   - Очищает токены
   - Редирект на `/login`

### Совместимость с новой ошибкой:

✅ **Ошибка "Missing access token" обрабатывается корректно:**
- Формат ошибки совпадает с обычным 401: `error.response.status === 401`
- Все существующие обработчики 401 будут работать без изменений
- Не требуется дополнительный маппинг

### Пример обработки:
```javascript
try {
  const data = await apiGet('/api/master/settings')
  // ...
} catch (err) {
  const status = err.response?.status
  if (status === 401) {
    // Обработка работает как обычно
    localStorage.removeItem('access_token')
    window.location.href = '/login'
  }
}
```

---

## ШАГ 4 — Smoke Checklist

### Тесты для проверки guard:

1. ✅ **Без токена: переход в `/master?tab=loyalty`**
   - Открыть DevTools → Network
   - Очистить `localStorage.removeItem('access_token')`
   - Перейти на `/master?tab=loyalty`
   - **Ожидаемо:** Нет запросов к `/api/master/*` и `/api/loyalty/*` в Network
   - **Ожидаемо:** Показывается сообщение об ошибке или редирект на `/login`

2. ✅ **После логина: запросы идут нормально**
   - Залогиниться мастером
   - Перейти на `/master?tab=loyalty`
   - **Ожидаемо:** Запросы к `/api/master/loyalty/*` уходят с `Authorization` header
   - **Ожидаемо:** Данные загружаются корректно

3. ✅ **Токен удалён вручную: запросы не уходят**
   - Залогиниться мастером
   - Открыть `/master?tab=loyalty` (данные загружены)
   - В консоли: `localStorage.removeItem('access_token')`
   - Попытаться выполнить действие (например, сохранить настройки)
   - **Ожидаемо:** Запрос НЕ уходит в Network
   - **Ожидаемо:** Показывается сообщение об ошибке или редирект

4. ✅ **Публичные эндпоинты работают без токена**
   - Очистить токен
   - Вызвать публичный эндпоинт (если есть, например `/api/public/*`)
   - **Ожидаемо:** Запрос уходит нормально (guard не срабатывает)

5. ✅ **Обработка 401 работает корректно**
   - Залогиниться мастером
   - Установить невалидный токен: `localStorage.setItem('access_token', 'invalid')`
   - Перейти на `/master?tab=loyalty`
   - **Ожидаемо:** Запрос уходит, сервер возвращает 401
   - **Ожидаемо:** Токены очищаются, редирект на `/login`

6. ✅ **MasterAccounting без токена**
   - Очистить токен
   - Открыть страницу с `MasterAccounting`
   - **Ожидаемо:** Запрос к `/api/master/tax-rates/current` НЕ уходит
   - **Ожидаемо:** Показывается ошибка или редирект

7. ✅ **ExpenseModal без токена**
   - Очистить токен
   - Открыть модалку расхода
   - **Ожидаемо:** Запрос к `/api/master/services` НЕ уходит
   - **Ожидаемо:** Показывается ошибка или редирект

8. ✅ **BookingConfirmations без токена**
   - Очистить токен
   - Открыть компонент подтверждений
   - **Ожидаемо:** Запросы к `/api/master/accounting/*` НЕ уходят
   - **Ожидаемо:** Показывается ошибка или редирект

---

## ШАГ 5 — Unified Diff

### Изменения в `frontend/src/utils/api.js`:

```diff
--- frontend/src/utils/api.js
+++ frontend/src/utils/api.js
@@ -1,5 +1,19 @@
 // Базовый URL для API
 const API_BASE_URL = '' // Используем относительные пути для прокси Vite
 
+// Префиксы эндпоинтов, которые требуют авторизации
+const AUTH_REQUIRED_PREFIXES = [
+  '/api/master/',
+  '/api/loyalty/',
+  '/api/master/loyalty/'
+]
+
+// Проверка, требует ли эндпоинт авторизации
+const requiresAuth = (endpoint) => {
+  return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
+}
+
 // Функция для создания полного URL
 export const getApiUrl = (endpoint) => {
   // ...
@@ -25,6 +39,20 @@
 
 // Функция для выполнения API запросов
 export const apiRequest = async (endpoint, options = {}) => {
+  // Проверка авторизации для защищённых эндпоинтов
+  if (requiresAuth(endpoint)) {
+    const token = localStorage.getItem('access_token')
+    if (!token) {
+      // Выбрасываем ошибку в формате, совместимом с обработкой 401
+      const error = new Error('HTTP error! status: 401')
+      error.response = {
+        status: 401,
+        statusText: 'Unauthorized',
+        headers: { get: () => null },
+        data: { detail: 'Missing access token', message: 'Missing access token' }
+      }
+      throw error
+    }
+  }
+  
   const url = getApiUrl(endpoint)
   const headers = getAuthHeaders()
   // ...
```

Аналогичные изменения добавлены в `apiRequestSilent()` и `apiFetch()`.

---

## Итоговый статус

### ✅ Реализовано:
1. ✅ Guard на уровне API слоя для `/api/master/*`, `/api/loyalty/*`, `/api/master/loyalty/*`
2. ✅ Проверка токена ДО отправки запроса
3. ✅ Ошибка в формате, совместимом с существующей обработкой 401
4. ✅ Публичные эндпоинты не затрагиваются

### ⚠️ Известные ограничения:
- `LoyaltySystem.jsx` использует `fetch()` напрямую, обходя guard (требует отдельного рефакторинга)

### 📝 Рекомендации:
1. **Опционально:** Рефакторить `LoyaltySystem.jsx` для использования `apiGet()`/`apiRequest()` вместо `fetch()`
2. **Опционально:** Добавить проверку токена в `useEffect` для компонентов без явных проверок (но guard уже защищает)

---

**Статус:** ✅ **READY FOR TESTING**
