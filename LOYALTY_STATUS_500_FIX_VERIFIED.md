# Отчёт: Проверка исправления 500 ошибки в GET /api/loyalty/status

**Дата:** 2026-01-21  
**Статус:** ✅ Исправлено и проверено

---

## Проблема

Ранее `GET /api/loyalty/status` возвращал 500 при ошибках схемы БД, но затем ошибки маскировались "тихими" 200 с пустыми массивами. Это не позволяло обнаружить проблему со схемой БД.

---

## Решение

Теперь ошибки схемы возвращают явный **409 Conflict** вместо маскировки, что позволяет:
- Обнаружить проблему со схемой БД
- Не переносить логику в мобильное приложение с нерабочим backend
- Получить полный traceback в логах

---

## Конкретные except блоки и статусы

### 1. Master не найден → **404 Not Found**

**Строки:** 182-190

```python
try:
    master_id = get_master_id_from_user(current_user.id, db)
except HTTPException as e:
    # Если мастер не найден, возвращаем 404 (это ожидаемое поведение)
    logger.warning(
        f"GET /api/loyalty/status: Master profile not found for user_id={current_user.id}",
        exc_info=True
    )
    raise
```

**Статус:** `404 Not Found`  
**Логирование:** `logger.warning` с `exc_info=True` (полный traceback)

**Пример ответа:**
```json
{
  "detail": "Профиль мастера не найден"
}
```

---

### 2. SQL ошибка (схема устарела) → **409 Conflict**

**Строки:** 210-220

```python
except (OperationalError, ProgrammingError) as sql_error:
    # SQL ошибка (например, колонка master_id не существует - миграция не применена)
    logger.exception(
        f"GET /api/loyalty/status: SQL error when querying discounts (schema outdated, migration not applied): {sql_error}"
    )
    # Возвращаем 409 Conflict вместо маскировки ошибки пустыми массивами
    raise HTTPException(
        status_code=409,
        detail="Loyalty schema outdated, apply migrations",
        headers={"X-Error-Code": "SCHEMA_OUTDATED"}
    )
```

**Статус:** `409 Conflict`  
**Логирование:** `logger.exception` (полный traceback)  
**Заголовок:** `X-Error-Code: SCHEMA_OUTDATED`

**Пример ответа:**
```json
{
  "detail": "Loyalty schema outdated, apply migrations"
}
```

**Заголовки ответа:**
```
HTTP/1.1 409 Conflict
X-Error-Code: SCHEMA_OUTDATED
Content-Type: application/json
```

---

### 3. AttributeError (схема устарела) → **409 Conflict**

**Строки:** 221-231

```python
except AttributeError as attr_error:
    # Ошибка доступа к атрибуту (например, model_class.master_id не существует)
    logger.exception(
        f"GET /api/loyalty/status: Attribute error when querying discounts (schema outdated, migration not applied): {attr_error}"
    )
    # Возвращаем 409 Conflict вместо маскировки ошибки пустыми массивами
    raise HTTPException(
        status_code=409,
        detail="Loyalty schema outdated, apply migrations",
        headers={"X-Error-Code": "SCHEMA_OUTDATED"}
    )
```

**Статус:** `409 Conflict`  
**Логирование:** `logger.exception` (полный traceback)  
**Заголовок:** `X-Error-Code: SCHEMA_OUTDATED`

**Пример ответа:** (аналогично п.2)

---

### 4. Реально пустые данные → **200 OK**

**Строки:** 233-249

```python
total_discounts = len(quick_discounts) + len(complex_discounts) + len(personal_discounts)
active_discounts = len([d for d in quick_discounts + complex_discounts + personal_discounts if d.is_active])

# Диагностическое логирование результатов
logger.debug(
    f"GET /api/loyalty/status: master_id={master_id}, "
    f"quick={len(quick_discounts)}, complex={len(complex_discounts)}, "
    f"personal={len(personal_discounts)}, total={total_discounts}, active={active_discounts}"
)

return LoyaltySystemStatus(
    quick_discounts=quick_discounts,
    complex_discounts=complex_discounts,
    personal_discounts=personal_discounts,
    total_discounts=total_discounts,
    active_discounts=active_discounts
)
```

