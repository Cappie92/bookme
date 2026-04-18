# Финальная верификация: Публичная загрузка услуг мастера

## 1. Backend: Полный код endpoint

### Файл: `backend/routers/domain.py`

**Полный код нового endpoint (строки 160-188):**

```python
@router.get("/services")
async def get_master_services_by_id(
    master_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Получить услуги мастера по master_id (публичный endpoint для бронирования без поддомена)
    """
    if not master_id:
        raise HTTPException(status_code=400, detail="Не указан master_id")
    
    # Ищем мастера по ID
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    
    services = []
    # Используем master_services (собственные услуги мастера)
    for master_service in master.master_services:
        services.append({
            "id": master_service.id,
            "name": master_service.name,
            "description": master_service.description,
            "duration": master_service.duration,
            "price": master_service.price,
            "category_name": master_service.category.name if master_service.category else None
        })
    
    return {"services": services}
```

### Детали реализации:

**Path и сигнатура:**
- Path: `/api/domain/services` (router prefix: `/api/domain`)
- Query параметр: `master_id: Optional[int] = None`
- Зависимости: `db: Session = Depends(get_db)` (без авторизации)

**Запрос к БД:**
- `db.query(Master).filter(Master.id == master_id).first()` — поиск мастера по ID
- `master.master_services` — доступ к услугам через relationship (SQLAlchemy)
- Используются **собственные услуги мастера** (`master_services`), а не услуги салона (`services`)

**Фильтры и сортировка:**
- ❌ Нет фильтрации по активным услугам (все услуги мастера)
- ❌ Нет сортировки (порядок из БД)
- ✅ Возвращаются все поля: `id`, `name`, `description`, `duration`, `price`, `category_name`

**Статусы ошибок:**
- `400` — если `master_id` не передан (`if not master_id`)
- `404` — если мастер не найден (`if not master`)
- `200` — успешный ответ с `{"services": [...]}`

**Pydantic response schema:**
- ❌ Нет явной response_model (возвращается dict)
- Формат ответа: `{"services": [{"id": int, "name": str, "description": str, "duration": int, "price": float, "category_name": str | None}, ...]}`

### Порядок роутов:

**Важно:** Endpoint `/services` размещён **ДО** `/{subdomain}/masters` (строка 191), чтобы FastAPI правильно обрабатывал маршруты.

**Причина:** FastAPI обрабатывает маршруты сверху вниз. Если `/{subdomain}/masters` будет раньше, то запрос `/services` может быть интерпретирован как `/{subdomain}/masters` с `subdomain="services"`, что приведёт к ошибке.

**Текущий порядок:**
1. `/services` (строка 160) — статический маршрут
2. `/{subdomain}/masters` (строка 191) — параметризованный маршрут

### Auth guard проверка:

✅ **Endpoint НЕ попадает под auth guard:**
- Path: `/api/domain/services` — не начинается с `/api/master/`
- Path: `/api/domain/services` — не начинается с `/api/loyalty/`
- Path: `/api/domain/services` — не начинается с `/api/master/loyalty/`

**Вывод:** Endpoint публичный, не требует авторизации.

---

## 2. Frontend: Точный фрагмент кода

### Файл: `frontend/src/components/booking/MasterBookingModule.jsx`

**Полный код функции `loadServices()` (строки 126-155):**

```javascript
const loadServices = async () => {
  try {
    // Проверяем, находимся ли мы на поддомене
    const subdomain = window.location.pathname.split('/')[2] // /domain/subdomain
    
    if (subdomain) {
      // Используем API для поддомена
      const data = await apiGet(`/api/domain/${subdomain}/services`)
      setServices(data.services || data)
    } else if (masterId) {
      // Используем публичный endpoint для получения услуг по master_id
      const data = await apiGet(`/api/domain/services?master_id=${masterId}`)
      setServices(data.services || data)
    } else {
      // Нет ни subdomain, ни masterId - показываем ошибку
      setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
      setServices([])
    }
  } catch (error) {
    console.error('Ошибка загрузки услуг:', error)
    if (error.response?.status === 404) {
      setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
    } else if (error.response?.status === 400) {
      setError('Не указан ID мастера. Для бронирования необходимо открыть страницу по доменному адресу мастера.')
    } else {
      setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
    }
    setServices([])
  }
}
```

### Выбор endpoint:

**Ветка 1: С subdomain**
```javascript
if (subdomain) {
  const data = await apiGet(`/api/domain/${subdomain}/services`)
  setServices(data.services || data)
}
```

**Ветка 2: Без subdomain, но с masterId**
```javascript
else if (masterId) {
  const data = await apiGet(`/api/domain/services?master_id=${masterId}`)
  setServices(data.services || data)
}
```

**Ветка 3: Нет ни subdomain, ни masterId**
```javascript
else {
  setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
  setServices([])
}
```

### Обработка ошибок:

**a) Нет masterId и нет subdomain:**
```javascript
setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
```

