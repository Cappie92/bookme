# Отчёт: Swagger/OpenAPI и состояние системы DeDato (для ревью ChatGPT)

**Дата:** 2026-03  
**Область:** backend (FastAPI), конфиг-документы, web/mobile интеграция.

---

## A. Executive summary

- **OpenAPI:** Приложение экспортирует `/openapi.json`, `/docs` (Swagger UI), `/redoc`. В `main.py` заданы только `title`, `description`, `version`; кастомных тегов на уровне приложения нет — теги задаются в роутерах. Всего **273 path** в OpenAPI.
- **Swagger:** Многие эндпоинты не имеют `response_model`; часть возвращает `dict`/сырой JSON вместо Pydantic-схем; описание 4xx/5xx часто отсутствует; единого перечня тегов в корне нет (теги разбросаны по роутерам).
- **Конфиг-документы:** Соответствуют коду (settings, prod-валидация, legacy). Исключение: fallback `PLUSOFON_USER_ID = "3545"` в `plusofon_service.py` активен при пустом env; в prod при non-stub режиме валидатор требует переменную, поэтому fallback в prod не срабатывает — но в доках это можно явно оговорить.
- **Система:** Backend — модульная (routers, services, auth, payments, telephony, subscriptions). Web использует относительные пути и префиксы `/api/master/`, `/api/loyalty/` для auth. Mobile дергает те же пути; public booking — `/api/public/masters/{slug}/bookings`. Техдолг: множество эндпоинтов без типизированного ответа, возврат dict в нескольких роутерах.

---

## B. Swagger improvements done / proposed

### Изменения в рамках этого прохода

**В рамках этого прохода изменений в Swagger/OpenAPI не вносилось.** Ниже — предложения по улучшению на основе аудита.

### Файлы, относящиеся к OpenAPI/Swagger

| Место | Файл | Роль |
|-------|------|------|
| App | `backend/main.py` | FastAPI(title, description, version, docs_url, redoc_url, openapi_url); подключение роутеров; глобальный exception_handler для SchemaOutdatedError (409). |
| Роутеры | `backend/routers/*.py` (30 файлов) | APIRouter(prefix=..., tags=...); эндпоинты с/без summary, description, response_model, status_code, dependencies. |
| Схемы | `backend/schemas.py` | Pydantic-модели для request/response; используются в response_model и в типах. |
| Зависимости/авторизация | `backend/auth.py` | get_current_user, get_current_active_user, require_salon, require_admin и др.; OAuth2PasswordBearer(tokenUrl="auth/login"); влияют на OpenAPI через dependencies. |
| Исключения | `backend/exceptions.py` | SchemaOutdatedError; обрабатывается в main.py (409, X-Error-Code). |

### Предлагаемые улучшения (без внесённых правок)

1. **main.py**  
   - **Было/есть:** Нет `openapi_tags` — в OpenAPI корневые `tags: []`.  
   - **Предложение:** Задать `openapi_tags` в FastAPI() с перечнем групп (auth, bookings, master, client, admin, payments, loyalty, …) и описаниями.  
   - **Зачем:** Упорядоченная группировка в Swagger UI.

2. **Роутеры без response_model (см. раздел C)**  
   - Для эндпоинтов, возвращающих структурированный JSON, добавить `response_model` с Pydantic-схемой (или `response_model=None` и явные `responses={400: ..., 500: ...}`).  
   - Зачем: предсказуемая схема ответа в OpenAPI и клиентах.

3. **Эндпоинты с возвратом dict**  
   - Заменить возврат `return {"key": value}` на типизированные схемы из `schemas.py` и указать их в `response_model`.  
   - Зачем: единообразие и валидация ответа.

4. **Auth в OpenAPI**  
   - В `auth.py` уже используется `OAuth2PasswordBearer(tokenUrl="auth/login")` — в Swagger отображается замок и возможность передать token.  
   - У части роутеров зависимость только `Depends(get_current_user)` без явного `responses={401: ...}`. Предложение: на уровне роутера или в FastAPI задать общий `responses={401: {"description": "Unauthorized"}}` для защищённых роутеров.

