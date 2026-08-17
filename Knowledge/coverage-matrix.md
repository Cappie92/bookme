---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-08-05
non_canonical: true
audit_baseline: d3407a57171993e23ad3dd6aed3d98a99e7cd196
---

# Runtime coverage matrix

Coverage measures whether a significant runtime aspect has a clear Knowledge owner. It does not require one document per file and does not imply correctness of the implementation.

| Runtime area/component | Canonical owner | Coverage | Evidence | Gap |
|---|---|---|---|---|
| Backend application composition and route mounting | `backend.md` | FULL | `backend/main.py`; router inventory | None |
| Identity/OAuth/verification models and auth router | `identity-access.md`; `identity-api.md` | FULL | `backend/models.py`; `backend/auth.py`; `backend/routers/auth.py` | None |
| Actual role/object authorization behavior | `identity-access.md`; scoped Debt | FULL | Dependencies and mutation-handler checks | Remediation remains separate from documentation |
| Master/salon/indie profile model and lifecycle | `product-roles-business-model.md`; `domain-map.md` | PARTIAL | Models and master/salon/public routers | No detailed owner for profile creation, branch membership and legacy bridges |
| Service catalog, categories and per-master settings | `domain-map.md`; `scheduling.md` | PARTIAL | Service/category models and master/salon routers | Price/duration ownership is mentioned but catalog mutation/lifecycle is not owned |
| Booking, temporary booking and edit-request lifecycle | `booking.md`; `booking-api.md` | FULL | Booking models/router/factory/status helpers | None |
| Scheduling, slots and conflicts | `scheduling.md` | FULL | Scheduling service, schedule models and conflict helpers | None |
| Client CRM, notes, favorites and restrictions | `client-crm.md` | FULL | Client/master-client routers, models and helpers | None |
| Client loyalty and discount ledger | `loyalty.md` | FULL | Loyalty routers/models/reserve and finalization helpers | None |
| Subscription, balance, payment and subscription-points ledger | Subscriptions/billing canon and payment contract | FULL | Subscription/payment models, routers and billing helpers | None |
| Promo Engine and legacy promo | `promo.md` | FULL | Promo routers/service/models | None |
| Operational `Income`/`MissedRevenue` ownership | `operational-finance.md` and `domain-map.md` | MULTIPLE_OWNERS | Finance and Booking sections both claim related owner data | Resolve overview ownership wording |
| Public profile/domain/page modules/blog | `domain-map.md`; `configuration.md` | PARTIAL | Domain/blog/public/module routers and models | No single lifecycle/API owner for the composed public surface |
| Admin/moderator platform operations | `identity-access.md`; configuration and Debt documents | PARTIAL | Admin, moderator, plan and function routers | Authorization and feature administration are covered; full operational surface is not |
| Account deletion and privacy boundary | `privacy-data-handling.md`; `identity-api.md` | FULL | Account-deletion service and auth endpoints | External retention remains host/provider unknown |
| Email, telephony, OAuth and geocoder integrations | Identity, privacy, topology and domain overview | PARTIAL | Integration services/routers and settings categories | No unified integration owner for failure/status/retry contracts |
| Backend business-rule utils | Respective Booking, Scheduling, Loyalty, Billing and Finance owners | FULL | Status, money, loyalty, subscription and statistics helper groups | None for owned domains |
| Five background jobs | `background-jobs.md` | FULL | `backend/main.py`; job services | None |
| Runtime settings and feature configuration | `configuration.md` | FULL | Backend settings, DB settings, web/mobile feature layers | Live values remain unknown by design |
| Alembic graph, ORM persistence and SQLite lifecycle | `data-and-migrations.md` | FULL | Alembic head, database/main modules and production Compose | Host schema remains unknown by design |
| Web public/legal/blog/payment route surface | `web.md`; relevant Contracts/Privacy | PARTIAL | `frontend/src/App.jsx`; page groups | Composition is owned; individual public profile/blog contracts are not |
| Web master/salon workspace | `web.md`; domain documents | PARTIAL | Master/salon routes, pages, layouts and modals | Profile/catalog/admin-like mutations have no single surface owner |
| Web client workspace | `web.md`; `client-crm.md` | PARTIAL | Client routes/layout/context | Screen-level API coverage is not complete |
| Web admin workspace | `web.md`; Identity/configuration Debt | PARTIAL | Admin routes/layout/pages | Full endpoint-to-screen authorization matrix is absent |
| Web auth and shared contexts | `web.md`; `identity-access.md` | FULL | Auth/Favorites/Toast contexts | None |
| Web API transports and error handling | `web.md`; `api-conventions.md`; client Debt | FULL | Main wrapper, domain wrappers and direct-fetch inventory | Fragmentation is documented debt |
| Web analytics | `privacy-data-handling.md`; `web.md` | PARTIAL | Analytics modules and route listener | Event taxonomy, consent enforcement and provider delivery are not fully owned |
| Web feature config | `configuration.md` | FULL | Browser-local feature settings and backend GlobalSettings | None; divergence is documented debt |
| Web test/demo/design routes | `web.md`; client-platform Debt | FULL | Unconditional route declarations and production build | Product disposition requires remediation decision |
| Mobile Expo route groups and role navigation | `mobile.md` | FULL | `mobile/app/` route tree and layouts | None |
| Mobile auth/bootstrap/session bridge | `mobile.md`; Identity canon | FULL | Auth context, token storage and root gate | None |
| Mobile API service layer | `mobile.md`; domain Contracts | FULL | Axios client and domain service modules | Endpoint-specific drift remains documented |
| Mobile storage and local state | `mobile.md` | FULL | Token storage, AsyncStorage hooks and Zustand stores | None |
| Mobile deep links/public booking | `client-links-and-payment-return.md`; `mobile.md` | FULL | Parser, dynamic/native config and root listeners | OS delivery remains external |
| Mobile payment return | Payment/link Contracts and mobile architecture | FULL | Checkout modal, pending state and public-status verification | None |
| Mobile analytics and diagnostics | Mobile architecture, Privacy and client Debt | FULL | Analytics providers, pending-payment telemetry and debug modules | Delivery is explicitly best effort |
| Mobile build/env profiles | `configuration.md`; `mobile.md` | FULL | EAS profiles, dynamic config and env resolver | Actual store build remains unknown |
| Mobile notification UI/feed | Mobile architecture and client Debt | MENTIONED_ONLY | Hook uses `notificationsMock` | No real feed/delivery/read-state owner exists |
| Mobile welcome/pricing fallback data | `mobile.md` | FULL | Public catalog, local error/display fallback, discarded welcome selection and backend authority boundary | Product/test drift remains open as RC-010 |
| Docker/Compose topology and persistence | `production-topology.md`; data canon | FULL | Production Dockerfiles, Nginx and Compose | Host state remains unknown by design |
| GitHub workflow semantics | `ci-cd.md`; `deployment-artifact-inventory.md` | FULL | Four root workflow files; production artifact inventory | None; external run history and required-check state remain unknown by design |
| Production migration helper | `data-and-migrations.md`; `deployment-artifact-inventory.md` | FULL | `scripts/prod/migrate.sh`; deploy workflow | Host execution and schema readiness remain unknown by design |
| Production backup/restore/import/export scripts | `deployment-artifact-inventory.md` | FULL | Four executable scripts under `scripts/prod/` | No approved host runbook; consistency, RPO and RTO remain unknown by design |
| Test frameworks and discovery | `testing-strategy.md` | FULL | Pytest, Vitest, Playwright, Jest and Maestro configs | Latest pass state remains external/time-bound |
| Release/build configuration | Web/mobile architecture, configuration and CI/CD | FULL | Docker, Vite, Expo/EAS and workflow config | Actual release state remains unknown |
| Root and legacy deployment scripts | `deployment-artifact-inventory.md` | FULL | Root/server scripts, generic scripts and archived deploy instructions | Legacy files remain tracked; actual host usage is unknown by design |

## Coverage counts

| Coverage | Count |
|---|---:|
| FULL | 34 |
| PARTIAL | 10 |
| MENTIONED_ONLY | 1 |
| NONE | 0 |
| MULTIPLE_OWNERS | 1 |

The `NONE` rows are grouped aspects, not a demand for one document per file.