**b) 404 — Мастер не найден:**
```javascript
if (error.response?.status === 404) {
  setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
}
```

**c) 400 — Нет master_id:**
```javascript
else if (error.response?.status === 400) {
  setError('Не указан ID мастера. Для бронирования необходимо открыть страницу по доменному адресу мастера.')
}
```

**d) Прочие ошибки:**
```javascript
else {
  setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
}
```

### Проверка старых ссылок:

✅ **Grep проверка:** `/api/master/services/public` больше не используется в коде:

```bash
$ grep -r "/api/master/services/public" frontend/src backend
```

**Результат:** Найдено только в документации (`.md` файлах), но **НЕ в коде** (`frontend/src` и `backend`).

---

## 3. api.js: Auth guard конфигурация

### Файл: `frontend/src/utils/api.js`

**AUTH_REQUIRED_PREFIXES (строки 4-9):**

```javascript
// Префиксы эндпоинтов, которые требуют авторизации
const AUTH_REQUIRED_PREFIXES = [
  '/api/master/',
  '/api/loyalty/',
  '/api/master/loyalty/'
]
```

**PUBLIC_ENDPOINTS (строки 11-14):**

```javascript
// Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
const PUBLIC_ENDPOINTS = [
  // Добавьте сюда другие публичные endpoints, если появятся
]
```

✅ **PUBLIC_ENDPOINTS пуст** — несуществующий `/api/master/services/public` удалён.

**requiresAuth() реализация (строки 16-32):**

```javascript
// Проверка, требует ли эндпоинт авторизации
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

**Усиленная проверка:**
- `endpoint === publicEndpoint` — точное совпадение
- `endpoint.startsWith(publicEndpoint + '?')` — с query параметрами
- `endpoint.startsWith(publicEndpoint + '/')` — с подпутём

**Защита от false positive:**
- `/api/master/publicity` не будет считаться публичным, если `/api/master/public` в списке (но сейчас список пуст)

---

## 4. Мини-тесты

### Тест 1: Без master_id → 400

```bash
curl -X GET "http://localhost:8000/api/domain/services" \
  -H "Content-Type: application/json"
```

**Ожидаемый результат:**
```json
{
  "detail": "Не указан master_id"
}
```
**Статус:** `400 Bad Request`

### Тест 2: master_id не существует → 404

```bash
curl -X GET "http://localhost:8000/api/domain/services?master_id=99999" \
  -H "Content-Type: application/json"
```

**Ожидаемый результат:**
```json
{
  "detail": "Мастер не найден"
}
```
**Статус:** `404 Not Found`

### Тест 3: Валидный master_id → 200

```bash
curl -X GET "http://localhost:8000/api/domain/services?master_id=1" \
  -H "Content-Type: application/json"
```

**Ожидаемый результат:**
```json
{
  "services": [
    {
      "id": 1,
      "name": "Стрижка",
      "description": "Классическая стрижка",
      "duration": 30,
      "price": 1000.0,
      "category_name": "Парикмахерские услуги"
    },
    ...
  ]
}
```
**Статус:** `200 OK`

### Тест 4: Проверка auth guard

```bash
# Без токена — должен работать (публичный endpoint)
curl -X GET "http://localhost:8000/api/domain/services?master_id=1" \
  -H "Content-Type: application/json"
```

**Ожидаемый результат:** `200 OK` (без требования авторизации)

---

## 5. Unified Diff

### backend/routers/domain.py

```diff
@@ -157,6 +157,37 @@ async def get_subdomain_services(subdomain: str, db: Session = Depends(get_db)):
     raise HTTPException(status_code=404, detail="Поддомен не найден")
 
 
+@router.get("/services")
+async def get_master_services_by_id(
+    master_id: Optional[int] = None,
+    db: Session = Depends(get_db)
+):
+    """
+    Получить услуги мастера по master_id (публичный endpoint для бронирования без поддомена)
+    """
+    if not master_id:
+        raise HTTPException(status_code=400, detail="Не указан master_id")
+    
+    # Ищем мастера по ID
+    master = db.query(Master).filter(Master.id == master_id).first()
+    if not master:
+        raise HTTPException(status_code=404, detail="Мастер не найден")
+    
+    services = []
+    # Используем master_services (собственные услуги мастера)
+    for master_service in master.master_services:
+        services.append({
+            "id": master_service.id,
+            "name": master_service.name,
+            "description": master_service.description,
+            "duration": master_service.duration,
+            "price": master_service.price,
+            "category_name": master_service.category.name if master_service.category else None
+        })
+    
+    return {"services": services}
+
+
 @router.get("/{subdomain}/masters")
 async def get_subdomain_masters(subdomain: str, db: Session = Depends(get_db)):
