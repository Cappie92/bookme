# Swagger/OpenAPI — приоритизированный shortlist (что делать первым)

**Основа:** docs/SWAGGER_AND_SYSTEM_AUDIT_REPORT.md  
**Цель:** только то, что мешает тестировать API в Swagger, понимать контракты фронту/мобилке и готовить backend к финальному тестированию.

---

## A. TOP-20 Swagger issues

| # | Приоритет | Файл | Эндпоинт(ы) | Что не так | Почему важно | Какой фикс | Пример целевого решения |
|---|-----------|------|-------------|------------|--------------|------------|---------------------------|
| 1 | **P0** | main.py | (все) | Нет `openapi_tags` — в OpenAPI пустой список тегов, в Swagger группы не упорядочены | Невозможно быстро найти нужный эндпоинт среди 273 | Задать в FastAPI() список тегов с name + description | `openapi_tags=[{"name":"auth","description":"Авторизация"},{"name":"bookings",...}]` |
| 2 | **P0** | routers/public_master.py | POST /api/public/masters/{slug}/bookings | Нет response_model; ответ — произвольный объект | Публичная запись — ключевой сценарий; фронт/мобилка не видят контракт | Добавить Pydantic-схему ответа (booking + payment_url или ошибка) и response_model | `response_model=PublicBookingCreateOut` с полями id, status, payment_url? и т.д. |
| 3 | **P0** | routers/public_master.py | GET /api/public/masters/{slug}/availability | Есть response_model=PublicAvailabilityOut | — | Проверить, что схема полная и совпадает с фактическим ответом | Ручная проверка в Swagger (см. раздел B) |
| 4 | **P0** | routers/bookings.py | GET /api/bookings/available-slots, available-slots-repeat, available-slots-any-master | response_model=List[dict] — в OpenAPI пустой массив объектов | Клиенты не знают структуру слота (datetime, master_id, …) | Ввести схему AvailabilitySlotOut и response_model=List[AvailabilitySlotOut] | В schemas.py класс с полями; в роутере response_model=List[AvailabilitySlotOut] |
| 5 | **P0** | routers/auth.py | POST /api/auth/login, /register, /refresh | Есть response_model=Token, summary частично | Нет явного responses={401,400,422} | Добавить responses для типичных ошибок | `responses={400: {"description": "Bad request"}, 401: {"description": "Invalid credentials"}}` |
| 6 | **P1** | routers/master.py | GET /api/master/settings, GET /api/master/dashboard/stats | Нет response_model; возвращают dict/сложный объект | Мастер-дашборд и настройки — частые запросы; контракт неочевиден | Ввести MasterSettingsOut, DashboardStatsOut и проставить response_model | Аналогично другим Out-схемам в schemas.py |
| 7 | **P1** | routers/bookings.py | POST /api/bookings/public | Нет response_model | Публичное создание брони (виджет/мобилка); контракт скрыт | Схема ответа (booking или redirect URL) + response_model | PublicBookingResponse с полями по факту ответа |
| 8 | **P1** | routers/payments.py | POST /api/payments/subscription/init, POST /api/payments/deposit/init | Есть response_model=PaymentInitResponse | — | Убедиться, что 4xx/5xx описаны при необходимости | responses={400: ..., 402: ...} если есть |
| 9 | **P1** | routers/payments.py | POST /api/payments/robokassa/result, POST /api/payments/{id}/activate-subscription | Нет response_model; результат — redirect или JSON | Платёжный флоу; тестировщику неясно, что ожидать | Описать response (RedirectResponse / JSON) и при необходимости схему | responses={302: ...}, 200: {"content": {...}} или отдельная схема |
| 10 | **P1** | routers/subscriptions.py | GET /api/subscriptions/my, POST /api/subscriptions/upgrade, PUT /api/subscriptions/{id} | Часть с response_model, часть без | Подписки — критичный продукт; контракт должен быть явным | Проставить response_model для всех возвращающих JSON | SubscriptionOut, SubscriptionCalculationResponse и т.д. |
| 11 | **P1** | routers/domain.py | GET /api/domain/{subdomain}/info | Возврат dict; нет response_model | Публичный эндпоинт для лендинга/виджета; фронт не видит структуру | Ввести DomainSubdomainInfoOut (owner_type, name, ...) и response_model | Класс в schemas.py, в роутере response_model=DomainSubdomainInfoOut |
| 12 | **P1** | routers/client.py / client dashboard | GET /api/client/dashboard/stats (если есть) или ключевые client endpoints | Без response_model или с dict | Клиентский дашборд в мобилке; контракт для тестов | Уточнить путь в коде; добавить схему ответа и response_model | По факту полей ответа — схема + response_model |
| 13 | **P2** | routers/tax_rates.py | GET /api/master/tax-rates/, GET /current, POST / | Возврат dict; нет response_model | Нужно для тестирования и типобезопасности | TaxRateListOut, CurrentTaxRateOut, TaxRateCreateOut в schemas + response_model | Небольшие схемы по текущей структуре dict |
| 14 | **P2** | routers/blog.py | GET /api/blog/posts, GET /api/blog/posts/{slug} | Нет response_model | Публичный блог; контракт для интеграций | Использовать существующие BlogPostList, BlogPost или добавить и проставить response_model | response_model=List[BlogPostList], response_model=BlogPost |
| 15 | **P2** | Защищённые роутеры (master, client, bookings, …) | Многие GET/POST с Depends(get_current_user) | Нет responses={401: ...} | В Swagger не видно, что без токена будет 401 | На уровне APIRouter задать responses={401: {"description": "Unauthorized"}} | В каждом защищённом роутере или один раз через dependency |
| 16 | **P2** | routers/auth.py | POST change-password, set-password, verify-password, delete-account, confirm-delete-account | Нет response_model (возвращают сообщение или 204) | Понимание контракта при тестировании | Явно response_model=None и responses={200: ..., 401: ...} или MessageOut | Либо схема с message, либо только описание responses |
| 17 | **P2** | routers/client_loyalty.py | GET /api/client/loyalty/points/{master_id}/available, GET .../master/{id}/loyalty-settings | Нет response_model | Мобилка дергает; контракт не описан | Схемы по фактическому ответу + response_model | LoyaltyAvailableOut, LoyaltySettingsPublicOut и т.п. |
| 18 | **P2** | routers/balance.py | POST /api/balance/deposit, GET /api/balance/low-balance-warning | Нет response_model | Баланс и депозит — важны для сценариев | Схема ответа (balance, warning message) + response_model | DepositOut, LowBalanceWarningOut |
| 19 | **P2** | Разные роутеры | Эндпоинты без summary | В Swagger заголовок — только путь | Быстрее ориентироваться в /docs | Добавить summary="Краткое описание" к приоритетным эндпоинтам (auth, bookings, public_master, payments) | summary="Вход в систему" (уже есть в auth частично) |
| 20 | **P2** | routers/moderator.py, master_clients.py, accounting.py | DELETE/POST возвращают {"message": "..."} | В OpenAPI — произвольный object | Единообразие и явный контракт | MessageOut или аналог с полем message + response_model | class MessageOut(BaseModel): message: str |