---

## C. Swagger problems still open

### 1. Эндпоинты без response_model

(Выборка по grep по `@router.(get|post|...)` и отсутствию `response_model` в той же строке/декораторе.)

- **tax_rates.py:** `GET /`, `GET /current`, `POST /` — возвращают dict, response_model не задан.
- **domain.py:** `GET /{subdomain}/info` и др. — возвращают dict, в OpenAPI будет произвольный object.
- **blog.py:** `GET /posts`, `GET /posts/{slug}`, `GET /posts/{slug}/navigation`, `GET /posts/{slug}/related`, `GET /tags`, `GET /posts/{slug}/meta` — без response_model.
- **admin.py:** множество: `POST /payments/{payment_id}/retry-subscription-apply`, `GET /users`, `GET /users/{user_id}`, `PUT /users/{user_id}`, `DELETE /users/{user_id}`, `GET /stats`, `GET /blog/tags`, `GET /services`, `PUT /services/{service_id}/type`, `POST /services/check-access`, `GET /always-free-logs`, `GET /always-free-stats`, `POST /promo-codes`, `GET /promo-codes`, и др. — часть с response_model, часть без.
- **bookings.py:** `POST /public`, `GET /available-slots` (List[dict]), `GET /available-slots-repeat`, `GET /available-slots-any-master`, `POST /verify-phone-cjm`, `POST /create-with-any-master` — без типизированного response_model или с dict.
- **master.py:** `GET /bookings/detailed`, `GET /past-appointments`, `GET /schedule/rules`, `POST /schedule/rules`, `GET /settings`, `GET /subscription/features`, `GET /service-functions`, `GET /bookings/limit`, `POST /invitations/{invitation_id}/respond`, `GET /salon-work`, `GET /salon-work/schedule`, `PUT /salon-work/schedule`, `POST /restrictions/check`, `GET /dashboard/stats`, `GET /stats/extended`, и др.
- **client_loyalty.py:** `GET /points/{master_id}/available`, `GET /master/{master_id}/loyalty-settings` — без response_model.
- **public_master.py:** `POST /{slug}/bookings`, `GET /{slug}/client-note`, `GET /{slug}/eligibility` — без response_model.
- **payments.py:** `GET /robokassa/stub-complete`, `POST /robokassa/result`, `POST /{payment_id}/activate-subscription` — без response_model.
- **balance.py:** `POST /deposit`, `GET /low-balance-warning`, `POST /test-daily-charge` — без response_model.
- **subscriptions.py:** `PUT /{subscription_id}/activate`, `DELETE /{subscription_id}`, `GET /reserved-balance`, `DELETE /calculate/{calculation_id}`, `POST /apply-upgrade-free` — без response_model.
- **auth.py:** `POST /change-password`, `POST /set-password`, `POST /verify-password`, `DELETE /delete-account`, `POST /confirm-delete-account`, `GET /zvonok/balance` — без response_model.
- **moderator.py:** `DELETE /{moderator_id}` — без response_model.
- **salon.py:** множество GET/POST/PUT/DELETE без response_model (например `GET /masters`, `POST /masters/invite`, `GET /branches/{branch_id}/working-hours`, `GET /dashboard/stats`, и др.).
- **loyalty.py:** `GET /applicable-discounts`, `GET /check-discount/{client_phone}` — без response_model.
- **dev_testdata.py**, **dev_e2e.py:** все эндпоинты без response_model (допустимо для dev).
- **yandex_geocoder.py**, **address_extraction.py:** возвращают dict, response_model не задан.

### 2. Эндпоинты без summary/description

- У многих эндпоинтов есть только docstring (он попадает в description в OpenAPI), но нет краткого `summary=`. В auth.py у части эндпоинтов задан `summary=` (например "Вход в систему", "Текущий пользователь"); в остальных роутерах summary часто отсутствует — в Swagger отображается путь как заголовок.

### 3. Неявные или слишком широкие схемы ответа

- Эндпоинты с `response_model=List[dict]` или возвращающие `dict` без схемы дают в OpenAPI тип object/array без полей (например `bookings.GET /available-slots`, ряд эндпоинтов master, client).

