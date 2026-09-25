---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-25
---

# Debt — testing, delivery and onboarding

Confirmed gaps in executable quality gates and developer entrypoints.

## Application CI does not include Playwright, Maestro, lint, or coverage

- **Severity:** `medium`.
- **Confidence:** CONFIRMED for repository workflows; external branch protection is UNKNOWN.
- **Evidence:** `.github/workflows/tests.yml` runs backend `python -m pytest`, frontend `npm test`, and mobile `npm test` plus `npm run test:integration` on `pull_request` and push to `main`. Clean-checkout GitHub Actions jobs have passed. Playwright, Maestro, EAS, black/isort/flake8/mypy and Codecov are **not** current root jobs. Nested `backend/.github/workflows/ci.yml` was removed; it was never a functioning GitHub check.
- **Failure scenario:** E2E, native device, and static-analysis regressions can still merge without a repository-hosted gate; whether `tests.yml` is required on the branch is UNKNOWN.
- **Sources:** `.github/workflows/tests.yml`; [CI/CD](ci-cd.md); [Testing strategy](testing-strategy.md).
- **Required action:** optional later gates for Playwright/Maestro/lint/coverage; confirm branch-protection required checks.

## Deployment starts without an application validation gate

- **Severity:** `high`.
- **Confidence:** CONFIRMED.
- **Evidence:** `deploy.yml` has one job and runs no backend or client test suite before or during delivery. It transfers the checkout and builds mutable images on the target; there is no isolated pre-deploy artifact build/test job or immutable artifact promotion.
- **Failure scenario:** unvalidated application changes reach the production-host build/recreate path; client build/lint/mobile checks are absent from the gate.
- **Sources:** `.github/workflows/deploy.yml` — jobs/step ordering.
- **Required action:** separate delivery remediation establishes pre-deploy validation and artifact ownership without documenting host procedures here.

## Services start before the explicit migration step

- **Severity:** `high`.
- **Confidence:** CONFIRMED for workflow content.
- **Evidence:** deploy workflow explicitly invokes `scripts/prod/migrate.sh`, which runs `alembic upgrade head`, but only after Compose services start. Backend startup still calls `create_all`; no separate schema-readiness prerequisite prevents requests/background jobs before Alembic succeeds.
- **Failure scenario:** application code and in-process jobs can start against an older/incompatible schema before the explicit migration completes, while shallow process health can remain green.
- **Sources:** `.github/workflows/deploy.yml`; `backend/main.py`; [Data and migrations](data-and-migrations.md).
- **Required action:** make migration success a pre-service/readiness gate and define failure stop/rollback policy in a separate delivery track.

## Health check is liveness-only

- **Confidence:** CONFIRMED.
- **Evidence:** post-deploy check calls HTTP health; backend and frontend health responses do not verify database, migration revision, jobs or providers.
- **Failure scenario:** workflow reports success while core dependencies are unavailable or stale.
- **Sources:** `.github/workflows/deploy.yml`; `backend/main.py`; `frontend/nginx.conf`.
- **Required action:** define separate readiness and dependency health semantics.

## Knowledge is outside Docs CI

- **Confidence:** CONFIRMED.
- **Evidence:** MkDocs uses `docs_dir: docs`; canonical `Knowledge/` is not part of strict docs build. No workflow validates Knowledge links/source paths/security patterns.
- **Failure scenario:** broken canonical links or unsafe literals can merge while Docs CI stays green.
- **Sources:** `mkdocs.yml`; `.github/workflows/mkdocs.yml`; `docs.sh`.
- **Required action:** add a dedicated non-secret Knowledge validation gate in a separate CI change.

## Incremental secret scan cannot attest unchanged repository state

- **Severity:** `high`.
- **Confidence:** CONFIRMED.
- **Evidence:** gitleaks scans event commit ranges. Sanitized Debt records unchanged credential-like literals and access-named artifacts outside a full-history/full-tree guarantee.
- **Failure scenario:** a green incremental scan is interpreted as proof that no sensitive repository evidence exists.
- **Sources:** `.github/workflows/gitleaks.yml`; [Security and privacy Debt](security-and-privacy.md).
- **Required action:** security owner defines full repository/history remediation and ongoing scan baseline.

## Test discovery and coverage are fragmented

- **Confidence:** CONFIRMED.
- **Evidence:** canonical backend config excludes 29 top-level `backend/test_*.py`; web has no coverage threshold; mobile package scripts bypass the generic Jest config that declares 70% thresholds; Maestro remains a separate device opt-in suite. Mobile integration is part of root CI and local `npm run test:integration`.
- **Failure scenario:** `make test` or `npm test` is reported as “all tests” although substantial suites/thresholds were not exercised.
- **Sources:** `backend/pyproject.toml`; `backend/Makefile`; test file inventory; frontend/mobile manifests and test configs.
- **Required action:** define named test tiers and machine-readable aggregate gates.

## Jest worker leak, Playwright/Maestro, and other test-infra debt

- **Confidence:** CONFIRMED; not store/release blockers.
- **Evidence:** unit Jest can force-exit a worker after `mobile/__tests__/unit/components/build7Stabilization.test.tsx`; Playwright and Maestro are not root CI; `time.sleep(1.1)` remains in subscription points redemption; `can_add_page_module` tests stay skipped; react-test-renderer deprecation warnings are warnings only.
- **Required action:** separate tracks (next: Jest worker leak audit). Do not treat as App Review / RuStore blockers.

## Native E2E application identifier drift

- **Confidence:** CONFIRMED.
- **Evidence:** mobile Maestro package scripts/config use placeholder application identifiers that do not match tracked iOS/Android identifiers.
- **Failure scenario:** documented E2E commands target no installed application until manually overridden.
- **Sources:** `mobile/package.json`; `mobile/.maestro/config.yaml`; `mobile/app.config.ts`.
- **Required action:** bind E2E identifiers to release profiles or require an explicit validated input.

## Wall-clock-dependent booking fixture

- **Confidence:** CONFIRMED by repeated repository run in Package 5.
- **Evidence:** generic booking fixture combines current wall clock with a schedule ending at 23:59; near the boundary five tests cascade from slot rejection. Focused API tests pass.
- **Failure scenario:** suite outcome depends on execution time and obscures unrelated regressions.
- **Sources:** `backend/tests/test_bookings.py`; Package 5 verification in [Knowledge audit status](knowledge-audit-status.md).
- **Required action:** test-only remediation fixes the clock/date or constructs a schedule-relative slot; runtime validation remains unchanged.

## Onboarding surface is fragmented and sensitive

- **Severity:** `high` for sensitive artifact boundary.
- **Confidence:** CONFIRMED for repository structure.
- **Evidence:** root contains current package wrappers alongside historical reports, production scripts and access/credential-like artifacts. Backend/frontend/mobile READMEs have different maturity and source priority.
- **Failure scenario:** a new contributor follows a stale deployment/setup path, uses the wrong package root or opens/copies sensitive repository material.
- **Sources:** root file inventory; root and package `README.md`; `scripts/dev/README.md`; [Security and privacy Debt](security-and-privacy.md).
- **Required action:** use [Onboarding](onboarding.md) as safe entrypoint; repository cleanup and security remediation are separate tracks.
