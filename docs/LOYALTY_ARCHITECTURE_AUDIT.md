# Аудит архитектуры системы скидок/лояльности

**Дата:** 2026-01-28  
**Цель:** единственная бизнес-логика для web, mobile и backend. Без правок кода — только анализ, выводы и карта изменений.

---

## Резюме

- **Источник истины расчёта скидок:** `backend/utils/loyalty_discounts.py` — `evaluate_discount_candidates`, `evaluate_and_prepare_applied_discount`. Вся логика условий (first_visit, regular_visits, returning_client, birthday, happy_hours, service_discount) и выбор лучшего кандидата живут только в backend.
- **Нормализация parameters:** `backend/utils/loyalty_params.py` — `normalize_parameters`, дефолты, backward compatibility (period→period_days, days_since_last_visit→min/max, start_time/end_time→intervals). Вызывается из `loyalty_discounts` при eval и из `routers/loyalty` при валидации create/update.
- **Дубликаты логики на фронтах:** web и mobile имеют собственные `normalizeParametersForComparison` и `templateMatchesDiscount` (и `stableStringify`) в `loyaltyConditions` — эти функции **должны** зеркалить backend, иначе матчинг «шаблон ↔ скидка» разойдётся с оценкой при бронировании.
- **Поток скидок:** создание/редактирование быстрой скидки → сохранение в `loyalty_discounts` (JSON `conditions`) → при создании/подтверждении бронирования вызывается `evaluate_and_prepare_applied_discount` → при совпадении создаётся `AppliedDiscount` → в ответах GET booking подставляется `applied_discount` через `build_applied_discount_info`.
- **Эндпоинты loyalty (скидки):** `GET/POST /api/loyalty/templates`, `GET /api/loyalty/status`, `GET/POST/PUT/DELETE /api/loyalty/quick-discounts`, `.../complex-discounts`, `.../personal-discounts`, `POST /api/loyalty/evaluate`. Роутер подключён в `main.py` как `loyalty.router` с префиксом `/api`. Отдельно: `GET /api/loyalty/rules`, `GET /api/loyalty/legacy-rules`.
- **Применение при бронировании:** `evaluate_and_prepare_applied_discount` вызывается в `routers/bookings.py` (POST `/`, POST `/public`) и в `routers/client.py` (создание клиентского бронирования, создание временной брони, подтверждение оплаты временной брони). Везде при наличии `applied_discount_data` создаётся `AppliedDiscount` и в ответ добавляется `applied_discount` (если эндпоинт возвращает booking).
- **Валидация при create/update quick discount:** `_validate_quick_discount_conditions` в `routers/loyalty.py` использует `normalize_parameters` и `validate_happy_hours_intervals`; для `service_discount` проверяется принадлежность `service_id` из `items` мастеру через таблицу `master_services`. При ошибках — 422.
- **Контракты данных:** Pydantic-схемы в `schemas.py` (LoyaltyDiscount, QuickDiscountTemplate, LoyaltySystemStatus, AppliedDiscountInfo, DiscountEvaluationRequest/Response и др.). TS-типы в `mobile/src/types/loyalty_discounts.ts`. Открытого OpenAPI-спека по скидкам в репо нет; контракт задаётся FastAPI-роутами и схемами.
- **UI быстрых скидок:** web — `LoyaltySystem.jsx` → `QuickDiscountsTab` (шаблоны, активация, редактирование %, удаление); mobile — `DiscountsQuickTab` (шаблоны, Switch, edit [input%][✓][✕]). Оба используют «активность» шаблона: web — `templateMatchesDiscount`, mobile — `isTemplateActive` / `findActiveDiscountForTemplate`, которые внутри опираются на `templateMatchesDiscount`.
- **Риски обратной совместимости:** старые правила с `period` (week/month/year), `days_since_last_visit`, `start_time`/`end_time`/`days_of_week`, `service_ids`/`category_ids` поддерживаются через нормализацию. Любое ужесточение без маппинга старых полей может сломать существующие скидки.
- **Два loyalty-модуля в backend:** `utils/loyalty_discounts.py` (оценка скидок, AppliedDiscount) и `utils/loyalty.py` (баллы, LoyaltySettings, LoyaltyTransaction, `calculate_points_to_spend`). Это **разные** домены: скидки vs баллы. Дублей по скидкам нет.
- **Услуги мастера для service_discount:** связь мастер–услуга — таблица `master_services` (master_id, service_id). Валидация «услуга принадлежит мастеру» выполняется в `_validate_quick_discount_conditions` по `master_services`. Модель `MasterService` (master_services_list) — собственный каталог мастера; в контексте скидок используется именно ассоциация с `Service` через `master_services`.

