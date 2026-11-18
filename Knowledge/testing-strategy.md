---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-11-16
---

# Testing strategy

Repository-known map of executable test suites and their current guarantees. A file named `test_*` is not automatically part of the default suite; commands/configuration below define the active boundary.

## Canonical commands and latest pass state

Счётчики — инвентарь, не цель покрытия. Backend и mobile — локальные результаты на 2026-10-19. Frontend, integration и Playwright в той проверке заново не гонялись. CI и production deploy `d072998`: [Production topology](production-topology.md).

| Layer | Command (from package root) | Latest verified |
|-------|-----------------------------|-----------------|
| Backend full | `cd backend && .venv/bin/python -m pytest` | 1372 passed / 7 skipped locally on the booking-cap worktree before commit. CI status: [Production topology](production-topology.md) |
| Frontend unit | `cd frontend && npm test` (`vitest run`) | 267 passed / 0 failed |
| Mobile unit | `cd mobile && npm test` (`jest.unit.config.js`) | 103 suites / 951 passed after schedule `scrollsToTop` tests (`60eba89` baseline) |
| Mobile integration | `cd mobile && npm run test:integration` | 2 suites / 17 passed / 0 failed |
| Playwright E2E | `./scripts/run-playwright-e2e.sh` | 139 passed / 0 failed (10 Chromium specs) |
| Migration focused | pytest on `test_alembic_create_all_then_upgrade.py`, `test_migration_*.py`, `test_session_version_migration.py` | 12 passed / 1 skipped (Postgres-only `skipif`) |

Root GitHub Actions `.github/workflows/tests.yml` starts with conservative suite selection (`scripts/ci/select_tests.py`), then runs enabled jobs: backend pytest (two module shards **or** a selected module list), frontend, mobile, playwright. PRs that touch only `Knowledge/*.md` may skip all application suites; any ambiguity forces full regression. Clean-checkout full runs have passed at least through `d072998`; per-commit CI for later SHAs is not restated here. Details: [CI/CD](ci-cd.md).

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

Known non-blocking flake:

`tests/test_booking_reconciliation_routes.py::test_authenticated_client_http_same_slot_race_returns_one_success_and_one_conflict`

Occasional result: expected `[200, 409]`, actual `[200, 503]`.

Cause: the fixture uses SQLite `timeout=0.15`. The loser can receive `BOOKING_SLOT_BUSY` before the committed slot conflict is visible. Another atomic-concurrency fixture uses a much longer timeout; production does not use this 0.15s timeout.

Production fix is not justified. Do not map an arbitrary `SQLITE_BUSY` / `OperationalError` to 409. Future cleanup: split the test harness into a lock/busy case and an occupancy race. The latest reported CI rerun of this test passed. Do not block the iOS release on the flake.

Twenty-nine `backend/test_*.py` files outside `backend/tests/` remain excluded by default discovery. They are legacy/manual candidates; do not bulk-run them as the canonical suite.

**Sources:** `backend/pyproject.toml`; `backend/tests/conftest.py`; file inventory under `backend/tests/` and top-level `backend/`.

## Web unit tests

Vite/Vitest discovers `frontend/src/**/*.test.js` in Node. Inventory после calendar
redesign: **41** modules / **476** tests (локальный прогон 2026-11-14). Package scripts `test` and `test:unit` are the same `vitest run`. No coverage threshold in this config.

**Sources:** `frontend/package.json`; `frontend/src/**/*.test.js`.

## Web end-to-end tests

Playwright discovers **10** Chromium specs / **139** tests under `frontend/e2e/`. Config uses one worker, no retries, retained trace/screenshot/video on failure. `frontend/e2e/localGuard.ts` refuses production/staging origins. Global setup requires loopback SPA HTML; in CI (`CI=true` or `E2E_REQUIRE_SEED=1`) `POST /api/dev/e2e/seed` must succeed. Local mocked-only `npm run test:e2e` may still skip seed if the backend E2E router is absent.

Canonical stack orchestration is `./scripts/run-playwright-e2e.sh`: disposable SQLite `/tmp/dedato-playwright-e2e.db` (never `bookme.db`), loopback uvicorn + Vite, readiness polling, Playwright, process cleanup. Schema is `Base.metadata.create_all` on backend import, not empty-DB `alembic upgrade head`. `DEV_E2E` seed router cannot mount when `ENVIRONMENT=production`.

`scripts/e2e_full.sh` is **not** the CI contract and can reuse existing servers or a non-temp SQLite path. `scripts/test_e2e.sh` assumes services are already prepared. Do not point any harness at production.

**Sources:** `frontend/playwright.config.ts`; `frontend/e2e/`; `frontend/e2e/localGuard.ts`; `frontend/e2e/globalSetup.ts`; `scripts/run-playwright-e2e.sh`; `backend/routers/dev_e2e.py`; `backend/settings.py` — `dev_e2e`; `.github/workflows/tests.yml`.

## Mobile tests

