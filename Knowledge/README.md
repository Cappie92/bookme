---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-17
---

# Knowledge — каноническая база знаний DeDato

`Knowledge/` — единая физическая Project Knowledge base для онбординга, безопасной разработки и эксплуатации DeDato. Она хранит актуальную истину по каждому аспекту и не создаёт параллельные snapshots living knowledge.

## Physical model

`Knowledge/` is intentionally flat. Folders do not encode semantics. Все документы физически лежат непосредственно в `Knowledge/`; назначение, временной характер и environment задаются frontmatter и логическим registry ниже.

Filename описывает предмет знания. Группировка Core, Production, Test, Debt и Retro существует только в этом README и не создаёт filesystem hierarchy.

## Metadata contract

Каждый документ имеет обязательные dimensions:

```yaml
---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: YYYY-MM-DD
---
```

| Dimension | Allowed values | Meaning |
|-----------|----------------|---------|
| `knowledge_class` | `living`, `retro` | Текущий обновляемый SSOT или неизменяемый исторический artifact |
| `environment` | `common`, `prod`, `test` | Общепроектная, production-specific или staging/test-specific истина |
| `status` | `active`, `closed`, `superseded` | Текущий, завершённый или заменённый документ |
| `last_verified` | `YYYY-MM-DD` | Последняя зафиксированная проверка content/source boundary |

`living` включает current architecture, infrastructure, contracts, operations, product behavior и active technical debt. Такие документы обновляются на месте.

`retro` описывает завершённый release/incident/bug/migration/decision/audit или иной historical artifact. Он не становится альтернативной копией living SSOT. Поле `non_canonical: true` может дополнительно отмечать сохранённый audit/build artifact.

Документ с общим контрактом и отдельными prod/test особенностями остаётся `environment: common`; environment-копии без отдельного владельца не создаются.

## Source priority and confidence

Приоритет источников истины:

1. runtime-код;
2. модели данных и migrations;
3. executable configuration;
4. tests;
5. living `Knowledge/`;
6. обычная документация;
7. historical reports и retro artifacts.

Тест подтверждает конкретное поведение, но не имеет безусловного приоритета над runtime. При конфликте обновляется living owner-document; retro сохраняется как свидетельство своего baseline.

| Label | Meaning |
|-------|---------|
| `CONFIRMED` | Подтверждено указанными runtime/model/migration/config/test sources |
| `INFERRED` | Логический вывод из подтверждённых фактов |
| `REPORTED` | Получено из handoff/операционного отчёта, но отдельно не подтверждено |
| `UNKNOWN` | Надёжных данных недостаточно |

Один аспект имеет один living owner. Overview хранит границы и ссылки, а не копирует детальный контракт. Не использовать event-driven формулировки без подтверждённого publisher/consumer mechanism: business fact, synchronous side effect и реальное domain event — разные вещи.

Секреты и credential-like values нельзя переносить в Knowledge, source blocks или diff. Допустимы только sanitized category/path/status и required action.

## Registry

### Core and common product knowledge

- [Product roles and business model](product-roles-business-model.md)
- [Domain map](domain-map.md)
- [Onboarding](onboarding.md)
- [Identity and access](identity-access.md)
- [Privacy and data handling](privacy-data-handling.md)
- [Booking](booking.md)
- [Booking completion side effects](booking-completion-side-effects.md)
- [Scheduling and availability](scheduling.md)
- [Client CRM](client-crm.md)
- [Client loyalty](loyalty.md)
- [Promo](promo.md)
- [Operational finance](operational-finance.md)
- [Subscriptions billing](subscriptions-billing.md)
- [Subscriptions billing invariants](subscriptions-billing-invariants.md)
- [Subscriptions billing money flows](subscriptions-billing-money-flows.md)

### Architecture and configuration

- [Backend architecture](backend.md)
- [Background jobs](background-jobs.md)
- [Data and migrations](data-and-migrations.md)
- [Web architecture](web.md)
- [Mobile architecture](mobile.md)
- [Configuration and feature flags](configuration.md)

### Contracts

- [Backend API conventions](api-conventions.md)
- [Booking API](booking-api.md)
- [Client links and payment return](client-links-and-payment-return.md)
- [Feature entitlements](feature-entitlements.md)
- [Identity API](identity-api.md)
- [Robokassa and subscription payments](payments-robokassa.md)

### Operations and delivery

- [CI/CD](ci-cd.md)
- [Local development](local-development.md)
- [Testing strategy](testing-strategy.md)

### Production

- [Production topology](production-topology.md)
- [Deployment artifact inventory](deployment-artifact-inventory.md)

### Test / staging

- [Staging infrastructure and release gate](staging.md)

### Active debt

- [Backend and API debt](backend-api.md)
- [Booking and scheduling debt](booking-scheduling.md)
- [CRM, loyalty, promo and finance debt](client-crm-loyalty-promo-finance.md)
- [Client platforms debt](client-platforms.md)
- [Feature entitlements and jobs debt](feature-entitlements-and-jobs.md)
- [Security and privacy debt](security-and-privacy.md)
- [Subscriptions billing debt](subscriptions-billing-debt.md)
- [Testing, delivery and onboarding debt](testing-delivery-onboarding.md)

### Retro / non-canonical audit artifacts

These files preserve the completed Knowledge-build/audit context. Their historical open items do not override current living owners above.

- [Runtime coverage matrix](coverage-matrix.md)
- [Decision queue](decision-queue.md)
- [Runtime drift queue](drift-queue.md)
- [Knowledge build roadmap](knowledge-build-roadmap.md)
- [Runtime consistency audit](runtime-consistency-audit.md)
- [Source map](source-map.md)
- [Knowledge audit status](knowledge-audit-status.md)
