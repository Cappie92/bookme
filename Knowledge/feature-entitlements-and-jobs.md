---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# Debt — feature entitlements and background jobs

Repository-known gaps in flag propagation, paid capability enforcement and in-process jobs. This document describes failure boundaries, not target design or an operational runbook.

## Entitlement enforcement is not centralized

- **Confidence:** CONFIRMED
- **Evidence:** named capability helpers have heterogeneous router call sites; `has_client_restrictions` has no backend router call site while finance/loyalty/clients/custom-domain/extended-stats do.
- **Failure scenario:** client restriction UI can be hidden as paid capability while direct backend mutation remains available; future surfaces can mistake feature response for enforcement.
- **Existing protection:** several sensitive domain routers explicitly re-check their own capability server-side.
- **Sources:** `backend/utils/subscription_features.py`; call sites in `backend/routers/master.py`, `backend/routers/master_loyalty.py`, `backend/routers/accounting.py`, `backend/routers/master_clients.py`; restriction handlers in `backend/routers/master.py`.
- **Required action:** separate entitlement remediation defining server authority per capability and regression coverage.

## Page module capability is contradictory

- **Confidence:** CONFIRMED
- **Evidence:** aggregate feature response computes module limit and `can_add_more_modules`, but create endpoint first calls legacy `can_add_page_module`, which always returns false.
- **Failure scenario:** plans can advertise positive module capacity while every create request is denied; existing modules can still be updated/deleted.
- **Sources:** `backend/utils/subscription_features.py`; `backend/routers/master.py` — feature response; `backend/routers/master_page_modules.py`.
- **Required action:** separate product/code remediation choosing and testing one module entitlement contract.

## Service-function identity and activation drift

- **Confidence:** CONFIRMED
- **Evidence:** runtime maps hardcoded numeric IDs to capability keys and checks only ID membership in plan JSON. `ServiceFunction.is_active`, type and existence are validated when a plan is written but not on entitlement read; admin can later disable/delete rows.
- **Failure scenario:** public/admin catalog can hide a function while existing plan access remains true; delete/recreate can change numeric identity.
- **Sources:** `backend/utils/subscription_features.py`; `backend/routers/subscription_plans.py`; `backend/routers/service_functions.py`; `backend/routers/subscription_plans_public.py`.
- **Required action:** controlled catalog identity/activation model and tests for revocation behavior.

## Entitlement fallback divergence

- **Confidence:** CONFIRMED
- **Evidence:** no-subscription aggregate response reports booking page true while the individual helper returns false. For `is_always_free`, the helper grants every mapped capability once any effective/auto-created subscription exists, while aggregate response remains plan-derived; if no fallback plan exists, helper returns false and aggregate returns permissive values.
- **Failure scenario:** different endpoints/clients can report different access for the same account/configuration.
- **Sources:** `backend/utils/subscription_features.py` — `get_user_subscription_with_plan`, `check_feature_access`, `get_master_features`.
- **Required action:** define one side-effect-free effective entitlement result and reuse it.

## Global settings propagation

- **Confidence:** CONFIRMED
- **Evidence:** admin allow-list stores four DB booleans; backend consumes only salon setting in one dashboard response. Web ordinary consumers read browser-local compatibility state; mobile reads device-local state; registration/blog/reviews backend paths do not read their rows.
- **Failure scenario:** an admin toggle appears saved but affects only the admin browser or selected response, while other users/devices and backend mutations retain old behavior.
- **Sources:** `backend/routers/admin.py`, `backend/routers/client.py`; `frontend/src/pages/AdminSettings.jsx`, `frontend/src/config/features.js`; `mobile/src/config/features.ts`; repository call-site search.
- **Required action:** decide which keys are real rollout controls, assign one distribution source and remove/deprecate non-consumed keys.

## Salon env alias precedence

- **Confidence:** CONFIRMED
- **Evidence:** computed helper returns true from the legacy alias whenever primary value is not truthy, including explicit primary false; warning/comment describe alias use only when primary is absent.
- **Failure scenario:** stale legacy environment can override an explicit disable without the expected warning.
- **Source:** `backend/settings.py` — `salons_enabled_env`, `used_legacy_salon_alias`.
- **Required action:** separate configuration cleanup with precedence tests.

## In-process jobs and multiple processes