---

## A) Backend

### Эндпоинты loyalty/discounts и вызовы

| Метод | Путь | Описание | Кто вызывает |
|-------|------|----------|--------------|
| GET | `/api/loyalty/templates` | Шаблоны быстрых скидок (константа) | Web: `LoyaltySystem` → `apiGet('/api/loyalty/templates')`. Mobile: `getLoyaltyTemplates()` → `GET /api/loyalty/templates`. |
| GET | `/api/loyalty/status` | quick/complex/personal скидки мастера | Web: `apiGet('/api/loyalty/status')`. Mobile: `getLoyaltyStatus()` → `GET /api/loyalty/status`. |
| GET | `/api/loyalty/rules` | То же, что status (алиас по смыслу) | Прямых вызовов с фронтов не найдено. |
| GET | `/api/loyalty/legacy-rules` | Legacy (master_id IS NULL, salon_id) | Прямых вызовов с фронтов не найдено. |
| POST | `/api/loyalty/evaluate` | Оценка кандидатов для данного бронирования | Используется для отладки/админки; в основном потоке бронирований не вызывается. |
| POST | `/api/loyalty/quick-discounts` | Создать быструю скидку | Web: `handleCreateDiscount` → `apiPost('/api/loyalty/quick-discounts', ...)`. Mobile: `createQuickDiscount()` → `POST /api/loyalty/quick-discounts`. |
| GET | `/api/loyalty/quick-discounts` | Список быстрых скидок | Через `GET /api/loyalty/status` (quick_discounts). |
| PUT | `/api/loyalty/quick-discounts/{id}` | Обновить быструю скидку | Web: `handleUpdateDiscount` → `apiPut(...)`. Mobile: `updateQuickDiscount()`. |
| DELETE | `/api/loyalty/quick-discounts/{id}` | Удалить быструю скидку | Web, mobile аналогично. |
| POST/GET/PUT/DELETE | `/api/loyalty/complex-discounts` | CRUD сложных скидок | Web: `LoyaltySystem`. Mobile: `createComplexDiscount`, `updateComplexDiscount`, `deleteComplexDiscount`. |
| POST/GET/PUT/DELETE | `/api/loyalty/personal-discounts` | CRUD персональных скидок | Web: `PersonalDiscountsTab`. Mobile: `createPersonalDiscount`, `updatePersonalDiscount`, `deletePersonalDiscount`. |

Роутер: `routers/loyalty.py`, в `main.py`: `app.include_router(loyalty.router, prefix="/api")`.

### Применение скидки при бронировании и AppliedDiscount

- **bookings.py:**  
  - `POST /bookings/` (создание авторизованным пользователем): после проверок вызывается `evaluate_and_prepare_applied_discount(...)`. При `applied_discount_data` создаётся `AppliedDiscount`, делается `build_applied_discount_info(applied_discount)`, результат кладётся в `db_booking.applied_discount` и возвращается в схеме.  
  - `POST /bookings/public`: то же для публичного создания (клиент по телефону).  
  - `GET /bookings/{id}` и т.п.: при отдаче бронирования подгружается `AppliedDiscount` (joinedload), вызывается `build_applied_discount_info`, в ответе — `applied_discount`.
- **client.py:**  
  - Создание бронирования клиентом, создание временной брони, `confirm_temporary_booking_payment`: везде вызывается `evaluate_and_prepare_applied_discount`. При подтверждении временной брони создаётся `Booking` и при наличии `applied_discount_data` — `AppliedDiscount`.  
  - GET бронирования клиента: аналогично подгружается `AppliedDiscount` и отдаётся `applied_discount`.

Импорты: `from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info`. Модель `AppliedDiscount` — `models`, создание записей — вручную в роутерах (не через `create_applied_discount` из `loyalty_discounts`).

### Модуль оценки и нормализации

- **Оценка условий:** `utils/loyalty_discounts.py`:
  - `evaluate_discount_candidates(master_id, client_id, client_phone, booking_payload, db)` — возвращает `(candidates, best_candidate)`.
  - Внутри для каждого `LoyaltyDiscount` берётся `conditions`, вызывается `normalize_parameters(condition_type, parameters, rule_discount_percent)` из `utils/loyalty_params`.
  - Обрабатываются first_visit, returning_client, regular_visits, birthday, happy_hours, service_discount. Personal — отдельно по `PersonalDiscount`.
