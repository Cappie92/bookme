# Финальная архитектурная полировка: Публичная загрузка услуг мастера

## ШАГ 1. ДИАГНОСТИКА (ДО ЛЮБЫХ ИЗМЕНЕНИЙ)

### 1. Backend — `/api/domain/services`

#### Полный текущий код endpoint

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

#### SQLAlchemy query анализ

**Импорты:**
```python
from sqlalchemy.orm import Session, contains_eager
```

**Query структура:**
- `db.query(MasterService)` — основная таблица
- `.filter(MasterService.master_id == master_id)` — фильтр
- `.outerjoin(MasterServiceCategory, ...)` — LEFT JOIN
- `.options(contains_eager(MasterService.category))` — loader option
- `.order_by(...)` — сортировка в SQL

**Join'ы:**
- ✅ `outerjoin(MasterServiceCategory, ...)` — LEFT JOIN

**Loader options:**
- ✅ `contains_eager(MasterService.category)` — использует данные из JOIN

#### Как работает

**Загрузка category:**
- Через `outerjoin` + `contains_eager`
- Данные из LEFT JOIN в основном запросе
- Нет отдельного SELECT

**Сортировка:**
- В SQL через `ORDER BY`
- `MasterServiceCategory.name.nullslast()` — NULL последними
- Затем `MasterService.name` ASC, затем `MasterService.id` ASC

**Обработка NULL:**
- `outerjoin` сохраняет услуги без категории
- `nullslast()` отправляет NULL в конец
- В коде: `master_service.category.name if master_service.category else None`

#### Response model

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
- `contains_eager()` использует данные из JOIN, не делает отдельный SELECT

#### Q2: Может ли это привести к лишним запросам?

**НЕТ**

**Пояснение:**
- `outerjoin` + `contains_eager` = один SQL-запрос (LEFT JOIN)
- Нет отдельного SELECT для категорий
- Эффективно: все данные в одном запросе

#### Q3: Может ли это привести к конфликту loader strategy?

**НЕТ**

**Пояснение:**
- `contains_eager` предназначен для использования с `outerjoin`/`join`
- Стандартный и безопасный паттерн SQLAlchemy
- Нет конфликта: `contains_eager` использует данные из JOIN

#### Q4: Где именно выполняется сортировка (SQL или Python)?

**SQL**

**Пояснение:**
- Сортировка в SQL через `ORDER BY`
- `MasterServiceCategory.name.nullslast()` — SQL функция
- Результат уже отсортирован при возврате из `.all()`

#### Q5: Какие реальные HTTP статусы возвращаются?

**Нет master_id:**
- **422 Unprocessable Entity** (FastAPI валидация `Query(..., gt=0)`)

**master_id <= 0:**
- **422 Unprocessable Entity** (FastAPI валидация `gt=0`)

**Мастер не найден:**
- **404 Not Found** (явно в коде)

---

### 2. Frontend — `MasterBookingModule.jsx`

