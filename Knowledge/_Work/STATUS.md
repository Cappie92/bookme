---
type: Work
status: active
project: DeDato
non_canonical: true
---

# Knowledge build status

## Current package

- **Package 7:** Testing, CI/CD, Local Development and Onboarding
- **State:** `completed`
- **Current phase:** completion checkpoint
- **Owner rule retained:** credential-like literal is repository evidence, `validity: UNKNOWN`, `sensitivity: HIGH`; separate remediation required. It does not block unrelated canon and is never copied or externally tested.
- **Next autonomous step:** run final integrity/divergence review and push the completed Package 6–7 checkpoint; after synchronization this Knowledge roadmap is complete.

## Completed foundations

| Package | Commit | Result |
|---------|--------|--------|
| Living canon governance | `0d5a191` | Knowledge classification, source priority, confidence and security rules |
| Production topology and data lifecycle | `04795e3` | Repository-known topology plus data/migrations ownership |
| Package 1 — Booking and Scheduling | `c89d1fe` | Booking lifecycle, completion side effects, scheduling, API contract, sanitized critical authorization debt |
| Package 2 — Identity, Authorization and Privacy | `f37db77` | Account/OAuth/session/enforcement/privacy canon and sanitized security/privacy Debt |
| Package 3 — Feature flags, Entitlements and Background Jobs | `de8af2b` | Configuration precedence, entitlement enforcement, five in-process jobs and confirmed Debt |
| Package 4 — Client CRM, Loyalty, Promo and Finance | `decdd29` | CRM ownership, client points, Promo Engine/legacy boundary, dual operational accounting and confirmed Debt |
| Package 5 — Backend and API Architecture | `6b79e55` | FastAPI composition, request/session/transaction lifecycle, HTTP conventions and confirmed Debt |
| Package 6 — Mobile and Web Architecture | `b839a62` | Web/mobile composition, routes, config, shared code, public/deep links, payment return and client-platform Debt |
| Package 7 — Testing, CI/CD, Local Development and Onboarding | current package commit | Executable test tiers, workflow/deploy boundaries, safe local bootstrap, onboarding and confirmed Debt |

## Last verification

