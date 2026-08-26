---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-05
---

# DeDato — роли и бизнес-модель

Каноническое описание **продукта и бизнес-логики** DeDato «как есть».
Не путать с целевой архитектурой, маркетинговыми обещаниями и планами релизов.

Уровни уверенности: **CONFIRMED** / **INFERRED** / **REPORTED** / **UNKNOWN**
(см. `Knowledge/README.md`).

---

## Назначение продукта

### Какую проблему решает

**CONFIRMED.** DeDato — сервис онлайн-записи и ведения клиентской работы для индивидуальных мастеров (и, при включённых флагах, салонов): расписание, публичная страница записи, клиентская база, скидки/лояльность, операционный учёт доходов по записям.

Source: `frontend/src/pages/Home.jsx`; `backend/models.py` — `Master`, `Booking`, `LoyaltySettings`; [Operational Finance](operational-finance.md).

### Для кого

| Сторона | Роль в продукте |
|---------|-----------------|
| **Мастер** | Основной платящий пользователь SaaS: настраивает услуги, расписание, принимает записи |
| **Клиент** | Записывается к мастеру (часто через публичную страницу `/m/{slug}`), ведёт свои записи |
| **Салон** | Модель и route families существуют, но текущий default-конфиг не включает salon features как основной поддерживаемый путь |
| **Админ / модератор** | Операционное управление платформой |

Source: `backend/models.py` — `UserRole`; `backend/settings.py` — `SALONS_ENABLED`, `LEGACY_INDIE_MODE`; `backend/utils/master_canon.py`; `frontend/src/config/features.js`.

### Основная ценность

**INFERRED из позиционирования + модели данных.** Ценность для мастера — единый рабочий контур «страница записи → слоты → клиенты → скидки/баллы → операционный учёт доходов / статистика».
Ценность для клиента — запись без звонков, история записей, участие в лояльности мастера.

**Важно:** DeDato монетизируется как **SaaS для мастера**, а не как комиссия с оплаты услуги клиентом мастеру. Оплата услуги клиентом (если есть) — отдельный контур от оплаты тарифа DeDato.

Source: `subscriptions-billing.md` §1, §8.

---

## Участники и роли

### CLIENT (`user.role = client`)

| | |
|--|--|
| **Цель** | Записаться к мастеру/салону, управлять своими бронями, видеть лояльность у мастеров |
| **Ключевые возможности** | Публичная запись, личный кабинет записей, избранное, заметки о мастерах, настройки уведомлений |
| **Зона ответственности** | Свои данные аккаунта; доступные действия по своим бронированиям (создание / отмена / запрос переноса — в рамках правил) |
| **Данные** | `User` + связи `Booking.client_id`, favorites, notes, loyalty transactions как клиент |
| **Не может** | Управлять расписанием мастера; использовать клиентскую роль как профессиональный контур тарификации; администрировать платформу |
| **Взаимодействие** | Создаёт запись у MASTER (или salon/branch при включённом салоне); получает скидки/баллы по правилам мастера |

Source: `backend/models.py` — `UserRole.CLIENT`, `Booking.client_id`.

**Оговорка:** в публичном booking/auth flow человек может начать запись до того, как в системе уже существует завершённый аккаунт `User(role=client)`. Канонически «клиент записи» — сторона бронирования; наличие готового `User(role=client)` на каждом шаге UI **не следует** считать безусловным инвариантом.

### MASTER (`user.role = master`)

| | |
|--|--|
| **Цель** | Принимать онлайн-записи и вести клиентов в DeDato |
| **Ключевые возможности** | Профиль + `domain` (slug публичной страницы), услуги, расписание, подтверждение / исполнение / outcome бронирований, клиентская база, лояльность (скидки + баллы), операционный учёт доходов и статистика (по entitlements тарифа), покупка/продление подписки |
| **Зона ответственности** | Своё расписание, услуги, публичная страница, правила лояльности, pre-visit и post-visit решения по записям |
| **Данные** | `Master` (1:1 с `User`), услуги, schedule, bookings с `master_id`, loyalty settings/discounts, subscription на `User` |
| **Не может** (продуктово) | Быть «платформенным админом»; произвольно менять чужие брони других мастеров |
| **Взаимодействие** | Принимает CLIENT; может быть связан с SALON (модель `salon_masters` / invitations); платит DeDato за тариф |

Source: `backend/models.py` — `Master`, `User.master_profile`.

**Флаг профиля:** `is_always_free` на `User` даёт полный доступ к платным функциям без обычной оплаты (операционный/внутренний режим).

Source: `backend/models.py` — `User.is_always_free`; `backend/utils/subscription_features.py`.

### SALON (`user.role = salon`)