#### Полная текущая реализация `loadServices()`

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
      const data = await apiGet(`/api/domain/${subdomain}/services`)
      setServices(data.services || data)
    } else if (masterId) {
      const data = await apiGet(`/api/domain/services?master_id=${masterId}`)
      setServices(data.services || data)
    } else {
      setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера')
      setServices([])
    }
  } catch (error) {
    console.error('Ошибка загрузки услуг:', error)
    const status = error.response?.status
    
    if (status === 404) {
      setError('Мастер не найден. Пожалуйста, проверьте правильность ссылки.')
    } else if (status === 400 || status === 422) {
      setError('Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера.')
    } else {
      setError('Ошибка загрузки услуг. Пожалуйста, попробуйте позже.')
    }
    setServices([])
  }
}
```

#### Все ветки обработки ошибок

1. **status === 404** → "Мастер не найден..." + `setServices([])`
2. **status === 400 || 422** → "Для бронирования необходимо..." + `setServices([])`
3. **другие ошибки** → "Ошибка загрузки услуг..." + `setServices([])`
4. **нет subdomain и нет masterId** → "Для бронирования необходимо..." + `setServices([])`

#### Где вызывается `setServices([])`

1. ✅ В `catch` блоке при любой ошибке
2. ✅ В `else` ветке (нет subdomain и masterId)
3. ✅ При успешной загрузке: `setServices(data.services || data)`

---

### Ответы на вопросы (ЯВНО)

#### Q1: Что происходит при status 422?

**Ответ:**
- Попадает в ветку `status === 400 || status === 422`
- Сообщение: "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера."
- Вызывается `setServices([])`

#### Q2: Отличается ли UX для 400 и 422?

**НЕТ**

**Пояснение:**
- Оба статуса обрабатываются в одной ветке
- Одно сообщение для пользователя
- Одинаковый UX

#### Q3: Есть ли сценарий, где services остаётся "грязным" после ошибки?

**НЕТ**

**Пояснение:**
- `setServices([])` вызывается в `catch` блоке при любой ошибке
- `setServices([])` вызывается в `else` ветке
- Нет сценария, где `services` остаётся "грязным"

#### Q4: Как парсится subdomain?

**`/domain`** → `subdomain = null` ✅  
**`/domain/`** → `subdomain = null` ✅  
**`/domain/test`** → `subdomain = "test"` ✅  
**`/other/path`** → `subdomain = null` ✅

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

- ✅ **НЕТ проблем**: Парсинг subdomain корректен
- ✅ **НЕТ проблем**: Обработка ошибок полная

### Неочевидные edge-cases

- ✅ **НЕТ проблем**: Путь `/domain/` корректно обрабатывается
- ✅ **НЕТ проблем**: Путь без `/domain/` не вызывает ложных срабатываний

---

## ШАГ 3. ВЫВОД ДИАГНОСТИКИ

**Текущая реализация архитектурно корректна и не требует исправлений.**

- ✅ Backend использует эффективный ORM-паттерн (`outerjoin` + `contains_eager`)
- ✅ Frontend корректно обрабатывает все HTTP статусы
- ✅ Нет архитектурных проблем или рисков
- ✅ Все edge-cases обработаны

**Код готов к продакшену.**

---

## ШАГ 4. РЕЗУЛЬТАТЫ

### Краткое резюме

Текущая реализация публичной загрузки услуг мастера архитектурно корректна:
- Backend использует эффективный ORM-паттерн (`outerjoin` + `contains_eager`) — один SQL-запрос, сортировка в SQL
- Frontend корректно обрабатывает все HTTP статусы (400, 422, 404) с понятными сообщениями
- Нет архитектурных проблем, конфликтов ORM или рисков для UX
- Все edge-cases (парсинг subdomain, обработка ошибок) корректно обработаны

**Изменения не требуются.**

### Unified Diff

**Нет изменений** — текущая реализация корректна.

### Почему выбран ORM-паттерн `outerjoin` + `contains_eager`

- ✅ **Один SQL-запрос**: LEFT JOIN загружает все данные за один раз
- ✅ **Сортировка в SQL**: Быстрее, чем сортировка в Python
- ✅ **Безопасность**: Нет конфликтов loader strategy, стандартный паттерн SQLAlchemy
- ✅ **Эффективность**: Критично для публичного endpoint (высокая нагрузка)
- ✅ **Читаемость**: Понятный и явный паттерн

### Smoke Checklist (10 пунктов)

#### Backend: ORM и производительность

- [ ] **1. Один SQL-запрос**
  - Запрос: `GET /api/domain/services?master_id=1`
  - Проверить в логах БД: должен быть **один запрос** (LEFT JOIN)
  - НЕ должно быть отдельного SELECT для категорий

- [ ] **2. Сортировка в SQL**
  - Проверить SQL: должен быть `ORDER BY ... NULLS LAST`
  - Услуги отсортированы: категории A-Z, NULL последними, затем name, затем id

- [ ] **3. HTTP статусы валидации**
  - Без `master_id`: `GET /api/domain/services` → `422`
  - `master_id=0`: `GET /api/domain/services?master_id=0` → `422`
  - `master_id=-1`: `GET /api/domain/services?master_id=-1` → `422`

- [ ] **4. HTTP статус 404**
  - Несуществующий мастер: `GET /api/domain/services?master_id=99999` → `404`

#### Frontend: Обработка ошибок

- [ ] **5. Обработка 422**
  - Запрос без `master_id` → сообщение: "Для бронирования необходимо..."
  - `services = []` установлен

- [ ] **6. Обработка 400**
  - Некорректный `master_id` → то же сообщение, что и для 422
  - `services = []` установлен

- [ ] **7. Обработка 404**
  - Несуществующий мастер → "Мастер не найден..."
  - `services = []` установлен

- [ ] **8. Парсинг subdomain**
  - `/domain/test` → `subdomain = "test"`, запрос к `/api/domain/test/services`
  - `/domain/` → `subdomain = null`, запрос к `/api/domain/services?master_id=...`
  - `/other/path` → `subdomain = null`, запрос к `/api/domain/services?master_id=...`

#### Интеграция: Публичное бронирование

- [ ] **9. С subdomain**
  - Открыть `/domain/{subdomain}` → услуги загружаются, отсортированы, можно создать запись

- [ ] **10. С master_id**
  - Открыть страницу с `masterId` → услуги загружаются, отсортированы, можно создать запись
  - Работает без токена (публичный endpoint)

---

## КРИТЕРИЙ ГОТОВНОСТИ

✅ **Нет ORM-конфликтов**: Используется безопасный паттерн `outerjoin` + `contains_eager`  
✅ **Нет "молчаливых" HTTP статусов**: Все статусы (400, 422, 404) обработаны явно  
✅ **UX стабилен**: Понятные сообщения при любых ошибках, `setServices([])` гарантирован  
✅ **Публичное бронирование работает**: С subdomain, с master_id, без токена

**Код готов к продакшену.**
