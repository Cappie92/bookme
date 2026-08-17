---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-05
---

# DeDato — карта доменов

Верхнеуровневая карта **бизнес-доменов** существующей системы.
Не техническая архитектура и не план развития.

Слова «получает» и «предоставляет» ниже обозначают business/data dependency. Они не означают event bus, domain-event publisher или asynchronous consumer. Там, где runtime использует прямой query либо синхронный function/service call, это указывается явно; неподтверждённая event semantics не достраивается.

Связанные каноны:

- [роли и бизнес-модель](product-roles-business-model.md)
- [Identity and access](identity-access.md)
- [Privacy and data handling](privacy-data-handling.md)
- [Client CRM](client-crm.md)
- [Client Loyalty](loyalty.md)
- [Promo](promo.md)
- [Operational Finance](operational-finance.md)
- [Booking](booking.md)
- [Scheduling](scheduling.md)
- [subscriptions-billing](subscriptions-billing.md)

Уровни: **CONFIRMED** / **INFERRED** / **UNKNOWN**.

---

## Identity

### Назначение
Учётные записи участников, роль, доступ в кабинеты, сессия.

### Владелец данных
Домен Identity — источник истины по `User` (идентичность, роль, флаги активности/верификации).

### Основные сущности
`User`, `UserOAuthAccount` (CONFIRMED).

### Основные процессы
Регистрация / вход; назначение роли; верификация телефона по сценариям; восстановление доступа; привязка OAuth-аккаунта (web).

### Что получает извне
Почти ничего: точка входа в систему.

### Что публикует наружу
Идентификатор пользователя, роль, факт аутентификации для остальных доменов.

### Границы
Не владеет профилем мастера/салона, бронями, тарифами, лояльностью клиента.

Фактические registration/session/verification/authorization boundaries и подтверждённый critical Debt описаны в [Identity and access](identity-access.md). Privacy lifecycle и third-party data flows принадлежат [Privacy and data handling](privacy-data-handling.md); они не дублируются в Identity.

---

## Profiles

### Назначение
Профессиональные и клиентские профильные данные поверх Identity.

### Владелец данных
`Master` / `Salon` (и legacy `IndieMaster`) как профильные записи, связанные с `User`.

### Основные сущности
`Master`, `Salon`, `IndieMaster` (legacy), связанные настройки профиля (адрес, город, таймзона, `domain` у мастера) — CONFIRMED.

### Основные процессы
Создание/редактирование профиля мастера или салона; фиксация города/таймзоны; связь master↔salon (приглашения).

### Что получает извне
`User` + роль из Identity.

### Что публикует наружу
Профиль исполнителя/организации для Booking, Scheduling, Public Profiles, Client CRM, Billing entitlements context.

### Границы
Не публичная витрина как таковая (см. Public Profiles); не слоты и не брони.

---

## Public Profiles

### Назначение
Публичная страница записи мастера (`/m/{slug}`): то, что видит гость/клиент до и во время записи.

### Владелец данных
Публичное представление профиля и настроек страницы мастера (`domain`, описание, модули страницы) — CONFIRMED.

### Основные сущности
`Master.domain`, `MasterPageModule`; данные услуг/слотов **читаются** из Services / Scheduling, не дублируются здесь как source of truth.

### Основные процессы
Открытие публичной страницы по slug; показ услуг и доступных слотов; старт сценария записи (с возможным auth).

### Что получает извне
Profiles, Services, Scheduling; при записи — Identity (если нужна сессия).

### Что публикует наружу
Контекст для создания Booking (мастер, услуга, слот); ссылки/deeplink в приложения.

### Границы
Не каталог «поиск всех мастеров» (см. Search); не кабинет мастера.

---

## Services

### Назначение
Каталог услуг, на которые можно записаться (длительность, цена, привязка к мастеру/контексту).

### Владелец данных
Услуги и связи мастер↔услуга (`Service`, `MasterService`, категории) — CONFIRMED.

### Основные сущности
`Service`, `MasterService`, `ServiceCategory` / `MasterServiceCategory` — CONFIRMED.
Сосуществование двух представлений услуги — факт модели; детальный маппинг — отдельный Domain при необходимости.

