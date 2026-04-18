# Финальный отчёт: обработка ошибок лояльности (GET /api/loyalty/status)

**Дата:** 2026-01-21  
**Статус:** ✅ Всё завершено

---

## Краткое содержание

Доработана обработка ошибок для `GET /api/loyalty/status` и экрана «Система лояльности» в веб-приложении: исправлена 500, введён явный 409 при устаревшей схеме БД, явная обработка 404 (профиль мастера не найден), обновлён UI (warning/error, без `[object Object]`). Ответ 409 идёт через общий exception handler, возвращается плоский JSON и заголовок `X-Error-Code: SCHEMA_OUTDATED`.

---

## 1. Что сделано

### 1.1. Исправление 500 и переход на явные коды ошибок

- **Было:** При ошибках схемы БД (нет колонки `master_id`, миграция не применена) или при `AttributeError` эндпоинт мог отдавать 500 либо «тихие» 200 с пустыми массивами.
- **Сделано:**
  - При **устаревшей схеме** (SQL/AttributeError) возвращается **409 Conflict** с плоским JSON и `X-Error-Code: SCHEMA_OUTDATED`.
  - При **отсутствии профиля мастера** — **404** (без маскировки «пустыми вкладками»).
  - **200 с пустыми массивами** — только когда данные реально пустые.
  - Добавлено логирование (`logger.exception` / `logger.warning`) для 409 и 404.

### 1.2. 409 через exception handler (без обхода error-handling)

- **Было:** 409 отдавался через `return JSONResponse(...)` в роутере, что могло обходить общий error-handling.
- **Сделано:**
  - Введено кастомное исключение **`SchemaOutdatedError`** (`backend/exceptions.py`).
  - В **`main.py`** зарегистрирован **`@app.exception_handler(SchemaOutdatedError)`**, который формирует ответ 409 с плоским JSON и заголовком `X-Error-Code: SCHEMA_OUTDATED`.
  - В **`loyalty.py`** при SQL/AttributeError вызывается **`raise SchemaOutdatedError(...)`**.
  - Добавлен **`except SchemaOutdatedError: raise`**, чтобы 409 не перехватывался общим `except Exception` и не превращался в 500.

### 1.3. Формат ответа 409 (плоский JSON)

- **Требование:** Плоский JSON, без вложенного `detail.detail`.
- **Реализация:**
  - Тело ответа: `detail` (строка), `code`, `hint`, при dev — `debug` с `missing`, `table`, `original_error`.
  - Заголовок **`X-Error-Code: SCHEMA_OUTDATED`** для фронта и логирования.

**Пример (production):**
```json
{
  "detail": "Loyalty schema outdated, apply migrations",
  "code": "SCHEMA_OUTDATED",
  "hint": "Run alembic upgrade head"
}
```

**Пример (development, с debug):**
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

**Headers:** `HTTP/1.1 409 Conflict`, `X-Error-Code: SCHEMA_OUTDATED`, `Content-Type: application/json`.

### 1.4. Обработка типичных ошибок схемы (SQLAlchemy)

- Ловятся **`OperationalError`**, **`ProgrammingError`**, **`DatabaseError`**, **`AttributeError`** при запросах к скидкам.
- Для извлечения `missing` / `table` используется **`extract_schema_error_info()`** с поддержкой SQLite, PostgreSQL, MySQL.

### 1.5. Frontend (`LoyaltySystem.jsx`)

- **409 и `X-Error-Code: SCHEMA_OUTDATED`:**
  - Берутся **`detail`** и **`hint`** из плоского JSON.
  - Показывается **warning-блок** (жёлтый), текст вида: `Loyalty schema outdated, apply migrations. Run alembic upgrade head`.
  - Нет `[object Object]`, нет лишнего вывода в console.
- **404 (профиль мастера не найден):**
  - **Явное сообщение** вместо «пустых вкладок»:  
    `Профиль мастера не найден. Пожалуйста, перелогиньтесь или создайте профиль мастера. Если проблема сохраняется, обратитесь в поддержку.`
  - **error-блок** (красный).