### 4. Не описанные 4xx/5xx ответы

- В большинстве роутеров не заданы `responses={400: ..., 401: ..., 404: ..., 500: ...}`. Исключение: `auth.router` с `responses={401: {"description": "Unauthorized"}}` на уровне роутера. FastAPI по умолчанию добавляет 422 для валидации; 401/403/404/500 в схемах не описаны.

### 5. Auth в коде есть, в Swagger неочевидно

- Защищённые эндпоинты используют `Depends(get_current_user)` или `Depends(require_salon)` и т.п.; в OpenAPI это даёт зависимость от security scheme (Bearer), но без явного `responses={401: ...}` не видно, что именно вернётся при неавторизованном доступе.

### 6. Дублирующиеся/хаотичные tags

- Разные стили: `tags=["bookings"]`, `tags=["master_loyalty"]`, `tags=["tax-rates"]`, `tags=["public_master"]`, `tags=["dev-testdata"]`. В корне OpenAPI `tags: []` — список тегов собирается из роутеров, единого описания групп нет.

### 7. Схемы Pydantic, которые могут плохо отображаться

- Крупный `schemas.py` (много моделей с Optional, вложенными моделями, enum) — в целом подходят для OpenAPI. Потенциально неудобны: модели с `Union` или большие вложенные структуры без `example`/`examples` — в Swagger могут быть громоздкими.

### 8. Ответы dict вместо типизированной схемы

- **domain.py:** несколько эндпоинтов возвращают `return {"owner_type": "salon", ...}` или `return {"services": services}` — нет схемы.
- **tax_rates.py:** `return {"tax_rates": [...]}`, `return {"rate": ..., "effective_from_date": ...}`.
- **moderator.py:** `return {"message": "Moderator deleted successfully"}`.
- **master_clients.py:** `return {"id": ..., "type": ..., "reason": ...}`, `return {"message": "Ограничение удалено"}`.
- **accounting.py:** множество `return {"message": ..., "booking_id": ...}` и т.п.
- **client_loyalty.py:** возврат dict в части эндпоинтов.
- **blog.py:** возврат dict для постов/навигации.
- **yandex_geocoder.py**, **address_extraction.py:** возврат dict.

---

## D. System review

### Backend

- **Архитектура:** FastAPI, SQLAlchemy, Pydantic. Роутеры подключаются в `main.py` с префиксами `/api` для большей части; исключения: blog, domain, accounting, tax_rates, subscription_plans, subscription_plans_public, master_page_modules, service_functions, public_master — часть с полным путём в prefix (например `/api/domain`), часть без дополнительного `/api` в main (уже в prefix роутера).
- **Settings:** `backend/settings.py` — pydantic-settings, `get_settings()`, prod-валидация JWT и фичевых секретов (Robokassa, Zvonok, Plusofon). Соответствует CONFIG_AUDIT.
- **Routers:** auth, client, master, salon, admin, bookings, blog, moderator, domain, subscriptions, balance, loyalty, expenses, promo_codes, accounting, tax_rates, subscription_plans, subscription_plans_public, master_page_modules, service_functions, payments, address_extraction, yandex_geocoder, public_master, master_loyalty, client_loyalty, master_clients; в dev — dev_testdata, dev_e2e.
- **Services:** scheduling, verification_service, zvonok_service, plusofon_service, email_service, daily_charges, recurring_expenses, bookings_limit_monitor, temporary_bookings_cleanup и др.
- **DB:** database.py, models.py, alembic. DATABASE_URL в settings и в alembic/env.py.
- **Auth:** JWT (auth.py), get_current_user, role-based (require_salon, require_admin и т.д.).
- **Payments:** Robokassa (stub/test/prod), payments router, balance, subscriptions.
- **Telephony:** Zvonok, Plusofon (режимы stub/non-stub).
- **Subscriptions:** подписки мастеров, планы, заморозка, расчёт — отдельные роутеры и сервисы.

**Production-ready:** Конфиг через settings, валидация секретов в prod, CORS по окружению, health endpoint, фоновые задачи с корректным shutdown.