**Статус:** `200 OK`  
**Логирование:** `logger.debug` (диагностика)

**Пример ответа:**
```json
{
  "quick_discounts": [],
  "complex_discounts": [],
  "personal_discounts": [],
  "total_discounts": 0,
  "active_discounts": 0
}
```

---

### 5. Непредвиденная ошибка → **500 Internal Server Error**

**Строки:** 254-263

```python
except Exception as e:
    # Непредвиденная ошибка - логируем и пробрасываем как 500
    logger.exception(
        f"GET /api/loyalty/status: Unexpected error for user_id={current_user.id}: {e}"
    )
    # Возвращаем 500 вместо маскировки ошибки пустыми массивами
    raise HTTPException(
        status_code=500,
        detail=f"Internal server error: {str(e)}"
    )
```

**Статус:** `500 Internal Server Error`  
**Логирование:** `logger.exception` (полный traceback)

**Пример ответа:**
```json
{
  "detail": "Internal server error: <error_message>"
}
```

---

## Пример traceback строки (который раньше давал 500)

### До исправления

**Файл:** `backend/routers/loyalty.py`  
**Строка:** 197 (или 201, или 207)

**Traceback:**
```
Traceback (most recent call last):
  File "backend/routers/loyalty.py", line 197, in get_loyalty_system_status
    quick_discounts = db.query(LoyaltyDiscount).filter(
  File "backend/routers/loyalty.py", line 198, in get_loyalty_system_status
    get_loyalty_filter(master_id, db, LoyaltyDiscount),
  File "backend/routers/loyalty.py", line 61, in get_loyalty_filter
    return model_class.master_id == master_id
AttributeError: 'InstrumentedAttribute' object has no attribute 'master_id'
```

**Или:**
```
Traceback (most recent call last):
  File "backend/routers/loyalty.py", line 197, in get_loyalty_system_status
    quick_discounts = db.query(LoyaltyDiscount).filter(
  ...
sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: loyalty_discounts.master_id
[SQL: SELECT ... FROM loyalty_discounts WHERE loyalty_discounts.master_id = ? ...]
```

### После исправления

**Файл:** `backend/routers/loyalty.py`  
**Строка:** 221-231 (для AttributeError) или 210-220 (для OperationalError)

**Поведение:**
- Полный traceback логируется через `logger.exception`
- Возвращается **409 Conflict** с понятным сообщением
- Заголовок `X-Error-Code: SCHEMA_OUTDATED` для программной обработки

**Лог в консоли:**
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

**HTTP ответ:**
```
HTTP/1.1 409 Conflict
X-Error-Code: SCHEMA_OUTDATED
Content-Type: application/json

{
  "detail": "Loyalty schema outdated, apply migrations"
}
```

---

## Пример ответа для 409 Conflict

### Запрос

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

### Ответ (если миграция не применена)

**Status Code:** `409 Conflict`

**Headers:**
```
HTTP/1.1 409 Conflict
X-Error-Code: SCHEMA_OUTDATED
Content-Type: application/json
Content-Length: 58
```

**Body:**
```json
{
  "detail": "Loyalty schema outdated, apply migrations"
}
```

### Обработка в мобильном приложении

```typescript
try {
  const response = await api.get('/loyalty/status');
  // Обработка успешного ответа
} catch (error) {
  if (error.response?.status === 409 && 
      error.response?.headers['x-error-code'] === 'SCHEMA_OUTDATED') {
    // Показать сообщение: "Схема БД устарела, примените миграции"
    showError('Loyalty schema outdated, apply migrations');
  } else {
    // Другая ошибка
    handleError(error);
  }
}
```

