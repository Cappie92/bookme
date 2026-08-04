---
type: Work
status: active
project: DeDato
non_canonical: true
---

# Knowledge build status

## Current package

- **Package 4:** Client CRM, Loyalty, Promo and Finance
- **State:** `in_progress`
- **Current phase:** inventory
- **Owner rule retained:** credential-like literal is repository evidence, `validity: UNKNOWN`, `sensitivity: HIGH`; separate remediation required. It does not block unrelated canon and is never copied or externally tested.
- **Next autonomous step:** separate CRM ownership, loyalty ledger, promo rewards and operational finance from Booking outcomes and SaaS subscription billing.

## Completed foundations

| Package | Commit | Result |
|---------|--------|--------|
| Living canon governance | `0d5a191` | Knowledge classification, source priority, confidence and security rules |
| Production topology and data lifecycle | `04795e3` | Repository-known topology plus data/migrations ownership |
| Package 1 — Booking and Scheduling | `c89d1fe` | Booking lifecycle, completion side effects, scheduling, API contract, sanitized critical authorization debt |
| Package 2 — Identity, Authorization and Privacy | `f37db77` | Account/OAuth/session/enforcement/privacy canon and sanitized security/privacy Debt |
| Package 3 — Feature flags, Entitlements and Background Jobs | pending commit | Configuration precedence, entitlement enforcement, five in-process jobs and confirmed Debt |

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

## Known cross-package risks

- Existing `Domain/domain-map.md` uses event-like wording for Booking → Loyalty/Notifications; runtime orchestration must be checked before any direct correction.
- Booking status enum, transition declarations, actual router guards and client labels may describe different state graphs.
- Salon/legacy indie paths coexist with master-only canon and must not be silently merged.
- Completion side effects span Booking, Loyalty, Client CRM and Finance; ownership must remain explicit.
- Host-only production facts are outside this track unless separately authorized.

## Git state

- Branch: `main`
- Remote state at start: synchronized with `origin/main`
- Remote checkpoint includes `c89d1fe` (Package 1). Local `main` includes Package 2 and has Package 3 Knowledge pending its documentation commit.
- Push policy: after at least three completed package commits, completion, or Stop Gate, provided fetch shows no divergence.
