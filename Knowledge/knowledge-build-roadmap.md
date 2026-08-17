---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-08-05
non_canonical: true
---

# Knowledge build roadmap

Служебный план наполнения. Не является продуктовым или архитектурным SSOT: канон создаётся в обычных разделах `Knowledge/`.

## Packages

| # | Пакет | Приоритет | Зависимости | Статус | Предполагаемые владельцы | Критерий готовности |
|---|-------|-----------|-------------|--------|--------------------------|---------------------|
| 1 | Booking and Scheduling | P0 | Existing product/domain map | `completed` | `booking.md`, `scheduling.md`, `booking-api.md`, `booking-scheduling.md` | Runtime create/status/outcome/availability paths, clients, tests и debt согласованы; critical authorization debt описан sanitized; overview не дублирует детали |
| 2 | Identity, Authorization and Privacy | P0 | Roles/business model; Package 1 public/auth boundary | `completed` | `identity-access.md`, `privacy-data-handling.md`, `identity-api.md`, `security-and-privacy.md` | Account/auth/role/privacy/storage/third-party behavior разделены; credential-like evidence sanitized; host retention остаётся UNKNOWN |
| 3 | Feature flags, Entitlements and Background Jobs | P0 | Billing canon; production topology | `completed` | `feature-entitlements.md`, `background-jobs.md`, `configuration.md`, `feature-entitlements-and-jobs.md` | Env/DB/client flags и пять loops имеют source-backed ownership, precedence и single-instance constraints |
| 4 | Client CRM, Loyalty, Promo and Finance | P1 | Booking completion facts; billing boundaries | `completed` | `client-crm.md`, `loyalty.md`, `promo.md`, `operational-finance.md`, `client-crm-loyalty-promo-finance.md` | Money-like ledgers и side effects разделены от SaaS billing и Booking lifecycle |
| 5 | Backend and API Architecture | P1 | Packages 1–4 contracts | `completed` | `backend.md`, `api-conventions.md`, `backend-api.md` | Composition, transactions, schemas, conventions, compatibility и drift описаны без повторения domain rules |
| 6 | Mobile and Web Architecture | P1 | Identity/API contracts; feature configuration | `completed` | `mobile.md`, `web.md`, `client-links-and-payment-return.md`, `client-platforms.md` | Routes, guards, storage, API, links, analytics, builds и platform drift подтверждены runtime/config |
| 7 | Testing, CI/CD, Local Development and Onboarding | P2 | Architecture/contracts from previous packages | `completed` | `testing-strategy.md`, `ci-cd.md`, `local-development.md`, `onboarding.md`, `testing-delivery-onboarding.md` | Existing capability отделена от required gates; onboarding ссылается на канон и воспроизводимые repository procedures |

## Global completion gates

- Каждый аспект имеет одного владельца; overview содержит только границы и ссылки.
- Существенные утверждения имеют runtime/model/config/test source anchors и confidence downgrade при необходимости.
- Historical docs используются только после сверки с источниками более высокого приоритета.
- Knowledge не содержит secrets, абсолютных локальных путей, target-state архитектуры или ложной event-driven семантики.
- Каждый пакет проходит link/source-path validation и `git diff --check`, затем получает отдельный documentation commit.
- Product code, tests, migrations и executable config остаются неизменными.