- **Нормализация:** `utils/loyalty_params.py`:
  - `normalize_parameters(condition_type, parameters, rule_discount_percent)` — единая точка нормализации.
  - Вызывается из: `loyalty_discounts.evaluate_discount_candidates`; `routers/loyalty._validate_quick_discount_conditions`.
  - `validate_happy_hours_intervals` используется только в `_validate_quick_discount_conditions`.

Дубликатов `loyalty_discounts`/`loyalty_params` нет. Отдельно есть `utils/loyalty.py` (баллы), он скидки не трогает.

### Импорты (кто что импортирует)

- `routers/loyalty.py`: `utils.loyalty_discounts` (SUPPORTED_CONDITION_TYPES, evaluate_discount_candidates), `utils.loyalty_params` (normalize_parameters, validate_happy_hours_intervals), `models` (LoyaltyDiscount, PersonalDiscount, AppliedDiscount, ..., master_services as master_services_table).
- `routers/bookings.py`: `utils.loyalty_discounts` (evaluate_and_prepare_applied_discount, build_applied_discount_info), `models` (AppliedDiscount, …).
- `routers/client.py`: то же для loyalty_discounts и AppliedDiscount.
- `routers/master.py`: `utils.loyalty_discounts` (build_applied_discount_info) при отдаче бронирований с `applied_discount`.

---

## B) Frontend Web

### UI быстрых и «простых» скидок

- **Быстрые скидки:** `frontend/src/components/LoyaltySystem.jsx` → компонент `QuickDiscountsTab`.  
  - Шаблоны из `GET /api/loyalty/templates`, скидки из `GET /api/loyalty/status` (quick_discounts).  
  - Отображаются карточки шаблонов, кнопки «Активировать» / «Сохранить» (при редактировании %), удаление.  
  - **Активность шаблона:** `isActive = discounts.some(d => templateMatchesDiscount(template, d))`.  
  - Редактирование % только при неактивном шаблоне; при активации используется `template.default_discount` или введённый %.
- **Сложные скидки:** та же `LoyaltySystem` → вкладка с complex-discounts, CRUD через API.  
- **Персональные:** `PersonalDiscountsTab`, создание по телефону и т.д.  
- Отдельного UI «простых скидок» как отдельной сущности нет; быстрые скидки и есть основной «простой» поток.

### Утилиты и сравнение template vs discount

- **Файл:** `frontend/src/utils/loyaltyConditions.js`.
- **Функции:**  
  - `normalizeConditionsForApi(input)` — подготовка условий к отправке на API (в т.ч. для complex); не используется для сравнения шаблон↔скидка.  
  - `normalizeParametersForComparison(conditionType, parameters, ruleDiscountPercent)` — приводит parameters к каноническому виду (совпадает с backend).  
  - `stableStringify(obj)` — каноническая сериализация (null/undefined→`'null'`, примитивы→`JSON.stringify`, массивы/объекты с сортировкой ключей).  
  - `templateMatchesDiscount(template, discount)` — проверяет `condition_type` и равенство `stableStringify(normT) === stableStringify(normD)` для нормализованных parameters.
- **Использование:** в `QuickDiscountsTab` только `templateMatchesDiscount` для `isActive`. Нет отдельной логики «сам решаю матч» мимо этой функции.

---

## C) Mobile

### UI и API

