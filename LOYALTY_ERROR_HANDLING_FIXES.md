# Отчёт: Исправления обработки ошибок лояльности

**Дата:** 2026-01-21  
**Статус:** ✅ Исправлено

---

## 409 через exception handler (финальный подход)

Чтобы **не обходить** общий error-handling/middleware, 409 отдаётся через **исключение** и единый `exception_handler` в `main.py`:

1. **`backend/exceptions.py`** — кастомное исключение `SchemaOutdatedError(detail, hint, debug)`.
2. **`backend/main.py`** — `@app.exception_handler(SchemaOutdatedError)` возвращает плоский JSON + заголовок `X-Error-Code: SCHEMA_OUTDATED`.
3. **`backend/routers/loyalty.py`** — при SQL/AttributeError вызывается `raise SchemaOutdatedError(...)` вместо `return JSONResponse(...)`.
4. В роутере добавлен `except SchemaOutdatedError: raise`, чтобы 409 не перехватывался общим `except Exception` и не превращался в 500.

В итоге 409 идёт по тому же пути, что и остальные ошибки (через exception handling), с плоским JSON и `X-Error-Code`.

---

## Проблемы и исправления

### Проблема 1: 409 формат ответа (вложенный detail)

**Было:**
```json
{
  "detail": {
    "detail": "Loyalty schema outdated, apply migrations",
    "code": "SCHEMA_OUTDATED",
    "hint": "Run alembic upgrade head"
  }
}
```

**Стало:**
```json
{
  "detail": "Loyalty schema outdated, apply migrations",
  "code": "SCHEMA_OUTDATED",
  "hint": "Run alembic upgrade head",
  "debug": { ... }  // только в dev
}
```

---

### Проблема 2: Frontend обработка 409 ([object Object])

**Было:** Сложная логика с проверкой `typeof errorData.detail === 'object'` и вложенным `errorData.detail.detail`

**Стало:** Прямой доступ к полям плоского JSON: `errorData.detail`, `errorData.hint`

---

### Проблема 3: 404 master not found (маскировка пустыми вкладками)

**Было:** 404 обрабатывался как нормальная ситуация, показывались пустые вкладки

**Стало:** Явное сообщение об ошибке с инструкцией что делать

---

### Проблема 4: 409 показывается как error вместо warning

**Было:** Красный error-блок для 409

**Стало:** Жёлтый warning-блок для 409

---

## Конкретные диффы

### Backend: `backend/exceptions.py` (новый файл)

```python
from typing import Any, Dict, Optional

class SchemaOutdatedError(Exception):
    def __init__(self, detail: str = "...", hint: str = "Run alembic upgrade head", debug: Optional[Dict[str, Any]] = None):
        self.detail = detail
        self.hint = hint
        self.debug = debug
        super().__init__(detail)
```

### Backend: `backend/main.py`

- Импорты: `from fastapi.responses import JSONResponse`, `from exceptions import SchemaOutdatedError`.
- Добавлен обработчик:

```python
@app.exception_handler(SchemaOutdatedError)
async def schema_outdated_handler(request, exc: SchemaOutdatedError):
    body = {"detail": exc.detail, "code": "SCHEMA_OUTDATED", "hint": exc.hint}
    if exc.debug is not None:
        body["debug"] = exc.debug
    return JSONResponse(status_code=409, content=body, headers={"X-Error-Code": "SCHEMA_OUTDATED"})
```

### Backend: `backend/routers/loyalty.py`

#### Дифф 1: Импорт + 409 через raise SchemaOutdatedError (SQL-ошибки)

```diff
  from auth import require_master, get_current_active_user
  from routers.accounting import get_master_id_from_user
+ from exceptions import SchemaOutdatedError
  ...
        except (OperationalError, ProgrammingError, DatabaseError) as sql_error:
            ...
            error_info = extract_schema_error_info(sql_error)
-            error_response = {"detail": "...", "code": "SCHEMA_OUTDATED", "hint": "..."}
-            if is_dev_mode():
-                error_response["debug"] = error_info
-            from fastapi.responses import JSONResponse
-            return JSONResponse(status_code=409, content=error_response, headers={"X-Error-Code": "SCHEMA_OUTDATED"})
+            debug = error_info if is_dev_mode() else None
+            raise SchemaOutdatedError(
+                detail="Loyalty schema outdated, apply migrations",
+                hint="Run alembic upgrade head",
+                debug=debug,
+            )
```