- **200:** Очистка ошибки, отображение данных во вкладках.
- **Другие ошибки:** Безопасное извлечение `detail` (в т.ч. для вложенных структур), без `[object Object]`.
- Введён **`errorType`** (`'error' | 'warning'`); для 409 — `warning`, для 404 и остальных — `error`.

### 1.6. Вспомогательные функции в backend

- **`is_dev_mode()`** — по `ENVIRONMENT` решает, отдавать ли `debug` в 409.
- **`extract_schema_error_info(exc)`** — возвращает `{ missing, table, original_error }` для логов и `debug`.
- **`get_loyalty_filter(master_id, db, model_class)`** — фильтр по `master_id` с учётом legacy `salon_id`; при ошибках — fallback и логирование.

---

## 2. Изменённые и добавленные файлы

| Файл | Изменения |
|------|-----------|
| **`backend/exceptions.py`** | **Новый.** Класс `SchemaOutdatedError(detail, hint, debug)`. |
| **`backend/main.py`** | Импорты `JSONResponse`, `SchemaOutdatedError`. Регистрация `@app.exception_handler(SchemaOutdatedError)` → 409, плоский JSON, `X-Error-Code: SCHEMA_OUTDATED`. |
| **`backend/routers/loyalty.py`** | Импорт `SchemaOutdatedError`. Обработка SQL/AttributeError → `raise SchemaOutdatedError(...)`. `except SchemaOutdatedError: raise`. Логирование, `get_loyalty_filter`, `extract_schema_error_info`, `is_dev_mode`. |
| **`frontend/src/components/LoyaltySystem.jsx`** | Обработка 409 (плоский `detail`/`hint`, `X-Error-Code`), 404 (явное сообщение), `errorType`, warning/error блоки. `setErrorType` в `loadData` и во всех ветках обработки ошибок. |
| **`LOYALTY_ERROR_HANDLING_FIXES.md`** | Отчёт с диффами и примерами ответов. |
| **`docs/LOYALTY_ERROR_HANDLING_OTCHET_FINAL.md`** | Данный финальный отчёт. |

---

## 3. Примеры ответов API

| Код | Ситуация | Пример body | Заголовки |
|-----|----------|-------------|-----------|
| **200** | Успех, есть/нет скидок | `{ "quick_discounts": [...], "complex_discounts": [...], "personal_discounts": [...], "total_discounts": N, "active_discounts": M }` | — |
| **404** | Профиль мастера не найден | `{ "detail": "Профиль мастера не найден" }` | — |
| **409** | Схема БД устарела | См. примеры выше (плоский JSON, при dev — `debug`) | `X-Error-Code: SCHEMA_OUTDATED` |
| **500** | Неожиданная ошибка | `{ "detail": "Internal server error: ..." }` | — |

---

## 4. Где что отображается в UI

- **409 (SCHEMA_OUTDATED):** жёлтый warning-блок над вкладками, текст `detail` + `hint`.
- **404 (master not found):** красный error-блок над вкладками, текст с инструкцией (перелогин / создать профиль / поддержка).
- **200:** блоков ошибки нет, данные во вкладках «Быстрые / Сложные / Персональные скидки».
- **Другие ошибки:** красный error-блок, `detail` или общее сообщение.

---

## 5. Чек-лист проверки

- [ ] **200:** мастер со скидками → данные во вкладках, нет ошибок.
- [ ] **200:** мастер без скидок → пустые списки, нет ошибок.
- [ ] **404:** пользователь без профиля мастера → красный блок с текстом про перелогин/профиль/поддержку.
- [ ] **409 (production):** миграция не применена → 409, плоский JSON без `debug`, `X-Error-Code: SCHEMA_OUTDATED`, жёлтый блок с `detail` и `hint`.
- [ ] **409 (development):** то же + `debug` в body, в логах — traceback.
- [ ] Нет `[object Object]` в UI, нет лишнего спама в console.

---

## 6. Как проверить

### 6.1. Запуск backend и frontend