---

## B. TOP-10 эндпоинтов для ручной проверки в Swagger

| # | Method + path | Зачем важен | Что проверить руками в Swagger | Ожидаемые статусы | Риск нестыковки |
|---|----------------|-------------|--------------------------------|-------------------|-----------------|
| 1 | POST /api/auth/login | Вход — основа всех защищённых сценариев | Body: email/phone + password; ответ Token (access_token, refresh_token, token_type). Без токена — 401. | 200, 401, 422 | Схема Token уже есть; проверить, что реальный ответ совпадает с полями |
| 2 | GET /api/auth/users/me | Текущий пользователь после авторизации | С заголовком Authorization: Bearer <token> — 200, UserSchema. Без токена — 401. | 200, 401 | Низкий (response_model есть) |
| 3 | GET /api/public/masters/{slug} | Публичная страница мастера для записи | Без auth; ответ — профиль мастера (имя, услуги, slug). Подставить реальный slug. | 200, 404 | Проверить, что все поля из PublicMasterProfileOut присутствуют в ответе |
| 4 | GET /api/public/masters/{slug}/availability | Слоты для публичной записи | Query: date_from, date_to или аналог. Ответ — слоты. Проверить структуру (даты, времена). | 200, 404 | Высокий — ранее отмечено отсутствие явной схемы слотов в части эндпоинтов |
| 5 | POST /api/public/masters/{slug}/bookings | Создание брони с публичной страницы | Body: client_name, phone, service_id, slot, … Ответ — бронь или редирект на оплату. | 200/201, 400, 404, 422 | Высокий — нет response_model, контракт неочевиден |
| 6 | GET /api/bookings/ | Список бронирований (мастер/клиент) | С auth. Query: status, start_date, end_date. Ответ — список бронирований. | 200, 401 | Средний — response_model=List[BookingSchema]; проверить соответствие полей |
| 7 | POST /api/bookings/ | Создание брони (под авторизацией) | С auth. Body по BookingCreate. Ответ — одна бронь. | 200/201, 400, 401, 422 | Средний — схема есть; проверить 4xx в ответе |
| 8 | POST /api/payments/subscription/init | Инициация оплаты подписки | С auth. Body: plan_id и т.д. Ответ — payment_url или ошибка. | 200, 400, 402 | Средний — PaymentInitResponse; убедиться, что URL и статусы описаны |
| 9 | GET /api/subscriptions/my | Текущая подписка мастера | С auth. Ответ — подписка или её отсутствие. | 200, 401 | Низкий — response_model=SubscriptionOut |
| 10 | GET /api/master/dashboard/stats | Дашборд мастера | С auth. Ответ — агрегаты (записи, доход и т.д.). | 200, 401 | Средний — нет response_model; проверить фактические поля и при необходимости добавить схему |

