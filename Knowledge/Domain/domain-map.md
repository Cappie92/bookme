---
type: Knowledge
status: active
project: DeDato
---

# DeDato — карта доменов

Верхнеуровневая карта **бизнес-доменов** существующей системы.
Не техническая архитектура и не план развития.

Связанные каноны:

- [роли и бизнес-модель](product-roles-business-model.md)
- [Booking](booking/README.md)
- [Scheduling](scheduling/README.md)
- [subscriptions-billing](subscriptions-billing/README.md)

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
Не создаёт бронь; не владеет исходом визита. Детальный канон: [Scheduling](scheduling/README.md).

---

## Booking

### Назначение
Договорённость о визите: создание, статусы, отмена, подтверждение, post-visit outcome, связь с операционным доходом по записи.

### Владелец данных
`Booking` (+ связанные confirmation/income/missed revenue по факту визита) — CONFIRMED.

### Основные сущности
`Booking`, `BookingStatus`, `BookingEditRequest`, `BookingConfirmation`, `Income`, `MissedRevenue` — CONFIRMED.

### Основные процессы
Создание записи; pre-visit confirm (авто/ручное); ветки отмены; ожидание/истечение оплаты услуги (если сценарий активен); post-visit outcome → completion; фиксация операционного дохода.

### Что получает извне
Identity/Profiles (стороны); Services; Scheduling (слот).

### Что публикует наружу
Состояние записи и синхронно рассчитанные результаты для других доменов:

- booking created;
- booking cancelled;
- booking completed;

а также статус и операционный доход для Client CRM, Notifications, Analytics. В текущем runtime create/cancel/completion paths синхронно вызывают discount/loyalty reserve, release, spend и earn logic; publisher/event bus для этой связи не подтверждён.

### Границы
Не SaaS-оплата тарифа DeDato; не владеет правилами и ledger лояльности. Детальный канон: [Booking](booking/README.md) и [completion side effects](booking/completion-side-effects.md).

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
Не лояльность (баллы/скидки — отдельный домен); не публичная витрина.

---

## Loyalty

### Назначение
Программа лояльности мастера для клиентов: скидки и баллы, связанные с визитами.

### Владелец данных
Правила и ledger лояльности у мастера — CONFIRMED.

### Основные сущности
`LoyaltySettings`, `LoyaltyTransaction`, `LoyaltyDiscount`, personal discounts / applied discounts — CONFIRMED.

### Основные процессы
Настройка скидок и баллов; синхронные вызовы из Booking paths:

- при **created** — резерв выбранных баллов (если применимо);
- при **cancelled** — освобождение резерва;
- при **completed** — фактический spend и earn по правилам мастера;

без дублей при повторной обработке того же outcome.

### Что получает извне
Profiles (мастер); Identity (client_id, когда есть); Booking context и вызовы create / cancel / completion. Runtime dependency Booking → Loyalty существует на уровне orchestration; lifecycle Booking при этом остаётся во владельце Booking.

### Что публикует наружу
Доступные/зарезервированные баллы; применённые скидки к расчёту визита; факт spend/earn.

### Границы
Не subscription points SaaS; не Robokassa; не CRM-заметки; не владеет жизненным циклом брони.

---

## Billing (Subscriptions → Payments → Balance)

### Назначение
SaaS-монетизация: тарифы мастера, оплата/продление, баланс, entitlements доступа к функциям.

### Владелец данных
Планы, подписки, платежи SaaS, денежный баланс, subscription points — CONFIRMED.
Канон: `Knowledge/Domain/subscriptions-billing/*`.

### Основные сущности
`SubscriptionPlan`, `Subscription`, `SubscriptionPriceSnapshot`, `Payment`, `UserBalance`, `BalanceTransaction`, `SubscriptionReservation`, `SubscriptionPointsLedger`, `DailySubscriptionCharge` — CONFIRMED.

### Основные процессы
Расчёт → split → free/balance/Robokassa → apply подписки → reserve → daily charges; проверка feature access.

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
Не loyalty-скидки мастера клиенту (другой контур); не сам apply подписки и не внутренняя логика split/оплаты.

---

## Notifications

