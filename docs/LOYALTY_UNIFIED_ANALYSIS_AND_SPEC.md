# Единая система лояльности: анализ, спецификация и план

**Дата:** 2026-01-28  
**Статус:** Анализ, спецификация и реализация (backend + shared + web + mobile)  
**Охват:** mobile (React Native), web (админка / ЛК), backend

---

## Реализовано по шагам 1–3 (2026-01-28)

Сводка внедрённых изменений. Детали — в отчётах:

- **Шаг 1:** `docs/LOYALTY_STEP1_TEMPORARY_BOOKING_REPORT.md`  
- **Шаг 2:** `docs/LOYALTY_STEP2_TIMEZONE_REPORT.md`  
- **Шаг 3:** `docs/LOYALTY_STEP3_DEACTIVATION_REPORT.md`  
- **Шаг 5:** `docs/LOYALTY_STEP5_TESTS_REPORT.md` (тесты: timezone, winner min rule_id, deactivated в бронированиях)  
- **Финальная доработка:** `docs/LOYALTY_FINAL_SPEC_REPORT.md` (winner selection test, timezone обязательность при update мастера, Etc/GMT → Europe/Moscow в тестах)

### Фиксация скидки во временном бронировании (шаг 1)

- Скидка фиксируется **при создании** temporary (create), **не пересчитывается** при confirm.
- В `temporary_bookings` добавлены `fixed_discount_rule_type`, `fixed_discount_rule_id`, `fixed_discount_percent`, `fixed_discount_amount` (nullable). При confirm создаётся `AppliedDiscount` только из этих данных.
- Деактивация правила **после** создания temporary не отменяет скидку в подтверждённом бронировании.

### Timezone (шаг 2)

- **Backend:** `Master.timezone` обязателен для создания/обновления скидок. `_require_master_timezone` в `create_quick_discount` / `update_quick_discount` → HTTP 400 при пустом timezone. Fallback UTC в `loyalty_discounts` и `client.get_master_timezone` (унификация; не Europe/Moscow).
- **Web и Mobile:** при отсутствии timezone — баннер «Укажите город и часовой пояс…», блокировка создания скидок, кнопка перехода в настройки. В «Заполненность профиля» (web) — предупреждение «Не указан часовой пояс».

### Деактивация скидок (шаг 3)

- **Деактивация = `is_active: false`**, правило **не удаляется**. UI (переключатель шаблона, корзина) вызывает `PUT .../quick|complex|personal-discounts/:id` с `{ "is_active": false }`.
- Деактивированные правила **не применяются** к новым бронированиям (`applicable` только `is_active` + `match`). Уже оформленные брони с `AppliedDiscount` **не меняются**.
- Списки «Активные … скидки» на web и mobile показывают только `discounts.filter(d => d.is_active)`.

### Winner selection (уже в спецификации)

- Макс. `discount_percent` → приоритет `condition_type` (birthday → returning_client → regular_visits → first_visit → happy_hours → service_discount) → мин. `rule_id`. Тест `test_winner_selection_min_rule_id` проверяет tie-break по `rule_id`.

### Тесты (шаг 5)

- Добавлены: `test_winner_selection_min_rule_id`, `test_timezone_master_local_happy_hours`, `test_applied_discount_unchanged_after_rule_deactivation`. См. `LOYALTY_STEP5_TESTS_REPORT.md`.

---

## ЧАСТЬ A — Анализ текущей реализации «Быстрых скидок»

### 1. Поиск по коду (mobile + web)

#### Ключи: DiscountsQuickTab, quick discount, template, loyalty, birthday, returning, repeat, service discount, happy hours

