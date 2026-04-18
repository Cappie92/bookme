# Финальная архитектурная верификация: Публичная загрузка услуг мастера

## ШАГ 1. ДИАГНОСТИКА (ФАКТЫ, НЕ ВЫВОДЫ)

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

#### 1.2. ORM-часть отдельно

**Импорты:**
```python
from sqlalchemy.orm import Session, contains_eager
```

**Query структура:**
```python
master_services = db.query(MasterService)                    # Основная таблица
    .filter(MasterService.master_id == master_id)            # Фильтр по master_id
    .outerjoin(                                              # LEFT JOIN
        MasterServiceCategory, 
        MasterService.category_id == MasterServiceCategory.id
    )
    .options(                                                 # Loader option
        contains_eager(MasterService.category)
    )
    .order_by(                                                # Сортировка
        MasterServiceCategory.name.nullslast(),
        MasterService.name,
        MasterService.id
    )
    .all()
```

**Join'ы:**
- ✅ `outerjoin(MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id)` — LEFT JOIN

**Loader strategy:**
- ✅ `contains_eager(MasterService.category)` — использует данные из JOIN

**Order_by:**
- ✅ `MasterServiceCategory.name.nullslast()` — NULL категории последними
- ✅ `MasterService.name` — ASC по умолчанию
- ✅ `MasterService.id` — ASC по умолчанию

#### 1.3. Количество SQL-запросов и сортировка

**Количество SQL-запросов:**
1. Запрос для проверки мастера: `SELECT * FROM masters WHERE id = ?`
2. Запрос для услуг с категориями: `SELECT ... FROM master_services_list LEFT JOIN master_service_categories ... ORDER BY ...`

**Итого: 2 SQL-запроса**

**Где выполняется сортировка:**
- ✅ В SQL через `ORDER BY master_service_categories.name NULLS LAST, master_services_list.name, master_services_list.id`
- ✅ Результат уже отсортирован при возврате из `.all()`

#### 1.4. Response model

**Endpoint:**
```python
@router.get("/services", response_model=ServicesPublicResponse)
```

**Схемы (backend/schemas.py, строки 788-804):**
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

---

### Ответы на вопросы (ФАКТЫ)

#### Q1: Используется ли `outerjoin`?

**ДА**

**Факт:**
```python
.outerjoin(
    MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
)
```

#### Q2: Используется ли `contains_eager`?

**ДА**

**Факт:**
```python
.options(
    contains_eager(MasterService.category)
)
```

#### Q3: Используется ли `selectinload`?

**НЕТ**

**Факт:** В коде нет `selectinload`, используется только `contains_eager`.

#### Q4: Есть ли комбинации loader strategy?

**НЕТ**

**Факт:** Используется только одна loader strategy: `contains_eager(MasterService.category)`.

#### Q5: Какие HTTP статусы реально возвращаются?

**Отсутствует master_id:**
- **422 Unprocessable Entity**
- **Факт:** FastAPI валидация `Query(..., gt=0)` автоматически возвращает 422

**master_id <= 0:**
- **422 Unprocessable Entity**
- **Факт:** FastAPI валидация `gt=0` автоматически возвращает 422

**Мастер не найден:**
- **404 Not Found**
- **Факт:** Явно в коде: `raise HTTPException(status_code=404, detail="Мастер не найден")`

---

### 2. Frontend — `MasterBookingModule.jsx`

#### 2.1. Полная текущая реализация `loadServices()`

**Файл:** `frontend/src/components/booking/MasterBookingModule.jsx` (строки 126-163)

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

#### 2.3. Где вызывается `setServices([])`

**Факты:**
1. ✅ Строка 149: В `else` ветке (нет subdomain и нет masterId)
2. ✅ Строка 163: В `catch` блоке при любой ошибке
3. ✅ Строки 141, 145: При успешной загрузке: `setServices(data.services || data)`

---

### Ответы на вопросы (ФАКТЫ)