**Technical debt:** Много эндпоинтов без response_model и без описания ошибок; возврат dict в нескольких модулях; разрозненные теги OpenAPI.

**Риски для продакшена:** Жёстко зашитые origins в main.py (при смене домена — правка кода); отсутствие rate limiting и детального логирования ошибок в OpenAPI.

**Перед финальным тестированием:** Проверить все публичные эндпоинты (public_master, domain, blog) и защищённые (auth + префиксы); прогон make config-runbook; проверка /health и основных сценариев оплаты/подписок.

### Web (frontend)

- **Интеграция с backend:** `frontend/src/utils/api.js` — относительные пути (API_BASE_URL = ''), проверка авторизации по префиксам (`/api/master/`, `/api/loyalty/`, `/api/master/loyalty/`), токен из localStorage, заголовок Authorization. Публичные эндпоинты задаются через PUBLIC_ENDPOINTS (сейчас пусто).
- **Вывод:** Web рассчитан на тот же backend (тот же набор путей и auth).

### Mobile

- **Интеграция:** В `mobile/src/services/api/` вызываются пути вида `/api/client/loyalty/points`, `/api/master/loyalty/stats`, `/api/master/settings`, `/api/master/services`, `/api/client/dashboard/stats` и т.д. — соответствуют backend.
- **Public booking / deeplink:** Роутер `public_master` — `GET /api/public/masters/{slug}`, `GET /api/public/masters/{slug}/availability`, `POST /api/public/masters/{slug}/bookings` — используются для публичной записи к мастеру; в mobile ожидаемо используются те же пути (по коду не проверялось наличие deeplink-страницы в app).

---

## E. Config docs vs actual code

### Совпадения с CONFIG_AUDIT.md и CONFIG_CLEANUP_PLAN.md

- **Источник правды:** Конфиг в `backend/settings.py`, приложение использует `get_settings()`. Alembic читает DATABASE_URL из env в env.py — в доках указано.
- **JWT в prod:** В settings есть `validate_jwt_secret_in_production` — запрет дефолтного JWT в production — совпадает.
- **Фичевые секреты в prod:** `validate_feature_secrets_in_production` проверяет Robokassa, Zvonok, Plusofon при не-stub режимах — совпадает.
- **SALON_ROLE_ENABLED:** В settings есть legacy alias и WARNING при старте (used_legacy_salon_alias) — совпадает.
- **MASTER_CANON_MODE:** В runtime из os.environ не читается; в `utils/master_canon.py` только переданный dict env — совпадает.
- **Runbook/DoD:** Команды (1)–(3), скрипт runbook_config_check.sh, ожидание 3 PASS и тело /health — зафиксированы в доках и соответствуют коду (main.py /health возвращает нужное тело; скрипт выполняет 3 проверки).

### Расхождения / уточнения

- Нет явных расхождений: код ведёт себя в соответствии с описанием в CONFIG_AUDIT и CONFIG_CLEANUP_PLAN.

### PLUSOFON_USER_ID fallback "3545"

- **Где есть:** `backend/services/plusofon_service.py`, строка 14:  
  `self.user_id = s.PLUSOFON_USER_ID or "3545"`.
- **Активен ли в production:**  
  - В production при `PLUSOFON_MODE` не stub валидатор в settings требует непустые `PLUSOFON_USER_ID` и `PLUSOFON_ACCESS_TOKEN`. Если они пустые, приложение не стартует (ValueError).  
  - Fallback "3545" используется только когда settings уже загружены (т.е. валидация пройдена). В prod с non-stub Plusofon переменная обязательна, поэтому в типичном prod fallback не срабатывает.  
  - В dev или при PLUSOFON_MODE=stub переменная не обязательна — тогда fallback активен.
- **Противоречит ли правилу “в prod non-stub secrets required”:** Нет. Правило обеспечивается валидатором до использования сервиса; fallback — только для случаев, когда Plusofon не обязателен (stub/dev).
- **Рекомендация для доков:** В CONFIG_AUDIT в комментарии к PLUSOFON_USER_ID уже указано: "В коде fallback '3545' если пусто". Имеет смысл добавить одну фразу: "В production при non-stub Plusofon переменная обязательна (валидатор), fallback не используется."