---

## Сравнение: До и После

### До исправления

| Ситуация | Статус | Проблема |
|----------|--------|----------|
| Master не найден | 404 | ✅ OK |
| Схема устарела (SQL ошибка) | 200 (пустые массивы) | ❌ Маскирует ошибку |
| Схема устарела (AttributeError) | 200 (пустые массивы) | ❌ Маскирует ошибку |
| Реально пустые данные | 200 (пустые массивы) | ✅ OK |
| Непредвиденная ошибка | 200 (пустые массивы) | ❌ Маскирует ошибку |

### После исправления

| Ситуация | Статус | Результат |
|----------|--------|-----------|
| Master не найден | 404 | ✅ OK, логируется warning |
| Схема устарела (SQL ошибка) | 409 Conflict | ✅ Явная ошибка, логируется exception |
| Схема устарела (AttributeError) | 409 Conflict | ✅ Явная ошибка, логируется exception |
| Реально пустые данные | 200 OK | ✅ OK, логируется debug |
| Непредвиденная ошибка | 500 Internal Server Error | ✅ Явная ошибка, логируется exception |

---

## Чек-лист проверки

### ✅ Тест 1: Master не найден → 404

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <user_without_master_token>"
```

**Ожидаемый результат:**
- ✅ 404 Not Found
- ✅ В логах: `WARNING` с `exc_info=True` (полный traceback)

---

### ✅ Тест 2: Схема устарела (миграция не применена) → 409

**Шаги:**
1. Убедиться, что миграция `20260121_add_master_id_to_loyalty_discounts` не применена
2. Выполнить запрос

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Ожидаемый результат:**
- ✅ 409 Conflict
- ✅ Заголовок `X-Error-Code: SCHEMA_OUTDATED`
- ✅ Body: `{"detail": "Loyalty schema outdated, apply migrations"}`
- ✅ В логах: `ERROR` с полным traceback через `logger.exception`

---

### ✅ Тест 3: Реально пустые данные → 200

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token_without_discounts>"
```

**Ожидаемый результат:**
- ✅ 200 OK
- ✅ Body: `{"quick_discounts": [], "complex_discounts": [], "personal_discounts": [], "total_discounts": 0, "active_discounts": 0}`
- ✅ В логах: `DEBUG` с counts

---

### ✅ Тест 4: Мастер со скидками → 200

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token_with_discounts>"
```

**Ожидаемый результат:**
- ✅ 200 OK
- ✅ Body содержит скидки в соответствующих массивах
- ✅ В логах: `DEBUG` с counts

---

## Изменённые файлы

1. **`backend/routers/loyalty.py`**
   - Строки 182-190: Добавлен `exc_info=True` в `logger.warning` для 404
   - Строки 210-220: Изменён `except (OperationalError, ProgrammingError)` → выбрасывает 409 вместо возврата пустых массивов
   - Строки 221-231: Изменён `except AttributeError` → выбрасывает 409 вместо возврата пустых массивов
   - Строки 254-263: Изменён общий `except Exception` → выбрасывает 500 вместо возврата пустых массивов

---

## Итог

✅ **500 ошибка исправлена и проверена**

- Ошибки схемы БД возвращают явный **409 Conflict** вместо маскировки
- Все ошибки логируются с полным traceback (`logger.exception` или `logger.warning` с `exc_info=True`)
- Реально пустые данные возвращают **200 OK** с пустыми массивами
- Непредвиденные ошибки возвращают **500 Internal Server Error** вместо маскировки

✅ **Убраны "тихие" 200 при сломанной схеме**

- Теперь невозможно перенести логику в мобильное приложение с нерабочим backend
- Все ошибки схемы явно видны через 409 Conflict
- Полный traceback доступен в логах для диагностики

---

**Автор:** AI Assistant  
**Дата:** 2026-01-21