### Назначение
Сопровождение записи и аккаунта каналами связи (in-app / email / SMS — по фактическим сценариям).

### Владелец данных
**INFERRED / частичный:** нет единого агрегата «Notification» как ядра домена. Есть preferences клиента и разрозненные отправки.

### Основные сущности
Предпочтения уведомлений клиента (хранилище preferences); триггеры из Booking/Identity — CONFIRMED existence каналов, **не** единая модель Notification.

### Основные процессы
Отправка/показ уведомлений по событиям брони и аккаунта; хранение согласий/preferences.

### Что получает извне
События Booking, Identity; иногда Profiles.

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
**Частично + feature flags** (`SALONS_ENABLED` / `enableSalonFeatures`). В master-only MVP **не** обязательный домен первого релиза.

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

### Feature / release notes
Mobile Yandex Auth button может быть **скрыт** релизной конфигурацией — это поставка Integrations/Identity UX, не отдельный домен.

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
| Billing | Identity, Profiles; готовые результаты Promo Engine |
| Promo Engine | Identity |
| Notifications | Booking, Identity, Profiles |
| Analytics | UI-события из Public Profiles / Booking / Billing / Identity |
| Administration | Identity + обзор сущностей других доменов |
| Salon | Identity, Profiles |
| Search | — (продуктового домена нет) |
| Integrations | вызываются Billing / Identity / Notifications / Analytics / Profiles |

---

## Основные бизнес-потоки через домены

### Публичная запись

```text
Public Profiles
  → Services
  → Scheduling
  → (Identity — при необходимости auth)
  → Booking
  → Loyalty          # синхронный расчёт скидки/резерва из create path
  → Notifications    # по событиям записи
  → Analytics        # цели/события (если включены)
```

### Оплата подписки мастера

```text
Identity
  → Billing          # calculate / split / pay / apply
  → Promo Engine     # при применении промо/баллов подписки
  → Billing          # effective subscription + entitlements
  → Analytics        # return/success события (если есть)
```

### Настройка мастера к приёму записей

```text
Identity
  → Profiles
  → Services
  → Scheduling
  → Public Profiles  # публикация slug
  → (Loyalty)        # опционально правила
  → Billing          # entitlements на функции
```

### Post-visit завершение

```text
Booking (outcome / completed)
  → Loyalty          # синхронный spend резерва + earn в finalize transaction path
  → Client CRM       # обновление истории взаимодействия
  → Notifications
```

---

## Домены первого релиза

### Обязательные для master-only MVP (CONFIRMED / INFERRED)

Identity, Profiles, Public Profiles, Services, Scheduling, Booking, Client CRM, Loyalty, Billing, Promo Engine (как источник SaaS-наград), Notifications (минимально для сопровождения), Administration (операции платформы), Analytics (наблюдаемость), Integrations (Robokassa и необходимые каналы).

### Существуют, но выключены / не канон MVP

| Домен | Статус |
|-------|--------|
| Salon | Feature flags; не основной путь |
| Reviews | Флаг без доменной модели (см. product-roles) |
| Mobile Yandex Auth UI | Релизная конфигурация off |

### Legacy

| Домен / контур | Статус |
|----------------|--------|
| Indie (`IndieMaster`, role indie) | Legacy при master-only |
| Произвольный deposit balance API | Отключён (410) в billing-каноне |

### Отсутствует как продуктовый домен

Search (marketplace-поиск).

---

## Открытые вопросы архитектуры продукта

1. Нужен ли Salon в ближайшем публичном релизе или остаётся выключенным контуром?
2. Канонизировать ли предоплату услуги клиентом как полноценный поток Booking↔Integrations(оплата), или основной путь — `on_visit`?
3. Нужен ли отдельный продуктовый домен Search / каталог мастеров?
4. Следует ли выделять «операционный учёт доходов/расходов мастера» в отдельный Domain-документ или держать как выход Booking?
5. Notifications: достаточно ли текущего «канального» статуса или нужна единая доменная модель?
6. Reviews: строить домен или исключить из канона продукта?
7. Где проходит жёсткая граница Services vs Profiles vs Public Profiles при кастомизации страницы записи?

Не предлагать решения в этом документе — только зафиксировать вопросы.
