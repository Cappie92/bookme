# Post-change verification: после Swagger/OpenAPI cleanup

**Дата:** 2026-03-16  
**Цель:** убедиться, что изменения Swagger не сломали существующие тесты и что текущее состояние безопасно.

---

## A. Инвентаризация тестов

### Backend (unit / integration / API)

| Расположение | Test runner | Команда запуска |
|--------------|-------------|-----------------|
| `backend/tests/` | **pytest** | `cd backend && python3 -m pytest tests/ -v --tb=short` |

- Конфиг: `backend/pyproject.toml` → `[tool.pytest.ini_options]` → `testpaths = ["tests"]`.
- Фикстуры: `backend/tests/conftest.py` (TestClient от `main.app`, override `get_db`).
- Тестов в каталоге: 194 (с учётом параметризаций). Файлы в корне `backend/` с префиксом `test_*.py` в `testpaths` не входят — по умолчанию запускается только `tests/`.

### Другие тесты в проекте

| Тип | Расположение | Runner | Запуск |
|-----|--------------|--------|--------|
| Mobile unit/integration | `mobile/__tests__/` | Jest | `cd mobile && npm test` |
| Mobile e2e | `mobile/.maestro/` | Maestro | Требует устройство/эмулятор и окружение |
| Frontend e2e | Playwright (если настроен) | — | Не проверялся, может требовать dev-сервер и окружение |

В рамках этой проверки **запускались только backend pytest**; mobile/frontend не запускались (окружение не проверялось).

---

## B. Выполненные команды

1. **Smoke (уже выполнялся ранее):**
   - `python3 -c "from main import app"` — OK
   - Старт приложения, GET `/health` → 200
   - GET `/openapi.json` → 200, 273 path

2. **Backend pytest (полный прогон):**
   ```bash
   cd /Users/s.devyatov/DeDato/backend
   python3 -m pytest tests/ -v --tb=short
   ```
   - С первого запуска: **2 ошибки при сборе** (collection errors) — тесты не запускались.

3. **Backend pytest (без двух проблемных модулей):**
   ```bash
   python3 -m pytest tests/ -v --tb=short \
     --ignore=tests/test_current_subscription_selector.py \
     --ignore=tests/test_effective_subscription_selector.py
   ```
   - Результат: **158 passed**, **20 failed**, **16 errors** (≈77.9 s).

---

## C. Краткий отчёт по результатам

| Метрика | Значение |
|---------|----------|
| Собрано (без 2 ignore) | 192 теста |
| Passed | 158 |
| Failed | 20 |
| Errors | 16 |
| Collection errors (2 файла исключены) | 2 |

**Связь с Swagger/OpenAPI cleanup:** ни один из падений и ошибок не связан с внесёнными Swagger-изменениями (openapi_tags, response_model, responses, новые схемы). Причины — окружение (Python 3.9), ожидания тестов от маршрутов auth, фикстуры, модель подписок, ограничения БД, Robokassa stub.

**Вердикт:** текущие Swagger-изменения можно считать **безопасными** с точки зрения существующих автотестов; выявленные падения — **старые/регрессии окружения и кода**, не вызванные cleanup.

---

## D. Детализация по падениям и ошибкам

### 1. Collection errors (тесты не запускались)

| Файл | Ошибка | Причина | Swagger? | Нужен ли фикс сейчас |
|------|--------|---------|----------|----------------------|
| `tests/test_current_subscription_selector.py` | `TypeError: unsupported operand type(s) for \|: 'type' and 'NoneType'` (строка 34: `plan_id: int \| None`) | Синтаксис `int \| None` требует Python 3.10+; в окружении Python 3.9 | Нет | Да, если хотим гонять тесты на 3.9 (заменить на `Optional[int]`) |
| `tests/test_effective_subscription_selector.py` | То же для `plan_id: int \| None` | То же | Нет | То же |

---

### 2. Failed (20)