| | |
|--|--|
| **Цель** | Управление салоном: филиалы, места, мастера, записи в контексте салона |
| **Факт доступности** | Модели и роуты существуют; включение завязано на `SALONS_ENABLED` / `enableSalonFeatures`. Default-конфигурация не делает salon основным поддерживаемым путём |
| **Данные** | `Salon`, `SalonBranch`, `SalonPlace`, invitations, bookings с `salon_id`/`branch_id` |
| **Ограничение** | Не описывать как текущий default-сценарий без явного включения соответствующих флагов |

Source: `backend/models.py` — `Salon`, `SalonBranch`; `backend/settings.py` — `salons_enabled_env`; admin key `enableSalonFeatures`.

### INDIE (`user.role = indie`) + `IndieMaster`

**LEGACY.** Отдельная сущность `IndieMaster` и роль `indie` сохранены в моделях. Текущий default — master path (`LEGACY_INDIE_MODE=0`); indie остаётся compatibility-контуром, а не основным поддерживаемым professional path.

Source: `backend/models.py` — `UserRole.INDIE`, `IndieMaster`; `backend/settings.py` — `LEGACY_INDIE_MODE`; `backend/utils/master_canon.py`; `backend/tests/test_master_canon_flags.py`.

### ADMIN (`user.role = admin`)

| | |
|--|--|
| **Цель** | Управление платформой: пользователи, тарифы/функции, promo-engine, настройки, модерация контента |
| **Не является** | Участником записи клиент↔мастер как равноправная сторона бронирования |

Source: `backend/models.py` — `UserRole.ADMIN`; admin routers.

### MODERATOR (`user.role = moderator`)

**CONFIRMED existence.** Роль и `ModeratorPermissions` есть в модели. Детальный продуктовый scope модератора в этом документе **не развёрнут** (требуется отдельный Knowledge при необходимости).

Source: `backend/models.py` — `UserRole.MODERATOR`.

### Связанные орг. сущности (не отдельные login-роли)

| Сущность | Смысл |
|----------|--------|
| **Филиал** (`SalonBranch`) | Подразделение салона |
| **Место** (`SalonPlace`) | Рабочее место в филиале |
| **Приглашение мастера в салон** | `SalonMasterInvitation` |
| **Менеджер филиала** | `BranchManagerInvitation` → связь user↔branch |

Source: `backend/models.py`.

---

## Основные бизнес-сущности

Включать только подтверждённые. Цены тарифов **не** фиксируются здесь (живут в БД `SubscriptionPlan`).

### Пользователь (`User`)

- **Смысл:** учётная запись участника платформы.
- **Владелец:** сам пользователь; платформа хранит.
- **ЖЦ:** появление аккаунта → активная работа; soft-флаги `is_active`.
- **Связи:** 0..1 `Master` / `Salon` / `IndieMaster`; N bookings как client; subscriptions; balance.
- **Инвариант:** `role` определяет кабинет и доступные действия.
- **Не канонизировать здесь:** конкретный набор способов входа — это механизм доступа, а не устойчивое ядро бизнес-модели.

### Профиль мастера (`Master`)

- **Смысл:** публичная и рабочая идентичность мастера.
- **Владелец:** `User` с ролью master.
- **Ключевое:** уникальный `domain` (slug страницы `/m/{domain}`), город/таймзона, адрес, авто/ручное подтверждение записей.
- **Связи:** услуги, расписание, брони, лояльность, модули страницы.

### Салон / филиал / сотрудник

- **Салон** — организационный профиль, связанный с `User(role=salon)`.
- **Филиал / место** — структура салона.
- **«Сотрудник»** = мастер, привязанный к салону через M2M/invitations, а не отдельная login-роль `employee`.
- **Статус:** feature-gated salon context поверх основного master path.

### Услуга

- **Смысл:** то, на что записывается клиент (длительность, цена).
- **Владелец:** мастер (и/или салон в salon-контексте).
- **Связи:** `Booking.service_id`; каталоги/категории мастера.
- **Замечание:** в коде сосуществуют `Service` и `MasterService` — маппинг при публичной записи нужно читать в booking-пути (детали — отдельный Domain-документ при необходимости).

### Расписание и слот

- **Расписание** хранит правила/окна доступности исполнителя.
- **Слот** — вычисляемый интервал под длительность услуги; точные precedence, timezone, blocking и overlap semantics принадлежат [Scheduling](scheduling.md).

Source: `backend/models.py` — schedule models; `backend/services/scheduling.py`; [Scheduling](scheduling.md).

### Бронирование (`Booking`)

- **Смысл:** договорённость о визите: клиент ↔ исполнитель, услуга и интервал времени.
- **Участники и права сторон (вместо «владельца»):**
  - **клиент** — создаёт запись и выполняет доступные ему действия со своей записью (например отмена / запрос изменения — по правилам продукта);
  - **мастер** — подтверждает (если включено), исполняет визит и фиксирует outcome;
  - **платформа** — хранит запись, статусы, связи с лояльностью и операционным учётом.