---

## C. Что можно исправить быстро за 1 проход

| Правка | Сложность | Ожидаемый эффект |
|--------|------------|-------------------|
| **openapi_tags в main.py** | low | Группировка всех эндпоинтов в Swagger по разделам (auth, bookings, master, client, payments, public_master, …); быстрее находить нужное. |
| **summary для auth, bookings, public_master, payments** | low | Понятные заголовки в списке операций вместо только пути. |
| **responses={401: {"description": "Unauthorized"}} на защищённых роутерах** | low | В Swagger видно, что без токена будет 401; меньше путаницы при тестировании. |
| **Одна общая схема MessageOut (message: str)** | low | Использовать для эндпоинтов, возвращающих только {"message": "..."}; единообразие и явный контракт. |
| **response_model для domain GET /{subdomain}/info** | medium | Один класс в schemas + одна строка в роутере; публичный контракт для лендинга. |
| **response_model для tax_rates (3 эндпоинта)** | medium | Три небольшие схемы; полный контракт для мастера/учёта. |
| **AvailabilitySlotOut и response_model для available-slots** | medium | Схема слота уже может быть частично в schemas; добавить/привязать и проставить List[AvailabilitySlotOut]. |
| **response_model для POST public_master/{slug}/bookings** | medium | Критично для контракта публичной записи; одна схема + response_model. |
| **Типовые error schemas (HTTPErrorDetail)** | low | Одна схема с полем detail (и при необходимости code); подставлять в responses={400: ..., 500: ...}. |
| **Замена return {"message": ...} на MessageOut** в moderator, master_clients (выборочно) | low | Без изменения поведения API; только тип ответа в OpenAPI. |

---

## D. Что уже нормально и не требует срочного вмешательства