#### Дифф 2: 409 через raise SchemaOutdatedError (AttributeError)

```diff
        except AttributeError as attr_error:
            ...
            error_info = extract_schema_error_info(attr_error)
-            error_response = {"detail": "...", "code": "SCHEMA_OUTDATED", "hint": "..."}
-            if is_dev_mode():
-                error_response["debug"] = error_info
-            return JSONResponse(...)
+            debug = error_info if is_dev_mode() else None
+            raise SchemaOutdatedError(detail="...", hint="Run alembic upgrade head", debug=debug)
```

#### Дифф 3: Проброс SchemaOutdatedError (чтобы не превращать в 500)

```diff
    except HTTPException:
        raise
+   except SchemaOutdatedError:
+       raise
    except Exception as e:
        ...
```

---

### Frontend: `frontend/src/components/LoyaltySystem.jsx`

#### Дифф 1: Добавление errorType state (строка 14)

```diff
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
+ const [errorType, setErrorType] = useState('error') // 'error' | 'warning' | 'info'
  const [editingDiscount, setEditingDiscount] = useState(null)
```

#### Дифф 2: Исправление обработки 409 (строки 77-97)

```diff
        } else if (statusResponse.status === 409) {
          // Обработка ошибки схемы БД (SCHEMA_OUTDATED)
          const errorCode = statusResponse.headers.get('X-Error-Code')
          if (errorCode === 'SCHEMA_OUTDATED') {
            const errorData = await statusResponse.json()
-            // Показываем понятное сообщение с инструкцией
-            const errorMessage = typeof errorData.detail === 'object' 
-              ? errorData.detail.detail || errorData.detail
-              : errorData.detail || 'Схема базы данных устарела'
-            const hint = typeof errorData.detail === 'object' && errorData.detail.hint
-              ? errorData.detail.hint
-              : 'Run alembic upgrade head'
+            // Плоский JSON: errorData.detail, errorData.hint напрямую
+            const errorMessage = errorData.detail || 'Схема базы данных устарела'
+            const hint = errorData.hint || 'Run alembic upgrade head'
            setError(`${errorMessage}. ${hint}`)
+            setErrorType('warning') // Warning вместо error для 409
          } else {
            // Другая 409 ошибка
            const errorData = await statusResponse.json()
-            setError(typeof errorData.detail === 'object' 
-              ? errorData.detail.detail || JSON.stringify(errorData.detail)
-              : errorData.detail || 'Ошибка конфликта')
+            const errorMessage = typeof errorData.detail === 'string' 
+              ? errorData.detail 
+              : errorData.detail?.detail || JSON.stringify(errorData.detail) || 'Ошибка конфликта'
+            setError(errorMessage)
+            setErrorType('error')
          }
```

#### Дифф 3: Исправление обработки 404 (строки 98-107)

```diff
-        } else if (statusResponse.status === 404 || statusResponse.status === 403) {
-          // Эндпоинт не реализован или нет доступа - это нормально, просто не загружаем данные
-          setQuickDiscounts([])
-          setComplexDiscounts([])
-          setPersonalDiscounts([])
+        } else if (statusResponse.status === 404) {
+          // Профиль мастера не найден - показываем явное сообщение
+          const errorData = await statusResponse.json().catch(() => ({}))
+          const errorMessage = errorData.detail || 'Профиль мастера не найден'
+          setError(`${errorMessage}. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку.`)
+          setErrorType('error')
+          setQuickDiscounts([])
+          setComplexDiscounts([])
+          setPersonalDiscounts([])
+        } else if (statusResponse.status === 403) {
+          // Нет доступа - это нормально, просто не загружаем данные
+          setQuickDiscounts([])
+          setComplexDiscounts([])
+          setPersonalDiscounts([])
+          setError('')
+          setErrorType('error')
```

#### Дифф 4: Исправление обработки других ошибок (строки 108-115)

