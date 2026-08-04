---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Testing strategy

Repository-known map of executable test suites and their current guarantees. A file named `test_*` is not automatically part of the default suite; commands/configuration below define the active boundary.

## Backend

Canonical backend pytest discovery is `backend/tests/`: `backend/pyproject.toml` sets `testpaths = ["tests"]` and standard `test_*` naming. At the latest inventory this directory contained 89 test modules. `backend/Makefile` runs pytest with coverage collection but has no minimum coverage threshold.

The common function-scoped fixture uses a dedicated SQLite test engine, creates/drops schema per test and overrides FastAPI `get_db`. This isolates normal canonical tests from the configured application database. Individual tests/scripts can still replace fixtures or access external state, so the guarantee applies only to tests using the common fixture.

Twenty-nine `backend/test_*.py` files outside `backend/tests/` are excluded by default discovery. They are legacy/manual/integration candidates until individually classified; do not bulk-run them as if they were the canonical isolated suite.

**Sources:** `backend/pyproject.toml`; `backend/Makefile`; `backend/tests/conftest.py` — fixture structure only; file inventory under `backend/tests/` and top-level `backend/`.

## Web unit tests

Vite/Vitest discovers `frontend/src/**/*.test.js` in Node environment. At inventory time seven modules matched. The package `test` and `test:unit` scripts both run the same Vitest suite. There is no repository-known coverage threshold or DOM-browser test environment in this config.

**Sources:** `frontend/vite.config.js`; `frontend/package.json`; `frontend/src/**/*.test.js` inventory.

## Web end-to-end tests

Playwright discovers eight Chromium specs under `frontend/e2e/`. Config uses one worker, no retries in CI or locally, retained trace/video on failure and a global preflight that only proves the configured base URL serves SPA-like HTML. It does not reset or seed data.

`scripts/e2e_full.sh` is the repository harness that launches local backend/frontend, enables the development E2E surface, resets/seeds local test data, runs Playwright and cleans up processes. Treat it as destructive to its configured local test dataset. `scripts/test_e2e.sh` runs Playwright against already prepared services and does not perform that lifecycle.

Backend settings gate the E2E seed surface to development. Do not point either harness at production or a shared environment.

**Sources:** `frontend/playwright.config.ts`; `frontend/e2e/globalSetup.ts`; `frontend/e2e/*.spec.ts`; `scripts/e2e_full.sh`; `scripts/test_e2e.sh`; `backend/settings.py`; `backend/routers/dev_e2e.py`.

## Mobile tests

Mobile separates:

- 48 unit modules under `mobile/__tests__/unit/`, run by default `npm test`/`test:unit` with `jest.unit.config.js` and mocked env;
- two integration modules under `mobile/__tests__/integration/`, run only by `test:integration` with Expo/React Native setup;
- Maestro flows under `mobile/.maestro/`, run separately by `test:e2e*` against an installed app.

The generic `jest.config.js` declares 70% global coverage thresholds, but package scripts select `jest.unit.config.js`; the default and coverage scripts therefore do not enforce those generic thresholds. Native E2E package scripts/config retain placeholder application identifiers that do not match tracked native identifiers.

**Sources:** `mobile/package.json`; `mobile/jest.config.js`; `mobile/jest.unit.config.js`; `mobile/jest.integration.config.js`; `mobile/test-utils/`; `mobile/.maestro/`; `mobile/app.config.ts`.

## Test selection rules

Use the smallest suite that owns a changed contract, then expand across boundaries:

1. pure helper/model contract tests;
2. router/service integration using canonical backend fixtures;
3. web/mobile unit or integration tests;
4. local E2E only when the end-user flow or cross-process wiring changed.

Production smoke scripts, files with `prod` in their name and unclassified top-level tests are not routine validation. They require a separate authorized operations track and environment review.

## Known reliability boundary

The generic backend booking fixture derives a near-future timestamp from wall clock and can cross the configured 23:59 schedule boundary. A prior combined run produced five cascading failures while the focused API suite passed. This is test-fixture nondeterminism, not permission to weaken Scheduling runtime checks.

**Sources:** `backend/tests/test_bookings.py`; [Scheduling canon](../Domain/scheduling/README.md); [Backend/API Debt](../Debt/backend-api.md); [Testing/delivery Debt](../Debt/testing-delivery-onboarding.md).
