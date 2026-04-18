# Архитектурная диагностика: Публичная загрузка услуг мастера

## ШАГ 1. ДИАГНОСТИКА (ДО ЛЮБЫХ ИЗМЕНЕНИЙ)

### 1. Backend — `/api/domain/services`

#### 1.1. Полный текущий код endpoint

**Файл:** `backend/routers/domain.py` (строки 161-202)

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
    # Используем outerjoin + contains_eager для загрузки категорий из JOIN
    # Это эффективнее, чем selectinload (один запрос вместо двух)
    master_services = db.query(MasterService).filter(
        MasterService.master_id == master_id
    ).outerjoin(
        MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
    ).options(
        contains_eager(MasterService.category)  # Используем данные из JOIN, не делаем отдельный запрос
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

#### 1.2. SQLAlchemy query анализ

**Импорты:**
```python
from sqlalchemy.orm import Session, contains_eager
from sqlalchemy import func, or_
```

**Query структура:**
```python
db.query(MasterService)                    # Основная таблица
    .filter(MasterService.master_id == master_id)  # Фильтр
    .outerjoin(                            # LEFT JOIN
        MasterServiceCategory, 
        MasterService.category_id == MasterServiceCategory.id
    )
    .options(                              # Loader option
        contains_eager(MasterService.category)
    )
    .order_by(                             # Сортировка
        MasterServiceCategory.name.nullslast(),
        MasterService.name,
        MasterService.id
    )
    .all()
```

**Join'ы:**
- ✅ `outerjoin(MasterServiceCategory, ...)` — LEFT JOIN для сортировки и загрузки категорий

**Loader options:**
- ✅ `contains_eager(MasterService.category)` — использует данные из JOIN

#### 1.3. Как сейчас работает

**Загрузка category:**
- Через `outerjoin` + `contains_eager`
- Данные загружаются из LEFT JOIN в основном запросе
- Нет отдельного SELECT для категорий

**Сортировка:**
- Выполняется в SQL через `ORDER BY`
- `MasterServiceCategory.name.nullslast()` — NULL категории последними
- Затем `MasterService.name` ASC
- Затем `MasterService.id` ASC

**Обработка NULL:**
- `outerjoin` гарантирует, что услуги без категории не теряются
- `nullslast()` отправляет NULL категории в конец
- В коде: `master_service.category.name if master_service.category else None`

#### 1.4. Response model

**Endpoint:**
```python
@router.get("/services", response_model=ServicesPublicResponse)
```

**Схемы:**
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

### Ответы на вопросы (ДА / НЕТ + пояснение)

#### Q1: Используется ли одновременно `outerjoin()` и `selectinload()`?

**НЕТ**

**Пояснение:**
- Используется `outerjoin()` + `contains_eager()`
- `selectinload()` НЕ используется
- `contains_eager()` указывает SQLAlchemy использовать данные из JOIN, а не делать отдельный SELECT

#### Q2: Может ли это привести к лишним запросам?

**НЕТ**

**Пояснение:**
- `outerjoin` + `contains_eager` = один SQL-запрос (LEFT JOIN)
- Нет отдельного SELECT для категорий
- Эффективно: все данные в одном запросе

#### Q3: Может ли это привести к конфликту loader strategy?

**НЕТ**

**Пояснение:**
- `contains_eager` специально предназначен для использования с `outerjoin`/`join`
- Это стандартный и безопасный паттерн SQLAlchemy
- Нет конфликта: `contains_eager` использует данные из JOIN

#### Q4: Где именно выполняется сортировка (SQL или Python)?

**SQL**

**Пояснение:**
- Сортировка выполняется в SQL через `ORDER BY`
- `MasterServiceCategory.name.nullslast()` — SQL функция
- Результат уже отсортирован при возврате из `.all()`

#### Q5: Какие реальные HTTP статусы возвращаются?

**Нет master_id:**
- **422 Unprocessable Entity** (FastAPI валидация `Query(..., gt=0)`)

**master_id <= 0:**
- **422 Unprocessable Entity** (FastAPI валидация `gt=0`)

**Мастер не найден:**
- **404 Not Found** (явно в коде: `raise HTTPException(status_code=404, ...)`)

---

### 2. Frontend — `MasterBookingModule.jsx`

#### 2.1. Полная текущая реализация `loadServices()`

**Файл:** `frontend/src/components/booking/MasterBookingModule.jsx` (строки 126-161)

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
    const status = error.response?.status
    
    if (status === 404) {
      setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
    } else if (status === 400 || status === 422) {
      // 400: некорректный запрос, 422: ошибка валидации (нет master_id или master_id <= 0)
      setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера.')
    } else {
      setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
    }
    setServices([])
  }
}
```

#### 2.2. Все ветки обработки ошибок

**Ветка 1: status === 404**
```javascript
setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
setServices([])
```

**Ветка 2: status === 400 || status === 422**
```javascript
setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера.')
setServices([])
```

**Ветка 3: другие ошибки**
```javascript
setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
setServices([])
```

**Ветка 4: нет subdomain и нет masterId (до try/catch)**
```javascript
setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
setServices([])
```

#### 2.3. Где и когда вызывается `setServices([])`

1. ✅ В `catch` блоке при любой ошибке (строка 160)
2. ✅ В `else` ветке, когда нет subdomain и нет masterId (строка 149)
3. ✅ При успешной загрузке: `setServices(data.services || data)` (строки 141, 145)

---

### Ответы на вопросы (ЯВНО)

#### Q1: Что происходит при status 422?

**Ответ:**
- Попадает в ветку `status === 400 || status === 422`
- Показывается сообщение: "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера."
- Вызывается `setServices([])`

#### Q2: Отличается ли UX для 400 и 422?

**НЕТ**

**Пояснение:**
- Оба статуса обрабатываются в одной ветке
- Одно и то же сообщение для пользователя
- Одинаковый UX

#### Q3: Есть ли сценарий, где services остаётся "грязным" после ошибки?

**НЕТ**

**Пояснение:**
- `setServices([])` вызывается в `catch` блоке при любой ошибке
- `setServices([])` вызывается в `else` ветке (нет subdomain и masterId)
- Нет сценария, где `services` остаётся "грязным"

#### Q4: Как парсится subdomain для путей?

**`/domain`:**
- `path.startsWith('/domain/')` → `false`
- `subdomain = null` ✅

**`/domain/`:**
- `path.startsWith('/domain/')` → `true`
- `parts = ['', 'domain', '']`
- `parts.length >= 3` → `true`
- `parts[1] === 'domain'` → `true`
- `parts[2]` → `''` (пустая строка, falsy)
- `subdomain = null` ✅

**`/domain/test`:**
- `path.startsWith('/domain/')` → `true`
- `parts = ['', 'domain', 'test']`
- `parts.length >= 3` → `true`
- `parts[1] === 'domain'` → `true`
- `parts[2]` → `'test'` (truthy)
- `subdomain = 'test'` ✅

**`/other/path`:**
- `path.startsWith('/domain/')` → `false`
- `subdomain = null` ✅

---

## ШАГ 2. СПИСОК ПРОБЛЕМ (БЕЗ ИСПРАВЛЕНИЙ)

### ORM-риски

- ✅ **НЕТ проблем**: Используется корректный паттерн `outerjoin` + `contains_eager`
- ✅ **НЕТ конфликтов**: Loader strategy безопасна
- ✅ **НЕТ N+1**: Один SQL-запрос

### UX-риски

- ✅ **НЕТ проблем**: Все HTTP статусы обработаны (400, 422, 404)
- ✅ **НЕТ проблем**: Единое сообщение для 400 и 422
- ✅ **НЕТ проблем**: `setServices([])` гарантирован при любой ошибке

### Потенциальные баги

- ✅ **НЕТ проблем**: Парсинг subdomain корректен для всех случаев
- ✅ **НЕТ проблем**: Обработка ошибок полная

### Неочевидные edge-cases

- ✅ **НЕТ проблем**: Путь `/domain/` корректно обрабатывается (subdomain = null)
- ✅ **НЕТ проблем**: Путь без `/domain/` не вызывает ложных срабатываний

---

## ВЫВОД ДИАГНОСТИКИ

**Текущая реализация корректна и не требует исправлений.**

- Backend использует эффективный ORM-паттерн (`outerjoin` + `contains_eager`)
- Frontend корректно обрабатывает все HTTP статусы
- Нет архитектурных проблем или рисков

**Однако, можно улучшить:**
- Добавить более явные комментарии в код
- Улучшить читаемость (вынести статусы в константы, опционально)

Но это не критично и не является архитектурной проблемой.