### Основные процессы
CRUD услуг мастера; выбор услуги на публичной странице и в кабинетах.

### Что получает извне
Profiles (чей каталог).

### Что публикует наружу
`service_id`, длительность и цену для Scheduling (расчёт слотов) и Booking.

### Границы
Не расписание и не факт бронирования.

---

## Scheduling

### Назначение
Доступность исполнителя во времени: окна работы и вычисление свободных слотов под услугу.

### Владелец данных
Правила/окна доступности (`MasterSchedule`, settings, `AvailabilitySlot`) — CONFIRMED.
Слот как «забронированный объект» обычно **вычисляется**, а не хранится отдельно.

### Основные сущности
`MasterSchedule`, `MasterScheduleSettings`, `AvailabilitySlot` — CONFIRMED.

### Основные процессы
Настройка расписания; расчёт доступных интервалов с учётом длительности услуги и занятых броней.

### Что получает извне
Profiles; Services (длительность); Booking (занятость пересекающимися бронями).

### Что публикует наружу
Кандидаты слотов для Public Profiles / Booking.

### Границы
Не создаёт бронь; не владеет исходом визита. Детальный канон: [Scheduling](scheduling.md).

---

## Booking

### Назначение
Договорённость о визите: создание, состояния, отмена, подтверждение и post-visit outcome.

### Владелец данных
`Booking` и связанные mutation/reschedule данные жизненного цикла записи — CONFIRMED. Accounting stores не принадлежат Booking overview.

### Основные сущности
`Booking`, `BookingStatus`, `BookingEditRequest` — CONFIRMED. `BookingConfirmation`, `MasterExpense`, `Income` и `MissedRevenue` принадлежат [Operational Finance](operational-finance.md), хотя часть записей создаётся синхронно из completion path.

### Основные процессы
Создание и изменение записи; endpoint-specific pre/post-visit paths; cancellation/reschedule; вызов repository-known completion orchestration. Точная lifecycle semantics принадлежит [Booking](booking.md).

### Что получает извне
Identity/Profiles (стороны); Services; Scheduling (слот).

### Что предоставляет другим доменам
Текущее состояние и business facts записи доступны прямым readers (например Client CRM) и caller-side integrations. Create/cancel paths могут синхронно обращаться к Loyalty, а common completion orchestration — к Loyalty и Operational Finance side effects внутри caller transaction. Repository publisher/event bus для этих связей не подтверждён.

### Границы
Не SaaS-оплата тарифа DeDato; не владеет правилами и ledger лояльности. Детальный канон: [Booking](booking.md) и [completion side effects](booking-completion-side-effects.md).

---

## Client CRM

### Назначение
Ведение клиентской базы **у мастера**: кто клиент, заметки, ограничения, избранное со стороны клиента.

### Владелец данных
Мастер-специфичные данные о клиентах и клиентские связи с мастерами — CONFIRMED.

### Основные сущности
`MasterClientMetadata`, `ClientMasterNote`, `ClientRestriction` / `ClientRestrictionRule`, `ClientFavorite` — CONFIRMED.

### Основные процессы
Просмотр/поиск клиентов мастера; заметки и alias; стоп-листы/ограничения; избранные мастера у клиента.

### Что получает извне
Identity; Profiles; Booking (история визитов как источник «кто уже был»).

### Что публикует наружу
Контекст клиента для UI мастера и ограничений записи (где применяется).

### Границы
Не лояльность (баллы/скидки — отдельный домен); не публичная витрина. Детальный канон: [Client CRM](client-crm.md).

---

## Loyalty

### Назначение
Программа лояльности мастера для клиентов: скидки и баллы, связанные с визитами.

### Владелец данных
Правила и ledger лояльности у мастера — CONFIRMED.

### Основные сущности
`LoyaltySettings`, `LoyaltyTransaction`, `LoyaltyDiscount`, personal discounts / applied discounts — CONFIRMED.

### Основные процессы
Настройка скидок и баллов; repository-known синхронные вызовы из Booking create/cancel/completion paths. Точные reserve/release/spend/earn и idempotency semantics принадлежат [Client Loyalty](loyalty.md), а не этой карте.

