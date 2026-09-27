---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-27
---

# Testing strategy

Repository-known map of executable test suites and their current guarantees. A file named `test_*` is not automatically part of the default suite; commands/configuration below define the active boundary.

## Canonical commands and latest pass state

CONFIRMED local/CI baselines after public-booking product fix (`4e219cc`), Playwright local stabilization (`a465ed3`) and the self-contained Playwright CI job (`aa37b54`). Counts are current inventory, not a coverage target.

| Layer | Command (from package root) | Latest verified |
|-------|-----------------------------|-----------------|
| Backend full | `cd backend && .venv/bin/python -m pytest` | 1347 passed / 7 skipped / 0 failed |
| Frontend unit | `cd frontend && npm test` (`vitest run`) | 267 passed / 0 failed |
| Mobile unit | `cd mobile && npm test` (`jest.unit.config.js`) | 95 suites / 802 passed / 0 failed |
| Mobile integration | `cd mobile && npm run test:integration` | 2 suites / 17 passed / 0 failed |
| Playwright E2E | `./scripts/run-playwright-e2e.sh` | 139 passed / 0 failed (10 Chromium specs) |
| Migration focused | pytest on `test_alembic_create_all_then_upgrade.py`, `test_migration_*.py`, `test_session_version_migration.py` | 12 passed / 1 skipped (Postgres-only `skipif`) |

Root GitHub Actions `.github/workflows/tests.yml` runs four independent jobs on `pull_request` and push to `main`: backend, frontend, mobile, playwright. Clean-checkout jobs have passed. Details: [CI/CD](ci-cd.md).

Playwright is a real CI regression gate. Maestro exists locally and is **not** a root CI gate.

## FAST / pre-commit

Smallest practical local set: focused backend files that own the changed contract, plus full frontend unit and full mobile unit. Example backend subset used during cleanup (not an extra script):

```bash
cd backend && .venv/bin/python -m pytest \
  tests/test_auth.py tests/test_bookings.py tests/test_jwt_token_contract.py \
  tests/test_account_deletion.py tests/test_push_notifications_foundations.py \
  tests/test_alembic_create_all_then_upgrade.py tests/test_ios_app_purchase_block.py
cd frontend && npm test
cd mobile && npm test
```

## FULL local

```bash
cd backend && .venv/bin/python -m pytest
cd frontend && npm test
cd mobile && npm test
cd mobile && npm run test:integration
```

Mobile integration and `androidAppIcon.contract.test.ts` require Pillow from `mobile/scripts/dev/requirements.txt` (`python3 scripts/dev/generate_app_icons.py --measure-json`). Not a runtime dependency.

## WEB E2E

```bash
./scripts/run-playwright-e2e.sh
```

Owns isolated backend + Vite + disposable SQLite + Playwright. Equivalent documented command: `cd frontend && npm run test:e2e` only against an already-running loopback stack that matches `localGuard`.

## RELEASE

Full regression above, plus migration contracts and platform/release contracts (iOS free companion, Android icon/push config, AppMetrica privacy, legal documents). Web E2E is `./scripts/run-playwright-e2e.sh` (canonical local/CI orchestration). Maestro (`cd mobile && npm run test:e2e`) only when a device/app exists; it is not current CI.

## Backend

Canonical discovery is `backend/tests/`: `backend/pyproject.toml` sets `testpaths = ["tests"]` and standard `test_*` naming. Inventory: **126** `test_*.py` modules. `backend/Makefile` can collect coverage but has no minimum threshold; root CI runs `python -m pytest` without coverage.

The common function-scoped fixture uses a **per-process tempfile SQLite** (`dedato-pytest-*`, not shared `./test.db`), creates/drops schema per test and overrides FastAPI `get_db`. Expo HTTP to `exp.host` is forbidden. This isolates normal canonical tests from the application database. Individual tests can still replace fixtures; the guarantee applies only to tests using the common fixture.

Twenty-nine `backend/test_*.py` files outside `backend/tests/` remain excluded by default discovery. They are legacy/manual candidates; do not bulk-run them as the canonical suite.

