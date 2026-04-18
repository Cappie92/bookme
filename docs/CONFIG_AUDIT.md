# Аудит конфигурации backend (env vars)

**Дата:** 2025-02  
**Область:** `backend/` (FastAPI).  
**Единый источник правды:** `backend/settings.py` (pydantic-settings). Код приложения читает конфиг через `get_settings()`. Исключения: `alembic/env.py` (DATABASE_URL из env), скрипты в `scripts/` и утилиты типа `create_test_token.py` (getenv для автономного запуска).

---

## 1. Инвентарь: таблица переменных окружения

| name | где используется (файл:строка) | тип | дефолт | обязательность | область | чувствительность | статус | комментарий/рекомендация |
|------|------------------------------|-----|--------|----------------|---------|------------------|--------|---------------------------|
| **JWT_SECRET_KEY** | settings.py; auth.py (через settings); scripts/smoke_test_bookings_auth.py:17; create_test_token.py:11 | str | в settings: dev-дефолт; в prod — без дефолта | required в prod, optional в dev | auth | secret | used | В prod валидатор в settings запрещает дефолт. Скрипты — свой getenv. |
| **DATABASE_URL** | settings.py (model_validator); database.py через get_settings(); alembic/env.py:36 | str (url) | sqlite:///{BASE_DIR}/bookme.db | optional | db | secret если с паролем | used | Alembic читает из env напрямую. |
| **ENVIRONMENT** | settings.py; main, dev_testdata, payments, loyalty через get_settings(); scripts/reset_admin_password_dev.py:19 | str | development | optional | cors, logging, dev routes | non-secret | used | Определяет is_development / is_production. |
| **ACCESS_TOKEN_EXPIRE_DAYS** | settings.py; auth через get_settings() | int | 7 | optional | auth | non-secret | used | |
| **REFRESH_TOKEN_EXPIRE_DAYS** | settings.py; auth через get_settings() | int | 30 | optional | auth | non-secret | used | |
| **ENABLE_DEV_TESTDATA** | settings.py; main, dev_testdata через get_settings() | bool (1/0, true/false) | "" → false | optional | dev routes | non-secret | used | Только при ENVIRONMENT=development. |
| **DEV_E2E** | settings.py; main, dev_e2e через get_settings() | bool | "" → false | optional | dev routes | non-secret | used | |
| **SALONS_ENABLED** | settings.py; routers/client через get_settings().salons_enabled_env | bool | "" → false | optional | feature flags | non-secret | used | Fallback, если в БД нет enableSalonFeatures. |
| **LEGACY_INDIE_MODE** | settings.py; utils/master_canon (при env=None); client, bookings, master, dev_testdata | bool | 0 | optional | business | non-secret | used | 0=master-only, 1=legacy indie. |
| **MASTER_CANON_MODE** | utils/master_canon.py (только при переданном dict env в тестах/скриптах; не читается из os.environ в runtime) | bool | — | — | legacy | non-secret | legacy | Deprecated. Использовать LEGACY_INDIE_MODE. В settings не вынесен; в шаблонах не указывать. |
| **MASTER_CANON_DEBUG** | settings.py; utils/master_canon через get_settings() | bool | 0 | optional | logging/debug | non-secret | used | |
| **TZ** | settings.py; routers/master через get_settings() | str | "" | optional | scheduling | non-secret | used | |
| **DEBUG_FUTURE_BOOKING_ID** | settings.py; routers/master через get_settings() | str | — | optional | debug | non-secret | used | |
| **SUBSCRIPTION_FEATURES_DEBUG** | settings.py; routers/master, subscriptions через get_settings() | bool | "" | optional | logging | non-secret | used | |
| **SUBSCRIPTION_DAYS_DEBUG** | settings.py; routers/subscriptions через get_settings() | bool | "" | optional | logging | non-secret | used | |
| **SUBSCRIPTION_CALC_DEBUG** | settings.py; routers/subscriptions через get_settings() | bool | "" | optional | logging | non-secret | used | |
| **SUBSCRIPTION_PAYMENT_DEBUG** | settings.py; routers/payments, subscriptions через get_settings() | bool | "" | optional | logging | non-secret | used | |
| **PAYMENT_URL_DEBUG** | settings.py; routers/payments через get_settings() | bool | "" | optional | logging | non-secret | used | |
| **DAILY_CHARGE_DEBUG** | settings.py; utils/balance_utils через get_settings() | bool | "" | optional | logging | non-secret | used | |
| **FRONTEND_URL** | settings.py; services/email_service через get_settings() | str (url) | http://localhost:5175 | optional | email links | non-secret | used | |
| **API_BASE_URL** | settings.py; routers/payments, utils/robokassa через get_settings() | str (url) | http://localhost:8000 | optional | payments | non-secret | used | |
| **ROBOKASSA_MODE** | settings.py; payments, robokassa через get_settings() | str | "" | optional | payments | non-secret | used | stub = тестовый режим. |
| **ROBOKASSA_MERCHANT_LOGIN** | settings.py; utils/robokassa через get_robokassa_config() | str | "" | required если не stub | payments | non-secret | used | |
| **ROBOKASSA_PASSWORD_1** | settings.py; utils/robokassa | str | "" | required если не stub | payments | secret | used | Не хранить в репо. |
| **ROBOKASSA_PASSWORD_2** | settings.py; utils/robokassa | str | "" | required если не stub | payments | secret | used | Не хранить в репо. |
| **ROBOKASSA_IS_TEST** | settings.py; utils/robokassa | bool | true | optional | payments | non-secret | used | |
| **ROBOKASSA_RESULT_URL** | settings.py; utils/robokassa | str (url) | "" | required если не stub | payments | non-secret | used | |
| **ROBOKASSA_SUCCESS_URL** | settings.py; utils/robokassa | str (url) | "" | required если не stub | payments | non-secret | used | |
| **ROBOKASSA_FAIL_URL** | settings.py; utils/robokassa | str (url) | "" | required если не stub | payments | non-secret | used | |
| **ZVONOK_API_KEY** | settings.py; services/zvonok_service через get_settings() | str | "" | optional (при stub не нужен) | telephony | secret | used | |
| **ZVONOK_MODE** | settings.py; services/zvonok_service | str | "" | optional | telephony | non-secret | used | stub = без реальных звонков. |
| **PLUSOFON_USER_ID** | settings.py; services/plusofon_service | str | "" | optional | telephony | non-secret | used | В коде fallback "3545" если пусто. |
| **PLUSOFON_ACCESS_TOKEN** | settings.py; services/plusofon_service | str | "" | required если не stub | telephony | secret | used | Дефолта в коде нет. |
| **PLUSOFON_MODE** | settings.py; services/plusofon_service | str | "" | optional | telephony | non-secret | used | |
| **REDIS_HOST** | settings.py; sms.py через get_settings() | str | localhost | optional | storage (SMS) | non-secret | used | |
| **REDIS_PORT** | settings.py; sms.py через get_settings().redis_port_int | str→int | 6379 | optional | storage | non-secret | used | |
| **BASE_URL** | scripts/verify_master_canon.py:16 | str (url) | http://localhost:8000 | optional | scripts | non-secret | used | Только скрипты. Не для uvicorn. |
| **TOKEN** | scripts/verify_master_canon.py:17 | str | "" | optional | scripts | secret | used | JWT для скрипта. Не в репо. |
| **SALON_ROLE_ENABLED** | settings.py (legacy alias к SALONS_ENABLED) | str | "" | optional | feature flags | non-secret | legacy | Deprecated. Поддержка до ближайшего major / оговорённого дедлайна. Канон: SALONS_ENABLED. В шаблонах не указывать; при использовании — один WARNING при старте. |

