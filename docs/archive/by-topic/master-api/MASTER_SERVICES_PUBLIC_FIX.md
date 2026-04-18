# Исправление публичной загрузки услуг мастера

## Проблема

Frontend использовал несуществующий endpoint `/api/master/services/public?master_id=...` для публичной страницы бронирования без поддомена. Этот endpoint был добавлен в `PUBLIC_ENDPOINTS` как временное решение, но не существует в backend.

## Решение

### 1. Backend: Добавлен публичный endpoint

**Файл:** `backend/routers/domain.py`

Добавлен новый endpoint `/api/domain/services?master_id=...` для получения услуг мастера по ID без необходимости поддомена:

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

**Важно:** Endpoint размещён **до** `/{subdomain}/masters`, чтобы FastAPI правильно обрабатывал маршруты (более специфичные маршруты должны быть раньше параметризованных).

### 2. Frontend: Обновлена логика загрузки услуг

**Файл:** `frontend/src/components/booking/MasterBookingModule.jsx`

**Изменения:**
- Убрана зависимость от несуществующего `/api/master/services/public`
- Добавлена поддержка нового endpoint `/api/domain/services?master_id=...`
- Улучшена обработка ошибок с понятными сообщениями для пользователя
- Добавлена проверка наличия `masterId` перед загрузкой

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

### 3. Убран несуществующий endpoint из PUBLIC_ENDPOINTS

**Файл:** `frontend/src/utils/api.js`

Удалён `/api/master/services/public` из `PUBLIC_ENDPOINTS`, так как endpoint не существует в backend:

```javascript
// Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
const PUBLIC_ENDPOINTS = [
  // Добавьте сюда другие публичные endpoints, если появятся
]
```

**Примечание:** Усиленная проверка `requiresAuth()` (с проверкой `endpoint === publicEndpoint || startsWith(publicEndpoint + '?') || startsWith(publicEndpoint + '/')`) остаётся для защиты от false positive.

## Unified Diff

```diff
--- a/backend/routers/domain.py
+++ b/backend/routers/domain.py
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
 
--- a/frontend/src/components/booking/MasterBookingModule.jsx
+++ b/frontend/src/components/booking/MasterBookingModule.jsx
@@ -126,24 +127,30 @@ export default function MasterBookingModule({
     try {
       // Проверяем, находимся ли мы на поддомене
       const subdomain = window.location.pathname.split('/')[2] // /domain/subdomain
-      let response
       
       if (subdomain) {
         // Используем API для поддомена
-        response = await fetch(`/api/domain/${subdomain}/services`)
-      } else {
-        // Используем обычный API
-        response = await fetch(`/api/master/services/public?master_id=${masterId}`)
-      }
-      
-      if (response.ok) {
-        const data = await response.json()
+        const data = await apiGet(`/api/domain/${subdomain}/services`)
+        setServices(data.services || data)
+      } else if (masterId) {
+        // Используем публичный endpoint для получения услуг по master_id
+        const data = await apiGet(`/api/domain/services?master_id=${masterId}`)
         setServices(data.services || data)
       } else {
-        console.error('Ошибка загрузки услуг:', response.status)
+        // Нет ни subdomain, ни masterId - показываем ошибку
+        setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
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
 
--- a/frontend/src/utils/api.js
+++ b/frontend/src/utils/api.js
@@ -11,14 +11,20 @@
 ]
 
 // Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
 const PUBLIC_ENDPOINTS = [
-  '/api/master/services/public', // Используется в MasterBookingModule для публичной страницы бронирования (endpoint может быть реализован в backend позже)
+  // Добавьте сюда другие публичные endpoints, если появятся
 ]
```

## Smoke Checklist

### Публичное бронирование с поддоменом
- [ ] Открыть страницу `/domain/{subdomain}` (где `{subdomain}` — валидный поддомен мастера)
- [ ] Проверить, что услуги загружаются через `/api/domain/{subdomain}/services`
- [ ] Проверить, что услуги отображаются в выпадающем списке
- [ ] Проверить, что можно выбрать услугу, дату и время
- [ ] Проверить, что запись создаётся успешно

### Публичное бронирование без поддомена (по master_id)
- [ ] Открыть страницу с `MasterBookingModule` и передать валидный `masterId`
- [ ] Проверить, что услуги загружаются через `/api/domain/services?master_id={masterId}`
- [ ] Проверить, что услуги отображаются в выпадающем списке
- [ ] Проверить, что можно выбрать услугу, дату и время
- [ ] Проверить, что запись создаётся успешно

### Обработка ошибок
- [ ] Открыть страницу без `masterId` и без поддомена
- [ ] Проверить, что отображается понятное сообщение об ошибке
- [ ] Открыть страницу с несуществующим `master_id`
- [ ] Проверить, что отображается сообщение "Мастер не найден"
- [ ] Открыть страницу с `master_id=null` или без параметра
- [ ] Проверить, что отображается сообщение о необходимости указать ID мастера

### Auth-guard проверка
- [ ] Проверить, что `/api/domain/services?master_id=...` работает без токена (публичный endpoint)
- [ ] Проверить, что `/api/domain/{subdomain}/services` работает без токена (публичный endpoint)
- [ ] Проверить, что `/api/master/services` требует токен (защищённый endpoint)
- [ ] Проверить, что запросы к `/api/master/*` без токена возвращают 401

## Вывод

✅ **Backend endpoint добавлен:** `/api/domain/services?master_id=...` для публичной загрузки услуг

✅ **Frontend обновлён:** Использует новый endpoint вместо несуществующего `/api/master/services/public`

✅ **PUBLIC_ENDPOINTS очищен:** Убран несуществующий endpoint

✅ **Обработка ошибок улучшена:** Понятные сообщения для пользователя

✅ **Auth-guard корректен:** Усиленная проверка остаётся для защиты от false positive
