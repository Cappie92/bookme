# Отчёт: Production-grade обработка ошибок лояльности

**Дата:** 2026-01-21  
**Статус:** ✅ Завершено

---

## Цель

Доработать обработку ошибок лояльности до production-grade уровня:
- Расширенный JSON для 409 SCHEMA_OUTDATED с debug информацией (только в dev)
- Обработка всех типичных SQLAlchemy ошибок схемы
- Понятное сообщение в UI без спама в console

---

## Изменения в Backend

### 1. Расширена обработка ошибок схемы

**Файл:** `backend/routers/loyalty.py`

**Добавлены импорты:**
```python
from sqlalchemy.exc import OperationalError, ProgrammingError, DatabaseError
import os
import re
from typing import Dict
```

**Новые функции:**

#### `is_dev_mode() -> bool`
Проверяет, работает ли приложение в режиме разработки через переменную окружения `ENVIRONMENT`.

#### `extract_schema_error_info(error: Exception) -> Dict[str, Optional[str]]`
Извлекает информацию об ошибке схемы БД:
- `missing` - название отсутствующей колонки
- `table` - название таблицы
- `original_error` - полный текст ошибки с типом

Поддерживает паттерны для:
- SQLite: `"no such column: table_name.column_name"`
- PostgreSQL: `'column "column_name" does not exist'`
- MySQL: `"Unknown column 'column_name' in 'field list'"`

**Обновлённая обработка ошибок (строки 210-260):**

```python
except (OperationalError, ProgrammingError, DatabaseError) as sql_error:
    # SQL ошибка (например, колонка master_id не существует - миграция не применена)
    logger.exception(
        f"GET /api/loyalty/status: SQL error when querying discounts (schema outdated, migration not applied): {sql_error}"
    )
    
    # Извлекаем информацию об ошибке для debug
    error_info = extract_schema_error_info(sql_error)
    
    # Формируем расширенный JSON ответ
    error_detail = {
        "detail": "Loyalty schema outdated, apply migrations",
        "code": "SCHEMA_OUTDATED",
        "hint": "Run alembic upgrade head"
    }
    
    # Добавляем debug информацию только в dev режиме
    if is_dev_mode():
        error_detail["debug"] = error_info
    
    # Возвращаем 409 Conflict вместо маскировки ошибки пустыми массивами
    raise HTTPException(
        status_code=409,
        detail=error_detail,
        headers={"X-Error-Code": "SCHEMA_OUTDATED"}
    )
```

Аналогичная обработка для `AttributeError` (строки 261-290).

---

## Изменения в Frontend

### 1. Обработка 409 ошибки

**Файл:** `frontend/src/components/LoyaltySystem.jsx`

**Обновлённая обработка ответа (строки 67-110):**

```javascript
if (statusResponse.ok) {
  // Успешный ответ - обрабатываем данные
  const statusData = await statusResponse.json()
  setQuickDiscounts(statusData.quick_discounts || [])
  setComplexDiscounts(statusData.complex_discounts || [])
  setPersonalDiscounts(statusData.personal_discounts || [])
} else if (statusResponse.status === 409) {
  // Обработка ошибки схемы БД (SCHEMA_OUTDATED)
  const errorCode = statusResponse.headers.get('X-Error-Code')
  if (errorCode === 'SCHEMA_OUTDATED') {
    const errorData = await statusResponse.json()
    // Показываем понятное сообщение с инструкцией
    const errorMessage = typeof errorData.detail === 'object' 
      ? errorData.detail.detail || errorData.detail
      : errorData.detail || 'Схема базы данных устарела'
    const hint = typeof errorData.detail === 'object' && errorData.detail.hint
      ? errorData.detail.hint
      : 'Run alembic upgrade head'
    setError(`${errorMessage}. ${hint}`)
    // Не логируем в console, чтобы избежать спама
  } else {
    // Другая 409 ошибка
    const errorData = await statusResponse.json()
    setError(typeof errorData.detail === 'object' 
      ? errorData.detail.detail || JSON.stringify(errorData.detail)
      : errorData.detail || 'Ошибка конфликта')
  }
}
```

**Отображение ошибки в UI (строки 293-297):**

```javascript
{error && (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
    {error}
  </div>
)}
```

---

## Примеры Response

### 1. Успешный ответ: 200 OK

**Запрос:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Response (200 OK):**
```json
{
  "quick_discounts": [
    {
      "id": 1,
      "discount_type": "quick",
      "name": "Новый клиент",
      "discount_percent": 10.0,
      "is_active": true,
      "priority": 1
    }
  ],
  "complex_discounts": [],
  "personal_discounts": [
    {
      "id": 1,
      "client_phone": "+79991234567",
      "discount_percent": 15.0,
      "is_active": true
    }
  ],
  "total_discounts": 2,
  "active_discounts": 2
}
```

**Отображение в UI:**
- Вкладка "Быстрые скидки": отображается карточка "Новый клиент" с кнопкой "Активна"
- Вкладка "Персональные скидки": отображается скидка для +79991234567
- Счётчики: `total_discounts: 2`, `active_discounts: 2`