### Что получает извне
Profiles (мастер); Identity (client_id, когда есть); Booking context и вызовы create / cancel / completion. Runtime dependency Booking → Loyalty существует на уровне orchestration; lifecycle Booking при этом остаётся во владельце Booking.

### Что публикует наружу
Доступные/зарезервированные баллы; применённые скидки к расчёту визита; факт spend/earn.

### Границы
Не subscription points SaaS; не Robokassa; не CRM-заметки; не владеет жизненным циклом брони. Детальный канон: [Client Loyalty](loyalty.md).

---

## Billing (Subscriptions → Payments → Balance)

### Назначение
SaaS-монетизация: тарифы мастера, оплата/продление, баланс, entitlements доступа к функциям.

### Владелец данных
Планы, подписки, платежи SaaS, денежный баланс, subscription points — CONFIRMED.
Канон: [Subscriptions billing](subscriptions-billing.md) и его linked invariants/money-flow owners.

### Основные сущности
`SubscriptionPlan`, `Subscription`, `SubscriptionPriceSnapshot`, `Payment`, `UserBalance`, `BalanceTransaction`, `SubscriptionReservation`, `SubscriptionPointsLedger`, `DailySubscriptionCharge` — CONFIRMED.

### Основные процессы
Оплата/продление и effective feature access. Точные calculate/split/apply/reserve/charge semantics принадлежат [Subscriptions Billing](subscriptions-billing.md) и не повторяются в overview.

### Что получает извне
Identity (плательщик); Profiles (контекст мастера); **уже созданные результаты промо** (награды / баллы подписки и т.п.), без зависимости от внутренней логики Promo Engine.

### Что публикует наружу
Effective subscription и доступ к функциям (entitlements) для остальных доменов.

### Границы
Не оплата услуги клиента мастеру; не loyalty-баллы клиента; не владеет правилами промо-кампаний.

---

## Promo Engine

### Назначение
Промо-кампании и коды с наградами (в т.ч. для SaaS), идемпотентные grants.
Источник промо-наград для Billing и смежных сценариев.

### Владелец данных
Кампании, коды, redemption, grants — CONFIRMED.

### Основные сущности
`PromoCampaign`, `PromoEngineCode` / `PromoCode`, `PromoRedemption`, `PromoRewardGrant` (+ связанные enum) — CONFIRMED.

### Основные процессы
Создание кампаний (admin); активация/redemption; выдача наград без дублей по роли redemption.

### Что получает извне
Identity (кто активирует).

### Что публикует наружу
Результаты промо: grants / subscription points / иные награды в рамках поддерживаемых типов — потребляются Billing как готовые артефакты.

### Границы
Не loyalty-скидки мастера клиенту (другой контур); не сам apply подписки и не внутренняя логика split/оплаты. Детальный канон, включая два mounted promo-контура: [Promo](promo.md).

---

## Operational Finance

### Назначение
Единственный canonical owner операционного учёта подтверждённого/ожидаемого дохода, расходов, налогов и упущенной выручки мастера или салона.

### Владелец данных
Canonical master accounting использует `BookingConfirmation`, `MasterExpense` и `TaxRate`; legacy salon/indie accounting использует отдельные `Expense`, `Income`, `MissedRevenue` и связанные types/templates — CONFIRMED.

### Основные процессы
Post-visit confirmation; отчёты и export; CRUD расходов; выбор налоговой ставки по дате; legacy salon/indie finance routes; process-local materialization recurring expenses.

### Что получает извне
Booking context и синхронный completion call; Services для service-based expenses; Identity/Profile owner context; Loyalty points для real-money interpretation.

### Что публикует наружу
Operational income/expense views и derived totals для кабинета мастера/салона.

### Границы
Не SaaS Billing, UserBalance или Robokassa. Два accounting stores не считаются единым ledger без repository reconciliation. Детальный канон: [Operational Finance](operational-finance.md).

---

## Notifications

### Назначение
Сопровождение записи и аккаунта каналами связи (in-app / email / SMS — по фактическим сценариям).

### Владелец данных
**INFERRED / частичный:** нет единого агрегата «Notification» как ядра домена. Есть preferences клиента и разрозненные отправки.

### Основные сущности
Предпочтения уведомлений клиента (хранилище preferences); триггеры из Booking/Identity — CONFIRMED existence каналов, **не** единая модель Notification.