| Файл | Найдено | Бизнес-логика / UI |
|------|--------|---------------------|
| **Mobile** | | |
| `mobile/src/components/loyalty/DiscountsQuickTab.tsx` | UI «Быстрые скидки», шаблоны, Switch, edit [input%][✓][✕], вызовы API | **Только UI.** Обработчики create/update/delete делегируют API. «Активность» шаблона — `isTemplateActive` / `findActiveDiscountForTemplate` из `loyaltyConditions`. |
| `mobile/src/types/loyalty_discounts.ts` | `LoyaltyDiscount`, `QuickDiscountTemplate`, `LoyaltyConditionType`, типы API | **Shared model.** Структуры данных, без логики. |
| `mobile/src/utils/loyaltyConditions.ts` | `isTemplateActive`, `findActiveDiscountForTemplate`, `normalizeConditionsForApi`, маппинг UI↔backend, `SUPPORTED_CONDITION_TYPES` | **Логика на frontend.** Сопоставление шаблон↔скидка по `condition_type` + `parameters`, нормализация `conditions` для API. Ссылается на `backend/utils/loyalty_discounts.py`. |
| `mobile/src/services/api/loyalty_discounts.ts` | `getLoyaltyTemplates`, `getLoyaltyStatus`, `createQuickDiscount`, `updateQuickDiscount`, `deleteQuickDiscount` | **Транспорт.** Вызовы `/api/loyalty/*`. |
| **Web** | | |
| `frontend/src/components/LoyaltySystem.jsx` | `QuickDiscountsTab`, «Быстрые скидки», шаблоны, активация, редактирование %, удаление | **Только UI.** Загрузка шаблонов + status, CRUD через `apiPost`/`apiPut`/`apiDelete`. |
| `frontend/src/utils/loyaltyConditions.js` | `SUPPORTED_CONDITION_TYPES`, маппинг типов для UI | **UI-only.** Справочник типов условий для сложных скидок. |
| **Backend** | | |
| `backend/routers/loyalty.py` | `QUICK_DISCOUNT_TEMPLATES`, эндпоинты `/templates`, `/status`, `/quick-discounts`, CRUD | **Частично логика.** Шаблоны — константа. CRUD — создание/обновление/удаление записей. |
| `backend/utils/loyalty_discounts.py` | `evaluate_discount_candidates`, `evaluate_and_prepare_applied_discount`, `_count_completed_visits`, `_get_last_completed_visit`, разбор `condition_type` | **Основная бизнес-логика.** Проверка условий (first_visit, returning_client, regular_visits, happy_hours, service_discount), выбор лучшего кандидата, расчёт скидки. |
| `backend/models.py` | `LoyaltyDiscount`, `PersonalDiscount`, `AppliedDiscount`, `LoyaltyConditionType` | **Модель данных.** |
| `backend/schemas.py` | Схемы loyalty, `QuickDiscountTemplate`, `LoyaltyDiscountCreate` и т.д. | **Валидация и контракт API.** |
| `backend/routers/bookings.py` | `evaluate_and_prepare_applied_discount`, `AppliedDiscount` при создании бронирования | **Применение скидок.** Вызов оценки при создании бронирования, запись в `applied_discounts`. |
| `backend/routers/client.py` | Аналогично — оценка скидок при создании/подтверждении бронирований | **Применение скидок.** |

**Итог:**  
- **Бизнес-логика условий и расчёта** сосредоточена в **backend** (`utils/loyalty_discounts.py`).  
- **Mobile** и **web** — в основном UI и вызовы API; в mobile дополнительно есть **frontend-логика** сопоставления шаблон↔активная скидка (`loyaltyConditions`).

---

### 2. Текущее поведение по каждому шаблону

| Шаблон | Реализовано | Где | Как считается | Где хранится |
|--------|-------------|-----|----------------|--------------|
| **1) Новый клиент** | ✅ Backend | `loyalty_discounts.evaluate_discount_candidates` | `_count_completed_visits(master_id, client_id, None, None) == 0` | `LoyaltyDiscount`, `conditions.condition_type: "first_visit"`, `parameters: {}` |
| **2) Повторные визиты** | ✅ Backend | там же | `visits_count`, `period` (week/month/year). Окно: `[booking_start - period, booking_start]`. completed-визиты. Match: `visits >= visits_count` | `parameters: { visits_count, period }` |
| **3) Возврат клиента** | ✅ Backend | там же | `days_since_last_visit`. Последний визит: последний **completed** booking. `delta_days = (booking_start - last_visit).days`. Match: `delta_days >= days_since` | `parameters: { days_since_last_visit, period? }` (period в шаблоне есть, в eval не используется) |
| **4) День рождения** | ❌ **Не реализовано** | Шаблон есть в `QUICK_DISCOUNT_TEMPLATES`, в `evaluate_discount_candidates` **нет** ветки `birthday` | — | Шаблон: `parameters: { days_before, days_after }`. При создании скидки «ДР» она попадает в БД, но при оценке даёт `unknown_condition` и **никогда не матчится**. |
| **5) Счастливые часы** | ✅ Backend | там же | Один интервал: `start_time`, `end_time`, `days_of_week` (1–7). `booking_start.time()` и `booking_start.isoweekday()` в диапазоне | `parameters: { start_time, end_time, days_of_week }` |
| **6) Скидка на услуги** | ✅ Backend | там же | `service_ids`, `category_ids`. Match: `service_id in service_ids` ИЛИ `service.category_id in category_ids` | `parameters: { service_ids, category_ids }` |