- **Auth в OpenAPI:** OAuth2PasswordBearer задан, в Swagger есть кнопка Authorize и передача Bearer token — этого достаточно для ручного тестирования защищённых эндпоинтов.
- **Многие эндпоинты уже с response_model:** auth (Token, UserSchema), bookings (BookingSchema для списка и создания), master (много Out-схем), loyalty (LoyaltySettingsOut, LoyaltyStatsOut), subscriptions (SubscriptionOut, SubscriptionFreezeInfo), payments (PaymentInitResponse, PaymentOut), public_master (PublicMasterProfileOut, PublicAvailabilityOut для GET).
- **Health и корень API:** /health и / возвращают фиксированный JSON; контракт простой и стабильный.
- **Config и Runbook:** CONFIG_AUDIT/CONFIG_CLEANUP_PLAN соответствуют коду; runbook_config_check.sh и Makefile в порядке; не трогать без необходимости.
- **Структура backend:** Роутеры, settings, auth, сервисы разделены; не нужен рефакторинг ради Swagger.
- **Dev-роутеры (dev_testdata, dev_e2e):** Можно оставить без response_model и богатой документации — они не для продакшена.
- **Geocoder/address_extraction:** Вспомогательные; приоритет ниже, чем у продуктовых эндпоинтов.

---

## E. Готовый план (prompt) для Cursor на следующий шаг

Ниже — готовый prompt для точечного улучшения Swagger без рефакторинга бизнес-логики.

---

**Prompt для Cursor:**

```
Задача: точечно улучшить Swagger/OpenAPI в backend DeDato. Основа — docs/SWAGGER_ACTIONABLE_SHORTLIST.md.

Ограничения:
- Не менять бизнес-логику (не трогать расчёты, права доступа, валидацию данных в теле запроса).
- Не рефакторить все роутеры разом — только перечисленные ниже пункты.
- Минимальный риск: только добавление полей в декораторы (summary, response_model, responses) и добавление новых Pydantic-схем в schemas.py без изменения возвращаемых данных (схема должна соответствовать текущему ответу).

Что сделать по приоритету:

1) P0 — main.py
- Добавить в FastAPI() параметр openapi_tags: список из тегов с name и description для групп: auth, bookings, master, client, admin, payments, loyalty, subscriptions, public_master, domain, blog, balance, expenses, moderator, остальные по желанию. Имена тегов должны совпадать с теми, что уже заданы в роутерах (bookings, master_loyalty, tax-rates, public_master и т.д.), чтобы операции сгруппировались под этими тегами.

2) P0 — Публичная запись
- В routers/public_master.py для POST /{slug}/bookings: добавить response_model. Если сейчас возвращается dict — ввести в schemas.py схему (например PublicBookingCreateOut) с полями, которые реально возвращает эндпоинт (id, status, payment_url если есть, и т.д.), и проставить response_model=PublicBookingCreateOut. Не менять логику формирования ответа — только тип в OpenAPI.

3) P0 — Слоты
- В routers/bookings.py для GET available-slots (и при необходимости available-slots-repeat, available-slots-any-master): если сейчас response_model=List[dict], ввести в schemas.py схему AvailabilitySlotOut (или использовать существующую, если есть) с полями слота (start_time, end_time, master_id и т.д. по факту) и проставить response_model=List[AvailabilitySlotOut]. Не менять логику выборки слотов.

4) P1 — Ответы ошибок
- В routers/auth.py для POST /login (и при необходимости /register): добавить в декоратор responses={400: {"description": "Bad request"}, 401: {"description": "Invalid credentials"}}. Без изменения кода обработки ошибок.

5) P1 — Domain
- В routers/domain.py для GET /{subdomain}/info: ввести в schemas.py схему DomainSubdomainInfoOut с полями, которые сейчас возвращаются в dict (owner_type, owner_id, name, description, phone, ...). В эндпоинте заменить return {...} на return DomainSubdomainInfoOut(...) и добавить response_model=DomainSubdomainInfoOut. Сохранить те же поля и значения.

6) P1 — Защищённые роутеры
- Добавить на уровне APIRouter в routers/master.py (и при желании в client, bookings) общий responses={401: {"description": "Unauthorized"}} в конструктор APIRouter, если его там ещё нет. Не трогать зависимости Depends(get_current_user).

После изменений:
- Убедиться, что backend запускается (uvicorn) и /docs открывается.
- Не требуется менять фронт или мобилку в этом задании.
```

---

**Итог shortlist:** сначала закрыть P0 (openapi_tags, публичная запись, слоты), затем P1 (auth responses, domain, 401 на роутерах). P2 из раздела A и остальные быстрые правки из раздела C — следующими итерациями, без изменения бизнес-логики.