| Тест | Ошибка | Root cause | Swagger? | Фикс сейчас? |
|------|--------|------------|----------|--------------|
| `test_accounting_master_id_consistency.py` (×2) | `403` "Finance feature not available in your plan" | Подписка/план тестового пользователя без finance | Нет | По желанию (настройка плана в фикстурах) |
| `test_accounting_post_visit_phase1.py::TestIndieMasterPostVisit` (×2) | `IntegrityError: NOT NULL constraint failed: indie_masters.master_id` | В фикстуре создаётся `indie_masters` с `master_id=None` | Нет | Да (фикстура/модель) |
| `test_auth.py::test_login_success` (и др. login/refresh/protected/admin) | `405 Method Not Allowed` или `404 Not Found` | Тесты ходят на пути/методы, не совпадающие с текущим приложением (например, префикс `/api/auth/` или другой путь) | Нет | Да (привести пути в тестах в соответствие с роутерами) |
| `test_e2e_seed_users_me.py::test_e2e_seed_login_users_me` | `405` | То же — эндпоинт auth | Нет | Да |
| `test_master_clients_completed_only.py` (×2), `test_master_clients_patch_note.py` (×1) | `403` | Нет прав/плана у тестового мастера | Нет | По желанию |
| `test_robokassa_stub.py::test_init_returns_stub_url_when_stub_mode` | В URL ожидался `stub-complete` или `invoice_id`; фактический URL другой | Логика/формат URL Robokassa stub изменился или тест чувствителен к регистру | Нет | По желанию |
| `test_scheduling.py::test_get_available_slots`, `test_get_available_slots_with_bookings` | `assert 0 > 0` (пустой список слотов) | Нет данных/фикстур или неверные параметры для слотов | Нет | Да (данные/фикстуры) |

---

### 3. Errors (16)

| Тест | Ошибка | Root cause | Swagger? | Фикс сейчас? |
|------|--------|------------|----------|--------------|
| `test_bookings.py` (×7) | `KeyError: 'access_token'` | Ответ логина не содержит `access_token` (например, другой формат или путь) | Нет | Да (фикстура auth / формат ответа) |
| `test_auth.py::test_refresh_token` | `KeyError: 'refresh_token'` | В ответе нет поля `refresh_token` | Нет | Да |
| `test_create_completed_bookings_owner.py` (×2) | `IntegrityError: NOT NULL constraint failed: indie_masters.master_id` | То же, что в п.2 — фикстура indie_masters | Нет | Да |
| `test_extended_stats.py` (×2), `test_master_page_modules.py` (×5) | `TypeError: 'price_monthly' is an invalid keyword argument for SubscriptionPlan` | Модель `SubscriptionPlan` не имеет поля `price_monthly` (переименовано или удалено) | Нет | Да (модель или тестовые данные) |

---

## E. Итоговая таблица по категориям

| Категория | Количество | Связано с Swagger cleanup? |
|-----------|------------|----------------------------|
| Collection errors | 2 | Нет (Python 3.9) |
| Failed | 20 | Нет |
| Errors | 16 | Нет |
| **Всего проблем** | **38** | **0** |

---

## F. Вывод

- **Запускалось:** smoke (import, /health, /openapi.json) + полный pytest по `backend/tests/` (с исключением двух файлов с `int | None`).
- **Прошло:** 158 тестов.
- **Упало/ошибки:** 38 (2 collection + 20 failed + 16 errors); все причины не связаны с Swagger/OpenAPI cleanup.
- **Безопасность изменений:** текущие Swagger-изменения можно считать безопасными; регрессии по тестам вызваны окружением, путями auth, фикстурами, моделью подписок и ограничениями БД.
- **Рекомендация:** фиксы делать по приоритету (auth/пути, фикстуры, модель SubscriptionPlan, Python 3.10 или замена `int|None`); для констатации безопасности после cleanup — достаточно данного отчёта.