#### a) Реализовано ли сейчас?

- **Backend-логика:** first_visit, regular_visits, returning_client, happy_hours, service_discount — **да**. Birthday — **нет**.  
- **Frontend-логика:**  
  - **Mobile:** определение «шаблон активен» и «найти скидку по шаблону» — в `loyaltyConditions`; нормализация `conditions` для API.  
  - **Web:** только отображение и вызовы API; «активность» шаблона — по `condition_type` (без учёта `parameters` — **UI-only**, расхождение с mobile).  
- **Только UI:** названия, иконки, подписи, дефолтные проценты — в шаблонах и компонентах.

#### b) Какие данные используются

- **Клиент:** `client_id`, `client_phone` → User: `id`, `phone`, `birth_date`. `birth_date` **не используется** в оценке (birthday не реализован).  
- **Визиты:** `Booking` с `status = COMPLETED`, `master_id`, `client_id`. Отменённые **не** учитываются.  
- **Услуга:** `Service.id`, `Service.category_id`, `Service.price`.  
- **Время:** `booking.start_time` для happy_hours и returning (разница с last_visit).

#### c) Как считается скидка

- **Фиксированный %:** нет отдельного «фикс» — везде `discount_percent` из правила.  
- **Редактируемый %:** да, при активации можно задать свой % (mobile — через ✏️ и [input%][✓][✕], web — через поле и «Сохранить»).  
- **Суммирование:** **нет**. Применяется **одна** скидка — лучший кандидат по **winner selection**: макс. `discount_percent` → приоритет `condition_type` (birthday → … → service_discount) → мин. `rule_id`. Поле `priority` в модели не определяет выбор победителя.  
- **Деактивация:** правила с `is_active=False` не участвуют в выборе; уже применённые скидки в `AppliedDiscount` не пересчитываются (см. шаг 3).

#### d) Где хранится активированная скидка

- **Модель:** `LoyaltyDiscount` (`loyalty_discounts`), `master_id`, `discount_type = 'quick'`, `conditions` (JSON), `is_active` (bool). Деактивация = `is_active=false`; правило **не удаляется** (шаг 3).  
- **API:** `GET/POST/PUT/DELETE /api/loyalty/quick-discounts`, плюс `GET /api/loyalty/status` (все скидки). В UI «деактивация» реализована через `PUT` с `{ "is_active": false }`.  
- **Web и mobile:** одни и те же эндпоинты и структуры. Списки «Активные …» фильтруют по `is_active`. Хранение **одинаковое**.

---

### 3. Критические бизнес-вопросы

#### Новый клиент

- **«Новый»:** 0 **завершённых** визитов (`Booking.status = COMPLETED`). Не «0 записей» и не «0 оплат» — только completed.  
- **Отменённые визиты:** **не** учитываются.  
- **Сфера:** **мастер** (`master_id`). Не салон, не организация.

#### Повторные визиты

- **Повторный:** не «со 2-го визита», а «не меньше N визитов за период» (например, 5 за месяц).  
- **Минимальный интервал:** не задаётся. Считаются только количество и период (week/month/year).  
- **Разные мастера:** визиты считаются **только к данному мастеру** (`master_id`).

#### Возврат клиента