```

### frontend/src/components/booking/MasterBookingModule.jsx

```diff
@@ -126,24 +127,30 @@ export default function MasterBookingModule({
     try {
       // Проверяем, находимся ли мы на поддомене
       const subdomain = window.location.pathname.split('/')[2] // /domain/subdomain
-      let response
       
       if (subdomain) {
         // Используем API для поддомена
-        response = await fetch(`/api/domain/${subdomain}/services`)
+        const data = await apiGet(`/api/domain/${subdomain}/services`)
+        setServices(data.services || data)
+      } else if (masterId) {
+        // Используем публичный endpoint для получения услуг по master_id
+        const data = await apiGet(`/api/domain/services?master_id=${masterId}`)
+        setServices(data.services || data)
       } else {
-        // Используем обычный API
-        response = await fetch(`/api/master/services/public?master_id=${masterId}`)
-      }
-      
-      if (response.ok) {
-        const data = await response.json()
+        // Нет ни subdomain, ни masterId - показываем ошибку
+        setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
         setServices(data.services || data)
       } else {
-        console.error('Ошибка загрузки услуг:', response.status)
+        setServices([])
       }
     } catch (error) {
       console.error('Ошибка загрузки услуг:', error)
+      if (error.response?.status === 404) {
+        setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
+      } else if (error.response?.status === 400) {
+        setError('Не указан ID мастера. Для бронирования необходимо открыть страницу по доменному адресу мастера.')
+      } else {
+        setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
+      }
+      setServices([])
     }
   }
```

### frontend/src/utils/api.js

```diff
@@ -1,6 +1,36 @@
 // Базовый URL для API
 const API_BASE_URL = '' // Используем относительные пути для прокси Vite
 
+// Префиксы эндпоинтов, которые требуют авторизации
+const AUTH_REQUIRED_PREFIXES = [
+  '/api/master/',
+  '/api/loyalty/',
+  '/api/master/loyalty/'
+]
+
+// Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
+const PUBLIC_ENDPOINTS = [
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
+
 // Функция для создания полного URL
```

---

## 6. Smoke Checklist (10 пунктов)

### Публичное бронирование с поддоменом (3 пункта)

- [ ] **1. Открыть страницу `/domain/{subdomain}`** (где `{subdomain}` — валидный поддомен мастера)
  - Проверить, что услуги загружаются через `/api/domain/{subdomain}/services`
  - Проверить Network tab: запрос проходит БЕЗ Authorization header
  - Проверить, что услуги отображаются в выпадающем списке

- [ ] **2. Выбрать услугу, дату и время**
  - Проверить, что календарь загружается
  - Проверить, что доступные слоты отображаются
  - Проверить, что можно выбрать время

- [ ] **3. Создать запись**
  - Проверить, что запись создаётся успешно
  - Проверить, что отображается сообщение об успехе

### Публичное бронирование без поддомена (по master_id) (3 пункта)

- [ ] **4. Открыть страницу с `MasterBookingModule` и валидным `masterId`**
  - Проверить, что услуги загружаются через `/api/domain/services?master_id={masterId}`
  - Проверить Network tab: запрос проходит БЕЗ Authorization header
  - Проверить, что услуги отображаются в выпадающем списке

- [ ] **5. Выбрать услугу, дату и время**
  - Проверить, что календарь загружается
  - Проверить, что доступные слоты отображаются
  - Проверить, что можно выбрать время

- [ ] **6. Создать запись**
  - Проверить, что запись создаётся успешно
  - Проверить, что отображается сообщение об успехе

### Обработка ошибок (2 пункта)

- [ ] **7. Открыть страницу без `masterId` и без поддомена**
  - Проверить, что отображается сообщение: "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера"
  - Проверить, что список услуг пуст

- [ ] **8. Открыть страницу с несуществующим `master_id`**
  - Проверить, что отображается сообщение: "Мастер не найден. Пожалуйста, проверьте правильность ссылки."
  - Проверить Network tab: запрос возвращает 404

### Auth-guard проверка (2 пункта)

- [ ] **9. Проверить публичные endpoints без токена**
  - `/api/domain/services?master_id=1` → должен работать (200 OK)
  - `/api/domain/{subdomain}/services` → должен работать (200 OK)
  - Проверить Network tab: запросы проходят БЕЗ Authorization header

- [ ] **10. Проверить защищённые endpoints без токена**
  - `/api/master/services` → должен вернуть 401 (или быть заблокирован на клиенте)
  - `/api/master/loyalty/...` → должен вернуть 401 (или быть заблокирован на клиенте)
  - Проверить, что auth-guard корректно блокирует запросы

---

## Вывод

✅ **Backend endpoint добавлен:** `/api/domain/services?master_id=...` для публичной загрузки услуг

✅ **Frontend обновлён:** Использует новый endpoint вместо несуществующего `/api/master/services/public`

✅ **PUBLIC_ENDPOINTS очищен:** Убран несуществующий endpoint

✅ **Обработка ошибок улучшена:** Понятные сообщения для пользователя

✅ **Auth-guard корректен:** Endpoint не попадает под защищённые префиксы, усиленная проверка остаётся для защиты от false positive

✅ **Старые ссылки удалены:** `/api/master/services/public` больше не используется в коде