```diff
        } else {
          // Другая ошибка
-          const errorData = await statusResponse.json()
-          setError(typeof errorData.detail === 'object' 
-            ? errorData.detail.detail || JSON.stringify(errorData.detail)
-            : errorData.detail || 'Ошибка загрузки данных')
+          const errorData = await statusResponse.json().catch(() => ({}))
+          const errorMessage = typeof errorData.detail === 'string' 
+            ? errorData.detail 
+            : errorData.detail?.detail || JSON.stringify(errorData.detail) || 'Ошибка загрузки данных'
+          setError(errorMessage)
+          setErrorType('error')
        }
```

#### Дифф 5: Обновление отображения ошибки с поддержкой warning (строки 293-299)

```diff
      {error && (
-        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
+        <div className={
+          errorType === 'warning' 
+            ? "bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded"
+            : "bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
+        }>
          {error}
        </div>
      )}
```

#### Дифф 6: Инициализация errorType в loadData (строка 43)

```diff
  const loadData = async () => {
    setLoading(true)
    setError('')
+   setErrorType('error')
```

#### Дифф 7: Очистка error при успехе (строка 76)

```diff
          setQuickDiscounts(statusData.quick_discounts || [])
          setComplexDiscounts(statusData.complex_discounts || [])
          setPersonalDiscounts(statusData.personal_discounts || [])
+         setError('') // Очищаем ошибку при успехе
+         setErrorType('error')
```

---

## Примеры Response

### 1. 409 Conflict (Production)

**Request:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Response:**
```json
{
  "detail": "Loyalty schema outdated, apply migrations",
  "code": "SCHEMA_OUTDATED",
  "hint": "Run alembic upgrade head"
}
```

**Headers:**
```
HTTP/1.1 409 Conflict
X-Error-Code: SCHEMA_OUTDATED
Content-Type: application/json
```

Формируется в `main.py` через `@app.exception_handler(SchemaOutdatedError)` (плоский JSON + `X-Error-Code`). Удобно для фронта и логирования.

**Отображение в UI:**
- Жёлтый warning-блок: `bg-yellow-100 border border-yellow-400 text-yellow-800`
- Текст: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"

---

### 2. 409 Conflict (Development)

**Request:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Response:**
```json
{
  "detail": "Loyalty schema outdated, apply migrations",
  "code": "SCHEMA_OUTDATED",
  "hint": "Run alembic upgrade head",
  "debug": {
    "missing": "master_id",
    "table": "loyalty_discounts",
    "original_error": "OperationalError: no such column: loyalty_discounts.master_id"
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
- Жёлтый warning-блок: `bg-yellow-100 border border-yellow-400 text-yellow-800`
- Текст: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- Debug информация доступна в DevTools Network tab

---

### 3. 404 Not Found (Master не найден)

**Request:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <user_without_master_token>"
```

**Response:**
```json
{
  "detail": "Профиль мастера не найден"
}
```

**Headers:**
```
HTTP/1.1 404 Not Found
Content-Type: application/json
```

**Отображение в UI:**
- Красный error-блок: `bg-red-100 border border-red-400 text-red-700`
- Текст: "Профиль мастера не найден. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку."
- Пустые вкладки (данные не загружены)

---

### 4. 200 OK (Успешный ответ)