---

## 2. Выводы

- **Единый модуль:** конфигурация приложения загружается из `backend/settings.py` (pydantic-settings). В приложении (routers, services, main, auth, database, utils) используется только `get_settings()`. Исключения: `alembic/env.py` (DATABASE_URL), скрипты в `scripts/`, `create_test_token.py` — осознанно через getenv для автономного запуска.
- **Секреты в prod:** при `ENVIRONMENT=production`: (1) JWT_SECRET_KEY обязателен и не дефолтный; (2) при включённой фиче (режим задан и не stub) обязательны соответствующие секреты: Robokassa (MERCHANT_LOGIN, PASSWORD_1, PASSWORD_2), Zvonok (ZVONOK_API_KEY), Plusofon (PLUSOFON_USER_ID, PLUSOFON_ACCESS_TOKEN). Иначе старт падает с понятной ошибкой.
- **Legacy:** `MASTER_CANON_MODE` не в settings; в runtime из `os.environ` не читается. В `utils/master_canon.py` допускается только чтение из переданного dict env (тесты/скрипты). В шаблонах не указывать.
- **SALON_ROLE_ENABLED:** legacy alias к SALONS_ENABLED (fallback в settings, если SALONS_ENABLED пустой); при использовании — один WARNING при старте. Срок поддержки: до ближайшего major релиза или оговорённого дедлайна. В шаблонах не указывать; только SALONS_ENABLED.
- **Alembic:** DATABASE_URL читается в env.py из env; дублировать в settings для alembic не обязательно.
- **Логи:** при старте вызывается `get_settings().log_safe_summary()` — в лог попадают только несекретные поля (ENVIRONMENT, тип БД, режимы, флаги); значения секретов не выводятся.

