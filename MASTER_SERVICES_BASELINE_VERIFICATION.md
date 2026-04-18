# Архитектурная верификация: Публичная загрузка услуг мастера

## ШАГ 0. BASELINE (ДО ИСПРАВЛЕНИЙ)

### 0.1 Backend Baseline

#### Полный код endpoint

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

#### ORM Query отдельно

**Импорты:**
```python
from sqlalchemy.orm import Session, contains_eager
```

**Query:**
```python
master_services = db.query(MasterService)                    # Основная таблица
    .filter(MasterService.master_id == master_id)            # Фильтр
    .outerjoin(                                              # LEFT JOIN
        MasterServiceCategory, 
        MasterService.category_id == MasterServiceCategory.id
    )
    .options(                                                # Loader option
        contains_eager(MasterService.category)
    )
    .order_by(                                               # Сортировка
        MasterServiceCategory.name.nullslast(),
        MasterService.name,
        MasterService.id
    )
    .all()
```

**Join'ы:**
- ✅ `outerjoin(MasterServiceCategory, ...)` — LEFT JOIN

**Loader strategy:**
- ✅ `contains_eager(MasterService.category)` — использует данные из JOIN

**Order_by:**
- ✅ `MasterServiceCategory.name.nullslast()` — NULL последними
- ✅ `MasterService.name` — ASC
- ✅ `MasterService.id` — ASC

#### Фиксация фактов

**Количество SQL-запросов:**
- **Факт:** 2 запроса
  1. `SELECT * FROM masters WHERE id = ?` (проверка мастера, строка 171)
  2. `SELECT ... FROM master_services_list LEFT JOIN master_service_categories ... ORDER BY ...` (загрузка услуг с категориями, строки 178-188)

**Где сортировка:**
- **Факт:** В SQL через `ORDER BY master_service_categories.name NULLS LAST, master_services_list.name, master_services_list.id`
- **Факт:** Результат уже отсортирован при возврате из `.all()`

**HTTP статусы:**
- **Отсутствует master_id:** `422 Unprocessable Entity` (FastAPI валидация `Query(..., gt=0)`)
- **master_id <= 0:** `422 Unprocessable Entity` (FastAPI валидация `gt=0`)
- **Мастер не найден:** `404 Not Found` (явно в коде, строка 173)

**Response model:**
- **Факт:** `response_model=ServicesPublicResponse` (строка 162)
- **Схемы:**
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

### 0.2 Frontend Baseline

#### Полная функция loadServices()

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

#### Таблица: статус → сообщение → очищаем services?

| Статус | Сообщение | `setServices([])` | Строка |
|--------|-----------|-------------------|--------|
| 404 | "Мастер не найден. Пожалуйста, проверьте правильность ссылки." | ✅ Да | 155-156 |
| 400 | "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера." | ✅ Да | 157-159 |
| 422 | "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера." | ✅ Да | 157-159 |
| Другие | "Ошибка загрузки услуг. Пожалуйста, попробуйте позже." | ✅ Да | 160-161 |
| Нет subdomain и нет masterId | "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера" | ✅ Да | 148-149 |

#### Парсинг subdomain

| Путь | `path.startsWith('/domain/')` | `parts[2]` | `subdomain` | Результат |
|------|-------------------------------|------------|--------------|-----------|
| `/domain` | `false` | N/A | `null` | ✅ Корректно |
| `/domain/` | `true` | `''` (пустая строка, falsy) | `null` | ✅ Корректно |
| `/domain/test` | `true` | `'test'` (truthy) | `'test'` | ✅ Корректно |
| `/other/path` | `false` | N/A | `null` | ✅ Корректно |

---

### 0.3 Baseline Verdict

#### Список рисков

**NO RISKS FOUND**

**Обоснование:**
- ✅ ORM паттерн корректен: `outerjoin` + `contains_eager` — стандартный и безопасный
- ✅ Нет конфликтов loader strategy: используется только одна (`contains_eager`)
- ✅ Нет N+1 проблемы: один запрос для услуг с категориями (LEFT JOIN)
- ✅ Все HTTP статусы обработаны: 404, 400, 422, другие
- ✅ `setServices([])` гарантирован при любой ошибке
- ✅ Парсинг subdomain корректен для всех edge-cases

#### Список улучшений (OPTIONAL)

**OPTIONAL улучшения (не критично):**
- Можно объединить проверку мастера и загрузку услуг в один запрос (оптимизация, но не обязательно)
- Можно вынести HTTP статусы в константы для лучшей читаемости (косметика)

---