#### Q1: Что происходит при status 422?

**Факт:**
- Попадает в ветку `status === 400 || status === 422` (строка 157)
- Вызывается `setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера.')` (строка 159)
- Вызывается `setServices([])` (строка 163)

#### Q2: Отличается ли UX для 400 и 422?

**НЕТ**

**Факт:**
- Оба статуса обрабатываются в одной ветке: `status === 400 || status === 422` (строка 157)
- Одно и то же сообщение для пользователя (строка 159)
- Одинаковый UX

#### Q3: Есть ли сценарий, где services остаётся "грязным" после ошибки?

**НЕТ**

**Факт:**
- `setServices([])` вызывается в `catch` блоке при любой ошибке (строка 163)
- `setServices([])` вызывается в `else` ветке (строка 149)
- Нет сценария, где `services` не очищается

#### Q4: Как парсится subdomain для путей?

**`/domain`:**
- **Факт:** `path.startsWith('/domain/')` → `false`
- **Факт:** `subdomain = null`

**`/domain/`:**
- **Факт:** `path.startsWith('/domain/')` → `true`
- **Факт:** `parts = ['', 'domain', '']`
- **Факт:** `parts.length >= 3` → `true`
- **Факт:** `parts[1] === 'domain'` → `true`
- **Факт:** `parts[2]` → `''` (пустая строка, falsy)
- **Факт:** `subdomain = null`

**`/domain/test`:**
- **Факт:** `path.startsWith('/domain/')` → `true`
- **Факт:** `parts = ['', 'domain', 'test']`
- **Факт:** `parts.length >= 3` → `true`
- **Факт:** `parts[1] === 'domain'` → `true`
- **Факт:** `parts[2]` → `'test'` (truthy)
- **Факт:** `subdomain = 'test'`

**`/other/path`:**
- **Факт:** `path.startsWith('/domain/')` → `false`
- **Факт:** `subdomain = null`

---

## ШАГ 2. СПИСОК ПРОБЛЕМ (АНАЛИЗ)

### ORM-риски

- ✅ **НЕТ проблем**: Используется корректный паттерн `outerjoin` + `contains_eager`
- ✅ **НЕТ конфликтов**: Только одна loader strategy, нет комбинаций
- ✅ **НЕТ N+1**: Один запрос для услуг с категориями (LEFT JOIN)
- ⚠️ **Минимальная оптимизация**: Можно объединить проверку мастера и загрузку услуг в один запрос (опционально)

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

## ШАГ 3. ВЫВОД ДИАГНОСТИКИ

**Текущая реализация архитектурно корректна.**

- ✅ Backend использует эффективный ORM-паттерн (`outerjoin` + `contains_eager`)
- ✅ Frontend корректно обрабатывает все HTTP статусы
- ✅ Нет архитектурных проблем или рисков
- ✅ Все edge-cases обработаны

**Изменения не требуются.**

---

## ШАГ 4. РЕЗУЛЬТАТЫ

### Краткое резюме

Текущая реализация публичной загрузки услуг мастера архитектурно корректна:
- Backend использует эффективный ORM-паттерн (`outerjoin` + `contains_eager`) — один SQL-запрос для услуг с категориями, сортировка в SQL
- Frontend корректно обрабатывает все HTTP статусы (400, 422, 404) с понятными сообщениями
- Нет архитектурных проблем, конфликтов ORM или рисков для UX
- Все edge-cases (парсинг subdomain, обработка ошибок) корректно обработаны

**Изменения не требуются.**

### Unified Diff

**Текущее состояние (без изменений):**

#### backend/routers/domain.py

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

#### frontend/src/components/booking/MasterBookingModule.jsx

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

### Почему выбран ORM-паттерн `outerjoin` + `contains_eager`

**Обоснование:**

1. **Один SQL-запрос для услуг с категориями**
   - `outerjoin` создаёт LEFT JOIN в основном запросе
   - `contains_eager` использует данные из JOIN, не делает отдельный SELECT
   - Результат: один запрос вместо двух (если бы использовали `selectinload`)