---

## 3. Минимальный набор для локального старта

```env
JWT_SECRET_KEY=your-super-secret-key
DATABASE_URL=sqlite:///./bookme.db
```

Опционально: `ENVIRONMENT=development`, `ROBOKASSA_MODE=stub`. Остальное имеет разумные дефолты в settings.

---

## 4. Минимальный набор для production

- **Обязательные (строго):** `ENVIRONMENT=production`, `JWT_SECRET_KEY` (сильный секрет из vault), `DATABASE_URL` (postgres из секретов; в prod не использовать дефолтный sqlite).
- **Платежи (если режим задан и не stub):** ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1, ROBOKASSA_PASSWORD_2 (и при необходимости URL). При старте в prod валидатор проверяет наличие.
- **Телефония:** при ZVONOK_MODE ≠ stub — ZVONOK_API_KEY; при PLUSOFON_MODE ≠ stub — PLUSOFON_USER_ID, PLUSOFON_ACCESS_TOKEN.
- **Письма:** FRONTEND_URL, API_BASE_URL для ссылок в письмах.
- Секреты не коммитить в .env; брать из vault/secrets.

---

## 5. Финальная проверка (Runbook)

**Основные команды (Runbook):**  
(1) Запуск backend: `cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`  
(2) Health: `curl -i http://localhost:8000/health` → HTTP 200 и тело `{"status":"healthy","service":"DeDato API"}` (допускается пробел после двоеточий).  
(3) Авто-проверка конфига (из корня репо): `make config-runbook` или `./backend/scripts/runbook_config_check.sh` → ожидание: РОВНО 3 проверки PASS и exit 0.

**Автоматически (из корня репо):** `make config-runbook` или `./backend/scripts/runbook_config_check.sh` — проверяет пункты 3–5 без подхвата локального .env.

1. **Dev: запуск backend**  
   `cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`  
   Минимальный env: `JWT_SECRET_KEY`, `DATABASE_URL` (или `cp backend/.env.example backend/.env`).

2. **Dev: health**  
   `curl -i http://localhost:8000/health` → HTTP 200 и тело `{"status":"healthy","service":"DeDato API"}` (допускается пробел после двоеточий).

3. **Prod: без JWT или с дефолтным JWT — не стартует**  
   Выполнять из корня репо (чтобы не подхватить `backend/.env`). Команда:  
   `ENVIRONMENT=production JWT_SECRET_KEY=your-secret-key-here-change-in-production python3 -c "import sys; sys.path.insert(0,'backend'); from settings import get_settings; get_settings()"`  
   Ожидаем: `ValidationError` про JWT_SECRET_KEY.

4. **Prod: при включённых не-stub фичах без секретов — не стартует**  
   Из корня репо:  
   `ENVIRONMENT=production JWT_SECRET_KEY=strong-secret ROBOKASSA_MODE=test python3 -c "import sys; sys.path.insert(0,'backend'); from settings import get_settings; get_settings()"`  
   Ожидаем: `ValidationError` с перечислением ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1, ROBOKASSA_PASSWORD_2.

5. **Dev: stub-режимы — стартует**  
   `ENVIRONMENT=development`, `ROBOKASSA_MODE=stub`, без robokassa/telephony секретов → приложение стартует; в логах safe summary (без секретов) через `get_settings().log_safe_summary()`.

**Definition of Done (конфиг-аудит):** конфиг-аудит считается завершенным, если команды (1)–(3) выполнены без ошибок; /health вернул тело `{"status":"healthy","service":"DeDato API"}`; make config-runbook дал ровно 3 PASS и exit 0.
