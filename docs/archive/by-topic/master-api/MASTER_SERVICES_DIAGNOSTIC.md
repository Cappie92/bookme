# Диагностика ДО исправлений: Публичная загрузка услуг мастера

## ШАГ 1. Диагностика текущей реализации

### 1. Backend: endpoint `/api/domain/services`

#### Текущий код endpoint (строки 161-201):

```python
# Важно: этот endpoint должен быть выше /{subdomain}/... чтобы FastAPI правильно обрабатывал статический маршрут
@router.get("/services", response_model=ServicesPublicResponse)
async def get_master_services_by_id(
    master_id: int = Query(..., gt=0, description="ID мастера"),
    db: Session = Depends(get_db)
):
    """
    Получить услуги мастера по master_id (публичный endpoint для бронирования без поддомена)
    """
    # Ищем мастера по ID
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    
    # Загружаем услуги с категориями одним запросом (избегаем N+1)
    # Используем outerjoin для сортировки и загрузки категорий одновременно
    master_services = db.query(MasterService).filter(
        MasterService.master_id == master_id
    ).outerjoin(
        MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
    ).options(
        selectinload(MasterService.category)  # Загружаем категории для доступа после запроса
    ).order_by(
        MasterServiceCategory.name.nullslast(),  # NULL категории последними
        MasterService.name,
        MasterService.id
    ).all()
    
    # Преобразуем в публичный формат
    services = []
    for master_service in master_services:
        services.append(ServicePublicOut(
            id=master_service.id,
            name=master_service.name,
            description=master_service.description,
            duration=master_service.duration,
            price=master_service.price,
            category_name=master_service.category.name if master_service.category else None
        ))
    
    return ServicesPublicResponse(services=services)
```

#### Импорты:

```python
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_
from models import ..., MasterService, MasterServiceCategory
from schemas import ServicePublicOut, ServicesPublicResponse
```

#### Текущий SQLAlchemy query:

```python
master_services = db.query(MasterService).filter(
    MasterService.master_id == master_id
).outerjoin(
    MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
).options(
    selectinload(MasterService.category)
).order_by(
    MasterServiceCategory.name.nullslast(),
    MasterService.name,
    MasterService.id
).all()
```

#### Response model:

```python
@router.get("/services", response_model=ServicesPublicResponse)
```

Где `ServicesPublicResponse`:
```python
class ServicesPublicResponse(BaseModel):
    services: List[ServicePublicOut]

class ServicePublicOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    duration: int
    price: float
    category_name: Optional[str] = None
```

---

### ❌ ПРОБЛЕМЫ BACKEND:

#### 1. Конфликт `outerjoin` + `selectinload`

**Проблема:**
- `outerjoin` создаёт LEFT JOIN в основном запросе для сортировки
- `selectinload` делает **отдельный SELECT** для загрузки категорий
- Это приводит к **двум запросам** вместо одного оптимизированного

**Риски:**
- Неэффективность: два запроса вместо одного
- Потенциальное дублирование данных в кэше SQLAlchemy
- `outerjoin` используется только для сортировки, но данные из него не используются напрямую

**Правильный паттерн:**
- Либо `outerjoin` + `contains_eager` (один запрос, данные из JOIN)
- Либо только `selectinload` + сортировка в Python (два запроса, но явно и безопасно)

#### 2. HTTP статусы

**Текущее поведение:**
- Нет `master_id` → FastAPI вернёт `422 Unprocessable Entity` (валидация Query)
- `master_id <= 0` → FastAPI вернёт `422 Unprocessable Entity` (gt=0)
- Мастер не найден → `404 Not Found` (явно в коде)

**Проблема:** Frontend не обрабатывает `422` явно.

#### 3. Сортировка

**Текущая реализация:**
```python
.order_by(
    MasterServiceCategory.name.nullslast(),  # NULL категории последними
    MasterService.name,
    MasterService.id
)
```

**Проблема:** `nullslast()` применяется к колонке из JOIN, но `selectinload` делает отдельный запрос, поэтому сортировка может работать некорректно или неэффективно.

---

### 2. Frontend: `MasterBookingModule.jsx`

#### Текущая реализация `loadServices()` (строки 126-160):

```javascript
const loadServices = async () => {
  try {
    // Безопасный парсинг subdomain: только если path начинается с "/domain/"
    const path = window.location.pathname
    let subdomain = null
    if (path.startsWith('/domain/')) {
      const parts = path.split('/')
      if (parts.length >= 3 && parts[1] === 'domain' && parts[2]) {
        subdomain = parts[2]
      }
    }
    
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

---

### ❌ ПРОБЛЕМЫ FRONTEND:

#### 1. Обработка статуса 422

**Проблема:**
- При `422` (нет `master_id` или `master_id <= 0`) попадает в `else` ветку
- Пользователь видит: "Ошибка загрузки услуг. Пожалуйста, попробуйте позже."
- Это неинформативно для ошибки валидации

**Нужно:** Объединить обработку `400` и `422` в одно понятное сообщение.

#### 2. Парсинг subdomain

**Текущая логика:**
```javascript
if (path.startsWith('/domain/')) {
  const parts = path.split('/')
  if (parts.length >= 3 && parts[1] === 'domain' && parts[2]) {
    subdomain = parts[2]
  }
}
```

**Проверка случаев:**
- `/domain` → `subdomain = null` ✅ (не начинается с `/domain/`)
- `/domain/` → `subdomain = null` ✅ (parts[2] пустой)
- `/domain/test` → `subdomain = "test"` ✅
- `/other/path` → `subdomain = null` ✅

**Вывод:** Парсинг корректен, но можно упростить.

#### 3. Гарантия `setServices([])`

**Текущее состояние:**
- ✅ В `catch` блоке: `setServices([])` вызывается
- ✅ В `else` ветке (нет subdomain и masterId): `setServices([])` вызывается
- ✅ При успешной загрузке: `setServices(data.services || data)`

**Вывод:** Гарантия есть, но можно улучшить явность.

---

## ШАГ 2. Обоснование исправлений

### Backend: Выбор ORM-паттерна

**Вариант 1: `outerjoin` + `contains_eager`**
- ✅ Один запрос (LEFT JOIN)
- ✅ Сортировка в SQL
- ✅ Эффективно
- ❌ Сложнее для понимания

**Вариант 2: `selectinload` + сортировка в Python**
- ✅ Проще и понятнее
- ✅ Два запроса, но явно
- ✅ Безопасно (нет конфликтов)
- ❌ Менее эффективно (но приемлемо для публичного endpoint)

**Выбор: Вариант 1 (`outerjoin` + `contains_eager`)**
- Публичный endpoint должен быть быстрым
- Один запрос лучше двух
- Сортировка в SQL эффективнее

### Frontend: Обработка ошибок

**Текущая проблема:**
- `422` не обрабатывается явно
- Сообщения не всегда понятны

**Решение:**
- Объединить `400` и `422` → одно сообщение об ошибке валидации
- Явно обработать `404` → "Мастер не найден"
- Гарантировать `setServices([])` при любой ошибке

---

## ШАГ 3. План исправлений

### Backend:
1. Заменить `selectinload` на `contains_eager` в комбинации с `outerjoin`
2. Убедиться, что сортировка работает корректно
3. Добавить комментарий о порядке роутов

### Frontend:
1. Объединить обработку `400` и `422` в одну ветку
2. Улучшить сообщения об ошибках
3. Упростить парсинг subdomain (опционально)