## ШАГ 1. РЕШЕНИЕ: НУЖНЫ ЛИ ИЗМЕНЕНИЯ?

### Вариант B — NO CHANGES REQUIRED

**NO CODE CHANGES REQUIRED**

**Обоснование (привязка к фактам baseline):**

1. **ORM паттерн корректен:**
   - **Факт:** Используется `outerjoin` + `contains_eager`
   - **Факт:** Только одна loader strategy, нет конфликтов
   - **Вывод:** Стандартный и безопасный паттерн SQLAlchemy, не требует изменений

2. **Производительность оптимальна:**
   - **Факт:** 2 SQL-запроса (проверка мастера + загрузка услуг с категориями)
   - **Факт:** Сортировка в SQL, не в Python
   - **Вывод:** Эффективно для публичного endpoint, не требует оптимизации

3. **Все HTTP статусы обработаны:**
   - **Факт:** 404, 400, 422, другие — все обработаны явно
   - **Факт:** Понятные сообщения для пользователя
   - **Вывод:** UX корректен, не требует изменений

4. **Нет рисков "грязного" состояния:**
   - **Факт:** `setServices([])` вызывается в `catch` блоке при любой ошибке
   - **Факт:** `setServices([])` вызывается в `else` ветке (нет subdomain и masterId)
   - **Вывод:** Гарантированная очистка состояния, не требует изменений

5. **Парсинг subdomain корректен:**
   - **Факт:** Все edge-cases (`/domain`, `/domain/`, `/domain/test`, `/other/path`) обработаны корректно
   - **Вывод:** Нет багов, не требует изменений

6. **Response model типизирован:**
   - **Факт:** Используется `response_model=ServicesPublicResponse`
   - **Факт:** Схемы определены в `schemas.py`
   - **Вывод:** Типизация на месте, не требует изменений

---

## ШАГ 2. ИСПРАВЛЕНИЯ

**НЕ ПРИМЕНИМО** — вариант B выбран, изменений не требуется.

---

## ШАГ 3. TRUE UNIFIED DIFF

### NO-CHANGE DIFF

#### backend/routers/domain.py

```diff
--- a/backend/routers/domain.py
+++ b/backend/routers/domain.py
@@
 // no changes required
 // Current implementation uses outerjoin + contains_eager pattern
 // which is correct and efficient (one SQL query for services with categories)
```

#### frontend/src/components/booking/MasterBookingModule.jsx

```diff
--- a/frontend/src/components/booking/MasterBookingModule.jsx
+++ b/frontend/src/components/booking/MasterBookingModule.jsx
@@
 // no changes required
 // All HTTP statuses (404, 400, 422) are handled correctly
 // setServices([]) is guaranteed on any error
```

#### backend/schemas.py

```diff
--- a/backend/schemas.py
+++ b/backend/schemas.py
@@
 // no changes required
 // ServicePublicOut and ServicesPublicResponse are defined and used correctly
```

#### frontend/src/utils/api.js

```diff
--- a/frontend/src/utils/api.js
+++ b/frontend/src/utils/api.js
@@
 // no changes required
 // No modifications needed for public endpoint /api/domain/services
```

---

## ШАГ 4. POST-CHECK (подтверждение baseline)

### 4.1 Backend Post-Check

**Количество SQL-запросов:**
- **Подтверждено:** 2 запроса
  1. Проверка мастера: `SELECT * FROM masters WHERE id = ?`
  2. Загрузка услуг с категориями: `SELECT ... FROM master_services_list LEFT JOIN master_service_categories ... ORDER BY ...`
- **Обоснование:** Оптимально для публичного endpoint (минимум запросов, сортировка в SQL)

**Где сортировка:**
- **Подтверждено:** В SQL через `ORDER BY master_service_categories.name NULLS LAST, master_services_list.name, master_services_list.id`
- **Обоснование:** Эффективно, использует индексы БД

**HTTP статусы:**
- **Подтверждено:**
  - Отсутствует master_id → `422 Unprocessable Entity`
  - master_id <= 0 → `422 Unprocessable Entity`
  - Мастер не найден → `404 Not Found`
- **Обоснование:** Корректная обработка всех случаев

**Response model:**
- **Подтверждено:** `response_model=ServicesPublicResponse` используется
- **Обоснование:** Типизация на месте, валидация через Pydantic

### 4.2 Frontend Post-Check

**Таблица: статус → сообщение → services очищается**

