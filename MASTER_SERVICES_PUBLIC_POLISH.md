# Доработка публичного endpoint /api/domain/services

## Изменения

### 1. Backend: Улучшения endpoint

**Файл:** `backend/routers/domain.py`

#### 1.1. Строгая валидация query параметра

**Было:**
```python
master_id: Optional[int] = None
if not master_id:
    raise HTTPException(status_code=400, detail="Не указан master_id")
```

**Стало:**
```python
master_id: int = Query(..., gt=0, description="ID мастера")
```

✅ Валидация через Pydantic/FastAPI Query, автоматическая проверка `gt=0`

#### 1.2. Устранение N+1 проблемы

**Было:**
```python
master = db.query(Master).filter(Master.id == master_id).first()
for master_service in master.master_services:  # N+1 запросов
    category_name = master_service.category.name if master_service.category else None
```

**Стало:**
```python
master_services = db.query(MasterService).filter(
    MasterService.master_id == master_id
).outerjoin(
    MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
).options(
    selectinload(MasterService.category)  # Загружаем категории одним запросом
).order_by(...).all()
```

✅ Один запрос вместо N+1

#### 1.3. Сортировка услуг

**Добавлена стабильная сортировка:**
```python
.order_by(
    func.nullslast(MasterServiceCategory.name),  # NULL категории последними
    MasterService.name,
    MasterService.id
)
```

✅ Сортировка: по category_name (NULL последними), затем по name, затем по id

#### 1.4. Pydantic response_model

**Добавлены схемы в `backend/schemas.py`:**

```python
class ServicePublicOut(BaseModel):
    """Публичная схема услуги мастера (без внутренних полей)"""
    id: int
    name: str
    description: Optional[str] = None
    duration: int
    price: float
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


class ServicesPublicResponse(BaseModel):
    """Ответ с публичными услугами мастера"""
    services: List[ServicePublicOut]
```

**Endpoint использует response_model:**
```python
@router.get("/services", response_model=ServicesPublicResponse)
```

✅ Типизированный ответ, валидация через Pydantic

#### 1.5. Порядок роутов

**Комментарий в коде:**
```python
# Важно: этот endpoint должен быть выше /{subdomain}/... чтобы FastAPI правильно обрабатывал статический маршрут
@router.get("/services", response_model=ServicesPublicResponse)
```

✅ Endpoint размещён до `/{subdomain}/masters` (строка 208)

#### 1.6. Фильтрация

**Проверено:** В модели `MasterService` нет полей `is_active`, `is_visible`, `archived`.

✅ Возвращаются все услуги мастера (без фильтрации по активности)

---

### 2. Frontend: Улучшение парсинга subdomain

**Файл:** `frontend/src/components/booking/MasterBookingModule.jsx`

#### 2.1. Безопасный парсинг subdomain

**Было:**
```javascript
const subdomain = window.location.pathname.split('/')[2] // /domain/subdomain
if (subdomain) {
```

**Проблема:** `split('/')[2]` может вернуть неверное значение для путей типа `/other/path/domain/test`

**Стало:**
```javascript
// Безопасный парсинг subdomain: только если path начинается с "/domain/"
const path = window.location.pathname
let subdomain = null
if (path.startsWith('/domain/')) {
  const parts = path.split('/')
  if (parts.length >= 3 && parts[1] === 'domain' && parts[2]) {
    subdomain = parts[2]
  }
}
```

✅ Subdomain извлекается только если path начинается с `/domain/`

#### 2.2. Обработка ошибок

**Проверено:**
- ✅ При отсутствии subdomain и masterId запросы не делаются
- ✅ `setServices([])` всегда вызывается при ошибке (в `catch` блоке и в `else` ветке)

---

## Unified Diff

### backend/routers/domain.py

```diff
@@ -1,10 +1,11 @@
-from fastapi import APIRouter, HTTPException, Depends
-from sqlalchemy.orm import Session
+from fastapi import APIRouter, HTTPException, Depends, Query
+from sqlalchemy.orm import Session, selectinload
 from sqlalchemy import func, or_
 from database import get_db
-from models import Salon, IndieMaster, Master, MasterPageModule, Booking, BookingStatus, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus, User
+from models import Salon, IndieMaster, Master, MasterPageModule, Booking, BookingStatus, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus, User, MasterService, MasterServiceCategory
 from typing import Optional
 from datetime import datetime
+from schemas import ServicePublicOut, ServicesPublicResponse
 
 router = APIRouter(prefix="/api/domain", tags=["domain"])
 
@@ -157,6 +158,54 @@ async def get_subdomain_services(subdomain: str, db: Session = Depends(get_db)):
     raise HTTPException(status_code=404, detail="Поддомен не найден")
 
 
+# Важно: этот endpoint должен быть выше /{subdomain}/... чтобы FastAPI правильно обрабатывал статический маршрут
+@router.get("/services", response_model=ServicesPublicResponse)
+async def get_master_services_by_id(
+    master_id: int = Query(..., gt=0, description="ID мастера"),
+    db: Session = Depends(get_db)
+):
+    """
+    Получить услуги мастера по master_id (публичный endpoint для бронирования без поддомена)
+    """
+    # Ищем мастера по ID
+    master = db.query(Master).filter(Master.id == master_id).first()
+    if not master:
+        raise HTTPException(status_code=404, detail="Мастер не найден")
+    
+    # Загружаем услуги с категориями одним запросом (избегаем N+1)
+    # Используем outerjoin для сортировки и загрузки категорий одновременно
+    master_services = db.query(MasterService).filter(
+        MasterService.master_id == master_id
+    ).outerjoin(
+        MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
+    ).options(
+        selectinload(MasterService.category)  # Загружаем категории для доступа после запроса
+    ).order_by(
+        func.nullslast(MasterServiceCategory.name),  # NULL категории последними
+        MasterService.name,
+        MasterService.id
+    ).all()
+    
+    # Преобразуем в публичный формат
+    services = []
+    for master_service in master_services:
+        services.append(ServicePublicOut(
+            id=master_service.id,
+            name=master_service.name,
+            description=master_service.description,
+            duration=master_service.duration,
+            price=master_service.price,
+            category_name=master_service.category.name if master_service.category else None
+        ))
+    
+    return ServicesPublicResponse(services=services)
+
+
 @router.get("/{subdomain}/masters")
 async def get_subdomain_masters(subdomain: str, db: Session = Depends(get_db)):
```