- **103** unit files were the passing inventory after the schedule/push release tests (`npm test`, 951 tests). The older «95 files» count is not current.
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

## Restored calendar design checks

**CONFIRMED, 2026-11-14, web-редизайн calendar B3 (Vitest happy-dom, focused suite):**
Среда: Vitest + `happy-dom`, `frontend/src/test/domHarness.js` (`mountDom`, `act`).

Поведенческие контракты (не source-text):

- `frontend/src/components/master/CalendarB3Composer.test.js` — пустой старт,
  валидация без API, overlap/duration/service сброс, prefill startIso без id,
  legacy
  off-grid, block empty start, create/update через mocked `calendarB3` API;
- `frontend/src/components/master/MasterBookingDetailAside.test.js` — confirm/cancel
  id, permissions, aside refresh через `syncMasterDaySelection`, отсутствие synthetic neutral rows,
  повторный `createPrefill.mode`;
- `frontend/src/pages/MasterDashboard.manualBooking.test.js` — реальный
  `MasterDashboard` hero CTA, deferred `schedule/weekly`, composer после resolve и
  повторного hero click, mobile quick-nav;
- `frontend/src/components/MasterScheduleCalendar.b3Toolbar.test.js` — день +
  inline create, slot-management drawer, dashboard manual intent → composer modal;
- `frontend/src/components/master/MasterScheduleHeader.test.js` — Figma 16.11
  segmented control, outline create actions, nav order (prev → date → next → Сегодня),
  mobile timezone line, tablist ArrowLeft/End keyboard;
- `frontend/src/utils/masterSchedulePeriodLabel.test.js` — compact week/day period strings;
- `frontend/src/utils/calendarOccupancy.test.js` — редактирование без ложного
  `busy:false` для legacy времени и конфликт после смены даты/длительности.

Источники реализации: `CalendarB3Composer.jsx`, `calendarOccupancy.js`,
`masterDaySelection.js`, `MasterDayDrawerModal.jsx` (hooks до условного return).

Это wiring/coverage Vitest, не полная UI/E2E готовность. **CONFIRMED, 2026-11-14:**
`cd frontend && npm test` — 482 passed (2026-11-16, Figma schedule header); Vite build `envDir: .local/dedato/empty-env` →
`.local/dedato/review-build`. Браузер / Playwright / backend-mobile — отдельно.

**CONFIRMED, 2026-11-14, calendar grid contract (disposable SQLite via `conftest`):**
`cd backend && .venv/bin/python -m pytest` набор:
`test_bookings`, `test_calendar_admission`, `test_calendar_interval_grid`,
`test_sqlite_calendar_grid_guard`, `test_calendar_grid_guard_migration`,
`test_database_calendar_guard_hooks`, `test_calendar_b3_backend` — **102 passed**
(2026-11-14 final review).
`conftest` перезаписывает `DATABASE_URL` на tempfile SQLite (отказ от managed/postgres).
Managed `.local/dedato/local.db` pytest не использует.

**CONFIRMED, 2026-11-16, schedule cleanup + full local прогон (ветка
`review/calendar-b3-20261114`, managed БД не тронута):**
| Suite | Команда | Результат |
|-------|---------|-----------|
| Frontend unit | `cd frontend && npm test` | **496** passed (2026-11-17, calendar UI polish) |
| Frontend build | `cd frontend && npm run build` | OK (`envDir: .local/dedato/empty-env`) |
| Mobile unit | `cd mobile && npm test` | **1003** passed |
| Mobile integration | `cd mobile && npm run test:integration` | **17** passed |
| Playwright | `./scripts/run-playwright-e2e.sh` | **CONFIRMED 2026-11-17, release worktree:** **178** passed, **0** failed, exit **0** (~2.3 min) |
| Backend full | `cd backend && .venv/bin/python -m pytest` | **CONFIRMED 2026-11-17, release worktree:** **1733** passed, **7** skipped, **0** failed (~26 min), exit **0** (`test_cleanup_deletes_smoke_not_admin` included) |
| Maestro | `cd mobile && npm run test:e2e` | **NOT RUN** — в package placeholder app IDs, нет установленной test build |
| git diff --check | из корня репо | без ошибок |

Логи: `…/private/backend-pytest-full-20261116-grid-final2.log`,
`…/playwright-e2e-20261116.log`. Скриншоты smoke:
`…/screenshots-cleanup-20261116/` (managed stack, только просмотр).

**CONFIRMED, 2026-11-16, backend full skip inventory (7):** SQLite FK platform skip в `test_booking_service_snapshot`; dev/testdata skips (`test_create_completed_bookings_owner` ×2, `test_e2e_seed_users_me`); устаревший `can_add_page_module` (`test_master_page_modules` ×2); Postgres-only migration `test_migration_payment_public_id` (`TEST_DATABASE_URL`).

Positive booking fixtures: явный `tests/booking_fixture.on_grid_interval` / `grid_booking_walls`; **без** автоматического snap в `conftest.db.add`.