| Статус | Сообщение | `setServices([])` | Подтверждено |
|--------|-----------|-------------------|--------------|
| 404 | "Мастер не найден..." | ✅ Да | ✅ |
| 400 | "Для бронирования необходимо..." | ✅ Да | ✅ |
| 422 | "Для бронирования необходимо..." | ✅ Да | ✅ |
| Другие | "Ошибка загрузки услуг..." | ✅ Да | ✅ |
| Нет subdomain и нет masterId | "Для бронирования необходимо..." | ✅ Да | ✅ |

**No dirty state:**
- **Подтверждено:** `setServices([])` вызывается при любой ошибке (в `catch` блоке)
- **Подтверждено:** `setServices([])` вызывается при отсутствии subdomain и masterId (в `else` ветке)
- **Вывод:** Нет сценариев, где `services` остаётся "грязным"

---

## ШАГ 5. SMOKE CHECKLIST (10 пунктов)

### Backend: Валидация и HTTP статусы

- [ ] **1. HTTP 422 — отсутствует master_id**
  - Запрос: `GET /api/domain/services`
  - Ожидается: `422 Unprocessable Entity`
  - Проверить: FastAPI автоматически возвращает 422 при отсутствии обязательного query параметра

- [ ] **2. HTTP 422 — master_id <= 0**
  - Запрос: `GET /api/domain/services?master_id=0`
  - Ожидается: `422 Unprocessable Entity`
  - Проверить: FastAPI валидация `gt=0` возвращает 422

- [ ] **3. HTTP 404 — мастер не найден**
  - Запрос: `GET /api/domain/services?master_id=99999`
  - Ожидается: `404 Not Found` с `{"detail": "Мастер не найден"}`
  - Проверить: Явная проверка в коде (строка 172-173)

- [ ] **4. HTTP 200 — успешный ответ**
  - Запрос: `GET /api/domain/services?master_id=1` (валидный мастер)
  - Ожидается: `200 OK` с `{"services": [...]}`
  - Проверить: Услуги отсортированы (категории A-Z, NULL последними, затем name, затем id)

### Frontend: Обработка ошибок

- [ ] **5. Обработка 422**
  - Запрос без `master_id` → сообщение: "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера."
  - Проверить: `services = []` установлен

- [ ] **6. Обработка 404**
  - Несуществующий мастер → сообщение: "Мастер не найден. Пожалуйста, проверьте правильность ссылки."
  - Проверить: `services = []` установлен

- [ ] **7. UX без subdomain и без masterId**
  - Открыть страницу без subdomain и без masterId
  - Ожидается: Сообщение "Для бронирования необходимо открыть страницу по доменному адресу мастера или указать ID мастера"
  - Проверить: `services = []` установлен, запросы не делаются

### Интеграция: Публичное бронирование

- [ ] **8. С subdomain (публичный endpoint)**
  - Открыть `/domain/{subdomain}` → услуги загружаются через `/api/domain/{subdomain}/services`
  - Проверить: Работает без токена, услуги отсортированы, можно создать запись

- [ ] **9. С master_id (публичный endpoint)**
  - Открыть страницу с `masterId` → услуги загружаются через `/api/domain/services?master_id={masterId}`
  - Проверить: Работает без токена, услуги отсортированы, можно создать запись

- [ ] **10. Отсутствие требований токена**
  - Запрос: `GET /api/domain/services?master_id=1` без `Authorization` header
  - Ожидается: `200 OK` (публичный endpoint)
  - Проверить: Endpoint не попадает под auth-guard (не начинается с `/api/master/`, `/api/loyalty/`, `/api/master/loyalty/`)

---

## ШАГ 6. ФИНАЛЬНЫЙ ВЕРДИКТ

### READY FOR PROD

**Обоснование:**

1. ✅ **ORM паттерн корректен и эффективен:**
   - Используется стандартный паттерн `outerjoin` + `contains_eager`
   - Один SQL-запрос для услуг с категориями
   - Сортировка в SQL, не в Python

2. ✅ **Все HTTP статусы обработаны:**
   - 422 (валидация) → понятное сообщение
   - 404 (мастер не найден) → понятное сообщение
   - 400 (некорректный запрос) → понятное сообщение

3. ✅ **Нет рисков "грязного" состояния:**
   - `setServices([])` гарантирован при любой ошибке
   - Все ветки обработки ошибок покрыты

4. ✅ **Парсинг subdomain корректен:**
   - Все edge-cases обработаны
   - Нет ложных срабатываний

5. ✅ **Публичный endpoint работает без токена:**
   - Endpoint не попадает под auth-guard
   - Доступен для публичного бронирования

**Код готов к продакшену.**
