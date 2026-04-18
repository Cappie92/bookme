# Верификация auth-guard и отсутствия прямых fetch

**Дата:** 2026-01-21

---

## RESULTS

---

## ШАГ 1 — auth-guard реализация

### Файл: `frontend/src/utils/api.js`

### AUTH_REQUIRED_PREFIXES + requiresAuth() (строки 4-14):

```javascript
// Префиксы эндпоинтов, которые требуют авторизации
const AUTH_REQUIRED_PREFIXES = [
  '/api/master/',
  '/api/loyalty/',
  '/api/master/loyalty/'
]

// Проверка, требует ли эндпоинт авторизации
const requiresAuth = (endpoint) => {
  return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
}
```

**Путь:** `frontend/src/utils/api.js:4-14`

---

### apiRequest() guard ДО fetch (строки 39-58):

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
      throw error  // ✅ Запрос НЕ отправляется (ДО fetch на строке 72)
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
    const response = await fetch(url, config)  // Строка 72
```

**Путь:** `frontend/src/utils/api.js:38-58` (guard), `frontend/src/utils/api.js:71-72` (fetch)

---

### getAuthHeaders() (строки 24-35):

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

**Путь:** `frontend/src/utils/api.js:24-35`

---

## ШАГ 2 — Подтверждение покрытия префиксов

### AUTH_REQUIRED_PREFIXES включает:

✅ `/api/master/` — **ЕСТЬ** (строка 6)  
✅ `/api/loyalty/` — **ЕСТЬ** (строка 7)  
✅ `/api/master/loyalty/` — **ЕСТЬ** (строка 8)

**Вывод:** Все необходимые префиксы покрыты. Дополнительных изменений не требуется.

---

## ШАГ 3 — Проверка отсутствия прямых fetch()

### Поиск прямых fetch по loyalty:

**Результат:** ✅ **НЕ НАЙДЕНО**

Все вызовы к `/api/loyalty/*` используют функции из `api.js`:
- `frontend/src/components/LoyaltySystem.jsx:81` — `apiGet('/api/loyalty/templates')`
- `frontend/src/components/LoyaltySystem.jsx:102` — `apiGet('/api/loyalty/status')`
- `frontend/src/components/LoyaltySystem.jsx:216` — `apiPost('/api/loyalty/quick-discounts', ...)`
- `frontend/src/components/LoyaltySystem.jsx:276` — `apiPost('/api/loyalty/personal-discounts', ...)`
- `frontend/src/components/LoyaltySystem.jsx:366` — `apiPost('/api/loyalty/complex-discounts', ...)`

**Вывод:** ✅ Все запросы к `/api/loyalty/*` проходят через `api.js` с guard.

---

### Поиск прямых fetch по master:

**Результат:** ⚠️ **НАЙДЕНО МНОЖЕСТВО ПРЯМЫХ fetch()**

**Файлы с прямыми fetch к `/api/master/*`:**

1. **`frontend/src/pages/MasterDashboard.jsx`** (множественные места):
   - Строка 40: `fetch(\`${API_BASE_URL}/api/master/invitations\`, ...)`
   - Строка 64: `fetch(\`${API_BASE_URL}/api/master/accounting/pending-confirmations\`, ...)`
   - Строка 244: `fetch(\`${API_BASE_URL}/api/master/categories\`, ...)`
   - Строка 249: `fetch(\`${API_BASE_URL}/api/master/services\`, ...)`
   - Строка 279: `fetch(\`${API_BASE_URL}/api/master/categories\`, method: 'POST')`
   - Строка 304: `fetch(\`${API_BASE_URL}/api/master/categories/${id}\`, method: 'PUT')`
   - Строка 331: `fetch(\`${API_BASE_URL}/api/master/categories/${id}\`, method: 'DELETE')`
   - Строка 348: `fetch(\`${API_BASE_URL}/api/master/services\`, method: 'POST')`
   - Строка 373: `fetch(\`${API_BASE_URL}/api/master/services/${id}\`, method: 'PUT')`
   - Строка 396: `fetch(\`${API_BASE_URL}/api/master/services/${id}\`, method: 'DELETE')`
   - Строка 642: `fetch(\`${API_BASE_URL}/api/master/salon-work\`, ...)`
   - Строка 667: `fetch(\`${API_BASE_URL}/api/master/invitations/${id}/respond\`, method: 'POST')`
   - Строка 691: `fetch(\`${API_BASE_URL}/api/master/invitations/${id}/respond\`, method: 'POST')`
   - Строка 1095: `fetch('/api/master/invitations', ...)`
   - Строка 1276: `fetch(\`${API_BASE_URL}/api/master/settings\`, ...)`
   - Строка 1306: `fetch(\`/api/master/bookings/limit\`, ...)`
   - Строка 1389: `fetch(\`${API_BASE_URL}/api/master/settings\`, ...)`
   - Строка 1456: `fetch(\`${API_BASE_URL}/api/master/services\`, ...)`
   - Строка 1475: `fetch(\`${API_BASE_URL}/api/master/schedule/weekly?week_offset=0&weeks_ahead=4\`, ...)`
   - Строка 1517: `fetch(\`${API_BASE_URL}/api/master/schedule/weekly?week_offset=-52&weeks_ahead=64\`, ...)`
   - Строка 1591: `fetch(\`${API_BASE_URL}/api/master/schedule/weekly?week_offset=${currentWeekOffset}&weeks_ahead=3\`, ...)`
   - Строка 1671: `fetch(\`${API_BASE_URL}/api/master/schedule/weekly\`, method: 'PUT')`

2. **`frontend/src/hooks/useMasterSubscription.js`**:
   - Строка 40: `fetch(\`${API_BASE_URL}/api/master/subscription/features\`, ...)`

3. **`frontend/src/components/SubscriptionModal.jsx`**:
   - Строка 56: `fetch(\`${API_BASE_URL}/api/master/service-functions?is_active=true\`, ...)`

4. **`frontend/src/pages/MasterTariff.jsx`**:
   - Строка 27: `fetch(\`${API_BASE_URL}/api/master/invitations\`, ...)`
   - Строка 51: `fetch(\`${API_BASE_URL}/api/master/accounting/pending-confirmations\`, ...)`
   - Строка 235: `fetch(\`${API_BASE_URL}/api/master/schedule/weekly?weeks_ahead=4\`, ...)`
   - Строка 320: `fetch(\`${API_BASE_URL}/api/master/service-functions?function_type=subscription&is_active=true\`, ...)`

5. **`frontend/src/components/MasterDashboardStats.jsx`**:
   - Строка 37: `fetch(\`/api/master/past-appointments?page=1&limit=3\`, ...)`
   - Строка 60: `fetch(\`/api/master/bookings/limit\`, ...)`

6. **`frontend/src/components/AllBookingsModal.jsx`**:
   - Строка 53: `fetch(\`${API_BASE_URL}/api/master/bookings/future?page=${reset ? 1 : futurePage}&limit=10\`, ...)`
   - Строка 61: `fetch(\`${API_BASE_URL}/api/master/past-appointments?page=${reset ? 1 : pastPage}&limit=10\`, ...)`

7. **`frontend/src/components/MasterScheduleCalendar.jsx`**:
   - Строка 93: `fetch('/api/master/schedule/rules', ...)`
   - Строка 114: `fetch('/api/master/bookings/detailed', ...)`
   - Строка 205: `fetch(\`/api/master/schedule/monthly?year=${year}&month=${month}\`, ...)`
   - Строка 300: `fetch('/api/master/schedule/weekly', method: 'PUT')`
   - Строка 718: `fetch('/api/master/schedule/rules', method: 'POST')`
   - Строка 1201: `fetch('/api/master/schedule/future', method: 'DELETE')`

8. **`frontend/src/components/MasterSettings.jsx`**:
   - Строка 84: `fetch(\`${API_BASE_URL}/api/master/settings\`, ...)`
   - Строка 136: `fetch(\`${API_BASE_URL}/api/master/payment-settings\`, ...)`
   - Строка 155: `fetch(\`${API_BASE_URL}/api/master/payment-settings\`, method: 'PUT')`
   - Строка 177: `fetch(\`${API_BASE_URL}/api/master/payment-settings\`, method: 'PUT')`
   - Строка 262: `fetch(\`${API_BASE_URL}/api/master/profile\`, method: 'PUT')`
   - Строка 358: `fetch(\`${API_BASE_URL}/api/master/profile\`, method: 'PUT')`

9. **`frontend/src/components/booking/MasterBookingModule.jsx`**:
   - Строка 136: `fetch(\`/api/master/services/public?master_id=${masterId}\`)`
   - Строка 362: `fetch('/api/master/check-booking-eligibility', method: 'POST')`

10. **`frontend/src/components/MasterPageModules.jsx`**:
    - Строка 20: `fetch(\`${API_BASE_URL}/api/master/page-modules\`, ...)`
    - Строка 53: `fetch(\`${API_BASE_URL}/api/master/page-modules\`, method: 'POST')`
    - Строка 83: `fetch(\`${API_BASE_URL}/api/master/page-modules/${moduleId}\`, method: 'DELETE')`
    - Строка 104: `fetch(\`${API_BASE_URL}/api/master/page-modules/${module.id}\`, method: 'PUT')`

11. **`frontend/src/components/SalonWorkSchedule.jsx`**:
    - Строка 51: `fetch(\`/api/master/salon-work/schedule?salon_id=${selectedSalon.salon_id}&start_date=${startDateStr}&end_date=${endDateStr}\`, ...)`
    - Строка 76: `fetch('/api/master/bookings/detailed', ...)`

12. **`frontend/src/modals/ServiceEditModal.jsx`**:
    - Строка 58: `fetch('/api/master/categories', method: 'POST')`

**Итого:** Найдено **50+ прямых fetch()** к `/api/master/*` в **12 файлах**.

---

### Поиск обхода через apiFetch:

**Результат:** ✅ **apiFetch имеет guard**

**Реализация apiFetch (строки 175-204):**

```javascript
// Функция для выполнения fetch запросов без автоматического парсинга JSON
export const apiFetch = async (endpoint, options = {}) => {
  // Проверка авторизации для защищённых эндпоинтов
  if (requiresAuth(endpoint)) {
    const token = localStorage.getItem('access_token')
    if (!token) {
      // Для apiFetch возвращаем Response с 401 статусом
      return new Response(
        JSON.stringify({ detail: 'Missing access token', message: 'Missing access token' }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' }
        }
      )
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
  
  return await fetch(url, config)
}
```

**Путь:** `frontend/src/utils/api.js:175-204`

**Вывод:** ✅ `apiFetch` имеет guard (строки 177-189), возвращает Response с 401 если токена нет.

**Использование apiFetch:**
- `frontend/src/components/MasterAccounting.jsx:157` — `apiFetch(url, { method: 'GET' })` → `/api/master/accounting/...` ✅ Guard есть
- `frontend/src/modals/TaxRateModal.jsx:61` — `apiFetch(\`/api/master/tax-rates/?${params}\`, ...)` → `/api/master/tax-rates/...` ✅ Guard есть
- `frontend/src/modals/ExpenseModal.jsx:129` — `apiFetch(endpoint, ...)` → `/api/master/accounting/expenses` ✅ Guard есть
- `frontend/src/pages/ClientDashboard.jsx` — `apiFetch(\`/api/client/...\`, ...)` → `/api/client/...` ⚠️ Не защищённый префикс (не входит в AUTH_REQUIRED_PREFIXES)

---

## ШАГ 4 — Итоговая таблица

| Найдено | Где | Эндпоинт | Через api.js? | Требует фикса? |
|---------|-----|----------|---------------|----------------|
| ✅ | `LoyaltySystem.jsx:81` | `/api/loyalty/templates` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `LoyaltySystem.jsx:102` | `/api/loyalty/status` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `LoyaltySystem.jsx:216` | `/api/loyalty/quick-discounts` | ✅ `apiPost` | ❌ НЕТ |
| ✅ | `LoyaltySystem.jsx:276` | `/api/loyalty/personal-discounts` | ✅ `apiPost` | ❌ НЕТ |
| ✅ | `LoyaltySystem.jsx:366` | `/api/loyalty/complex-discounts` | ✅ `apiPost` | ❌ НЕТ |
| ✅ | `MasterLoyalty.jsx:70` | `/api/master/loyalty/settings` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `MasterLoyalty.jsx:74` | `/api/master/loyalty/stats` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `MasterLoyalty.jsx:220` | `/api/master/loyalty/settings` | ✅ `apiPut` | ❌ НЕТ |
| ✅ | `MasterAccounting.jsx:122` | `/api/master/tax-rates/current` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `MasterAccounting.jsx:157` | `/api/master/accounting/...` | ✅ `apiFetch` (guard есть) | ❌ НЕТ |
| ✅ | `TaxRateModal.jsx:23` | `/api/master/tax-rates/current` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `TaxRateModal.jsx:61` | `/api/master/tax-rates/...` | ✅ `apiFetch` (guard есть) | ❌ НЕТ |
| ✅ | `ExpenseModal.jsx:51` | `/api/master/services` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `ExpenseModal.jsx:129` | `/api/master/accounting/expenses` | ✅ `apiFetch` (guard есть) | ❌ НЕТ |
| ✅ | `AllBookingsModal.jsx:31` | `/api/master/settings` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `BookingConfirmations.jsx:15` | `/api/master/accounting/pending-confirmations` | ✅ `apiGet` | ❌ НЕТ |
| ✅ | `BookingConfirmations.jsx:85` | `/api/master/accounting/confirm-all` | ✅ `apiPost` | ❌ НЕТ |
| ✅ | `BookingConfirmations.jsx:103` | `/api/master/accounting/cancel-all` | ✅ `apiPost` | ❌ НЕТ |
| ❌ | `MasterDashboard.jsx:40` | `/api/master/invitations` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:64` | `/api/master/accounting/pending-confirmations` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:244` | `/api/master/categories` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:249` | `/api/master/services` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:279` | `/api/master/categories` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:304` | `/api/master/categories/${id}` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:331` | `/api/master/categories/${id}` (DELETE) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:348` | `/api/master/services` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:373` | `/api/master/services/${id}` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:396` | `/api/master/services/${id}` (DELETE) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:642` | `/api/master/salon-work` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:667` | `/api/master/invitations/${id}/respond` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:691` | `/api/master/invitations/${id}/respond` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1095` | `/api/master/invitations` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1276` | `/api/master/settings` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1306` | `/api/master/bookings/limit` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1389` | `/api/master/settings` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1456` | `/api/master/services` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1475` | `/api/master/schedule/weekly` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1517` | `/api/master/schedule/weekly` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1591` | `/api/master/schedule/weekly` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboard.jsx:1671` | `/api/master/schedule/weekly` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `useMasterSubscription.js:40` | `/api/master/subscription/features` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `SubscriptionModal.jsx:56` | `/api/master/service-functions` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterTariff.jsx:27` | `/api/master/invitations` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterTariff.jsx:51` | `/api/master/accounting/pending-confirmations` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterTariff.jsx:235` | `/api/master/schedule/weekly` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterTariff.jsx:320` | `/api/master/service-functions` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboardStats.jsx:37` | `/api/master/past-appointments` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterDashboardStats.jsx:60` | `/api/master/bookings/limit` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `AllBookingsModal.jsx:53` | `/api/master/bookings/future` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `AllBookingsModal.jsx:61` | `/api/master/past-appointments` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterScheduleCalendar.jsx:93` | `/api/master/schedule/rules` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterScheduleCalendar.jsx:114` | `/api/master/bookings/detailed` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterScheduleCalendar.jsx:205` | `/api/master/schedule/monthly` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterScheduleCalendar.jsx:300` | `/api/master/schedule/weekly` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterScheduleCalendar.jsx:718` | `/api/master/schedule/rules` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterScheduleCalendar.jsx:1201` | `/api/master/schedule/future` (DELETE) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterSettings.jsx:84` | `/api/master/settings` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterSettings.jsx:136` | `/api/master/payment-settings` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterSettings.jsx:155` | `/api/master/payment-settings` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterSettings.jsx:177` | `/api/master/payment-settings` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterSettings.jsx:262` | `/api/master/profile` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterSettings.jsx:358` | `/api/master/profile` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterBookingModule.jsx:136` | `/api/master/services/public` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterBookingModule.jsx:362` | `/api/master/check-booking-eligibility` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterPageModules.jsx:20` | `/api/master/page-modules` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterPageModules.jsx:53` | `/api/master/page-modules` (POST) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterPageModules.jsx:83` | `/api/master/page-modules/${id}` (DELETE) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `MasterPageModules.jsx:104` | `/api/master/page-modules/${id}` (PUT) | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `SalonWorkSchedule.jsx:51` | `/api/master/salon-work/schedule` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `SalonWorkSchedule.jsx:76` | `/api/master/bookings/detailed` | ❌ `fetch()` | ✅ **ДА** |
| ❌ | `ServiceEditModal.jsx:58` | `/api/master/categories` (POST) | ❌ `fetch()` | ✅ **ДА** |

---

## Вывод

### ✅ `/api/loyalty/*` — полностью защищено
- Все запросы используют `apiGet`/`apiPost`/`apiPut`/`apiDelete`
- Guard работает корректно

### ⚠️ `/api/master/*` — **50+ прямых fetch() обходят guard**
- Найдено в **12 файлах**
- Все эти запросы могут уйти без токена (если забыта проверка в компоненте)

### Рекомендация
Заменить все прямые `fetch()` к `/api/master/*` на функции из `api.js` (`apiGet`, `apiPost`, `apiPut`, `apiDelete`, `apiFetch`).

**Приоритет:** P1 (не критично для loyalty, но нарушает архитектуру безопасности)

---

**Статус:** ✅ `/api/loyalty/*` защищено | ⚠️ `/api/master/*` требует рефакторинга