**Sources:** `backend/pyproject.toml`; `backend/tests/conftest.py`; file inventory under `backend/tests/` and top-level `backend/`.

## Web unit tests

Vite/Vitest discovers `frontend/src/**/*.test.js` in Node. Inventory: **24** modules / 267 tests. Package scripts `test` and `test:unit` are the same `vitest run`. No coverage threshold in this config.

**Sources:** `frontend/package.json`; `frontend/src/**/*.test.js`.

## Web end-to-end tests

Playwright discovers **10** Chromium specs / **139** tests under `frontend/e2e/`. Config uses one worker, no retries, retained trace/screenshot/video on failure. `frontend/e2e/localGuard.ts` refuses production/staging origins. Global setup requires loopback SPA HTML; in CI (`CI=true` or `E2E_REQUIRE_SEED=1`) `POST /api/dev/e2e/seed` must succeed. Local mocked-only `npm run test:e2e` may still skip seed if the backend E2E router is absent.

Canonical stack orchestration is `./scripts/run-playwright-e2e.sh`: disposable SQLite `/tmp/dedato-playwright-e2e.db` (never `bookme.db`), loopback uvicorn + Vite, readiness polling, Playwright, process cleanup. Schema is `Base.metadata.create_all` on backend import, not empty-DB `alembic upgrade head`. `DEV_E2E` seed router cannot mount when `ENVIRONMENT=production`.

`scripts/e2e_full.sh` is **not** the CI contract and can reuse existing servers or a non-temp SQLite path. `scripts/test_e2e.sh` assumes services are already prepared. Do not point any harness at production.

**Sources:** `frontend/playwright.config.ts`; `frontend/e2e/`; `frontend/e2e/localGuard.ts`; `frontend/e2e/globalSetup.ts`; `scripts/run-playwright-e2e.sh`; `backend/routers/dev_e2e.py`; `backend/settings.py` — `dev_e2e`; `.github/workflows/tests.yml`.

## Mobile tests

- **95** unit files under `mobile/__tests__/unit/`, default `npm test` / `test:unit` via `jest.unit.config.js` (`ts-jest`, Node, mocked env).
- **2** files under `mobile/__tests__/integration/`, `npm run test:integration` via `jest.integration.config.js` (`jest-expo`). These are RTL component tests with mocked API, not full-stack E2E. Collect was repaired for Expo SDK 54 / Jest 30 (WinterCG lazy globals evaluated during setupFiles).
- Maestro flows under `mobile/.maestro/`, `test:e2e*` against an installed app. **Not** in CI. Package scripts still use placeholder application identifiers.

The generic `jest.config.js` declares 70% coverage thresholds, but package scripts select `jest.unit.config.js` and do not enforce those thresholds.

**Sources:** `mobile/package.json`; `mobile/jest.unit.config.js`; `mobile/jest.integration.config.js`; `mobile/test-utils/`; `mobile/scripts/dev/requirements.txt`; `mobile/.maestro/`.

## Test selection rules

Use the smallest suite that owns a changed contract, then expand:

1. pure helper/model contract tests;
2. router/service tests using canonical backend fixtures;
3. web/mobile unit or mobile integration;
4. Playwright (web E2E) or Maestro (device) only when the end-user flow or cross-process wiring changed; Playwright is also the root CI web E2E gate.

Production smoke scripts and unclassified top-level `backend/test_*.py` are not routine validation.

## Known reliability boundary

Remaining test-infra debt (not store/release blockers): Maestro / mobile E2E is not a CI gate; `time.sleep(1.1)` in subscription points redemption; `can_add_page_module` skips; react-test-renderer deprecation warnings as warnings only. Playwright stays Chromium-only by design. Jest worker leak, mobile integration collection, root application CI absence, and Playwright local/CI orchestration are **closed**.

The generic backend booking fixture can still derive a near-future timestamp from wall clock near 23:59. Treat residual time-boundary failures as fixture issues, not permission to weaken Scheduling runtime checks.

**Sources:** `backend/tests/test_bookings.py`; [Scheduling canon](scheduling.md); [Testing/delivery Debt](testing-delivery-onboarding.md); [CI/CD](ci-cd.md).
