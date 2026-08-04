---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Background jobs

Канон пяти repository-known long-running jobs created by the FastAPI process. There is no separate scheduler service, queue worker or leader election in tracked production Compose.

## 1. Lifecycle

FastAPI startup creates five `asyncio` tasks and stores handles on `app.state`. Shutdown cancels and awaits each task, swallowing only expected `CancelledError`. Each service owns an infinite loop and catches ordinary exceptions before sleeping/retrying.

The production backend command has no explicit multi-worker option and Compose declares one backend service instance. This is repository-known single-process intent, not proof of host state. Every additional process/replica would run another full set of jobs.

**Source:** `backend/main.py` — startup/shutdown; `backend/Dockerfile`; `docker-compose.prod.yml`; [Production topology](../Infrastructure/production-topology.md#startup-and-process-model).

## 2. Job inventory

| Job | First action after startup | Normal cadence | State effect |
|-----|----------------------------|----------------|--------------|
| daily charges | immediately catch up and process current date | next process-local 00:01 daily | activate/expire subscriptions, charge daily balance/reserve, record charge outcomes; card recurring remains unimplemented |
| recurring expenses | sleep first | next process-local 00:05 daily | create one-time `MasterExpense` rows from active recurring templates |
| bookings limit monitor | sleep first | next process-local 00:00 daily | read Free-plan subscriptions/bookings and log at/over-limit details; no enforcement mutation |
| temporary booking cleanup | immediately scan | every 300 seconds | change expired pending `TemporaryBooking` rows to `expired` |
| pending payment cleanup | immediately scan | every 300 seconds | expire stale pending subscription `Payment` rows and release their balance soft-hold |

The three calendar jobs use naive `datetime.now()` / `date.today()`, so their schedule follows process/container local time. The two TTL cleanup functions compare UTC-naive timestamps. Exact production timezone is UNKNOWN from repository topology.

**Source:** the five modules under `backend/services/`; `backend/settings.py` — timezone/config category.

## 3. Daily subscription charges

Startup catch-up walks active subscription date ranges from the last successful charge (or start date) through today and calls the same charge function. The subsequent current-date pass encounters the row just created by catch-up: the charge function refuses a duplicate, but the aggregate pass classifies that response as a failed charge. This observability drift is tracked in [Debt](../Debt/feature-entitlements-and-jobs.md#daily-catch-up-result-drift). The daily pass also marks elapsed active subscriptions expired, activates due pending subscriptions, records failures and deactivates subscriptions when the charge path reports insufficient funds.

Application-level idempotency queries `DailySubscriptionCharge` by subscription/date before mutation. The DB index on that pair is not unique, so concurrent processes can pass the pre-check; this is [Debt](../Debt/feature-entitlements-and-jobs.md#daily-charge-concurrency).

Autorenewal check does not initiate recurring card payments; it records the current not-implemented outcome. Full money semantics remain in [Subscriptions billing](../Domain/subscriptions-billing/README.md).

**Source:** `backend/services/daily_charges.py`; `backend/utils/balance_utils.py` — `process_daily_charge`; `backend/models.py` — `DailySubscriptionCharge`; daily-charge tests.

## 4. Recurring master expenses

Active `MasterExpense` templates can be daily, weekly, monthly or conditional. The job derives a one-time expense for the current process-local date when template conditions pass. Weekly/monthly/conditional paths perform date-range existence checks; daily templates do not. There is no DB uniqueness tying a generated row to template/date.

The loop sleeps until the next day's 00:05 before first execution and has no catch-up window. A process down at the scheduled time resumes with the next future day, so a missed occurrence is not reconstructed by this service. Multi-process execution can duplicate generated expenses.

**Source:** `backend/services/recurring_expenses.py`; `backend/models.py` — `MasterExpense`; [Debt](../Debt/feature-entitlements-and-jobs.md#recurring-expense-recovery-and-idempotency).

## 5. Bookings limit monitor

The monitor selects the named Free master plan, then subscriptions with active status and a future end date, counts active future bookings and logs under/at/over-limit totals. It does not block bookings or modify subscription/booking state.

Its subscription query does not use the canonical effective selector: it omits `is_active` and start-date criteria. This can make monitoring differ from runtime entitlement/capacity views. Enforcement belongs to request paths, not this job.

**Source:** `backend/services/bookings_limit_monitor.py`; `backend/utils/master_future_bookings_query.py`; [Feature entitlements](../Contracts/feature-entitlements.md#6-limits).

## 6. TTL cleanup jobs

Temporary-booking cleanup changes only pending rows whose `expires_at` is before current UTC; it does not delete rows despite the legacy function wording. Payment cleanup selects pending subscription payments older than its fixed TTL, marks them expired and releases balance hold in the same DB session. Both run immediately and then every five minutes, and are idempotent by status transition.

Payment cleanup has targeted tests. No dedicated repository tests were found for the temporary-booking task loop/cleanup function.

**Source:** `backend/services/temporary_bookings_cleanup.py`; `backend/services/expired_payments_cleanup.py`; `backend/tests/test_expired_payments_cleanup.py`.

## 7. Execution and transaction model

The loop functions are async only around sleeps; their DB/business functions are synchronous and execute directly on the application event loop thread. Each service opens independent SQLAlchemy sessions and commits within its own domain operation. There is no shared job transaction, durable queue, lease or central retry ledger.

Most loops log failures and continue after one hour or five minutes. A returned error dict can be logged as completion because inner functions commonly catch DB exceptions instead of raising. `/health` does not inspect task handles, last-success time or DB/provider reachability.

**Source:** service implementations; `backend/main.py` — `/health`; [Debt](../Debt/feature-entitlements-and-jobs.md#job-health-and-event-loop-coupling).

## 8. Reliability boundaries

- Single-instance is a deployment assumption, not enforced by jobs.
- Daily charge has catch-up; recurring expenses and bookings monitor do not.
- Cleanup status transitions are repeatable, but multiple processes still perform duplicate scans/writes.
- Process-local calendar timezone determines three schedules; domain/user timezone is not used.
- Application logs are the only repository-confirmed observability; external alerts/metrics are UNKNOWN.
- Manual/admin call surfaces do not replace a durable scheduler contract.

Confirmed failure scenarios and remediation boundaries: [Feature entitlement and job Debt](../Debt/feature-entitlements-and-jobs.md).