```bash
# Терминал 1 — backend
cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Терминал 2 — frontend (Vite)
cd frontend && npm run dev
```

Откройте веб-приложение (например, `http://localhost:5173`), войдите как **мастер** и перейдите в раздел «Система лояльности» (из дашборда мастера).

### 6.2. Получить токен мастера

Через UI: войти → скопировать токен из DevTools (Application → Local Storage или Network → запрос с `Authorization`).  
Либо через API:

```bash
curl -s -X POST "http://localhost:8000/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=MASTER_EMAIL&password=MASTER_PASSWORD" | jq -r '.access_token'
```

Подставьте реальные `MASTER_EMAIL` и `MASTER_PASSWORD`. В ответе будет `access_token`. Далее используйте его как `TOKEN` в командах ниже.

### 6.3. Проверка 200 OK

```bash
export TOKEN="<ваш_access_token>"

curl -s -w "\nHTTP %{http_code}\n" -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer $TOKEN"
```

Ожидается **HTTP 200**, в body — JSON с `quick_discounts`, `complex_discounts`, `personal_discounts`, `total_discounts`, `active_discounts`. В UI — данные во вкладках, без ошибок.

### 6.4. Проверка 409 (схема устарела)

**Вариант A:** Временно откатить миграцию (если есть откат) или использовать БД без колонки `master_id` в `loyalty_discounts` / `personal_discounts`. Затем:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer $TOKEN" \
  -D - -o /tmp/409.txt
cat /tmp/409.txt
```

Ожидается **HTTP 409**, заголовок **`X-Error-Code: SCHEMA_OUTDATED`**, в body — плоский JSON `detail`, `code`, `hint`; в dev — также `debug`. В UI — жёлтый warning-блок с текстом «Loyalty schema outdated... Run alembic upgrade head».

**Вариант B:** Применена миграция — 409 не воспроизвести. Проверку 409 можно сделать на тестовой копии БД без миграции.

### 6.5. Проверка 404 (профиль мастера не найден)

Войти под пользователем **без** профиля мастера (или использовать токен такого пользователя), затем:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer $TOKEN"
```

Ожидается **HTTP 404**, в body — `{"detail": "Профиль мастера не найден"}` (или аналог). В UI — красный error-блок с инструкцией (перелогин / создать профиль / поддержка).

### 6.6. Проверка UI

1. **200:** Мастер со скидками → вкладки «Быстрые / Сложные / Персональные скидки» заполнены. Мастер без скидок → пустые списки. Ошибок нет.
2. **404:** Пользователь без мастера → красный блок с текстом про перелогин/профиль/поддержку.
3. **409:** Устаревшая схема → жёлтый блок «Loyalty schema outdated... Run alembic upgrade head».
4. Убедиться, что нигде не появляется `[object Object]` и нет лишнего спама в console.

---

## 7. Следующие шаги

- **Ручная проверка:** Пройти чек-лист из раздела 5 и шаги из раздела 6.
- **Автотесты:** При необходимости добавить pytest на `GET /api/loyalty/status` (200, 404, 409 при замоканной БД/схеме).
- **Мобильное приложение:** Использовать текущую логику и форматы ответов (409, 404, `X-Error-Code`, плоский JSON) при переносе экрана лояльности в React Native.

---

## 8. Итог

Реализовано:

1. Исправление 500 и отказ от «тихих» 200 при сломанной схеме.
2. 409 через **exception handler** (`SchemaOutdatedError`), без обхода общего error-handling.
3. Плоский JSON для 409: `detail`, `code`, `hint`, `debug` (только в dev).
4. Заголовок **`X-Error-Code: SCHEMA_OUTDATED`** для фронта и логирования.
5. Явная обработка 404 (профиль мастера не найден) с понятной инструкцией.
6. Корректный UI: warning для 409, error для 404 и остальных, без `[object Object]`.
7. Учёт типичных ошибок схемы SQLAlchemy и извлечение debug-информации.

Всё перечисленное реализовано и отражено в коде и отчётах. Разделы 6–7 содержат пошаговую проверку и возможные следующие шаги.