---

## F. Concrete next actions

1. **OpenAPI:** Задать в `main.py` `openapi_tags` с перечнем групп (auth, bookings, master, client, admin, payments, loyalty, subscriptions, …) и при необходимости унифицировать имена тегов в роутерах.
2. **Response models:** Ввести Pydantic-схемы для ответов, которые сейчас возвращаются как dict (tax_rates, domain subdomain info, blog, moderator delete, master_clients restrictions, accounting messages, client_loyalty частично, geocoder/address_extraction), и проставить `response_model` у соответствующих эндпоинтов.
3. **Ошибки в OpenAPI:** Добавить для критичных эндпоинтов `responses={401: ..., 404: ..., 500: ...}` или общий шаблон для защищённых роутеров.
4. **Summary:** Добавить `summary="..."` для эндпоинтов без краткого описания (по приоритету: auth, bookings, master, payments, public_master).
5. **Конфиг-документы:** Добавить в CONFIG_AUDIT уточнение про PLUSOFON_USER_ID fallback и prod (одна фраза в таблицу или выводы).
6. **Перед релизом:** Прогнать Runbook (1)–(3) и make config-runbook; smoke-проверка публичных и основных защищённых API; при необходимости экспорт openapi.json и проверка клиентов (web/mobile) по схеме.

---

## Подтверждения (артефакты)

### Дерево ключевых backend-файлов

```
backend/
├── main.py
├── settings.py
├── auth.py
├── database.py
├── models.py
├── schemas.py
├── exceptions.py
├── routers/
│   ├── auth.py
│   ├── client.py
│   ├── master.py
│   ├── salon.py
│   ├── admin.py
│   ├── bookings.py
│   ├── blog.py
│   ├── moderator.py
│   ├── domain.py
│   ├── subscriptions.py
│   ├── balance.py
│   ├── loyalty.py
│   ├── expenses.py
│   ├── promo_codes.py
│   ├── accounting.py
│   ├── tax_rates.py
│   ├── subscription_plans.py
│   ├── subscription_plans_public.py
│   ├── master_page_modules.py
│   ├── service_functions.py
│   ├── payments.py
│   ├── address_extraction.py
│   ├── yandex_geocoder.py
│   ├── public_master.py
│   ├── master_loyalty.py
│   ├── client_loyalty.py
│   ├── master_clients.py
│   ├── dev_testdata.py
│   └── dev_e2e.py
├── services/
│   ├── plusofon_service.py
│   ├── zvonok_service.py
│   ├── scheduling.py
│   ├── verification_service.py
│   ├── email_service.py
│   ├── daily_charges.py
│   └── ...
└── scripts/
    └── runbook_config_check.sh
```

### Список основных роутеров и префиксов (из main.py + routers)

| Роутер | prefix в роутере | prefix в main | Итоговый базовый путь |
|--------|------------------|--------------|------------------------|
| auth | /auth | /api | /api/auth |
| client | /client/bookings | /api | /api/client/bookings |
| client profile_router | /client | /api | /api/client |
| master | /master | /api | /api/master |
| master_clients | /api/master/clients | — | /api/master/clients |
| salon | /salon | /api | /api/salon |
| admin | /admin | /api | /api/admin |
| bookings | /bookings | /api | /api/bookings |
| blog | /api/blog | — | /api/blog |
| moderator | /admin/moderators | /api | /api/admin/moderators |
| domain | /api/domain | — | /api/domain |
| subscriptions | /subscriptions | /api | /api/subscriptions |
| balance | /balance | /api | /api/balance |
| loyalty | /loyalty | /api | /api/loyalty |
| expenses | /expenses | /api | /api/expenses |
| promo_codes | /promo-codes | /api | /api/promo-codes |
| accounting | /api/master/accounting | — | /api/master/accounting |
| tax_rates | /api/master/tax-rates | — | /api/master/tax-rates |
| master_loyalty | /api/master/loyalty | — | /api/master/loyalty |
| client_loyalty | /api/client/loyalty | — | /api/client/loyalty |
| subscription_plans | /api/admin/subscription-plans | — | /api/admin/subscription-plans |
| subscription_plans_public | /api/subscription-plans | — | /api/subscription-plans |
| master_page_modules | /api/master/page-modules | — | /api/master/page-modules |
| service_functions | /api/admin/service-functions | — | /api/admin/service-functions |
| payments | /payments | /api | /api/payments |
| address_router | (пусто в файле) | /api | /api/... |
| geocoder_router | (пусто) | /api/geocoder | /api/geocoder/... |
| public_master | /api/public/masters | — | /api/public/masters |
| dev_testdata | /dev/testdata | /api | /api/dev/testdata (только при enable_dev_testdata) |
| dev_e2e | /dev/e2e | /api | /api/dev/e2e (только при dev_e2e) |