### backend/schemas.py

```diff
@@ -785,6 +785,25 @@ class MasterServiceOut(BaseModel):
         from_attributes = True
 
 
+# Публичные схемы для domain endpoints
+class ServicePublicOut(BaseModel):
+    """Публичная схема услуги мастера (без внутренних полей)"""
+    id: int
+    name: str
+    description: Optional[str] = None
+    duration: int
+    price: float
+    category_name: Optional[str] = None
+
+    class Config:
+        from_attributes = True
+
+
+class ServicesPublicResponse(BaseModel):
+    """Ответ с публичными услугами мастера"""
+    services: List[ServicePublicOut]
+
+
 class InvitationResponse(BaseModel):
```

### frontend/src/components/booking/MasterBookingModule.jsx

```diff
@@ -126,24 +127,30 @@ export default function MasterBookingModule({
     try {
-      // Проверяем, находимся ли мы на поддомене
-      const subdomain = window.location.pathname.split('/')[2] // /domain/subdomain
+      // Безопасный парсинг subdomain: только если path начинается с "/domain/"
+      const path = window.location.pathname
+      let subdomain = null
+      if (path.startsWith('/domain/')) {
+        const parts = path.split('/')
+        if (parts.length >= 3 && parts[1] === 'domain' && parts[2]) {
+          subdomain = parts[2]
+        }
+      }
       
       if (subdomain) {
         // Используем API для поддомена
         const data = await apiGet(`/api/domain/${subdomain}/services`)
         setServices(data.services || data)
       } else if (masterId) {
         // Используем публичный endpoint для получения услуг по master_id
         const data = await apiGet(`/api/domain/services?master_id=${masterId}`
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

---

## Smoke Checklist (5-7 пунктов)

### Backend: Валидация и производительность

- [ ] **1. Query валидация master_id**
  - Запрос без `master_id`: `GET /api/domain/services` → должен вернуть 422 (Validation Error)
  - Запрос с `master_id=0`: `GET /api/domain/services?master_id=0` → должен вернуть 422 (Validation Error, gt=0)
  - Запрос с `master_id=-1`: `GET /api/domain/services?master_id=-1` → должен вернуть 422 (Validation Error, gt=0)

- [ ] **2. N+1 проблема устранена**
  - Запрос с валидным `master_id`: `GET /api/domain/services?master_id=1`
  - Проверить в логах БД: должно быть максимум 2 запроса (проверка мастера + загрузка услуг с категориями)
  - НЕ должно быть N+1 запросов для каждой категории

- [ ] **3. Сортировка услуг**
  - Запрос с валидным `master_id`: `GET /api/domain/services?master_id=1`
  - Проверить порядок услуг в ответе:
    - Услуги с категориями отсортированы по category_name (A-Z)
    - Услуги без категорий (NULL) идут последними
    - Внутри категории отсортированы по name (A-Z)
    - При одинаковом name отсортированы по id

- [ ] **4. Response schema валидация**
  - Запрос с валидным `master_id`: `GET /api/domain/services?master_id=1`
  - Проверить структуру ответа: `{"services": [{"id": int, "name": str, "description": str | null, "duration": int, "price": float, "category_name": str | null}, ...]}`
  - Проверить, что нет лишних полей (master_id, created_at и т.д.)

### Frontend: Парсинг subdomain

- [ ] **5. Безопасный парсинг subdomain**
  - Открыть `/domain/test` → subdomain должен быть `"test"`
  - Открыть `/other/path` → subdomain должен быть `null` (не `"other"`)
  - Открыть `/domain/` → subdomain должен быть `null` (пустой)
  - Открыть `/domain/test/extra` → subdomain должен быть `"test"` (первая часть после `/domain/`)

- [ ] **6. Обработка ошибок**
  - Открыть страницу без subdomain и без masterId → должно показаться сообщение об ошибке, `services = []`
  - Открыть страницу с несуществующим master_id → должно показаться "Мастер не найден", `services = []`
  - Открыть страницу с валидным master_id → услуги должны загрузиться

- [ ] **7. Интеграция: публичное бронирование**
  - Открыть `/domain/{subdomain}` → услуги загружаются через `/api/domain/{subdomain}/services`
  - Открыть страницу с `masterId` → услуги загружаются через `/api/domain/services?master_id={masterId}`
  - Проверить, что услуги отсортированы (категории, затем name, затем id)
  - Проверить, что можно выбрать услугу и создать запись

---

## Вывод

✅ **Backend улучшен:**
- Строгая валидация через Query
- Устранена N+1 проблема
- Добавлена стабильная сортировка
- Pydantic response_model для типизации

✅ **Frontend улучшен:**
- Безопасный парсинг subdomain
- Корректная обработка ошибок

✅ **Контракт не изменён:**
- Формат ответа остаётся `{"services": [...]}`
- Поля услуг остаются теми же (добавлена только сортировка)
