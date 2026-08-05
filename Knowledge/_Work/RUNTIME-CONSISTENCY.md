---
type: Work
status: complete
project: DeDato
non_canonical: true
audit_baseline: d3407a57171993e23ad3dd6aed3d98a99e7cd196
---

# Runtime consistency audit

Audit-only snapshot for baseline `d3407a5`. Verdicts apply to critical runtime claims, not introductory wording. Host-only facts remain `UNKNOWN`; no production access was used. `CURRENT` means the document's scoped critical claims and source anchors agree with this checkout, not that the runtime is defect-free.

Scoped documentation re-audit at baseline `ef4dd0a` rechecked only `Operations/ci-cd.md`, `Domain/product-roles-business-model.md` and `Domain/domain-map.md` against root/nested workflow files, deploy/migration helpers, role/feature configuration and the existing Booking, Scheduling, CRM, Loyalty, Finance and Billing owners. No production or external CI/branch-protection state was inspected.

| Canonical document | Owner aspect | Verdict | Critical claims checked | Drift | Host-only unknowns |
|---|---|---|---|---|---|
| `Knowledge/README.md` | Living-canon governance | CURRENT | Source priority, confidence labels, SSOT and security handling | None found | None |
| `Knowledge/Architecture/backend.md` | FastAPI composition, DB/session and transaction boundaries | CURRENT | Route composition, sync sessions in async handlers, exception handling, transaction ownership | None found | Process count and external observability |
| `Knowledge/Architecture/background-jobs.md` | Five in-process jobs | CURRENT | Startup/shutdown registration, cadence, side effects and lack of leader election | None found | Active task count, last success and scheduler overrides |
| `Knowledge/Architecture/data-and-migrations.md` | DB identity and schema lifecycle | CURRENT | SQLite URL/volume, Alembic head, `create_all`, deploy ordering, locking assumptions | None found; current head is `20260721_account_deletion_fields` | Host revision, physical schema and active deploy path |
| `Knowledge/Architecture/mobile.md` | Expo client composition | CURRENT | Route groups, auth bootstrap, Axios, env/native link boundary, payment return, mock notifications | None found | Store release state and installed build configuration |
| `Knowledge/Architecture/web.md` | React/Vite web composition | CURRENT | Route tree, providers, fragmented transports, proxy/build and health semantics | None found | Deployed asset and active external proxy state |
| `Knowledge/Contracts/api-conventions.md` | Cross-API HTTP/time/money/error conventions | CURRENT | Mounted prefixes, response heterogeneity, session commits, timestamps and money units | None found | External consumers not represented in repository |
| `Knowledge/Contracts/booking-api.md` | Booking HTTP contract | CURRENT | Create/update/cancel/confirm paths, object checks, effective statuses and conflict responses | None found | External client usage |
| `Knowledge/Contracts/client-links-and-payment-return.md` | Public/deep links and payment return | CURRENT | Trusted hosts, native/runtime split, public payment-status authority and app return | None found | OS association and deployed website files |
| `Knowledge/Contracts/feature-entitlements.md` | Subscription-derived capability enforcement | CURRENT | Effective subscription, AlwaysFree divergence, numeric service-function mapping and limits | None found | Live plan/catalog rows |
| `Knowledge/Contracts/identity-api.md` | Identity HTTP contract | CURRENT | Registration/OAuth/login/refresh, contact changes, reset/verification and account deletion | None found | Provider behavior and token use outside repository |
| `Knowledge/Contracts/payments-robokassa.md` | Robokassa payment boundary | CURRENT | Signature/status handling, snapshot apply, idempotency, public status and source return | None found | Provider callbacks and active merchant configuration |
| `Knowledge/Debt/backend-api.md` | Backend/API failure boundaries | CURRENT | Route-prefix drift, token URL, exception leakage, session and schema looseness | None found | Runtime log routing and external callers |
| `Knowledge/Debt/booking-scheduling.md` | Booking/scheduling debt | CURRENT | Object authorization gap, overlap/status inconsistencies and completion risks | None found | Production occurrence and affected records |
| `Knowledge/Debt/client-crm-loyalty-promo-finance.md` | CRM/loyalty/promo/finance debt | CURRENT | Identity fragmentation, loyalty failure handling, promo and accounting boundaries | None found | Production occurrence and reconciliation state |
| `Knowledge/Debt/client-platforms.md` | Web/mobile platform debt | CURRENT | Direct fetch fragmentation, UX guards, test routes, link drift, diagnostics and mock feed | None found | Deployed flags, actual diagnostics and external monitoring |
| `Knowledge/Debt/feature-entitlements-and-jobs.md` | Entitlement/job debt | CURRENT | Catalog identity, global-settings propagation, entitlement divergence and job health | None found | Active job multiplicity and live catalog rows |
| `Knowledge/Debt/security-and-privacy.md` | Sanitized security/privacy debt | CURRENT | Authorization boundaries, credential-like path evidence, logging and data discovery | No sensitive value or validity claim was re-evaluated | Credential validity, provider state, log retention |
| `Knowledge/Debt/subscriptions-billing.md` | Billing reliability debt | CURRENT | Concurrency, two-phase apply, charge idempotency, read-side mutation and observability | None found | Live topology, DB contents and provider reconciliation |
| `Knowledge/Debt/testing-delivery-onboarding.md` | Testing/delivery/onboarding debt | CURRENT | Test discovery gaps, PR gates, secret-scan scope, deploy and repository hygiene | None found | CI run history and remote execution state |
| `Knowledge/Domain/booking/README.md` | Booking lifecycle | CURRENT | Status model, effective status, mutation actors, conflict blocking and temporary bookings | None found | Production record distribution |
| `Knowledge/Domain/booking/completion-side-effects.md` | Visit-finalization transaction and side effects | CURRENT | Confirmation idempotency, loyalty spend/earn, income/expense and failure handling | None found | Reconciliation of existing records |
| `Knowledge/Domain/client-crm.md` | Client relationship data | CURRENT | Identity keys, notes, favorites, restrictions and booking-derived membership | None found | Production duplication and data quality |
| `Knowledge/Domain/domain-map.md` | Product-domain overview | CURRENT | Boundary ownership, synchronous dependencies, operational finance owner and current supported scope | None found after scoped re-audit; arrows are explicitly non-event business/runtime dependencies | Actual provider and notification delivery state |
| `Knowledge/Domain/identity-access.md` | Identity and actual authorization enforcement | CURRENT | Roles, registration persistence, dependency factories, session/token and account lifecycle | None found; documented gaps remain debt, not intended policy | Live provider modes and issued tokens |
| `Knowledge/Domain/loyalty.md` | Client loyalty lifecycle | CURRENT | Reserve, release, spend, earn, discount scoping and transaction uniqueness | None found | Existing-ledger reconciliation |
| `Knowledge/Domain/operational-finance.md` | Master/salon operational accounting | CURRENT | Canonical and legacy stores, completion writes, money semantics and ownership | None found | Production record completeness |
| `Knowledge/Domain/privacy-data-handling.md` | Personal-data lifecycle and external boundaries | CURRENT | Collection/storage, logging, analytics, deletion/retention and provider boundaries | None found | Backups, third-party deletion, retention and consent operations |
| `Knowledge/Domain/product-roles-business-model.md` | Product roles and business-model overview | CURRENT | Current role/feature scope, monetization boundaries, owner links and build-shaped mobile auth setting | None found after scoped re-audit; release wording and resolved owner question removed | Actual deployed/store configuration |
| `Knowledge/Domain/promo.md` | Promo Engine and legacy promo boundary | CURRENT | Redemption/grant lifecycle, uniqueness, first-payment link and legacy separation | None found | Live campaigns and provider payment outcomes |
| `Knowledge/Domain/scheduling/README.md` | Availability and conflict rules | CURRENT | Working intervals, timezone, overlap predicate and booking blockers | None found | Host clock/timezone and live schedule data |
| `Knowledge/Domain/subscriptions-billing/README.md` | Subscription lifecycle | CURRENT | Effective state, reservation/freeze, daily charge and payment application | None found | Live subscriptions and provider state |
| `Knowledge/Domain/subscriptions-billing/invariants.md` | Billing invariants | CURRENT | Money units, status/date semantics, uniqueness and transaction boundaries | None found | Live-ledger reconciliation |
| `Knowledge/Domain/subscriptions-billing/money-flows.md` | Billing money flows | CURRENT | Deposit split, points debit, soft hold, apply/failure and daily accrual | None found | Provider settlement and actual balances |
| `Knowledge/Infrastructure/configuration.md` | Settings and feature-configuration layers | CURRENT | Settings precedence, GlobalSettings, web/mobile local flags and EAS inputs | None found | Runtime values and active build profile |
| `Knowledge/Infrastructure/production-topology.md` | Repository-known production topology | CURRENT | Compose services/network/volumes, request path, health and process model | None found | Containers, listeners, TLS, volumes and external monitoring |
| `Knowledge/Onboarding/README.md` | Canon-aware contributor entrypoint | CURRENT | Source priority, package boundaries, safe bootstrap and validation sequence | None found | None |
| `Knowledge/Operations/ci-cd.md` | CI and deployment workflow semantics | CURRENT | Four root workflows, nested backend workflow boundary, PR suites, deploy concurrency/order, Alembic and health | None found after scoped re-audit; capability/workflow/required-gate/UNKNOWN are separated | Branch protection, external CI, active workflow revision and remote outcome |
| `Knowledge/Operations/local-development.md` | Safe local commands | CURRENT | Backend entrypoint, package-local JS commands, tests, docs and local E2E scope | None found | Developer machine prerequisites |
| `Knowledge/Operations/testing-strategy.md` | Executable test tiers and guarantees | CURRENT | Pytest discovery, excluded legacy tests, Vitest/Jest/Playwright/Maestro and CI coverage | None found | Latest CI pass state and device availability |

## Verdict counts

| Verdict | Count |
|---|---:|
| CURRENT | 40 |
| PARTIAL | 0 |
| STALE | 0 |
| CONFLICTING | 0 |
| UNVERIFIABLE | 0 |

All relative Markdown links resolved. Exact repository paths extracted from source-style inline code resolved; four non-path identifiers (`mobile_app` and `backend-run-legacy`) were excluded from path validation. No deleted source path was found. The scoped re-audit revalidated links and source paths in the three remediated canonical documents and rechecked their critical workflow/config/ownership claims; no host fact was reclassified. A universal symbol parser was not inferred from prose-only anchors.