**Request:**
```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Response:**
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

**Headers:**
```
HTTP/1.1 200 OK
Content-Type: application/json
```

**Отображение в UI:**
- Нет error/warning блоков
- Данные отображаются во вкладках
- Вкладка "Быстрые скидки": карточка "Новый клиент" с кнопкой "Активна"
- Вкладка "Персональные скидки": скидка для +79991234567

---

## Где отображается в UI

### 1. 409 Conflict (SCHEMA_OUTDATED)

**Компонент:** `LoyaltySystem.jsx`  
**Строки:** 293-299

```jsx
{error && (
  <div className={
    errorType === 'warning' 
      ? "bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded"
      : "bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
  }>
    {error}
  </div>
)}
```

**Визуально:**
- Жёлтый блок с жёлтой рамкой
- Текст: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- Расположение: в верхней части компонента, перед вкладками

---

### 2. 404 Not Found (Master не найден)

**Компонент:** `LoyaltySystem.jsx`  
**Строки:** 293-299

**Визуально:**
- Красный блок с красной рамкой
- Текст: "Профиль мастера не найден. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку."
- Расположение: в верхней части компонента, перед вкладками
- Вкладки: пустые (данные не загружены)

---

### 3. 200 OK (Успешный ответ)

**Компонент:** `LoyaltySystem.jsx`  
**Строки:** 311-347

**Визуально:**
- Нет error/warning блоков
- Вкладки отображают данные:
  - "Быстрые скидки": карточки шаблонов и активные скидки
  - "Сложные скидки": список сложных скидок
  - "Персональные скидки": список персональных скидок

---

## Чек-лист проверки

### ✅ Тест 1: 409 Conflict (Production)

**Шаги:**
1. Установить `ENVIRONMENT=production` в `.env`
2. Убедиться, что миграция не применена
3. Войти как мастер
4. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 409 Conflict
- ✅ Плоский JSON без вложенного detail
- ✅ Жёлтый warning-блок в UI
- ✅ Текст: "Loyalty schema outdated, apply migrations. Run alembic upgrade head"
- ✅ Нет debug информации в response

---

### ✅ Тест 2: 409 Conflict (Development)

**Шаги:**
1. Установить `ENVIRONMENT=development` в `.env`
2. Убедиться, что миграция не применена
3. Войти как мастер
4. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 409 Conflict
- ✅ Плоский JSON с полем debug
- ✅ Жёлтый warning-блок в UI
- ✅ Debug информация доступна в DevTools

---

### ✅ Тест 3: 404 Not Found (Master не найден)

**Шаги:**
1. Войти как пользователь без профиля мастера
2. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 404 Not Found
- ✅ Красный error-блок в UI
- ✅ Текст с инструкцией: "Профиль мастера не найден. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку."
- ✅ Пустые вкладки (данные не загружены)

---

### ✅ Тест 4: 200 OK (Успешный ответ)

**Шаги:**
1. Войти как мастер со скидками
2. Открыть страницу "Система лояльности"

**Ожидаемый результат:**
- ✅ 200 OK
- ✅ Нет error/warning блоков
- ✅ Данные отображаются во вкладках
- ✅ Все вкладки работают корректно

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `backend/exceptions.py` | **Новый.** Класс `SchemaOutdatedError(detail, hint, debug)`. |
| `backend/main.py` | Импорт `exceptions`, `JSONResponse`. `@app.exception_handler(SchemaOutdatedError)` → 409, плоский JSON, `X-Error-Code: SCHEMA_OUTDATED`. |
| `backend/routers/loyalty.py` | Импорт `SchemaOutdatedError`. При SQL/AttributeError — `raise SchemaOutdatedError(...)`. Добавлен `except SchemaOutdatedError: raise`. |
| `frontend/src/components/LoyaltySystem.jsx` | Обработка 409 (плоский `detail`/`hint`), 404 (явное сообщение), `errorType` (warning/error), warning-блок для 409. |
| `LOYALTY_ERROR_HANDLING_FIXES.md` | Отчёт с диффами и примерами. |

---

## Итог

✅ **Все проблемы исправлены**

1. ✅ 409 формат ответа: плоский JSON без вложенного detail (`detail`, `code`, `hint`, `debug` только в dev).
2. ✅ 409 через exception handler: `SchemaOutdatedError` → `@app.exception_handler` в `main.py`. Не обходим общий error-handling; заголовок `X-Error-Code: SCHEMA_OUTDATED` для фронта и логирования.
3. ✅ Frontend обработка 409: корректное извлечение `detail` и `hint`, нет [object Object].
4. ✅ 404 master not found: явное сообщение с инструкцией вместо маскировки пустыми вкладками.
5. ✅ 409 показывается как warning (жёлтый блок) вместо error (красный блок).

✅ **Улучшенный UX**

- Понятные сообщения об ошибках
- Инструкции что делать при ошибках
- Визуальное различие между warning и error
- Нет маскировки ошибок пустыми данными

---

**Автор:** AI Assistant  
**Дата:** 2026-01-21