### Список основных Pydantic-схем (schemas.py, выдержка)

UserBase, UserCreate, UserUpdate, User, SalonBase, SalonCreate, SalonUpdate, SalonOut, ServiceBase, ServiceOut, MasterBase, ScheduleBase, BookingBase, BookingUpdate, Booking (BookingSchema), BookingEditRequest*, Token, TokenData, LoginRequest, UserStats, AdminStats, BalanceOut, TransactionOut, SubscriptionOut, SubscriptionStatusOut, SubscriptionFreezeInfo, SubscriptionFreezeOut, ModeratorOut, BlogPostBase, BlogPostList, BlogPostPreview, MasterServiceOut, MasterServiceCategoryOut, ClientRestriction*, LoyaltySettingsOut, LoyaltyStatsOut, PublicMasterProfileOut, PublicAvailabilityOut, PaymentInitResponse, PaymentOut, и множество других (см. grep по `class.*BaseModel` в schemas.py).

### Env vars, реально используемые в коде (по CONFIG_AUDIT и settings.py)

JWT_SECRET_KEY, DATABASE_URL, ENVIRONMENT, ACCESS_TOKEN_EXPIRE_DAYS, REFRESH_TOKEN_EXPIRE_DAYS, ENABLE_DEV_TESTDATA, DEV_E2E, SALONS_ENABLED, LEGACY_INDIE_MODE, MASTER_CANON_DEBUG, TZ, DEBUG_FUTURE_BOOKING_ID, SUBSCRIPTION_*_DEBUG, PAYMENT_URL_DEBUG, DAILY_CHARGE_DEBUG, FRONTEND_URL, API_BASE_URL, ROBOKASSA_MODE, ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1, ROBOKASSA_PASSWORD_2, ROBOKASSA_IS_TEST, ROBOKASSA_*_URL, ZVONOK_API_KEY, ZVONOK_MODE, PLUSOFON_USER_ID, PLUSOFON_ACCESS_TOKEN, PLUSOFON_MODE, REDIS_HOST, REDIS_PORT. Legacy: SALON_ROLE_ENABLED (alias). Не из env в runtime: MASTER_CANON_MODE (только dict в тестах/скриптах).

### OpenAPI — краткая выжимка

- Получено из `app.openapi()` (backend):
  - **paths:** 273.
  - **tags в корне:** пустой список `[]` (теги задаются только в роутерах).
  - **Примеры paths:** `/api/auth/register`, `/api/auth/login`, `/api/client/bookings/`, `/api/client/bookings/past`, `/api/bookings/`, `/api/master/profile`, `/api/public/masters/{slug}`, и т.д.

Полный `openapi.json` можно получить запросом: `GET http://localhost:8000/openapi.json` при запущенном приложении (или через `app.openapi()` в скрипте, как делалось для отчёта).

---

**Что не проверялось / не хватает для полного вывода**

- Точный список всех эндпоинтов без response_model по каждому файлу (можно сгенерировать скриптом по AST или по grep по всем декораторам).
- Фактический запрос к `/openapi.json` в рантайме и разбор всех путей/операций — не выполнялся; использовался только вызов `app.openapi()` при импорте app.
- Mobile: наличие и маршруты deeplink для public booking не проверялись (нужны файлы роутинга в mobile/app или аналог).