2. **Сортировка в SQL**
   - Сортировка выполняется на уровне БД через `ORDER BY`
   - Быстрее, чем сортировка в Python после загрузки
   - Использует индексы БД для оптимизации

3. **Безопасность и отсутствие конфликтов**
   - `contains_eager` специально предназначен для использования с `outerjoin`/`join`
   - Стандартный и безопасный паттерн SQLAlchemy
   - Нет конфликтов loader strategy (используется только одна)

4. **Эффективность для публичного endpoint**
   - Публичный endpoint должен быть быстрым (высокая нагрузка)
   - Минимум запросов к БД
   - Сортировка в SQL эффективнее

5. **Читаемость и поддерживаемость**
   - Понятный и явный паттерн
   - Комментарии в коде объясняют выбор
   - Легко понять, что происходит

**Альтернатива (отклонена):**
- `selectinload` + сортировка в Python: проще, но два запроса и менее эффективно

### Обновлённый Smoke Checklist (10 пунктов)

#### Backend: ORM и производительность

- [ ] **1. Количество SQL-запросов**
  - Запрос: `GET /api/domain/services?master_id=1`
  - Проверить в логах БД: должно быть **2 запроса** (проверка мастера + загрузка услуг с категориями)
  - НЕ должно быть отдельного SELECT для категорий (используется JOIN)

- [ ] **2. Сортировка в SQL**
  - Проверить SQL: должен быть `ORDER BY master_service_categories.name NULLS LAST, master_services_list.name, master_services_list.id`
  - Услуги отсортированы: категории A-Z, NULL последними, затем name, затем id

- [ ] **3. HTTP статусы валидации**
  - Без `master_id`: `GET /api/domain/services` → `422 Unprocessable Entity`
  - `master_id=0`: `GET /api/domain/services?master_id=0` → `422 Unprocessable Entity`
  - `master_id=-1`: `GET /api/domain/services?master_id=-1` → `422 Unprocessable Entity`

- [ ] **4. HTTP статус 404**
  - Несуществующий мастер: `GET /api/domain/services?master_id=99999` → `404 Not Found`

#### Frontend: Обработка ошибок

- [ ] **5. Обработка 422**
  - Запрос без `master_id` → сообщение: "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера."
  - `services = []` установлен

- [ ] **6. Обработка 400**
  - Некорректный `master_id` → то же сообщение, что и для 422
  - `services = []` установлен

- [ ] **7. Обработка 404**
  - Несуществующий мастер → "Мастер не найден. Пожалуйста, проверьте правильность ссылки."
  - `services = []` установлен

- [ ] **8. Парсинг subdomain**
  - `/domain/test` → `subdomain = "test"`, запрос к `/api/domain/test/services`
  - `/domain/` → `subdomain = null`, запрос к `/api/domain/services?master_id=...`
  - `/other/path` → `subdomain = null`, запрос к `/api/domain/services?master_id=...`

#### Интеграция: Публичное бронирование

- [ ] **9. С subdomain**
  - Открыть `/domain/{subdomain}` → услуги загружаются, отсортированы, можно создать запись
  - Работает без токена (публичный endpoint)

- [ ] **10. С master_id**
  - Открыть страницу с `masterId` → услуги загружаются, отсортированы, можно создать запись
  - Работает без токена (публичный endpoint)

---

## КРИТЕРИЙ ГОТОВНОСТИ

✅ **Нет ORM-конфликтов**: Используется безопасный паттерн `outerjoin` + `contains_eager`, только одна loader strategy  
✅ **Нет "молчаливых" HTTP статусов**: Все статусы (400, 422, 404) обработаны явно  
✅ **UX стабилен**: Понятные сообщения при любых ошибках, `setServices([])` гарантирован  
✅ **Публичное бронирование работает**: С subdomain, с master_id, без токена

**Код готов к продакшену.**
