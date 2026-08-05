# Knowledge — каноническая база знаний DeDato

`Knowledge/` — **Project Knowledge**: живое каноническое описание существующей системы DeDato для онбординга, безопасной разработки и эксплуатации. Оно фиксирует текущее состояние, обновляется вместе с системой и является Single Source of Truth по своему аспекту.

`Knowledge/` описывает **как система работает сейчас**, а не целевую архитектуру или состояние конкретного релиза.

## Информационная модель

| Класс | Назначение | Место в этом репозитории |
|-------|------------|--------------------------|
| **Project Knowledge** | Живые знания о текущем DeDato | `Knowledge/`; цель этой базы |
| **Global Knowledge** | Переиспользуемые знания для нескольких проектов | Вне scope `Knowledge/` DeDato |
| **Historical artifacts** | Состоявшиеся Release, Decision, Bug, Incident, Migration и аналогичные события/решения | `docs/`, архивы или специализированные системы; не живой канон |

Исторический артефакт может ссылаться на живой канон, но не должен владеть постоянно обновляемым описанием системы. Старый документ не становится каноном только потому, что уже существует, и не переписывается задним числом в попытке сделать его текущим.

## Приоритет источников истины

1. Runtime-код
2. Модели данных и миграции
3. Исполняемая конфигурация
4. Тесты
5. Существующие документы `Knowledge/`
6. Обычная документация
7. Исторические отчёты, планы и аудиты

Тест подтверждает конкретное поведение, но не имеет безусловного приоритета над runtime. При конфликте канона с более приоритетным источником обновляется существующий канон; исторический документ при этом сохраняется как свидетельство своего времени.

## Правила живого канона

- Один аспект системы имеет один основной живой документ или один явно определённый пакет документов.
- При изменении системы обновляется существующий канон, а не создаётся новый файл с номером версии или датой релиза.
- Допустима дата последней runtime-проверки; она не превращает документ в release snapshot.
- Важные утверждения содержат source-якоря: относительный путь и, по возможности, символ, endpoint, модель, migration или test case.
- Неподтверждённые детали не достраиваются по предположению: они помечаются `INFERRED`, `REPORTED` или `UNKNOWN`.
- Обзорные документы ссылаются на владельца аспекта и не копируют его детальные правила.

## Категории Project Knowledge

| Категория | Что описывает |
|-----------|---------------|
| **Domain** | Бизнес-поведение, сущности, жизненные циклы и инварианты |
| **Architecture** | Устройство системы и кода, компоненты и зависимости |
| **Contracts** | Границы и обязательства между компонентами и клиентами |
| **Infrastructure** | Среду исполнения и внешние зависимости |
| **Operations** | Повторяемые исполняемые процедуры |
| **Debt** | Подтверждённые ограничения и failure scenarios, но не roadmap |

Название каталога не заменяет проверку содержания: один факт должен принадлежать категории, которая им владеет, а остальные документы должны ссылаться на неё.

## Уровни уверенности и Source

| Метка | Смысл |
|-------|-------|
| **CONFIRMED** | Подтверждено указанными runtime/model/migration/config/test источниками |
| **INFERRED** | Логический вывод из подтверждённых фактов |
| **REPORTED** | Утверждается документацией или человеком, но отдельно не подтверждено |
| **UNKNOWN** | Надёжных данных недостаточно |

`CONFIRMED` означает достаточное подтверждение на момент проверки, а не вечную неизменность. Source-якоря позволяют повторить проверку после изменения системы.

## Бизнес-факты, side effects и события

Не использовать язык event-driven архитектуры без подтверждённого runtime-механизма. Следует различать:

- бизнес-факт, например «бронирование завершено»;
- синхронный side effect внутри того же request/transaction path;
- реальное доменное событие, только если существует механизм публикации и обработки события.

Стрелка на схеме или слово «реагирует» сами по себе не доказывают наличие event bus, очереди или асинхронного consumer.

## Безопасность

Секреты и credential-like значения нельзя переносить в `Knowledge/`, source-блоки, отчёты или diff. Допустимо фиксировать только категорию риска, путь или область, статус проверки и необходимое действие — без показа значения.

## Текущий канон