- **Привязка исполнителя:** основной master path использует `master_id`; salon и legacy indie остаются отдельными repository-known owner contexts.
- **Публичный идентификатор для клиента:** `public_reference` (не sequential id).
- **Оплата услуги:** поля `payment_method` (`on_visit` / `advance`), `is_paid` — **отдельно** от SaaS `Payment`.

Lifecycle имеет несколько create/status/cancellation/reschedule route families и не сводится к одной линейной цепочке. Точные raw/effective statuses, mutation actors, cancellation semantics, completion side effects и подтверждённые расхождения принадлежат [Booking](booking.md), [Booking completion side effects](booking-completion-side-effects.md) и [Booking API](booking-api.md); этот product overview их не переопределяет.

Source: `backend/models.py` — `Booking`, `BookingStatus`; [Booking](booking.md).

### Клиент (как бизнес-понятие)

Не отдельная таблица «Client». Обычно клиент = `User(role=client)` плюс мастер-специфичные данные (`MasterClientMetadata`, loyalty, restrictions, notes).
См. оговорку выше про промежуточные шаги публичного booking/auth.

### Подписка и тариф

- **Тариф** (`SubscriptionPlan`) описывает коммерческое предложение и capability/limit configuration.
- **Подписка** (`Subscription`) связывает пользователя с периодом доступа.
- Точные effective-access, reserve, charge и apply semantics принадлежат [Subscriptions Billing](subscriptions-billing.md) и [Feature Entitlements](feature-entitlements.md).

Source: `backend/models.py` — `SubscriptionPlan`, `Subscription`; [Subscriptions Billing](subscriptions-billing.md).

### Платёж (`Payment`)

В денежном контуре SaaS `Payment` относится к оплате тарифа DeDato и отделён от оплаты визита клиентом мастеру. Provider, balance/split и apply details принадлежат billing/payment contract.

Source: [Subscriptions Billing](subscriptions-billing.md); [Robokassa contract](payments-robokassa.md).

### Промокод / promo-engine

Кампании и коды для наград (в т.ч. баллы подписки) с идемпотентными grants.
Current promo-engine eligibility paths ориентированы на master/indie.

Source: `backend/models.py` — Promo*; `backend/routers/admin_promo_engine.py`.

### Бонусные баллы подписки (`SubscriptionPointsLedger`)

Баллы, которые мастер может направить на оплату **SaaS-тарифа**. Их расчёт и списание принадлежат billing-контуру; этот обзор не фиксирует формулу.

**Не путать** с баллами лояльности клиента у мастера.

Source: `subscriptions-billing-money-flows.md`; `backend/models.py`.

### Программа лояльности (у мастера)

Скидки и client-points ledger принадлежат конкретному мастеру и связаны с Booking, но остаются отдельным money-like контуром от SaaS subscription points. Точные evaluation, reserve/release/spend/earn и idempotency semantics принадлежат [Client Loyalty](loyalty.md) и [Booking completion side effects](booking-completion-side-effects.md); этот обзор фиксирует только продуктовую границу.

Source: `backend/models.py` — `LoyaltyDiscount`, `LoyaltySettings`, `LoyaltyTransaction`; [Client Loyalty](loyalty.md).

### Отзыв

**Нет модели Review в `models.py`.** Есть продуктный флаг `enableReviews` в admin settings.
→ сущность **не каноническая**; статус: частично/флаг без подтверждённой доменной модели отзывов.

### Уведомление

Не единый доменный агрегат «Notification»: preferences клиента; in-app сигналы расписания у мастера; email/SMS сценарии бронирований.
Для бизнес-модели: уведомления — **канал сопровождения записи**, не отдельный денежный объект.

---

## Ключевые пользовательские потоки

### 1. Регистрация и роль

1. Появляется учётная запись участника.
2. Назначается роль (client / master; salon — при включённых салонах).
3. Для master — создаётся профиль, выбираются город/таймзона, настраивается `domain`.

### 2. Настройка предложения мастера

Услуги → расписание → (опционально) лояльность → публикация страницы `/m/{slug}`.

### 3. Запись клиента

1. Клиент открывает публичную страницу (ссылка / App Link).
2. Выбирает услугу → дату → слот.
3. При необходимости проходит auth / завершение аккаунта (см. оговорку про `User(role=client)`).
4. Создаётся `Booking`, после чего его дальнейшее состояние определяется конкретным Booking route/lifecycle path.
5. Scheduling, Loyalty и Operational Finance участвуют через свои repository-known read/synchronous boundaries; точные правила принадлежат их канонам.

Подробно: [Booking](booking.md), [Scheduling](scheduling.md), [Client Loyalty](loyalty.md), [Operational Finance](operational-finance.md).

