---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-05
---

# Debt — Backend and API architecture

Repository-known architectural/API failure boundaries. Security-sensitive findings остаются sanitized; документ не содержит credential values или эксплуатационных инструкций.

## Manual router composition permits prefix and guard drift

- **Confidence:** CONFIRMED
- **Evidence:** main manually imports/mounts every router; some routers own `/api` in prefix, others receive it at include time, and dependencies may be router-level or endpoint-local.
- **Failure scenario:** new/legacy route can be mounted under an unexpected path or without the guard pattern assumed from neighbouring modules; OpenAPI description does not enforce authorization.
- **Sources:** `backend/main.py`; APIRouter declarations in `backend/routers/`; existing authorization Debt.
- **Required action:** separate architecture/code track for explicit route inventory and guard-contract tests; do not infer policy from path naming.

## OAuth2 OpenAPI token URL differs from mounted login path

- **Confidence:** CONFIRMED
- **Evidence:** `OAuth2PasswordBearer` declares relative `auth/login`; application mounts auth router at `/api/auth`, so runtime login path is `/api/auth/login`.
- **Failure scenario:** OpenAPI OAuth2 client tooling can target a non-mounted token URL even though direct login clients work.
- **Sources:** `backend/auth.py` — `oauth2_scheme`; `backend/routers/auth.py` — router prefix/login; `backend/main.py` — mount prefix.
- **Required action:** align generated security scheme with runtime path and add OpenAPI contract test.

## Error contract is heterogeneous

- **Confidence:** CONFIRMED
- **Evidence:** handlers use string and object `detail`, flat custom `SCHEMA_OUTDATED`, domain headers and default framework errors; no global business-error schema exists.
- **Failure scenario:** clients must branch by endpoint/status/body shape and can regress when a handler changes error construction.
- **Sources:** `backend/main.py`; `backend/exceptions.py`; `backend/routers/loyalty.py`, `backend/routers/promo_engine.py`, `backend/routers/subscriptions.py`; repository HTTPException inventory.
- **Required action:** define a backward-compatible error envelope/code migration and client parsing contract.

## Exception text is returned by multiple handlers

- **Confidence:** CONFIRMED for code; concrete runtime text/data is request/provider dependent.
- **Evidence:** multiple caught exceptions are interpolated or copied into 4xx/5xx `detail` across accounting, client, master, auth, promo and geocoding routes.
- **Failure scenario:** internal implementation/provider/database details can become public response data, and clients can accidentally depend on unstable text.
- **Sources:** exception handlers in `backend/routers/accounting.py`, `backend/routers/client.py`, `backend/routers/master.py`, `backend/routers/auth.py`, `backend/routers/promo_codes.py`, `backend/routers/yandex_geocoder.py`.
- **Required action:** separate error redaction/observability remediation; retain detailed diagnostics only in controlled logs.

## Transaction ownership is not uniform

- **Confidence:** CONFIRMED
- **Evidence:** request dependency closes but does not rollback/commit; routers/services/utils independently call commit/rollback/flush, and some read-like checks commit derived/default state.
- **Failure scenario:** caller can assume one request transaction while nested helper has already committed; partial durable state can survive a later failure.
- **Examples:** automatic CRM restriction, loyalty settings GET, referral-code GET; other domain-specific cases live in their Debt owners.
- **Sources:** `backend/database.py`; commit call-site inventory; `backend/utils/client_restrictions.py`, `backend/routers/master_loyalty.py`, `backend/routers/promo_engine.py`.
- **Required action:** define transaction owner per command/query and prohibit hidden commits outside explicit boundaries, with migration-compatible tests.

## Sync ORM runs inside async route handlers

- **Confidence:** CONFIRMED
- **Evidence:** repository has many `async def` handlers that directly call synchronous SQLAlchemy Session/query/commit APIs; engine/session are not async.
- **Failure scenario:** slow database or business work can block event-loop progress for unrelated async requests.
- **Sources:** `backend/database.py`; async route handlers in `backend/routers/`; sync ORM call sites.
- **Required action:** architecture owner chooses sync handlers/threadpool or async database stack consistently and measures before migration.

## API versioning is metadata-only

- **Confidence:** CONFIRMED
- **Evidence:** FastAPI version is static `1.0.0`; no versioned path/media-type router exists while canonical and legacy contracts coexist.
- **Failure scenario:** breaking response/path changes rely on ad-hoc compatibility fields/routes rather than an explicit deprecation window.
- **Sources:** `backend/main.py`; router prefixes; web/mobile call-site inventory.
- **Required action:** define compatibility/deprecation policy before removing mounted legacy contracts.

## Response and pagination shapes are not uniform

- **Confidence:** CONFIRMED
- **Evidence:** routes return bare arrays, named lists, domain summaries and several pagination shapes; create endpoints use both 200 and 201.
- **Failure scenario:** shared clients/generators cannot safely infer one response model from method or resource category.
- **Sources:** route decorators/returns and `backend/schemas.py`.
- **Required action:** preserve current domain contracts; introduce shared conventions only with per-client migration tests.

## Request validation does not imply field persistence

- **Confidence:** CONFIRMED
- **Evidence:** Pydantic default extra behavior and several loose dict handlers can accept/ignore fields not used by persistence logic; consent drift is an existing concrete case.
- **Failure scenario:** clients interpret successful request as durable acceptance of an unowned field.
- **Sources:** `backend/schemas.py`; router-local request classes/dict handlers; [security/privacy Debt](security-and-privacy.md#high-registration-consent-evidence).
- **Required action:** use explicit request schemas/extra policy and document persisted side effects per contract.

## Working-directory and static fallback coupling

- **Confidence:** CONFIRMED
- **Evidence:** uploads and SPA fallback use relative/current-working-directory paths; missing frontend fallback response includes resolved path and current directory.
- **Failure scenario:** alternate entrypoint/cwd changes storage/serving behavior; missing artifact response can expose internal filesystem layout.
- **Sources:** `backend/main.py`; upload handlers; `backend/Dockerfile`.
- **Required action:** centralize absolute application paths from configured base and return a stable sanitized readiness/error response.

## Test fixture differs from production schema lifecycle

- **Confidence:** CONFIRMED
- **Evidence:** common pytest fixture creates/drops all ORM metadata in local SQLite and overrides `get_db`; it does not apply Alembic graph or reproduce production start-before-migrate ordering.
- **Failure scenario:** ORM-level API tests pass while migration-only data/constraint/order problems remain undetected.
- **Sources:** `backend/tests/conftest.py`; [Data and migrations](data-and-migrations.md).
- **Required action:** Package 7 owns a separate migration/contract test strategy; do not treat current TestClient suite as schema deployment proof.

## Generic booking API suite is wall-clock dependent

- **Confidence:** CONFIRMED by local run on 2026-08-04 and source review.
- **Evidence:** fixture creates schedule rows ending at 23:59, while payload starts at the current hour on the next day and lasts one hour; a late-day run crosses the schedule/day boundary.
- **Failure scenario:** create test receives the runtime working-hours rejection and four dependent update/delete/edit tests fail because no Booking was created.
- **Sources:** `backend/tests/test_bookings.py` — `master_schedule`, `_booking_payload`; `backend/services/scheduling.py` — `check_master_working_hours`.
- **Required action:** Package 7 test remediation should use a fixed in-window time/date and isolate dependent setup failures.