- **Confidence:** CONFIRMED for process behavior; actual production process count is UNKNOWN.
- **Evidence:** every FastAPI startup creates all five tasks; no lease, leader election or external scheduler exists in repository Compose.
- **Failure scenario:** additional workers/replicas duplicate charges, expenses, monitoring and cleanup work.
- **Existing protection:** current Compose declares one backend service and Uvicorn command has no explicit worker count; some domain operations are status/idempotency guarded.
- **Sources:** `backend/main.py`; five job modules; `backend/Dockerfile`; `docker-compose.prod.yml`.
- **Related:** [subscriptions billing Debt](subscriptions-billing-debt.md#in-process-background-jobs).

## Daily charge concurrency

- **Confidence:** CONFIRMED
- **Evidence:** charge path queries subscription/date before insert, but DB index is not unique and there is no distributed lock.
- **Failure scenario:** concurrent job/manual invocations can both pass the pre-check and duplicate financial effects/charge rows.
- **Sources:** `backend/utils/balance_utils.py` — `process_daily_charge`; `backend/models.py` — `DailySubscriptionCharge`; `backend/services/daily_charges.py`.
- **Required action:** separate billing reliability remediation with DB-level idempotency and transaction/concurrency tests.

## Daily catch-up result drift

- **Confidence:** CONFIRMED
- **Evidence:** task calls catch-up through current date and then `process_all_daily_charges` for the same date. Existing-row response is `success=false`, and the aggregate pass increments `failed_charges` rather than a skipped counter.
- **Failure scenario:** normal idempotency refusal after successful catch-up is logged/reported as a failed daily charge, obscuring real failures.
- **Sources:** `backend/services/daily_charges.py`; `backend/utils/balance_utils.py` — `process_daily_charge`.
- **Required action:** separate billing observability correction with deterministic startup/cadence tests.

## Recurring expense recovery and idempotency

- **Confidence:** CONFIRMED
- **Evidence:** loop sleeps to next 00:05 before first run and has no catch-up; daily templates do not check same-day existence, other checks are query-before-insert, and no template/date uniqueness exists.
- **Failure scenario:** downtime can miss an expected expense; multi-process/manual rerun can duplicate it.
- **Sources:** `backend/services/recurring_expenses.py`; `backend/models.py` — `MasterExpense`.
- **Required action:** finance owner defines missed-run and idempotency semantics before scheduler/code remediation.

## Monitoring selector drift

- **Confidence:** CONFIRMED
- **Evidence:** bookings-limit monitor uses status/end-date but omits effective selector's `is_active` and start-date predicates.
- **Failure scenario:** logged at/over-limit population can disagree with API entitlement and capacity behavior.
- **Source:** `backend/services/bookings_limit_monitor.py`; comparison with `backend/utils/subscription_features.py`.
- **Required action:** reuse canonical selector or explicitly document a different monitoring population.

## Job health and event-loop coupling

- **Confidence:** CONFIRMED
- **Evidence:** synchronous DB/business functions execute directly inside async task loops; health endpoint is static and does not expose task state/last success. Inner functions often return error dicts after logging rather than raising.
- **Failure scenario:** long DB work can delay request event loop; a repeatedly failing or unexpectedly ended task is not visible through health/readiness.
- **Sources:** `backend/main.py`; five job modules.
- **Required action:** separate reliability/observability design for execution isolation, durable state and alerts.

## Calendar timezone is process-local

- **Confidence:** CONFIRMED for code; production timezone value is UNKNOWN.
- **Evidence:** calendar jobs use naive `datetime.now()` / `date.today()` instead of an explicit application/domain timezone.
- **Failure scenario:** schedule and charge/expense business date can shift with container/process timezone configuration.
- **Sources:** `backend/services/daily_charges.py`, `backend/services/recurring_expenses.py`, `backend/services/bookings_limit_monitor.py`; `backend/settings.py`.
- **Required action:** owner selects an explicit scheduler/business timezone and tests boundary transitions.

## Cleanup coverage gap

- **Confidence:** CONFIRMED by repository test inventory.
- **Evidence:** pending payment cleanup has targeted tests; no dedicated tests were found for temporary-booking cleanup or recurring-expense/limit-monitor loops.
- **Failure scenario:** cadence/status/selection regressions in uncovered jobs can ship without focused detection.
- **Sources:** `backend/tests/test_expired_payments_cleanup.py`; repository test search; job modules.
- **Required action:** add deterministic function-level tests in a separate code/test track.
