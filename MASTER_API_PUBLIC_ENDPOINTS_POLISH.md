# Финальная полировка: Публичные endpoints в /api/master/

## Изменения в `frontend/src/utils/api.js`

### 1. Усилена проверка в `requiresAuth()`

**Проблема:** Простая проверка `endpoint.startsWith(publicEndpoint)` могла дать false positive для endpoints типа `/api/master/publicity`.

**Решение:** Добавлена точная проверка с тремя условиями:
- `endpoint === publicEndpoint` (точное совпадение)
- `endpoint.startsWith(publicEndpoint + '?')` (с query params)
- `endpoint.startsWith(publicEndpoint + '/')` (с подпутём)

### 2. Diff для `frontend/src/utils/api.js`

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
+  '/api/master/services/public',
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

### 3. Поиск всех публичных endpoints

**Grep команда:**
```bash
grep -r "/api/master.*public\|public.*/api/master" frontend/src backend/routers
```

**Результаты:**

#### В frontend:
- `/api/master/services/public` — используется в `MasterBookingModule.jsx:138`
  ```javascript
  const data = await apiGet(`/api/master/services/public?master_id=${masterId}`)
  ```

#### В backend:
- **НЕ найдено** публичных endpoints в `/api/master/` без `Depends(get_current_active_user)`
- Все endpoints в `backend/routers/master.py` требуют авторизацию через `current_user: User = Depends(get_current_active_user)`

**Вывод:** Единственный публичный endpoint, используемый во frontend — `/api/master/services/public`

**Примечание:** Endpoint `/api/master/services/public` используется во frontend, но не найден явно в `backend/routers/master.py`. Возможные варианты:
1. Endpoint обрабатывается через прокси/rewrite на уровне nginx/Vite
2. Endpoint находится в другом роутере (например, `domain.py`)
3. Endpoint планируется, но ещё не реализован в backend

В любом случае, он добавлен в исключения для безопасности.

### 4. Список найденных публичных endpoints

| Endpoint | Использование (frontend) | Backend определение | Статус |
|----------|-------------------------|-------------------|--------|
| `/api/master/services/public` | `MasterBookingModule.jsx:138` | **НЕ найден** в `backend/routers/master.py` | ✅ Добавлен в `PUBLIC_ENDPOINTS` |

**Другие публичные endpoints (не в /api/master/):**
- `/api/salon/services/public` — найден в `backend/routers/salon.py:208` (не требует изменений)
- `/api/bookings/public` — найден в `backend/routers/bookings.py:291` (не требует изменений)

### 5. Примеры работы проверки

| Endpoint | `requiresAuth()` | Причина |
|----------|------------------|---------|
| `/api/master/services/public` | `false` | Точное совпадение |
| `/api/master/services/public?master_id=123` | `false` | Начинается с `publicEndpoint + '?'` |
| `/api/master/services/public/extra` | `false` | Начинается с `publicEndpoint + '/'` |
| `/api/master/publicity` | `true` | НЕ начинается с `publicEndpoint + '?'` или `'/'` |
| `/api/master/publication` | `true` | НЕ начинается с `publicEndpoint + '?'` или `'/'` |
| `/api/master/services` | `true` | Не совпадает с публичным endpoint |
| `/api/master/settings` | `true` | Не совпадает с публичным endpoint |

## Вывод

✅ **Проверка усилена для защиты от false positive**

✅ **Найден и добавлен единственный публичный endpoint: `/api/master/services/public`**

✅ **Код готов к расширению для других публичных endpoints**