- **Через сколько дней:** задаётся в `days_since_last_visit` (в шаблоне по умолчанию 30).  
- **От какой даты:** от **последнего завершённого** визита (`last_booking.start_time`). Не дата записи.  
- **Разово или каждый раз:** **каждый раз**: при каждой оценке проверяется `delta_days >= days_since`.

#### День рождения

- **Окно (дни до/после):** в шаблоне есть `days_before`, `days_after` (по умолчанию 7/7), но **логика не реализована**.  
- **Если дата рождения не указана:** **не реализовано** — ветки birthday в коде нет.  
- **Таймзона / локаль:** **не реализовано**.

#### Счастливые часы

- **Временная логика:** **есть**. Один интервал `[start_time, end_time]` + `days_of_week`. Проверяется время и день бронирования.  
- **Несколько интервалов в день:** **нет**. Только один слот на правило.

#### Скидка на услуги

- **Связь с услугами:** **есть**. `service_ids` (список `Service.id`) и/или `category_ids` (категории `Service`).  
- **Сейчас:** по умолчанию в шаблоне `service_ids: []`, `category_ids: []` — без выбора конкретных услуг в UI быстрых скидок; при пустых списках правило **не матчится**. По сути это «общий» шаблон с возможностью привязки к услугам/категориям, но в UI он не настроен.

---

## Финальная спецификация parameters (реализовано 2026-01-28)

**Winner:** макс. discount_percent → приоритет condition_type (birthday → … → service_discount) → мин. rule_id. **TZ:** Master.timezone, fallback UTC; `get_master_local_now` / `to_master_local`. **Деактивация:** `is_active=false`; правило не удаляется; не применяется к новым бронированиям; уже оформленные (AppliedDiscount) не меняются. **Temporary:** скидка фиксируется при создании temporary, при confirm не пересчитывается (шаг 1).

### Дефолты (константы в backend `utils/loyalty_params` и `routers/loyalty`)

| Условие | Параметр | Дефолт |
|--------|----------|--------|
| returning_client | min_days_since_last_visit | 30 |
| returning_client | max_days_since_last_visit | null |
| birthday | days_before | 7 |
| birthday | days_after | 7 |
| regular_visits | visits_count | 2 |
| regular_visits | period_days | 60 |

### Форматы + backward compatibility

- **first_visit:** `{}`
- **regular_visits:** `{ visits_count: number, period_days: number }`. Legacy: `{ visits_count, period: 'week'|'month'|'year' }` → period_days (7/30/365).
- **returning_client:** `{ min_days_since_last_visit: number, max_days_since_last_visit?: number | null }`. Legacy: `{ days_since_last_visit }` → min, max=null.
- **birthday:** `{ days_before: number, days_after: number }`
- **happy_hours:** `{ days: number[], intervals: [{ start: 'HH:MM', end: 'HH:MM' }, ...] }`. Legacy: `{ start_time, end_time, days_of_week }` → один interval + days.
- **service_discount:** Один селекшен: `{ service_id }` или `{ category_id }`; percent из rule. Legacy: items/service_ids/category_ids с 1 элементом → конвертация; >1 → invalid_parameters (422). Валидация: service_id ∈ master_services, category_id у услуг мастера.

Валидации: happy_hours — start < end, end exclusive, интервалы не пересекаются. regular_visits B1: окно от «сейчас» (local). birthday, happy_hours: локальное время мастера.

---

## ЧАСТЬ B — Единая спецификация (web + mobile)

### 1. «Счастливые часы» (единая логика)

**Цель:** одна и та же структура и правила для backend, web и mobile.

**Структура данных (пример):**

```ts
happyHours: {
  days: number[];        // 1–7 (пн–вс), isoweekday
  intervals: Array<{
    start: string;       // "HH:MM"
    end: string;         // "HH:MM"
  }>;
}
```

**Правила:**

- **Дни недели:** множественный выбор. Допустимые значения 1–7.  
- **Интервалы:** несколько слотов в день. Каждый слот — `start`, `end` в формате `"HH:MM"`.  
- **Валидации:**  
  - `start < end` для каждого интервала.  
  - Интервалы не пересекаются (в рамках одного дня); при пересечении — явное правило (например, «запрет» или «объединение»).  
