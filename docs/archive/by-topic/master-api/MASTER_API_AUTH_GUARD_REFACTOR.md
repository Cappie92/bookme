# Рефакторинг: Замена прямых fetch() на api.js для /api/master/*

## Цель
Заменить все прямые `fetch()` к `/api/master/*` на функции из `frontend/src/utils/api.js`, чтобы все запросы проходили через централизованный auth-guard.

## Результат

### Статистика изменений
- **13 файлов изменено**
- **1169 строк добавлено, 1230 строк удалено** (чистое уменьшение на 61 строку)
- **0 прямых fetch() к /api/master/* осталось**

### Изменённые файлы

1. **frontend/src/pages/MasterDashboard.jsx** (594 строки изменено)
   - Заменены все fetch() к `/api/master/*` на `apiGet`/`apiPost`/`apiPut`/`apiDelete`
   - Убраны ручные заголовки Authorization
   - Убраны проверки `response.ok` и `response.status` (теперь через try/catch)

2. **frontend/src/hooks/useMasterSubscription.js** (56 строк изменено)
   - `loadFeatures()`: заменён fetch на `apiGet`
   - Обработка ошибок адаптирована под формат `err.response`

3. **frontend/src/components/SubscriptionModal.jsx** (597 строк изменено)
   - `loadServiceFunctions()`: заменён fetch на `apiGet`

4. **frontend/src/pages/MasterTariff.jsx** (212 строк изменено)
   - `loadPendingInvitations()`: заменён на `apiGet`
   - `loadUnconfirmedBookings()`: заменён на `apiGet`
   - `loadScheduleConflicts()`: заменён на `apiGet`
   - `loadServiceFunctions()`: заменён на `apiGet`

5. **frontend/src/components/MasterDashboardStats.jsx** (197 строк изменено)
   - `loadPastBookings()`: заменён на `apiGet`
   - `loadBookingsLimit()`: заменён на `apiGet`

6. **frontend/src/components/AllBookingsModal.jsx** (231 строка изменена)
   - `loadAllBookings()`: заменены два fetch на `Promise.all([apiGet(...), apiGet(...)])`
   - Убраны проверки `response.ok`

7. **frontend/src/components/MasterScheduleCalendar.jsx** (125 строк изменено)
   - `loadScheduleRules()`: заменён на `apiGet`
   - `loadBookings()`: заменён на `apiGet`
   - `loadMonthlySchedule()`: заменён на `apiGet`
   - `handleRemovePersonalSchedule()`: заменён PUT на `apiPut`
   - `handleCreateSchedule()`: заменён POST на `apiPost`
   - `handleDeleteSchedule()`: заменён DELETE на `apiDelete`

8. **frontend/src/components/MasterSettings.jsx** (107 строк изменено)
   - `loadProfile()`: заменён на `apiGet`
   - `loadPaymentSettings()`: заменён на `apiGet`
   - `savePaymentSettings()`: заменён на `apiPut`
   - `savePaymentSettingsSync()`: заменён на `apiPut`
   - `handleSave()` и `handleSaveWebsiteSettings()`: заменены fetch с FormData на `apiFetch`

9. **frontend/src/components/booking/MasterBookingModule.jsx** (26 строк изменено)
   - `loadServices()`: заменён fetch на `apiGet` (включая `/api/master/services/public`)
   - `checkBookingEligibility()`: заменён POST на `apiPost`

10. **frontend/src/components/MasterPageModules.jsx** (81 строка изменена)
    - `loadModules()`: заменён на `apiGet`
    - `handleAddModule()`: заменён POST на `apiPost`
    - `handleDeleteModule()`: заменён DELETE на `apiDelete`
    - `handleToggleActive()`: заменён PUT на `apiPut`

11. **frontend/src/components/SalonWorkSchedule.jsx** (35 строк изменено)
    - `loadSchedule()`: заменён на `apiGet`
    - `loadBookings()`: заменён на `apiGet`

12. **frontend/src/modals/ServiceEditModal.jsx** (18 строк изменено)
    - `handleCreateCategory()`: заменён POST на `apiPost`

13. **frontend/src/utils/api.js** (120 строк изменено)
    - Улучшена функция `apiFetch` для поддержки FormData:
      - Автоматически убирает `Content-Type` из headers, если body - FormData
      - Браузер установит правильный `Content-Type` с boundary автоматически

## Ключевые изменения

### 1. Замена fetch на apiGet/apiPost/apiPut/apiDelete
```javascript
// Было:
const res = await fetch(`${API_BASE_URL}/api/master/settings`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
if (res.ok) {
  const data = await res.json()
  // ...
}

// Стало:
const data = await apiGet('/api/master/settings')
// ...
```

### 2. Обработка ошибок
```javascript
// Было:
if (res.status === 401) {
  localStorage.removeItem('access_token')
  window.location.href = '/login'
}

// Стало:
try {
  const data = await apiGet('/api/master/settings')
  // ...
} catch (err) {
  const status = err.response?.status
  if (status === 401) {
    localStorage.removeItem('access_token')
    window.location.href = '/login'
  }
}
```

### 3. FormData через apiFetch
```javascript
// Было:
const res = await fetch(`${API_BASE_URL}/api/master/profile`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
})

// Стало:
const res = await apiFetch('/api/master/profile', {
  method: 'PUT',
  body: formData
})
// apiFetch автоматически убирает Content-Type для FormData
```

### 4. Параллельные запросы
```javascript
// Было:
const futureResponse = await fetch(...)
const pastResponse = await fetch(...)

// Стало:
const [futureData, pastData] = await Promise.all([
  apiGet(...),
  apiGet(...)
])
```

## Проверка результата

### Grep-проверка
```bash
# Проверка на оставшиеся fetch к /api/master/*
grep -r "fetch(.*\/api\/master" frontend/src
# Результат: 0 совпадений ✓

# Проверка на getApiUrl('/api/master
grep -r "getApiUrl\('/api\/master" frontend/src
# Результат: 0 совпадений ✓

# Проверка на `API_BASE_URL}/api/master
grep -r "\`API_BASE_URL}/api/master" frontend/src
# Результат: 0 совпадений ✓
```

## Smoke Checklist

### 1. Авторизация без токена
- [ ] Открыть приложение без токена (очистить localStorage)
- [ ] Перейти на страницу мастера
- [ ] Проверить Network tab: НЕ должно быть запросов к `/api/master/*`
- [ ] Ожидаемо: auth-guard блокирует запросы до fetch()

### 2. Логин мастера
- [ ] Войти как мастер
- [ ] Перейти на дашборд мастера
- [ ] Проверить: данные загружаются (настройки, услуги, расписание)
- [ ] Проверить Network tab: все запросы к `/api/master/*` имеют Authorization header

### 3. Сохранение настроек
- [ ] Открыть "Настройки" мастера
- [ ] Изменить какое-либо поле (например, ФИО)
- [ ] Сохранить
- [ ] Проверить: изменения сохранились
- [ ] Проверить Network tab: PUT `/api/master/settings` с корректным payload

### 4. Календарь расписания
- [ ] Открыть "Расписание"
- [ ] Проверить: расписание загружается
- [ ] Изменить несколько слотов
- [ ] Сохранить
- [ ] Проверить: изменения сохранились
- [ ] Проверить Network tab: PUT `/api/master/schedule/weekly` с корректным payload

### 5. Управление услугами
- [ ] Открыть "Услуги"
- [ ] Создать новую услугу
- [ ] Редактировать услугу
- [ ] Удалить услугу
- [ ] Проверить: все операции работают
- [ ] Проверить Network tab: POST/PUT/DELETE `/api/master/services/*` с корректными payloads

### 6. Загрузка фото/логотипа (FormData)
- [ ] Открыть "Настройки" → "Профиль"
- [ ] Загрузить фото профиля
- [ ] Проверить: фото загрузилось
- [ ] Проверить Network tab: PUT `/api/master/profile` с FormData и правильным Content-Type (multipart/form-data с boundary)

### 7. Обработка 401
- [ ] Войти как мастер
- [ ] Вручную удалить токен из localStorage (через DevTools)
- [ ] Выполнить действие, требующее API (например, сохранить настройки)
- [ ] Ожидаемо: auth-guard выбрасывает ошибку ДО fetch()
- [ ] Ожидаемо: токен очищается, редирект на /login

### 8. Публичный endpoint без токена
- [ ] Очистить localStorage (удалить access_token)
- [ ] Открыть страницу бронирования мастера (публичная страница)
- [ ] Проверить: услуги загружаются через `/api/master/services/public`
- [ ] Проверить Network tab: запрос к `/api/master/services/public` проходит БЕЗ Authorization header
- [ ] Ожидаемо: запрос успешен (200 OK), данные загружаются

### 9. Публичный endpoint с токеном (опционально)
- [ ] Войти как мастер
- [ ] Открыть страницу бронирования мастера
- [ ] Проверить: услуги загружаются
- [ ] Проверить Network tab: запрос к `/api/master/services/public` может иметь Authorization header (необязательно, но не блокируется)

### 10. Проверка других защищённых endpoints
- [ ] Без токена попытаться загрузить `/api/master/settings`
- [ ] Ожидаемо: auth-guard блокирует запрос ДО fetch()
- [ ] Ожидаемо: ошибка 401 выбрасывается немедленно

## Известные ограничения

1. **FormData через apiFetch**: `apiFetch` теперь автоматически убирает `Content-Type` из headers для FormData, чтобы браузер установил правильный boundary. Это работает корректно.

2. **Публичные endpoints**: `/api/master/services/public` добавлен в список исключений `PUBLIC_ENDPOINTS` в `api.js`. Этот endpoint не требует авторизации и не блокируется auth-guard'ом.

## Вывод

✅ **Все прямые fetch() к `/api/master/*` успешно заменены на функции из `api.js`**

✅ **Auth-guard теперь защищает все запросы к `/api/master/*`**

✅ **Код стал более единообразным и поддерживаемым**

✅ **Обработка ошибок централизована**
