---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-25
---

# Testing strategy

Repository-known map of executable test suites and their current guarantees. A file named `test_*` is not automatically part of the default suite; commands/configuration below define the active boundary.

## Canonical commands and latest pass state

CONFIRMED local/CI baselines after test-layer cleanup (`7b13f81`) and root application CI (`4a5145f`, `3aba6d7`). Counts are current inventory, not a coverage target.

| Layer | Command (from package root) | Latest verified |
|-------|-----------------------------|-----------------|
| Backend full | `cd backend && .venv/bin/python -m pytest` | 1347 passed / 7 skipped / 0 failed |
| Frontend unit | `cd frontend && npm test` (`vitest run`) | 253 passed / 0 failed |
| Mobile unit | `cd mobile && npm test` (`jest.unit.config.js`) | 94 suites / 800 passed / 0 failed |
| Mobile integration | `cd mobile && npm run test:integration` | 2 suites / 17 passed / 0 failed |
| Migration focused | pytest on `test_alembic_create_all_then_upgrade.py`, `test_migration_*.py`, `test_session_version_migration.py` | 12 passed / 1 skipped (Postgres-only `skipif`) |

Root GitHub Actions `.github/workflows/tests.yml` runs backend full, frontend unit, and mobile unit + integration on `pull_request` and push to `main`. Clean-checkout jobs have passed. Details: [CI/CD](ci-cd.md).

Playwright and Maestro exist locally and are **not** mandatory root CI gates.

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

## RELEASE

Full regression above, plus migration contracts and platform/release contracts (iOS free companion, Android icon/push config, AppMetrica privacy, legal documents). Playwright (`cd frontend && npm run test:e2e`) and Maestro (`cd mobile && npm run test:e2e`) only when a local stack/device exists; they are not current CI.

## Backend

Canonical discovery is `backend/tests/`: `backend/pyproject.toml` sets `testpaths = ["tests"]` and standard `test_*` naming. Inventory: **126** `test_*.py` modules. `backend/Makefile` can collect coverage but has no minimum threshold; root CI runs `python -m pytest` without coverage.

The common function-scoped fixture uses a **per-process tempfile SQLite** (`dedato-pytest-*`, not shared `./test.db`), creates/drops schema per test and overrides FastAPI `get_db`. Expo HTTP to `exp.host` is forbidden. This isolates normal canonical tests from the application database. Individual tests can still replace fixtures; the guarantee applies only to tests using the common fixture.

Twenty-nine `backend/test_*.py` files outside `backend/tests/` remain excluded by default discovery. They are legacy/manual candidates; do not bulk-run them as the canonical suite.

**Sources:** `backend/pyproject.toml`; `backend/tests/conftest.py`; file inventory under `backend/tests/` and top-level `backend/`.

## Web unit tests

Vite/Vitest discovers `frontend/src/**/*.test.js` in Node. Inventory: **23** modules / 253 tests. Package scripts `test` and `test:unit` are the same `vitest run`. No coverage threshold in this config.

**Sources:** `frontend/package.json`; `frontend/src/**/*.test.js`.

## Web end-to-end tests

Playwright discovers **10** Chromium specs under `frontend/e2e/`. Config uses one worker, no retries, retained trace/video on failure and a global preflight that the base URL serves SPA HTML. It does not reset or seed data. **Not** a root CI job.

`scripts/e2e_full.sh` launches local backend/frontend, enables the development E2E surface, resets/seeds local test data, runs Playwright and cleans up. Treat it as destructive to that local dataset. `scripts/test_e2e.sh` assumes services are already prepared. Do not point either harness at production.

**Sources:** `frontend/playwright.config.ts`; `frontend/e2e/`; `scripts/e2e_full.sh`; `scripts/test_e2e.sh`.

## Mobile tests

- **94** unit files under `mobile/__tests__/unit/`, default `npm test` / `test:unit` via `jest.unit.config.js` (`ts-jest`, Node, mocked env).
- **2** files under `mobile/__tests__/integration/`, `npm run test:integration` via `jest.integration.config.js` (`jest-expo`). These are RTL component tests with mocked API, not full-stack E2E. Collect was repaired for Expo SDK 54 / Jest 30 (WinterCG lazy globals evaluated during setupFiles).
- Maestro flows under `mobile/.maestro/`, `test:e2e*` against an installed app. **Not** in CI. Package scripts still use placeholder application identifiers.

The generic `jest.config.js` declares 70% coverage thresholds, but package scripts select `jest.unit.config.js` and do not enforce those thresholds.

**Sources:** `mobile/package.json`; `mobile/jest.unit.config.js`; `mobile/jest.integration.config.js`; `mobile/test-utils/`; `mobile/scripts/dev/requirements.txt`; `mobile/.maestro/`.

## Test selection rules

Use the smallest suite that owns a changed contract, then expand:

1. pure helper/model contract tests;
2. router/service tests using canonical backend fixtures;
3. web/mobile unit or mobile integration;
4. local Playwright/Maestro only when the end-user flow or cross-process wiring changed.

Production smoke scripts and unclassified top-level `backend/test_*.py` are not routine validation.

## Known reliability boundary

Remaining test-infra debt (not store/release blockers): Jest worker/open-handle leak in `mobile/__tests__/unit/components/build7Stabilization.test.tsx`; Playwright/Maestro not in CI; `time.sleep(1.1)` in subscription points redemption; `can_add_page_module` skips; react-test-renderer deprecation warnings as warnings only.

The generic backend booking fixture can still derive a near-future timestamp from wall clock near 23:59. Treat residual time-boundary failures as fixture issues, not permission to weaken Scheduling runtime checks.

**Sources:** `backend/tests/test_bookings.py`; [Scheduling canon](scheduling.md); [Testing/delivery Debt](testing-delivery-onboarding.md); [CI/CD](ci-cd.md).