- **Применение:** дата/время визита (например, `booking.start_time`): день должен входить в `days`, время — хотя бы в один из `intervals`.  
- **Хранение:** например, в `conditions.parameters` при `condition_type: "happy_hours"` в том же формате, чтобы backend и клиенты использовали одну и ту же модель.

**Пример:**

```json
{
  "condition_type": "happy_hours",
  "parameters": {
    "days": [1, 2, 3, 4, 5],
    "intervals": [
      { "start": "10:00", "end": "12:00" },
      { "start": "18:00", "end": "20:00" }
    ]
  }
}
```

---

### 2. «Скидка на услуги» (единая логика)

**Цель:** один источник правды для правил «скидка на конкретные услуги», общий для web и mobile.

**Предлагаемые правила:**

- **Источник услуг:** строго услуги **мастера**. Сейчас в оценке используются `Service` из бронирования и `Service.category_id`; при унификации нужно зафиксировать, что в `service_ids` — id именно тех услуг, которые участвуют в бронированиях (например, `Service` мастера/салона или `MasterService` — в зависимости от доменной модели).  
- **Выбор:** несколько услуг. Для **каждой** услуги можно задать **свой** процент (если решим поддерживать) либо один общий % на все выбранные услуги.  
- **Валидации:**  
  - `0 < percent ≤ 100`.  
  - Одна услуга не дублируется в списке.  
- **Удалённая/скрытая услуга:** явно описать поведение: правило не матчится по такой услуге; при сохранении правил можно помечать «услуга удалена» или автоматически исключать из `service_ids`.

**Структура данных (пример):**

```ts
serviceDiscounts: Array<{
  serviceId: number;  // id услуги мастера
  percent: number;    // 0–100
}>;
```

Либо упрощённо: один общий `percent` и `service_ids: number[]`.  
Важно: **одна** структура в `conditions.parameters` для `condition_type: "service_discount"`, одна и та же для backend, web и mobile.

---

## ЧАСТЬ C — Связь с «Простыми скидками»

**Примечание:** В коде отдельной сущности «Простые скидки» нет. Есть **Быстрые** (quick) и **Сложные** (complex). Далее «Простые» трактуются как **целевая упрощённая модель правил**, к которой можно свести часть сценариев.

**Что имеет смысл отразить в «Простых скидках»:**

- Те же **типы условий**, что и у быстрых: first_visit, returning_client, regular_visits, happy_hours, service_discount, а после реализации — birthday.  
- **Общие поля:** `condition_type`, `parameters`, `discount_percent`, `max_discount_amount`, `is_active`, `priority`, привязка к `master_id`.  
- **Отличие от «Быстрых»:** быстрые — это шаблоны + один стандартный сценарий на тип; «Простые» можно рассматривать как правила с теми же условиями, но без жёсткой привязки к шаблонам (более свободная настройка в UI).

**Что общего:**

- **Быстрая скидка:** по сути частный случай правила с `condition_type` + `parameters`; хранится в `LoyaltyDiscount` с `discount_type = 'quick'`.  
- **Простая скидка:** та же модель правил (условия + процент + лимиты), при необходимости — тот же `LoyaltyDiscount` с отдельным типом или подмножество «простых» правил.  
- **Персональная:** отдельная сущность (`PersonalDiscount`), привязка по `client_phone`, без `conditions`. Общее с быстрыми/простыми: `discount_percent`, `max_discount_amount`, участие в общем процессе оценки (приоритет, выбор одного правила).

**Цель:** прийти к **единой discount-rule модели** (условия, проценты, приоритеты, мастер) и не дублировать логику проверки условий в разных «типах» скидок.

---

## ЧАСТЬ D — Итоговый отчёт

### 1. Где в коде что находится (mobile + web)

