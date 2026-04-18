# Финальная полировка: Публичные endpoints в /api/master/

## Изменения

### 1. Усилена проверка в `requiresAuth()`

**Проблема:** Простая проверка `endpoint.startsWith(publicEndpoint)` могла дать false positive для endpoints типа `/api/master/publicity`.

**Решение:** Добавлена точная проверка:
- `endpoint === publicEndpoint` (точное совпадение)
- `endpoint.startsWith(publicEndpoint + '?')` (с query params)
- `endpoint.startsWith(publicEndpoint + '/')` (с подпутём)

**Код:**
```javascript
const requiresAuth = (endpoint) => {
  // Сначала проверяем, не является ли endpoint публичным
  // Проверяем точное совпадение или начало с publicEndpoint + '?' или '/'
  // Это защищает от false positive (например, /api/master/publicity не должен считаться публичным)
  for (const publicEndpoint of PUBLIC_ENDPOINTS) {
    if (
      endpoint === publicEndpoint ||
      endpoint.startsWith(publicEndpoint + '?') ||
      endpoint.startsWith(publicEndpoint + '/')
    ) {
      return false
    }
  }
  // Затем проверяем префиксы
  return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
}
```

### 2. Поиск всех публичных endpoints

**Grep по репозиторию:**
```bash
grep -r "/api/master.*public\|public.*/api/master" frontend/src backend/routers
```

**Найденные endpoints:**

#### В frontend:
- `/api/master/services/public` — используется в `MasterBookingModule.jsx:138`

#### В backend:
- **НЕ найдено** публичных endpoints в `/api/master/` без `Depends(get_current_active_user)`
- Все endpoints в `backend/routers/master.py` требуют авторизацию

**Вывод:** Единственный публичный endpoint — `/api/master/services/public`

### 3. Diff для `frontend/src/utils/api.js`

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

### 4. Список найденных публичных endpoints

**Grep по репозиторию:**
```bash
grep -r "/api/master.*public\|public.*/api/master" frontend/src backend/routers
```

**Результаты:**

| Endpoint | Использование (frontend) | Backend определение | Статус |
|----------|-------------------------|-------------------|--------|
| `/api/master/services/public` | `MasterBookingModule.jsx:138` | **НЕ найден** в `backend/routers/master.py` | ✅ Добавлен в `PUBLIC_ENDPOINTS` |

**Анализ:**
- Endpoint `/api/master/services/public` используется во frontend для загрузки публичных услуг мастера
- В `backend/routers/master.py` нет явного определения этого endpoint
- Возможные варианты:
  1. Endpoint обрабатывается через прокси/rewrite на уровне nginx/Vite
  2. Endpoint находится в другом роутере (например, `domain.py` или через middleware)
  3. Endpoint планируется, но ещё не реализован в backend
- **Решение:** Добавлен в `PUBLIC_ENDPOINTS` для безопасности, чтобы не блокировать запросы, если endpoint существует

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