- [Domain/product-roles-business-model.md](Domain/product-roles-business-model.md) — роли и бизнес-модель DeDato
- [Domain/domain-map.md](Domain/domain-map.md) — карта бизнес-доменов DeDato
- [Domain/identity-access.md](Domain/identity-access.md) — account, authentication и фактические authorization boundaries
- [Domain/privacy-data-handling.md](Domain/privacy-data-handling.md) — personal-data lifecycle, analytics и third-party boundaries
- [Domain/client-crm.md](Domain/client-crm.md) — клиентская база мастера, restrictions, notes и favorites
- [Domain/loyalty.md](Domain/loyalty.md) — скидки, client points ledger и booking reservations
- [Domain/promo.md](Domain/promo.md) — legacy promo activation и новый Promo Engine
- [Domain/operational-finance.md](Domain/operational-finance.md) — доходы, расходы, налоги и параллельный legacy accounting
- [Domain/booking](Domain/booking/README.md) — жизненный цикл Booking и completion side effects
- [Domain/scheduling](Domain/scheduling/README.md) — расписание, слоты, timezone и конфликты
- [Domain/subscriptions-billing](Domain/subscriptions-billing/README.md) — SaaS-оплата подписки мастера
- [Contracts/booking-api.md](Contracts/booking-api.md) — route families и межклиентский контракт Booking
- [Contracts/identity-api.md](Contracts/identity-api.md) — register/login/verification/OAuth/session contract
- [Contracts/feature-entitlements.md](Contracts/feature-entitlements.md) — effective subscription, capability mapping и backend enforcement
- [Contracts/api-conventions.md](Contracts/api-conventions.md) — cross-domain HTTP, validation, auth/error и compatibility contract
- [Contracts/client-links-and-payment-return.md](Contracts/client-links-and-payment-return.md) — web/mobile public links, deep links и payment return contract
- [Contracts/payments-robokassa.md](Contracts/payments-robokassa.md) — контракт внешней оплаты подписки
- [Debt/booking-scheduling.md](Debt/booking-scheduling.md) — подтверждённые ограничения Booking/Scheduling, включая sanitized critical authorization debt
- [Debt/security-and-privacy.md](Debt/security-and-privacy.md) — sanitized repository-known security/privacy debt
- [Debt/feature-entitlements-and-jobs.md](Debt/feature-entitlements-and-jobs.md) — flag/entitlement drift и reliability фоновых loops
- [Debt/client-crm-loyalty-promo-finance.md](Debt/client-crm-loyalty-promo-finance.md) — CRM/Loyalty/Promo/Finance failure boundaries
- [Debt/backend-api.md](Debt/backend-api.md) — backend composition, transaction и HTTP contract drift
- [Debt/client-platforms.md](Debt/client-platforms.md) — web/mobile transport, navigation, build/link и diagnostic drift
- [Debt/testing-delivery-onboarding.md](Debt/testing-delivery-onboarding.md) — test discovery, CI/deploy gates и onboarding drift
- [Debt/subscriptions-billing.md](Debt/subscriptions-billing.md) — подтверждённые ограничения billing-контура
- [Infrastructure/production-topology.md](Infrastructure/production-topology.md) — repository-known production-топология и внешние границы
- [Infrastructure/configuration.md](Infrastructure/configuration.md) — env/DB/build configuration layers и precedence
- [Architecture/data-and-migrations.md](Architecture/data-and-migrations.md) — production database и lifecycle схемы данных
- [Architecture/background-jobs.md](Architecture/background-jobs.md) — lifecycle, cadence и reliability пяти in-process jobs
- [Architecture/backend.md](Architecture/backend.md) — FastAPI composition, request/session lifecycle и runtime boundaries
- [Architecture/web.md](Architecture/web.md) — React SPA composition, routes, data access и delivery boundaries
- [Architecture/mobile.md](Architecture/mobile.md) — Expo Router composition, API/config, deep links и mobile runtime boundaries
- [Operations/testing-strategy.md](Operations/testing-strategy.md) — исполняемые backend/web/mobile test tiers и границы гарантий
- [Operations/ci-cd.md](Operations/ci-cd.md) — repository-known GitHub Actions, docs automation и deployment gates
- [Operations/deployment-artifact-inventory.md](Operations/deployment-artifact-inventory.md) — production entry points, data scripts и legacy/historical deployment boundaries
- [Operations/local-development.md](Operations/local-development.md) — безопасный package-local bootstrap и local-only validation
- [Onboarding/README.md](Onboarding/README.md) — безопасный маршрут нового участника к канону и проверкам