| Компонент | Mobile | Web | Backend |
|-----------|--------|-----|---------|
| UI «Быстрые скидки» | `DiscountsQuickTab.tsx` | `LoyaltySystem.jsx` → `QuickDiscountsTab` | — |
| Шаблоны | Из `GET /api/loyalty/templates` | Из того же API | `QUICK_DISCOUNT_TEMPLATES` в `routers/loyalty.py` |
| Сопоставление шаблон↔скидка | `loyaltyConditions`: `isTemplateActive`, `findActiveDiscountForTemplate` | По `condition_type` (без parameters) | — |
| Оценка условий при бронировании | — | — | `utils/loyalty_discounts.py`: `evaluate_discount_candidates` |
| Применение скидки | — | — | `evaluate_and_prepare_applied_discount`; вызов из `bookings`, `client` при создании/подтверждении бронирований |
| Хранение | — | — | `LoyaltyDiscount`, `AppliedDiscount`; API `quick-discounts`, `status` |

### 2. Как работает сейчас (по шаблонам)

- **Новый клиент:** 0 completed-визитов у мастера → матч.  
- **Повторные визиты:** N+ визитов за период (week/month/year) → матч.  
- **Возврат клиента:** дней с последнего completed-визита ≥ `days_since_last_visit` → матч.  
- **День рождения:** **не реализовано**; скидка сохраняется, но не применяется.  
- **Счастливые часы:** один интервал + дни недели; время и день бронирования в диапазоне → матч.  
- **Скидка на услуги:** `service_id` или `category_id` в списках → матч; по умолчанию списки пустые, в UI не задаются.

### 3. Что не реализовано

- **Birthday:** нет проверки в `evaluate_discount_candidates`; `birth_date` не используется.  
- **Несколько интервалов «счастливых часов»** в один день.  
- **Скидка на услуги:** в UI быстрых скидок нет выбора услуг/категорий; правило с пустыми списками не срабатывает.  
- **Web:** «активность» шаблона только по `condition_type` — расхождение с mobile и с реальной уникальностью скидки (по type + parameters).

### 4. Единая бизнес-спецификация (без UI)

- **Условия:** first_visit, regular_visits, returning_client, happy_hours, service_discount; отдельно доработать birthday.  
- **Область видимости:** всегда **мастер** (`master_id`).  
- **Визиты:** только `Booking.status = COMPLETED`.  
- **Один победитель:** макс. `discount_percent` → приоритет `condition_type` (birthday → … → service_discount) → мин. `rule_id`. Расчёт скидки от `Service.price` с учётом `max_discount_amount`. Правила с `is_active=false` не участвуют.  
- **Деактивация:** `is_active=false`; правило не удаляется; не применяется к новым бронированиям; `AppliedDiscount` по уже оформленным бронированиям не меняется.  
- **Temporary:** скидка фиксируется при создании temporary, при confirm не пересчитывается.  
- **Формат условий:** единая структура `conditions: { condition_type, parameters }` для всех платформ.  
- **Happy hours:** структура с `days` и `intervals[]` (см. выше).  
- **Service discount:** структура с `serviceIds`/`service_ids` и при необходимости `percent` по услуге (или один общий %).

### 5. Что нужно добавить в «Простые скидки»

- Те же `condition_type` и `parameters`, что и у быстрых.  
- Поля: `discount_percent`, `max_discount_amount`, `is_active`, `priority`, привязка к мастеру.  
- Использование **общей** с быстрыми логики оценки (одна реализация в backend, общая модель правил).

### 6. Вопросы, требующие решения

| Вопрос | Варианты / предложение |
|--------|-------------------------|
| Возврат клиента: порог по умолчанию | **30 дней** (уже в шаблоне). |
| ДР: окно до/после | **7 дней до, 7 дней после** (уже в шаблоне); при отсутствии ДР — не применять. |
| Повторный визит | **«Повторный» = со 2-го визита** при `visits_count = 2`, `period = month` (или иной период). Либо оставить «N визитов за период». |
| Таймзона для ДР и happy hours | Явно зафиксировать (например, таймзона салона/мастера или UTC) и использовать везде одинаково. |
| Несколько интервалов happy hours | Ввести `intervals[]` и единую структуру (см. раздел B). |
| Скидка на услуги: процент на каждую услугу | Либо один % на все выбранные услуги, либо `{ serviceId, percent }[]` — зафиксировать в спецификации. |
| Удалённая/скрытая услуга | Не матчить по ней; при редактировании правил — предупреждение или авто-исключение из списка. |

