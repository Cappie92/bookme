---
type: Work
status: active
project: DeDato
non_canonical: true
---

# Source map

Служебный индекс исследования. Он указывает, где повторно проверять факты, но не владеет продуктовым содержанием.

| Область | Runtime/model/config anchors | Tests | Historical/supporting docs | Canon owner | Проверено |
|---------|------------------------------|-------|----------------------------|-------------|-----------|
| Product roles and domain boundaries | `backend/models.py`, `backend/settings.py`, routers | Role/flag tests | Master-only and domain audits | `Domain/product-roles-business-model.md`, `Domain/domain-map.md` | 2026-08-04 |
| Booking lifecycle | `backend/models.py` (`Booking*`), `backend/routers/bookings.py`, `backend/routers/client.py`, `backend/routers/public_master.py`, `backend/routers/accounting.py`, booking services/utils | `backend/tests/test_*booking*`, outcome/confirmation tests | Booking ADR and audits; runtime takes priority | `Domain/booking/`, `Contracts/booking-api.md`, `Debt/booking-scheduling.md` | 2026-08-04 |
| Scheduling | `backend/services/scheduling.py`, schedule models and master routes | scheduling/slot/conflict tests | Scheduling docs and audits | `Domain/scheduling/README.md`, `Debt/booking-scheduling.md` | 2026-08-04 |
| Booking completion side effects | `backend/services/booking_visit_finalize.py`, accounting routes, loyalty reserve/finalize, income and expense writers | completion, loyalty and finance idempotency tests | Existing product/domain map claims | Package 1 plus links to Package 4 owners | 2026-08-04 |
| Subscriptions billing | subscription/payment/balance routers, services, utils and models | billing suites | Existing billing docs | `Domain/subscriptions-billing/`, `Contracts/payments-robokassa.md`, `Debt/subscriptions-billing.md` | 2026-08-04 |
| Production topology | production Compose, Dockerfiles, frontend Nginx, backend startup/settings | Configuration-adjacent tests where applicable | Production runbooks are supporting only | `Infrastructure/production-topology.md` | 2026-08-04 |
| Data and migrations | database/settings, models, Alembic env/versions, workflow migration path | Migration/schema tests where present | Migration runbooks are supporting only | `Architecture/data-and-migrations.md` | 2026-08-04 |
| Identity/privacy | auth/admin/moderator routers, token/OAuth/storage clients, account deletion, privacy manifests | auth/role/deletion tests | Privacy/store reports; credential-like values never copied | Package 2 — `Domain/identity-access.md`, `Domain/privacy-data-handling.md`, `Contracts/identity-api.md`, `Debt/security-and-privacy.md` | 2026-08-04 |
| Flags/entitlements/jobs | settings, `GlobalSettings`, subscription feature utils, five service loops | flag/feature/job tests | Feature audits | Package 3 — `Infrastructure/configuration.md`, `Contracts/feature-entitlements.md`, `Architecture/background-jobs.md`, `Debt/feature-entitlements-and-jobs.md` | 2026-08-04 |
| CRM/loyalty/promo/finance | `backend/models.py`, master/client/public/loyalty/promo/accounting/expenses/tax routers, restriction/loyalty/promo/finalize services and utils | master-client/restriction, loyalty reserve/discount, promo engine, accounting suites | Existing audits; runtime takes priority | `Domain/client-crm.md`, `Domain/loyalty.md`, `Domain/promo.md`, `Domain/operational-finance.md`, `Debt/client-crm-loyalty-promo-finance.md` | 2026-08-04 |
| Backend/API architecture | `backend/main.py`, routers/services/utils/schemas/errors | API and transaction tests | Architecture docs | Package 5 | planned |
| Web/mobile architecture | client routes, stores, API clients, config/build manifests | frontend/mobile tests | Release and platform docs as supporting evidence | Package 6 | planned |
| Testing/CI/local/onboarding | root and nested workflows, test configs, package scripts, Compose/dev docs | Repository test suites themselves | Existing setup/runbooks | Package 7 | planned |