### Основные процессы
Endpoint/service-specific отправка или показ сообщений в поддерживаемых сценариях; хранение preferences. Единого notification event consumer не подтверждено.

### Что получает извне
Прямые вызовы и контекст Booking/Identity; иногда Profiles. Наличие business fact не означает опубликованное domain event.

### Что публикует наружу
Доставку сообщений пользователю (побочный эффект, не бизнес-факт записи).

### Границы
Не источник истины по статусу брони или платежа.

---

## Analytics

### Назначение
Наблюдаемость продукта: веб-метрика и мобильная аналитика событий.

### Владелец данных
Внешние системы аналитики (Яндекс.Метрика / AppMetrica) + клиентская отправка событий — CONFIRMED как интеграции; **не** доменная БД DeDato.

### Основные сущности
События/цели на клиентах (web/mobile) — CONFIRMED existence; серверной «Analytics»-модели нет.

### Основные процессы
Инициализация счётчиков; pageview/hit; reachGoal / track event.

### Что получает извне
Факты UI и успешных сценариев (в т.ч. оплата подписки на return).

### Что публикует наружу
Данные во внешние кабинеты аналитики.

### Границы
Не влияет на бизнес-инварианты Booking/Billing; не entitlement.

---

## Administration

### Назначение
Операционное управление платформой: пользователи, планы/функции, глобальные флаги, контент (блог), promo admin.

### Владелец данных
Admin/moderator операции над системными сущностями и `GlobalSettings` — CONFIRMED.

### Основные сущности
`User` (управление), `SubscriptionPlan`, `ServiceFunction`, `GlobalSettings`, blog models (при включённом блоге), admin promo — CONFIRMED.

### Основные процессы
CRUD пользователей/планов; флаги (`enableSalonFeatures`, `enableReviews`, …); модерация; управление promo-engine.

### Что получает извне
Данные всех доменов для обзора/правок.

### Что публикует наружу
Конфигурацию платформы и каталог тарифов/функций.

### Границы
Не участник клиент↔мастер брони как равноправная сторона.

---

## Salon

### Назначение
Организационный контур: салон, филиалы, места, привязка мастеров.

### Владелец данных
`Salon`, `SalonBranch`, `SalonPlace`, invitations — CONFIRMED models.

### Основные процессы
Управление структурой салона; приглашения мастеров; записи в salon/branch контексте (когда контур включён).

### Что получает извне
Identity (`role=salon`); Profiles мастеров.

### Что публикует наружу
Контекст филиала/места для Scheduling/Booking в salon-режиме.

### Границы / статус
**Частично + feature flags** (`SALONS_ENABLED` / `enableSalonFeatures`). Default-конфигурация не делает Salon основным поддерживаемым path.

---

## Search

### Статус
**Отсутствует как продуктовый домен «поиск мастеров/услуг для клиента».**
CONFIRMED: есть служебный поиск внутри admin/списков (фильтры ILIKE), но нет канонического marketplace-поиска.

### Границы
Не путать с выбором слота или поиском клиента в CRM мастера.

---

## Integrations

### Назначение
Внешние сервисы, к которым DeDato подключается для оплаты, карт, auth, коммуникаций, аналитики.

### Источник внешних данных
Внешние системы; в DeDato — конфигурация и адаптеры.

### Подтверждённые направления (CONFIRMED existence)
| Интеграция | Назначение |
|------------|------------|
| Robokassa | Оплата SaaS-подписки |
| Yandex OAuth | Вход/привязка на web |
| Yandex Maps / geocoder | Адрес/карты |
| AppMetrica / Яндекс.Метрика | Analytics |
| SMS/email провайдеры | Notifications (каналы) |

### Границы
Не бизнес-правила доменов; сбои интеграции не меняют канон «кто платит / кто владеет бронью», но влияют на доставку оплаты/сообщений.

### Configuration note
Tracked preview/production EAS profiles скрывают Mobile Yandex Auth button. Это build configuration Integrations/Identity UX, не отдельный домен и не бизнес-инвариант; фактический store build остаётся `UNKNOWN`.

**Source:** `mobile/eas.json` — `YANDEX_MOBILE_AUTH_VISIBLE`.

---

## Зависимости доменов