**Где отображается:**
- Компонент `LoyaltySystem.jsx` → вкладки `QuickDiscountsTab`, `ComplexDiscountsTab`, `PersonalDiscountsTab`
- Строки 74-76: данные устанавливаются в state через `setQuickDiscounts`, `setComplexDiscounts`, `setPersonalDiscounts`
- Строки 311-347: рендеринг вкладок с данными

---

### 2. Master не найден: 404 Not Found

**Запрос:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <user_without_master_token>"
```

**Response (404 Not Found):**
```json
{
  "detail": "Профиль мастера не найден"
}
```

**Отображение в UI:**
- Frontend обрабатывает 404 как нормальную ситуацию (строки 77-81)
- Устанавливаются пустые массивы: `setQuickDiscounts([])`, `setComplexDiscounts([])`, `setPersonalDiscounts([])`
- UI показывает пустые вкладки без ошибок

**Где отображается:**
- Компонент `LoyaltySystem.jsx` → вкладки показывают "нет данных" или пустые списки
- Строки 77-81: обработка 404 статуса

---

### 3. Схема устарела (Production): 409 Conflict

**Запрос:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Response (409 Conflict) - Production режим:**
```json
{
  "detail": {
    "detail": "Loyalty schema outdated, apply migrations",
    "code": "SCHEMA_OUTDATED",
    "hint": "Run alembic upgrade head"
  }
}
```

**Headers:**
```
HTTP/1.1 409 Conflict
X-Error-Code: SCHEMA_OUTDATED
Content-Type: application/json
```

**Отображение в UI:**
- Красная плашка с сообщением: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- Отображается в верхней части компонента (строки 293-297)
- Без спама в console (убраны `console.error` и `console.warn`)

**Где отображается:**
- Компонент `LoyaltySystem.jsx` → строка 293-297: `<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>`
- Строки 77-95: обработка 409 статуса с проверкой заголовка `X-Error-Code: SCHEMA_OUTDATED`

---

### 4. Схема устарела (Development): 409 Conflict с debug

**Запрос:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Response (409 Conflict) - Development режим:**
```json
{
  "detail": {
    "detail": "Loyalty schema outdated, apply migrations",
    "code": "SCHEMA_OUTDATED",
    "hint": "Run alembic upgrade head",
    "debug": {
      "missing": "master_id",
      "table": "loyalty_discounts",
      "original_error": "OperationalError: no such column: loyalty_discounts.master_id"
    }
  }
}
```

**Headers:**
```
HTTP/1.1 409 Conflict
X-Error-Code: SCHEMA_OUTDATED
Content-Type: application/json
```

**Отображение в UI:**
- Красная плашка с сообщением: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- Debug информация доступна в response, но не отображается в UI (только для разработчиков через DevTools)
- В логах backend: полный traceback через `logger.exception`

**Где отображается:**
- Компонент `LoyaltySystem.jsx` → строка 293-297: красная плашка с сообщением
- Debug информация доступна в Network tab DevTools

---

## Примеры traceback в логах

### SQLite ошибка (миграция не применена)

**Лог в backend:**
```
ERROR:backend.routers.loyalty:GET /api/loyalty/status: SQL error when querying discounts (schema outdated, migration not applied): (sqlite3.OperationalError) no such column: loyalty_discounts.master_id
[SQL: SELECT loyalty_discounts.id, loyalty_discounts.discount_type, loyalty_discounts.name, loyalty_discounts.description, loyalty_discounts.discount_percent, loyalty_discounts.max_discount_amount, loyalty_discounts.conditions, loyalty_discounts.is_active, loyalty_discounts.priority, loyalty_discounts.salon_id, loyalty_discounts.master_id, loyalty_discounts.created_at, loyalty_discounts.updated_at 
FROM loyalty_discounts 
WHERE loyalty_discounts.master_id = ? AND loyalty_discounts.discount_type = ?]
[parameters: (1, 'quick')]
(Background on this error at: https://sqlalche.me/e/20/e3q8)
Traceback (most recent call last):
  File "backend/routers/loyalty.py", line 197, in get_loyalty_system_status
    quick_discounts = db.query(LoyaltyDiscount).filter(
  File "backend/routers/loyalty.py", line 198, in get_loyalty_system_status
    get_loyalty_filter(master_id, db, LoyaltyDiscount),
  File "backend/routers/loyalty.py", line 61, in get_loyalty_filter
    return model_class.master_id == master_id
...
```

**Извлечённая debug информация:**
```json
{
  "missing": "master_id",
  "table": "loyalty_discounts",
  "original_error": "OperationalError: no such column: loyalty_discounts.master_id"
}
```

---

### AttributeError (модель не обновлена)

**Лог в backend:**
```
ERROR:backend.routers.loyalty:GET /api/loyalty/status: Attribute error when querying discounts (schema outdated, migration not applied): 'InstrumentedAttribute' object has no attribute 'master_id'
Traceback (most recent call last):
  File "backend/routers/loyalty.py", line 197, in get_loyalty_system_status
    quick_discounts = db.query(LoyaltyDiscount).filter(
  File "backend/routers/loyalty.py", line 198, in get_loyalty_system_status
    get_loyalty_filter(master_id, db, LoyaltyDiscount),
  File "backend/routers/loyalty.py", line 61, in get_loyalty_filter
    return model_class.master_id == master_id
AttributeError: 'InstrumentedAttribute' object has no attribute 'master_id'
```

**Извлечённая debug информация:**
```json
{
  "missing": null,
  "table": null,
  "original_error": "AttributeError: 'InstrumentedAttribute' object has no attribute 'master_id'"
}
```

---

## Обработка различных типов SQLAlchemy ошибок

### Поддерживаемые типы ошибок:

1. **OperationalError** - SQLite/MySQL ошибки выполнения SQL
   - Пример: `no such column: table_name.column_name`
   - Обрабатывается: ✅

2. **ProgrammingError** - PostgreSQL ошибки синтаксиса/схемы
   - Пример: `column "column_name" does not exist`
   - Обрабатывается: ✅

3. **DatabaseError** - Общий базовый класс для всех ошибок БД
   - Обрабатывается: ✅

4. **AttributeError** - Ошибка доступа к атрибуту модели
   - Пример: `'InstrumentedAttribute' object has no attribute 'master_id'`
   - Обрабатывается: ✅

---

## Чек-лист проверки

### ✅ Тест 1: Успешный ответ (200 OK)

**Шаги:**
1. Войти как мастер со скидками
2. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 200 OK
- ✅ Данные отображаются во вкладках
- ✅ Нет красной плашки с ошибкой

**Где проверить:**
- UI: `/master` → "Система лояльности"
- DevTools Network: `GET /api/loyalty/status` → 200 OK

---

### ✅ Тест 2: Master не найден (404)

**Шаги:**
1. Войти как пользователь без профиля мастера
2. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 404 Not Found
- ✅ UI показывает пустые вкладки (без ошибок)
- ✅ Нет красной плашки

**Где проверить:**
- UI: `/master` → "Система лояльности" → пустые вкладки
- DevTools Network: `GET /api/loyalty/status` → 404 Not Found

---

### ✅ Тест 3: Схема устарела (409) - Production

**Шаги:**
1. Установить `ENVIRONMENT=production` в `.env`
2. Убедиться, что миграция не применена
3. Войти как мастер
4. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 409 Conflict
- ✅ Красная плашка: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- ✅ Нет debug информации в response
- ✅ Нет спама в console

**Где проверить:**
- UI: `/master` → "Система лояльности" → красная плашка сверху
- DevTools Network: `GET /api/loyalty/status` → 409 Conflict
- DevTools Response: нет поля `debug`

---

### ✅ Тест 4: Схема устарела (409) - Development

**Шаги:**
1. Установить `ENVIRONMENT=development` в `.env`
2. Убедиться, что миграция не применена
3. Войти как мастер
4. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 409 Conflict
- ✅ Красная плашка: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- ✅ Debug информация в response (только в DevTools)
- ✅ Полный traceback в логах backend

**Где проверить:**
- UI: `/master` → "Система лояльности" → красная плашка сверху
- DevTools Network: `GET /api/loyalty/status` → 409 Conflict
- DevTools Response: есть поле `debug` с информацией об ошибке
- Backend logs: полный traceback через `logger.exception`

---

## Изменённые файлы

1. **`backend/routers/loyalty.py`**
   - Добавлены импорты: `DatabaseError`, `os`, `re`, `Dict`
   - Добавлена функция `is_dev_mode()` (строки 36-40)
   - Добавлена функция `extract_schema_error_info()` (строки 43-88)
   - Обновлена обработка `OperationalError`, `ProgrammingError`, `DatabaseError` (строки 210-240)
   - Обновлена обработка `AttributeError` (строки 241-270)
   - Расширенный JSON для 409 с debug (только в dev)

2. **`frontend/src/components/LoyaltySystem.jsx`**
   - Обновлена обработка 409 статуса (строки 77-95)
   - Добавлена проверка заголовка `X-Error-Code: SCHEMA_OUTDATED`
   - Понятное сообщение с инструкцией
   - Убран спам в console (удалены `console.error` и `console.warn`)

---

## Итог

✅ **Production-grade обработка ошибок реализована**

- Расширенный JSON для 409 с `detail`, `code`, `hint`, `debug` (debug только в dev)
- Обработка всех типичных SQLAlchemy ошибок схемы (`OperationalError`, `ProgrammingError`, `DatabaseError`, `AttributeError`)
- Понятное сообщение в UI без спама в console
- Извлечение информации об ошибке (missing column, table, original error)
- Поддержка разных БД (SQLite, PostgreSQL, MySQL)

✅ **Улучшенный UX**

- Понятное сообщение для пользователя: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- Debug информация доступна разработчикам через DevTools (только в dev)
- Полный traceback в логах backend для диагностики

---

**Автор:** AI Assistant  
**Дата:** 2026-01-21
