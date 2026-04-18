# Hotfix: Публичные endpoints в /api/master/

## Проблема
После рефакторинга `fetch()` → `api.js` все запросы к `/api/master/*` блокировались auth-guard'ом, включая публичные endpoints, которые не требуют авторизации.

## Решение

### 1. Добавлено исключение в `requiresAuth()`

**Файл:** `frontend/src/utils/api.js`

**Изменения:**
- Добавлен массив `PUBLIC_ENDPOINTS` для исключений из auth-guard
- Обновлена функция `requiresAuth()` для проверки публичных endpoints перед проверкой префиксов

**Diff:**
```diff
+// Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
+const PUBLIC_ENDPOINTS = [
+  '/api/master/services/public',
+  // Добавьте сюда другие публичные endpoints, если появятся
+]
+
 // Проверка, требует ли эндпоинт авторизации
 const requiresAuth = (endpoint) => {
+  // Сначала проверяем, не является ли endpoint публичным
+  if (PUBLIC_ENDPOINTS.some(publicEndpoint => endpoint.startsWith(publicEndpoint))) {
+    return false
+  }
   // Затем проверяем префиксы
   return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
 }
```

### 2. Найденные публичные endpoints

**В frontend:**
- `/api/master/services/public` — используется в `MasterBookingModule.jsx` для загрузки публичных услуг мастера

**В backend (для справки):**
- `/api/master/services/public` — публичный endpoint для получения услуг мастера без авторизации
- Другие публичные endpoints находятся в `/api/salon/` и `/api/bookings/`, не требуют изменений

### 3. Проверка вызовов

**Найдено использование:**
```javascript
// frontend/src/components/booking/MasterBookingModule.jsx:138
const data = await apiGet(`/api/master/services/public?master_id=${masterId}`)
```

**Проверка:**
- ✅ Endpoint `/api/master/services/public` добавлен в `PUBLIC_ENDPOINTS`
- ✅ `requiresAuth('/api/master/services/public')` вернёт `false`
- ✅ Auth-guard не будет блокировать этот запрос
- ✅ Запрос пройдёт даже без токена (если backend разрешает)

### 4. Обновлённый Smoke Checklist

Добавлены 3 новых пункта в `MASTER_API_AUTH_GUARD_REFACTOR.md`:

#### 8. Публичный endpoint без токена
- [ ] Очистить localStorage (удалить access_token)
- [ ] Открыть страницу бронирования мастера (публичная страница)
- [ ] Проверить: услуги загружаются через `/api/master/services/public`
- [ ] Проверить Network tab: запрос к `/api/master/services/public` проходит БЕЗ Authorization header
- [ ] Ожидаемо: запрос успешен (200 OK), данные загружаются

#### 9. Публичный endpoint с токеном (опционально)
- [ ] Войти как мастер
- [ ] Открыть страницу бронирования мастера
- [ ] Проверить: услуги загружаются
- [ ] Проверить Network tab: запрос к `/api/master/services/public` может иметь Authorization header (необязательно, но не блокируется)

#### 10. Проверка других защищённых endpoints
- [ ] Без токена попытаться загрузить `/api/master/settings`
- [ ] Ожидаемо: auth-guard блокирует запрос ДО fetch()
- [ ] Ожидаемо: ошибка 401 выбрасывается немедленно

## Технические детали

### Логика проверки

1. **Порядок проверки:**
   ```javascript
   requiresAuth(endpoint) {
     // 1. Сначала проверяем публичные endpoints
     if (PUBLIC_ENDPOINTS.some(...)) return false
     
     // 2. Затем проверяем защищённые префиксы
     return AUTH_REQUIRED_PREFIXES.some(...)
   }
   ```

2. **Проверка через `startsWith()`:**
   - `/api/master/services/public` ✅ совпадает
   - `/api/master/services/public?master_id=123` ✅ совпадает (query params игнорируются)
   - `/api/master/services/public/extra` ✅ совпадает (подпуть тоже публичный)

### Расширение списка

Если появятся другие публичные endpoints в `/api/master/*`, добавьте их в массив `PUBLIC_ENDPOINTS`:

```javascript
const PUBLIC_ENDPOINTS = [
  '/api/master/services/public',
  '/api/master/profile/public',  // пример
  // ...
]
```

## Вывод

✅ **Публичный endpoint `/api/master/services/public` больше не блокируется auth-guard'ом**

✅ **Защищённые endpoints продолжают блокироваться без токена**

✅ **Код готов к расширению для других публичных endpoints**