- **Date:** 2026-08-04
- `main` and local `origin/main` both pointed to `04795e3` at track start.
- Working tree was clean before `_Work` creation.
- Mandatory existing Knowledge was read in full before Package 1 inventory.
- Package 1 link/source-path and sensitive-pattern checks passed.
- Package 1 targeted tests: 62 passed (`booking_factory`, effective status, confirmation, loyalty reserve/finalize, schedule day, public master/price/loyalty); deprecation warnings only.
- Package 2 credential-like evidence classified as `validity: UNKNOWN`; no value read/copy, active security test or provider request.
- Package 2 link/source-path, absolute-path and sensitive-pattern checks passed.
- Package 2 existing local tests: 60 passed (`auth`, Yandex OAuth, pending contact changes, account deletion); deprecation/SSL warnings only.
- Package 3 link/source-path and sensitive-pattern checks passed before commit review.
- Package 3 backend tests: 52 passed, 2 skipped (features, effective subscription, admin catalog, guards, flags, daily charges, payment cleanup); deprecation/SSL warnings only.
- Package 3 mobile env unit test unavailable because local JS dependencies are not installed (`jest` executable absent); no dependency installation attempted.
- Package 3 commit `de8af2b` was pushed; local `main` and `origin/main` were synchronized before Package 4 inventory.
- Package 4 repository inventory separated client loyalty from subscription points and operational finance from SaaS billing.
- Package 4 link/source-path, absolute-path and sensitive-pattern checks passed before commit review.
- Package 4 targeted backend tests: 147 passed (CRM clients/restrictions, loyalty discounts/reserve, Promo Engine/admin and accounting); deprecation/SSL warnings only. Production smoke script was intentionally not run.
- Package 4 commit `decdd29` created; local `main` is one commit ahead of `origin/main` before Package 5.
- Additional tracked `docker-compose.yml` credential-like literal classified as repository evidence, `validity: UNKNOWN`, `sensitivity: HIGH`; value is not copied or externally tested.
- Package 5 repository inventory confirmed manual route composition, request-scoped sync sessions, per-path transaction ownership, heterogeneous HTTP contracts and one custom application exception handler.
- Package 5 link/source-path, absolute-path and sensitive-pattern checks passed before commit review.
- Package 5 combined API run: 48 passed, 1 skipped, 5 failed; all five failures cascade from the wall-clock-dependent generic booking fixture crossing its 23:59 schedule boundary. Runtime rejection is consistent with Scheduling canon; no code was changed.
- Package 5 API/auth/public/admin run excluding the nondeterministic generic booking suite: 46 passed, 1 skipped; deprecation/SSL warnings only.
- Package 4–5 checkpoint was pushed; local `main` and `origin/main` synchronized at `6b79e55` before Package 6 inventory.
- Package 6 inventory confirmed the web lazy SPA/same-origin proxy model, mobile role-separated Expo route groups, runtime/native deep-link layers, backend-confirmed payment return and narrow repository `shared/` boundary.
- Additional tracked `mobile/src/services/analytics/apiKey.ts` credential-like literal classified by path-only evidence as repository evidence, `validity: UNKNOWN`, `sensitivity: HIGH`; value was not opened, copied or externally tested.
- Package 6 Markdown links, source paths, absolute-path and sensitive/long-literal checks passed; `git diff --check` passed.
- Package 6 backend payment/public-return tests: 21 passed (`payment_public_status`, `payment_source`, `payment_public_id`); deprecation/SSL warnings only.
- Package 6 pure web payment-query/state/source/application helpers passed direct Node runtime assertions.
- Frontend Vitest and mobile Jest suites were unavailable because local `node_modules` are absent; no dependency installation was attempted.
- Package 6 commit `b839a62` created; working tree was clean before Package 7 inventory.
- Package 7 inventory confirmed 89 canonical backend test modules/652 collected tests, 29 excluded top-level backend test files, 7 web unit modules, 8 Playwright specs, 48 mobile unit modules and 2 mobile integration modules.
- Package 7 workflow inventory confirmed Docs/gitleaks-only PR automation, single-job remote deployment validation, no explicit Alembic deploy step and MkDocs exclusion of canonical `Knowledge/`.
- Additional `backend/tests/conftest.py` credential-like literal and access-named tracked artifacts were classified sanitized as repository evidence, `validity: UNKNOWN`, `sensitivity: HIGH`; no validity/provider checks were performed.
- Package 7 Markdown links, source paths, absolute-path and sensitive/long-literal checks passed; `git diff --check` passed.
- Canonical backend collection: 652 tests collected without errors; deprecation/SSL warnings only.
- Frontend/mobile JS suites and MkDocs build were unavailable because package/docs dependencies are absent. Maestro CLI is available, but native E2E was not run without a separately prepared local device/app/test dataset.

## Known cross-package risks

- Existing `Domain/domain-map.md` uses event-like wording for Booking → Loyalty/Notifications; runtime orchestration must be checked before any direct correction.
- Booking status enum, transition declarations, actual router guards and client labels may describe different state graphs.
- Salon/legacy indie paths coexist with master-only canon and must not be silently merged.
- Completion side effects span Booking, Loyalty, Client CRM and Finance; ownership must remain explicit.
- Host-only production facts are outside this track unless separately authorized.

## Git state

- Branch: `main`
- Remote state at start: synchronized with `origin/main`
- Completion checkpoint consists of consecutive Package 6 and Package 7 Knowledge commits; synchronization is allowed only after fetch confirms no remote divergence.
- Push policy: after at least three completed package commits, completion, or Stop Gate, provided fetch shows no divergence.
