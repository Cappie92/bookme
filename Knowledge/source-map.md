---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-08-05
non_canonical: true
---

# Source map

Служебный индекс исследования. Он указывает, где повторно проверять факты, но не владеет продуктовым содержанием.

| Область | Runtime/model/config anchors | Tests | Historical/supporting docs | Canon owner | Проверено |
|---------|------------------------------|-------|----------------------------|-------------|-----------|
| Product roles and domain boundaries | `backend/models.py`, `backend/settings.py`, routers | Role/flag tests | Master-only and domain audits | `product-roles-business-model.md`, `domain-map.md` | 2026-08-04 |
| Booking lifecycle | `backend/models.py` (`Booking*`), `backend/routers/bookings.py`, `backend/routers/client.py`, `backend/routers/public_master.py`, `backend/routers/accounting.py`, booking services/utils | `backend/tests/test_*booking*`, outcome/confirmation tests | Booking ADR and audits; runtime takes priority | `booking.md`, `booking-api.md`, `booking-scheduling.md` | 2026-08-04 |
| Scheduling | `backend/services/scheduling.py`, schedule models and master routes | scheduling/slot/conflict tests | Scheduling docs and audits | `scheduling.md`, `booking-scheduling.md` | 2026-08-04 |
| Booking completion side effects | `backend/services/booking_visit_finalize.py`, accounting routes, loyalty reserve/finalize, income and expense writers | completion, loyalty and finance idempotency tests | Existing product/domain map claims | Package 1 plus links to Package 4 owners | 2026-08-04 |
| Subscriptions billing | subscription/payment/balance routers, services, utils and models | billing suites | Existing billing docs | `subscriptions-billing.md`, `payments-robokassa.md`, `subscriptions-billing-debt.md` | 2026-08-04 |
| Production topology | production Compose, Dockerfiles, frontend Nginx, backend startup/settings | Configuration-adjacent tests where applicable | Production runbooks are supporting only | `production-topology.md` | 2026-08-04 |
| Data and migrations | database/settings, models, Alembic env/versions, workflow migration path | Migration/schema tests where present | Migration runbooks are supporting only | `data-and-migrations.md` | 2026-08-04 |
| Identity/privacy | auth/admin/moderator routers, token/OAuth/storage clients, account deletion, privacy manifests | auth/role/deletion tests | Privacy/store reports; credential-like values never copied | Package 2 — `identity-access.md`, `privacy-data-handling.md`, `identity-api.md`, `security-and-privacy.md` | 2026-08-04 |
| Flags/entitlements/jobs | settings, `GlobalSettings`, subscription feature utils, five service loops | flag/feature/job tests | Feature audits | Package 3 — `configuration.md`, `feature-entitlements.md`, `background-jobs.md`, `feature-entitlements-and-jobs.md` | 2026-08-04 |
| CRM/loyalty/promo/finance | `backend/models.py`, master/client/public/loyalty/promo/accounting/expenses/tax routers, restriction/loyalty/promo/finalize services and utils | master-client/restriction, loyalty reserve/discount, promo engine, accounting suites | Existing audits; runtime takes priority | `client-crm.md`, `loyalty.md`, `promo.md`, `operational-finance.md`, `client-crm-loyalty-promo-finance.md` | 2026-08-04 |
| Backend/API architecture | `backend/main.py`, `backend/database.py`, `backend/auth.py`, `backend/schemas.py`, `backend/exceptions.py`, SPA/diagnostics, router/service/utils transaction call sites | TestClient fixture and cross-domain API/auth/error suites | Architecture docs; runtime takes priority | `backend.md`, `api-conventions.md`, `backend-api.md` | 2026-08-04 |
| Web/mobile architecture | `frontend/src/App.jsx`, auth/favorites/API/payment utilities, Vite/Nginx/Docker; `mobile/app/`, auth/store/API/env/deeplink/payment/analytics code, Expo/native config; `shared/` imports | frontend payment/analytics tests; mobile env/deeplink/payment tests; backend public-status/source tests | Release/platform docs are supporting only; runtime/config takes priority | `web.md`, `mobile.md`, `client-links-and-payment-return.md`, `client-platforms.md` | 2026-08-04 |
| Testing/CI/local/onboarding | `.github/workflows/`, `docs.sh`, MkDocs config, backend/frontend/mobile test configs and package scripts, Makefiles, local E2E harness, runtime Dockerfiles/lockfiles | 652 canonical backend tests collected; web/mobile unit/integration/E2E inventories | Package/root READMEs and setup docs are supporting only; credential-like artifacts not inspected | `testing-strategy.md`, `ci-cd.md`, `local-development.md`, `onboarding.md`, `testing-delivery-onboarding.md` | 2026-08-04 |