| Домен | Использует |
|-------|------------|
| Identity | — |
| Profiles | Identity |
| Public Profiles | Profiles, Services, Scheduling |
| Services | Profiles |
| Scheduling | Profiles, Services, Booking |
| Booking | Profiles, Services, Scheduling, Identity (когда сессия есть), Loyalty APIs/logic для скидки и synchronous side effects |
| Client CRM | Identity, Profiles, Booking |
| Loyalty | Profiles, Identity, Booking context для reserve/release/spend/earn |
| Operational Finance | Booking context/completion call, Profiles, Services, Loyalty interpretation |
| Billing | Identity, Profiles; готовые результаты Promo Engine |
| Promo Engine | Identity |
| Notifications | Booking, Identity, Profiles |
| Analytics | UI-события из Public Profiles / Booking / Billing / Identity |
| Administration | Identity + обзор сущностей других доменов |
| Salon | Identity, Profiles |
| Search | — (продуктового домена нет) |
| Integrations | вызываются Billing / Identity / Notifications / Analytics / Profiles |

---

## Основные business flows и synchronous dependencies

Стрелки ниже показывают пользовательскую последовательность или direct runtime dependency. Они не обозначают публикацию domain events.

### Публичная запись

```text
Public Profiles
  → Services
  → Scheduling
  → (Identity — при необходимости auth)
  → Booking
```

Booking create paths могут синхронно обратиться к Loyalty для расчёта/сохранения применимого loyalty context. Notifications зависят от конкретного handler/service path, а Analytics отправляется клиентами там, где соответствующая интеграция включена; универсальный downstream pipeline не подтверждён.

### Оплата подписки мастера

```text
Identity → Billing
Promo Engine grants → Billing
Billing result → client-side Analytics (если интеграция включена)
```

Promo Engine предоставляет готовые grants; он не является обязательным промежуточным шагом каждой оплаты.

### Настройка мастера к приёму записей

```text
Identity
  → Profiles
  → Services
  → Scheduling
  → Public Profiles
```

Loyalty settings и Billing entitlements — отдельные optional/capability dependencies, а не обязательные шаги одной transaction.

### Post-visit завершение

```text
Booking outcome/completion
  → synchronous Loyalty side effects
  → synchronous Operational Finance side effects
```

Client CRM читает Booking history позднее и не получает подтверждённое событие. Notification delivery не является универсальной частью общего finalize service.

---

## Current supported scope

### Основной repository-supported product path (CONFIRMED / INFERRED)

Основной path центрирован на master/client: Identity, Profiles, Public Profiles, Services, Scheduling, Booking, Client CRM, Loyalty, Billing и platform Administration. Promo Engine предоставляет optional SaaS-награды; Notifications, Analytics и Integrations участвуют только в подтверждённых handler/client/provider paths, а не как обязательные доменные стадии каждого сценария.

### Feature-gated / configuration-shaped

| Домен | Статус |
|-------|--------|
| Salon | Модели/routes существуют; feature flags; не default path |
| Reviews | Флаг без доменной модели (см. product-roles) |
| Mobile Yandex Auth UI | В tracked preview/production EAS profiles скрыт конфигурацией; фактический store build `UNKNOWN` |

### Legacy

| Домен / контур | Статус |
|----------------|--------|
| Indie (`IndieMaster`, role indie) | Legacy compatibility; default `LEGACY_INDIE_MODE=0` |
| Произвольный deposit balance API | Отключён (410) в billing-каноне |

### Отсутствует как продуктовый домен

Search (marketplace-поиск).

---

## Открытые вопросы архитектуры продукта

1. Должен ли Salon стать default-supported path или оставаться feature-gated контуром?
2. Канонизировать ли предоплату услуги клиентом как полноценный поток Booking↔Integrations(оплата), или основной путь — `on_visit`?
3. Нужен ли отдельный продуктовый домен Search / каталог мастеров?
4. Notifications: достаточно ли текущего «канального» статуса или нужна единая доменная модель?
5. Reviews: строить домен или исключить из канона продукта?
6. Где проходит жёсткая граница Services vs Profiles vs Public Profiles при кастомизации страницы записи?

Не предлагать решения в этом документе — только зафиксировать вопросы.
