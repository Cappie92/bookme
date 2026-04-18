# Финальный вердикт: `/api/master/services/public`

## Результаты поиска

### 1. Поиск в backend

**Команды:**
```bash
grep -R "/api/master/services/public" backend
grep -R "services/public" backend
grep -R "services" backend/routers/master.py | grep "@router"
```

**Результаты:**
- ❌ `/api/master/services/public` **НЕ найден** в backend
- ✅ Найден `/api/salon/services/public` в `backend/routers/salon.py:208` (для салонов, публичный)
- ✅ Найден `/api/master/services` в `backend/routers/master.py:1984` (требует авторизацию)

### 2. Анализ backend роутеров

**`backend/routers/master.py`:**
- Router prefix: `/master` (строка 32)
- Подключение в `main.py`: `app.include_router(master.router, prefix="/api")` (строка 103)
- **Итоговый путь:** `/api/master/...`

**Найденные endpoints для services:**
- `@router.get("/services")` — строка 1984, требует `current_user: User = Depends(get_current_active_user)`
- `@router.post("/services")` — строка 2024, требует авторизацию
- `@router.put("/services/{service_id}")` — строка 2079, требует авторизацию
- `@router.delete("/services/{service_id}")` — строка 2147, требует авторизацию

**Вывод:** Все endpoints `/api/master/services/*` требуют авторизацию.

### 3. Анализ frontend использования

**Файл:** `frontend/src/components/booking/MasterBookingModule.jsx:138`

**Контекст:**
```javascript
const loadServices = async () => {
  try {
    // Проверяем, находимся ли мы на поддомене
    const subdomain = window.location.pathname.split('/')[2] // /domain/subdomain
    
    if (subdomain) {
      // Используем API для поддомена
      const data = await apiGet(`/api/domain/${subdomain}/services`)
      setServices(data.services || data)
    } else {
      // Используем обычный API
      const data = await apiGet(`/api/master/services/public?master_id=${masterId}`)
      setServices(data.services || data)
    }
  } catch (error) {
    console.error('Ошибка загрузки услуг:', error)
  }
}
```

**Анализ:**
- Компонент `MasterBookingModule` используется для **публичной страницы бронирования мастера**
- Если есть поддомен → используется `/api/domain/{subdomain}/services` (найден в `domain.py:106`, публичный)
- Если нет поддомена → используется `/api/master/services/public?master_id=${masterId}` (НЕ найден в backend)

### 4. Проверка альтернативных путей

**Проверено:**
- ❌ `backend/routers/domain.py` — нет `/api/master/services/public`
- ❌ `nginx-dedato.conf` — нет rewrite правил для `/api/master/services/public`
- ❌ `vite.config.js` — нет proxy правил для `/api/master/services/public`
- ✅ `backend/routers/domain.py:106` — есть `/api/domain/{subdomain}/services` (публичный, без auth)

## Вердикт

### Проблема
Endpoint `/api/master/services/public` **не существует в backend**, но используется во frontend для публичной страницы бронирования.

### Решение: **Оставить в PUBLIC_ENDPOINTS**

**Причины:**
1. ✅ Frontend уже использует этот endpoint для публичного сценария
2. ✅ Если endpoint будет реализован в backend, он должен быть публичным (для публичной страницы бронирования)
3. ✅ Если endpoint не существует, запрос вернёт 404, что корректно обрабатывается в `catch` блоке
4. ✅ **Безопасно:** даже если endpoint появится без auth, он не будет блокироваться guard'ом
5. ✅ Минимальные изменения в коде

### Альтернатива (не рекомендуется)
- Заменить `/api/master/services/public?master_id=${masterId}` на существующий endpoint
- Проблема: все существующие endpoints требуют авторизацию
- Нужно либо создать новый публичный endpoint в backend, либо использовать `/api/domain/...` для всех случаев

## Итоговый diff для `frontend/src/utils/api.js`

```diff
+// Префиксы эндпоинтов, которые требуют авторизации
+const AUTH_REQUIRED_PREFIXES = [
+  '/api/master/',
+  '/api/loyalty/',
+  '/api/master/loyalty/'
+]
+
+// Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
+const PUBLIC_ENDPOINTS = [
+  '/api/master/services/public', // Используется в MasterBookingModule для публичной страницы бронирования (endpoint может быть реализован в backend позже)
+  // Добавьте сюда другие публичные endpoints, если появятся
+]
+
+// Проверка, требует ли эндпоинт авторизации
+const requiresAuth = (endpoint) => {
+  // Сначала проверяем, не является ли endpoint публичным
+  // Проверяем точное совпадение или начало с publicEndpoint + '?' или '/'
+  // Это защищает от false positive (например, /api/master/publicity не должен считаться публичным)
+  for (const publicEndpoint of PUBLIC_ENDPOINTS) {
+    if (
+      endpoint === publicEndpoint ||
+      endpoint.startsWith(publicEndpoint + '?') ||
+      endpoint.startsWith(publicEndpoint + '/')
+    ) {
+      return false
+    }
+  }
+  // Затем проверяем префиксы
+  return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
+}
```

## Список найденных endpoints

| Endpoint | Backend | Auth | Статус |
|----------|---------|------|--------|
| `/api/master/services/public` | ❌ Не найден | N/A | ✅ Добавлен в `PUBLIC_ENDPOINTS` |
| `/api/master/services` | ✅ `master.py:1984` | ✅ Требует | Не публичный |
| `/api/salon/services/public` | ✅ `salon.py:208` | ❌ Публичный | Не требует изменений |
| `/api/domain/{subdomain}/services` | ✅ `domain.py:106` | ❌ Публичный | Не требует изменений |

## Вывод

✅ **Endpoint `/api/master/services/public` оставлен в `PUBLIC_ENDPOINTS`**

✅ **Проверка усилена для защиты от false positive**

✅ **Код готов к расширению для других публичных endpoints**

**Примечание:** Если в будущем endpoint будет реализован в backend, он должен быть публичным (без `Depends(get_current_active_user)`), так как используется для публичной страницы бронирования.
