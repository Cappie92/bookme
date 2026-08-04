---
type: Work
status: active
project: DeDato
non_canonical: true
---

# Knowledge build roadmap

Служебный план наполнения. Не является продуктовым или архитектурным SSOT: канон создаётся в обычных разделах `Knowledge/`.

## Packages

| # | Пакет | Приоритет | Зависимости | Статус | Предполагаемые владельцы | Критерий готовности |
|---|-------|-----------|-------------|--------|--------------------------|---------------------|
| 1 | Booking and Scheduling | P0 | Existing product/domain map | `completed` | `Domain/booking/`, `Domain/scheduling/`, `Contracts/booking-api.md`, `Debt/booking-scheduling.md` | Runtime create/status/outcome/availability paths, clients, tests и debt согласованы; critical authorization debt описан sanitized; overview не дублирует детали |
| 2 | Identity, Authorization and Privacy | P0 | Roles/business model; Package 1 public/auth boundary | `completed` | `Domain/identity-access.md`, `Domain/privacy-data-handling.md`, `Contracts/identity-api.md`, `Debt/security-and-privacy.md` | Account/auth/role/privacy/storage/third-party behavior разделены; credential-like evidence sanitized; host retention остаётся UNKNOWN |
| 3 | Feature flags, Entitlements and Background Jobs | P0 | Billing canon; production topology | `completed` | `Contracts/feature-entitlements.md`, `Architecture/background-jobs.md`, `Infrastructure/configuration.md`, `Debt/feature-entitlements-and-jobs.md` | Env/DB/client flags и пять loops имеют source-backed ownership, precedence и single-instance constraints |
| 4 | Client CRM, Loyalty, Promo and Finance | P1 | Booking completion facts; billing boundaries | `completed` | `Domain/client-crm.md`, `Domain/loyalty.md`, `Domain/promo.md`, `Domain/operational-finance.md`, `Debt/client-crm-loyalty-promo-finance.md` | Money-like ledgers и side effects разделены от SaaS billing и Booking lifecycle |
| 5 | Backend and API Architecture | P1 | Packages 1–4 contracts | `completed` | `Architecture/backend.md`, `Contracts/api-conventions.md`, `Debt/backend-api.md` | Composition, transactions, schemas, conventions, compatibility и drift описаны без повторения domain rules |
| 6 | Mobile and Web Architecture | P1 | Identity/API contracts; feature configuration | `completed` | `Architecture/mobile.md`, `Architecture/web.md`, `Contracts/client-links-and-payment-return.md`, `Debt/client-platforms.md` | Routes, guards, storage, API, links, analytics, builds и platform drift подтверждены runtime/config |
| 7 | Testing, CI/CD, Local Development and Onboarding | P2 | Architecture/contracts from previous packages | `completed` | `Operations/testing-strategy.md`, `Operations/ci-cd.md`, `Operations/local-development.md`, `Onboarding/README.md`, `Debt/testing-delivery-onboarding.md` | Existing capability отделена от required gates; onboarding ссылается на канон и воспроизводимые repository procedures |

## Global completion gates

- Каждый аспект имеет одного владельца; overview содержит только границы и ссылки.
- Существенные утверждения имеют runtime/model/config/test source anchors и confidence downgrade при необходимости.
- Historical docs используются только после сверки с источниками более высокого приоритета.
- Knowledge не содержит secrets, абсолютных локальных путей, target-state архитектуры или ложной event-driven семантики.
- Каждый пакет проходит link/source-path validation и `git diff --check`, затем получает отдельный documentation commit.
- Product code, tests, migrations и executable config остаются неизменными.