### 7. План дальнейшей реализации

**Выполнено (шаги 1–3):** фиксация скидки в temporary (шаг 1), унификация timezone и блокировка скидок без TZ (шаг 2), деактивация через `is_active` вместо удаления (шаг 3). Smoke-чеклисты — в `LOYALTY_STEP1_TEMPORARY_BOOKING_REPORT.md`, `LOYALTY_STEP2_TIMEZONE_REPORT.md`, `LOYALTY_STEP3_DEACTIVATION_REPORT.md`.

1. **Backend**  
   - Добавить в `evaluate_discount_candidates` поддержку **birthday** (окно `days_before`/`days_after`, использование `birth_date`; явно обработать отсутствие ДР).  
   - Привести **happy_hours** к единой структуре с `days` и `intervals[]`; реализовать проверку нескольких слотов.  
   - Уточнить **service_discount**: источник услуг (MasterService/Service), структура `parameters`, валидации.  
   - Вынести общие константы и форматы в один модуль (например, `loyalty_discounts` или отдельный `discount_rules`), чтобы использовать и в quick, и в «простых» правилах.

2. **Shared / контракт**  
   - Описать **единые** JSON-схемы для `conditions.parameters` по каждому `condition_type`.  
   - Задокументировать их в OpenAPI/spec и в общем описании для frontend (TypeScript-типы, виджет в админке).

3. **Frontend (web + mobile)**  
   - Привести **«активность» шаблона** к одной логике: по `condition_type` **и** `parameters` (как в mobile), общая функция или переиспользование.  
   - Реализовать UI для **настройки happy hours** (дни + несколько интервалов) и **выбора услуг** для service_discount по единой структуре.  
   - Использовать общие типы/схемы из shared-спека.

4. **Тесты**  
   - Unit-тесты на `evaluate_discount_candidates` по каждому типу условия (включая birthday и обновлённые happy_hours/service_discount).  
   - Интеграционные тесты: создание бронирования → применение нужной скидки, запись в `applied_discounts`.  
   - Добавлены: `test_deactivated_rule_not_applied`, `test_require_master_timezone_rejects_empty`; **шаг 5:** `test_winner_selection_min_rule_id`, `test_timezone_master_local_happy_hours`, `test_applied_discount_unchanged_after_rule_deactivation`. Тесты temporary/confirm — по чеклисту шага 1. См. `LOYALTY_STEP5_TESTS_REPORT.md`.

5. **Дальше**  
   - Ввести «Простые скидки» как ещё один способ создания правил с теми же условиями и общей оценкой, без дублирования логики.

---

**Критерий успеха:**  
После внедрения плана web и mobile используют **одну и ту же** модель скидок и общую логику проверки условий; все правила и ограничения описаны явно, дальнейшая разработка не опирается на «угадывания».

---

### Smoke / regression (шаги 1–3, 5)

- **Тесты:** `pytest backend/tests/test_loyalty_discounts.py` — все зелёные (29 тестов). В т.ч. `test_deactivated_rule_not_applied`, `test_require_master_timezone_rejects_empty`; **шаг 5:** `test_winner_selection_min_rule_id`, `test_timezone_master_local_happy_hours`, `test_applied_discount_unchanged_after_rule_deactivation`. См. `LOYALTY_STEP5_TESTS_REPORT.md`.
- **Шаг 1 (temporary):** Create temporary с скидкой → confirm без пересчёта; деактивация между create и confirm не сбрасывает скидку. См. `LOYALTY_STEP1_TEMPORARY_BOOKING_REPORT.md`.
- **Шаг 2 (timezone):** POST quick-discounts при пустом timezone → 400; web/mobile баннер и блокировка создания. См. `LOYALTY_STEP2_TIMEZONE_REPORT.md`.
- **Шаг 3 (деактивация):** Деактивация → скидка пропадает из «Активных …», не применяется к новым бронированиям; существующие `AppliedDiscount` не меняются. См. `LOYALTY_STEP3_DEACTIVATION_REPORT.md`.