- **Быстрые скидки:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`.  
  - Шаблоны и скидки через `getLoyaltyTemplates` / `getLoyaltyStatus` (`/api/loyalty/templates`, `/api/loyalty/status`).  
  - Switch вкл/выкл, режим редактирования [input %][✓][✕], создание/обновление/удаление через `loyalty_discounts` API.
- **Активность:** `isTemplateActive(template, discounts)` и `findActiveDiscountForTemplate(template, discounts)` из `@src/utils/loyaltyConditions`. Обе внутри используют `templateMatchesDiscount`.

### loyaltyConditions и соответствие backend/web

- **Файл:** `mobile/src/utils/loyaltyConditions.ts`.
- **Функции:**  
  - `normalizeConditionsForApi` — для API (в т.ч. complex).  
  - `normalizeParametersForComparison` — та же идея, что в web (и backend).  
  - `stableStringify` — каноническая сериализация, синхронизирована с web.  
  - `templateMatchesDiscount`, `isTemplateActive`, `findActiveDiscountForTemplate`.
- **Типы:** `QuickDiscountTemplate`, `LoyaltyDiscount` из `@src/types/loyalty_discounts`.  
- Логика сравнения и нормализации **сознательно** унифицирована с web и backend; расхождений по задумке нет, но любые правки в backend должны отражаться в обоих фронтах.

---

## D) Data model / DB

### Таблицы и модели

| Таблица | Модель | Назначение |
|--------|--------|------------|
| `loyalty_discounts` | `LoyaltyDiscount` | Быстрые и сложные скидки. `master_id`, `discount_type` (quick/complex), `conditions` (JSON), `discount_percent`, `is_active`, `priority` и др. |
| `personal_discounts` | `PersonalDiscount` | Персональные скидки по `client_phone`, `master_id`. |
| `applied_discounts` | `AppliedDiscount` | Связь бронирования с применённой скидкой: `booking_id`, `discount_id` или `personal_discount_id`, `discount_percent`, `discount_amount`. |
| `bookings` | `Booking` | `service_id`, `payment_amount` (уже с учётом скидки), связь с `applied_discounts`. |
| `services` | `Service` | Услуга, `category_id`, `price`. |
| `master_services` | Таблица (association) | `(master_id, service_id)` — связь мастера с услугами. |

Для **service_discount** «услуга принадлежит мастеру» проверяется так: в `_validate_quick_discount_conditions` по `conditions.parameters` извлекаются `service_id` из `items` (или legacy `service_ids` после нормализации), затем выполняется выборка из `master_services` по `master_id` и списку этих id. Если какой‑то id не найден → 422 с перечислением некорректных.

---

## Выводы

### 1) Источник истины по типам скидок

| Тип | Где считается | Где отображается | Где валидируется |
|-----|----------------|-------------------|-------------------|
| first_visit | `loyalty_discounts.evaluate_discount_candidates` | Web: QuickDiscountsTab. Mobile: DiscountsQuickTab | — |
| regular_visits | то же | то же | — (при create/update quick — только общая валидация format) |
| returning_client | то же | то же | — |
| birthday | то же | то же | — |
| happy_hours | то же | то же | `_validate_quick_discount_conditions` (intervals, пересечения) |
| service_discount | то же | то же | `_validate_quick_discount_conditions` (service_id ∈ master_services) |

Общее: отображение «активности» шаблона и привязка к конкретной скидке — на фронтах через `templateMatchesDiscount` / `isTemplateActive` / `findActiveDiscountForTemplate`, которые должны использовать ту же нормализацию и те же правила, что и backend.

### 2) Расхождения web vs mobile vs backend (для устранения/контроля)

1. **Дефолты:** должны быть зафиксированы в одном месте (сейчас — backend `loyalty_params` + константы в `routers/loyalty`). Web/mobile дублируют дефолты в `normalizeParametersForComparison`; при смене на backend нужно менять и фронты.
2. **Форматы parameters:** backend принимает и старые форматы (period, days_since_last_visit, start_time/end_time, service_ids), нормализует. Фронты делают то же в `normalizeParametersForComparison`. Риск: разная обработка краевых случаев (пустые массивы, null, лишние поля).
3. **stableStringify:** реализован и на web, и на mobile; при изменениях (например, учёт числовых ключей или порядка в массивах) нужно менять оба.
4. **Типы TS vs Pydantic:** mobile использует `loyalty_discounts` types; явного shared-пакета или автогенерации из OpenAPI нет — возможны расхождения полей (например, `conditions` structure).
5. **Имена полей и допустимые значения:** разная обработка `discount_type` (enum vs string) на фронтах и в API может дать неожиданности при фильтрации «только quick».
6. **Границы интервалов happy_hours:** inclusive/exclusive (start/end) должны быть одинаково определены в backend и в нормализаторе на фронтах.
7. **Таймзоны и даты:** birthday, returning_client, happy_hours зависят от даты/времени бронирования. Сейчас явной таймзоны в контракте нет; возможны отличия между «локалью» клиента и сервера.
8. **Сортировка items в service_discount:** backend сортирует по `service_id`; при сравнении через `stableStringify` порядок должен совпадать с тем, что даёт нормализатор на фронтах.
9. **Обработка `category_ids` в service_discount:** при пустом `items` и непустых `category_ids` поведение должно быть одинаково на backend и во фронтовой нормализации (если она используется для матчинга).
10. **Эндпоинты loyalty vs master:** web/mobile скидки используют `/api/loyalty/*`. Баллы и история — `/api/master/loyalty/*`, `/api/client/loyalty/*`. Разные префиксы и разная авторизация; при рефакторинге маршрутов можно что‑то сломать.
11. **Поведение при 422:** сообщения от `_validate_quick_discount_conditions` отдаются как `detail`; формат единый, но локализация и разбор ошибок на фронтах могут различаться.
12. **SUPPORTED_CONDITION_TYPES / isConditionTypeSupported:** списки на web и mobile должны совпадать с backend; иначе UI может разрешать типы, которые backend не обрабатывает, или наоборот.

### 3) Риски обратной совместимости

- **Legacy parameters:** `period`, `days_since_last_visit`, `start_time`/`end_time`/`days_of_week`, `service_ids`/`category_ids`. Сейчас все проходят через нормализацию; отказ от маппинга сломает старые скидки.
- **Изменение формата `conditions` в БД:** любые новые обязательные поля без миграции или нормализации старых записей могут привести к ошибкам при eval.
- **Смена правил сортировки или stableStringify:** возможны ложные «не совпадает» при сравнении шаблон↔скидка на фронтах.

### 4) Файлы для унификации (что менять и зачем)

| Файл | Что менять |
|------|------------|
| `backend/utils/loyalty_params.py` | Дефолты, форматы, backward compat — единый источник. При изменении — синхронизировать с фронтами. |
| `backend/utils/loyalty_discounts.py` | Логика eval, добавление новых condition_type. Держать в sync с `loyalty_params` и с фронтовой нормализацией. |
| `backend/routers/loyalty.py` | Валидация, QUICK_DISCOUNT_TEMPLATES, сообщения 422. Убедиться, что форматы совпадают с `loyalty_params` и фронтами. |
| `frontend/src/utils/loyaltyConditions.js` | `normalizeParametersForComparison`, `stableStringify`, `templateMatchesDiscount` — строго по контракту backend. Вынести дефолты в константы, при возможности — переиспользовать shared-описание. |
| `mobile/src/utils/loyaltyConditions.ts` | То же. Полная симметрия с web и backend. |
| `mobile/src/types/loyalty_discounts.ts` | При появлении OpenAPI/spec — приводить типы к единому контракту. |
| `frontend/src/components/LoyaltySystem.jsx` | Не дублировать логику матчинга; только вызов `templateMatchesDiscount`. При добавлении новых параметров в шаблоны — учесть в нормализаторе. |
| `mobile/src/components/loyalty/DiscountsQuickTab.tsx` | Аналогично — только использование `isTemplateActive` / `findActiveDiscountForTemplate`. |
| `backend/schemas.py` | Схемы loyalty/discounts — при изменении контракта обновлять и TS-типы, и фронтовые вызовы. |
| `backend/tests/test_loyalty_discounts.py` | Регрессионные тесты на нормализацию, eval, валидацию; при изменении правил — обновлять тесты. |

---

## Чек-лист smoke / regression

### API

- [ ] `GET /api/loyalty/templates` — 200, список шаблонов с `conditions` в ожидаемом формате.
- [ ] `GET /api/loyalty/status` — 200 для мастера, `quick_discounts`/`complex_discounts`/`personal_discounts`.
- [ ] `POST /api/loyalty/quick-discounts` — 200 при валидном теле; 422 при невалидных `conditions` (happy_hours overlap, service_discount с чужими `service_id`).
- [ ] `PUT /api/loyalty/quick-discounts/{id}` — обновление, в т.ч. `conditions`; 422 при тех же нарушениях.
- [ ] `POST /api/loyalty/evaluate` — 200, `candidates` и `best_candidate` соответствуют правилам (first_visit, birthday, happy_hours и т.д.).

### Booking flow

- [ ] Создание бронирования (авторизованным и публично) с клиентом/услугой/временем, подходящими под first_visit, — в ответе `payment_amount` со скидкой, в БД есть `AppliedDiscount`.
- [ ] То же для birthday (в окне и на стыке года), happy_hours, returning_client, regular_visits, service_discount.
- [ ] Подтверждение временной брони — скидка применяется, `AppliedDiscount` создаётся.
- [ ] `GET /bookings/{id}` и `GET /client/bookings/...` — в ответе `applied_discount` с `rule_type`, `name`, `discount_percent`, `discount_amount`.
- [ ] `PUT` бронирования не теряет `AppliedDiscount` (smoke уже покрыт в `smoke_test_bookings_auth`).

### UI

- [ ] Web: один и тот же шаблон и набор скидок — «Активна» только у подходящего шаблона; выключение/удаление скидки снимает «Активна».
- [ ] Mobile: то же для DiscountsQuickTab (Switch, статус «активна»).
- [ ] Web и mobile при одних и тех же `templates` и `quick_discounts` показывают одинаковые шаблоны как активные/неактивные (нет расхождений из‑за разного матчинга).
- [ ] Редактирование % и повторное сохранение быстрой скидки не ломает отображение и применение при бронировании.

### Обратная совместимость

- [ ] Старые скидки с `period`, `days_since_last_visit`, `start_time`/`end_time`/`days_of_week`, `service_ids` продолжают матчиться при eval и корректно отображаться в UI (в т.ч. «активность» шаблона).