### 4. Оплата тарифа DeDato (мастер)

Master выбирает тариф и проходит поддерживаемый billing/payment path; успешный apply влияет на effective subscription и entitlements. Подробный lifecycle: [Subscriptions Billing](subscriptions-billing.md) и [Robokassa contract](payments-robokassa.md).

### 5. Повторная запись

Клиент из кабинета или снова с публичной страницы; мастер видит историю/метаданные клиента.

---

## Модель монетизации

| Вопрос | Ответ (факт) |
|--------|----------------|
| Кто платит DeDato? | **Мастер** (user тарифа), не клиент услуги |
| За что? | Доступ к функциям тарифного плана на период |
| Роль подписки | Связывает период доступа с plan capabilities/limits; точное enforcement — в owner contracts |
| Длительности пакетов | 1 / 3 / 6 / 12 месяцев (поля цен на плане) |
| Конкретные рубли | **Не канонизировать** — значения в БД `SubscriptionPlan` |
| Без активной подписки | Ограниченный набор функций; точный матричный список — через `check_feature_access` / план Free |
| AlwaysFree / `is_always_free` | Обход обычной монетизации для отмеченных пользователей |
| Промокоды | Награды (в т.ч. subscription points), идемпотентные grants |
| Баллы подписки | Участвуют в покрытии цены тарифа по правилам billing-контура |
| Связь оплаты с доступом | Успешный billing apply создаёт/продлевает `Subscription`; детали принадлежат billing owner |

**Не входит в монетизацию DeDato:** комиссия с `Booking.payment_amount` клиента (это расчёт визита у мастера).

Source: `subscriptions-billing.md`.

---

## Бизнес-инварианты

1. Client, professional и platform roles имеют разные продуктовые поверхности; фактическое authorization enforcement принадлежит [Identity and access](identity-access.md) и scoped Debt.
2. Основной professional path использует `Master`; salon feature-gated, indie legacy compatibility, а их модели не доказывают default-доступность продукта.
3. **SaaS-деньги ≠ client loyalty points ≠ оплата визита.** Это разные контуры с разными владельцами.
4. Product overview не определяет Booking transitions, slot blocking, Loyalty ledger или Finance accounting semantics: их SSOT — [Booking](booking.md), [Scheduling](scheduling.md), [Client Loyalty](loyalty.md), [Operational Finance](operational-finance.md) и [Subscriptions Billing](subscriptions-billing.md).

---

## Current supported scope

| Область | Статус |
|---------|--------|
| Master + публичная запись + bookings | **Реализовано** (CONFIRMED) |
| Client cabinet | **Реализовано** |
| Loyalty discounts + points (reserve / release / spend / earn) | **Реализовано** (CONFIRMED; глубина — отдельный Domain) |
| SaaS subscriptions + Robokassa + split | **Реализовано** (канон в `Knowledge/subscriptions-billing.md`) |
| Salon / branches / places | **Частично / feature-gated**; не default product path |
| Indie master | **Legacy compatibility**, выключен default-настройкой |
| Reviews | **Флаг без доменной модели Review** |
| Произвольный deposit balance API | **Отключён** (410) |
| Direct StoreKit / Apple IAP | **Реализовано для iOS-подписок мастера** |
| Оплата услуги клиентом через Robokassa end-to-end как основной путь | **UNKNOWN / не канонизировать** без отдельного Domain — поля на Booking есть |

### Mobile Yandex Auth configuration (не бизнес-инвариант)

Tracked mobile preview/production EAS profiles устанавливают `YANDEX_MOBILE_AUTH_VISIBLE=0`, поэтому соответствующая кнопка скрыта в этих repository-defined build profiles. Это build configuration, а не бизнес-правило о допустимых способах входа. Фактическая конфигурация опубликованного store build — `UNKNOWN` без внешней проверки.

Source: `mobile/eas.json` — `YANDEX_MOBILE_AUTH_VISIBLE`.

---

## Открытые продуктовые вопросы

1. Должен ли salon-контур стать default-supported web/mobile path или оставаться feature-gated?
2. Канонизировать ли предоплату услуги клиентом (`advance`) как поддерживаемый продукт или оставить `on_visit` основным?
3. Отзывы: строить домен или убрать/игнорировать флаг `enableReviews`?
4. Единая матрица «что даёт Free vs платные планы» для продукта (сейчас — данные плана + feature checks)?

---

## Связанные документы

- `Knowledge/README.md` — правила канона
- `subscriptions-billing.md`
- `subscriptions-billing-money-flows.md`
- `subscriptions-billing-invariants.md`
- `booking.md`
- `scheduling.md`
- `client-crm.md`
- `loyalty.md`
- `operational-finance.md`
- `payments-robokassa.md`
- `subscriptions-billing-debt.md`
