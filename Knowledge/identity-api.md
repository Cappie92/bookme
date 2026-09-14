---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-13
---

# Contract: Identity API

Repository-known `/api/auth` contract for tracked web/mobile clients. It describes current compatibility, including security gaps linked to [Debt](security-and-privacy.md); it does not endorse those gaps.

## 1. Route families

| Family | Authentication | Current purpose |
|--------|----------------|-----------------|
| register/login/refresh | anonymous with credentials/ticket/token | Stage registration, authenticate or rotate JWT pair |
| users/me | active bearer | Resolve current DB account and role |
| email/phone verification | mixed anonymous or active depending operation | Verify initial contact or pending contact change |
| password change/reset | active for change; anonymous reset flows | Update password state |
| Yandex OAuth | anonymous callback/exchange/onboarding; active link | External identity login/link and new-account onboarding |
| demo-master-access | anonymous | Issue pre-created readonly demo session (`demo_access`); never creates/reseeds identity |
| web-handoff | authenticated source session; anonymous exchange of one-time code | Mobile-to-web session with server-trusted `web_session_origin`; demo cannot mint handoff |
| delete-account | active bearer plus confirmation flow | Self-service client/master deletion |
| users/search | active bearer | Partial phone lookup; privacy/authorization Debt applies |

Router is mounted from `backend/main.py`. Exact dependency and object filter, not URL naming, determine authorization.

## 2. Token response and bearer contract

Successful login, completed registration/legacy verification, OAuth exchange and refresh responses contain `access_token`, `refresh_token` and bearer token type. Normal JWTs use numeric user ID in `sub`, integer `sv` and `token_type=access|refresh`. Demo access is a distinct contract: `token_type=demo_access`, `demo=true`, 15-minute TTL, no refresh token, no `web_session_origin`. Normal bearer rejects purpose-bound artifacts and refresh-class tokens; refresh rejects access, untyped and demo tokens. Identity resolution never falls back to email/phone.

Password mutations increment `User.session_version` transactionally and revoke prior pairs. Phase-one flags may temporarily accept numeric bearer tokens missing `sv` and/or `token_type`; `/refresh` is typed immediately. Per-device logout, refresh rotation/reuse detection and token-at-rest hardening remain outside this contract.

**Source:** `backend/auth.py`; `backend/routers/auth.py` — `_token_response_for_user`, register/login/refresh/OAuth exchange; `backend/services/demo_session.py`.

## 3. Registration

Common body includes phone, password, role, required terms/personal-data booleans, optional marketing choice/email/name/birth date, and master city/timezone/promo context. Self-service roles are exactly `client` and `master`. Success is `phone_verification_required` with an opaque 15-minute bearer ticket, phone, expiry and `verification_kind=new_registration`; no account/profile/promo/JWT exists yet.

The ticket is accepted only by request/confirm/cancel signup-phone endpoints. Confirmation requires the bound call id and digits; successful proof consumes the ticket before creating account-side rows in one transaction and returns the normal pair. Reuse returns conflict, and cancel/expiry leaves no account. Production registration ticket operations require Redis and fail with `503` when unavailable.

Anonymous account creation through public booking follows the same invariant. `/api/bookings/public` and `/api/bookings/create-with-any-master` validate the request and return a separate `verification_kind=public_booking` opaque ticket without creating `User`, `Booking` or normal JWT. The public-booking request/confirm/cancel endpoints bind proof to purpose, target phone and call id; confirm atomically claims the ticket, rechecks availability, creates or safely reuses the verified client, creates the booking and only then may return a canonical access JWT. Existing verified phone numbers still require possession proof when submitted anonymously.

OAuth onboarding is a distinct contract limited to client/master and requires its phone/terms/personal-data checks.

**Source:** `backend/schemas.py` — `UserCreate`; `backend/routers/auth.py` — `register`, OAuth onboarding; `backend/routers/bookings.py` — public-booking pending and verification handlers; `backend/services/pending_ticket_service.py`.

## 4. Login, current account and refresh

Login uses phone/password and rejects unknown, deleted or inactive accounts. It does not require completed email/phone verification. `/users/me` returns the current user schema after active-account checks, including `web_session_origin` when present.

Refresh accepts a `refresh_token` field, requires refresh class plus matching `sv`, resolves the active current account and returns a new pair. Both tracked clients persist both tokens, but neither establishes a repository-wide guarantee of automatic refresh. A consumer cannot assume silent refresh merely because the endpoint exists.

**Source:** `backend/routers/auth.py`; `frontend/src/contexts/AuthContext.jsx`, `frontend/src/modals/AuthModal.jsx`, `frontend/src/utils/api.js`; `mobile/src/auth/AuthContext.tsx`, `mobile/src/services/api/auth.ts`.

## 5. Verification and contact changes

Email verification/reset records are one-time and expire. New-registration and historical-account phone proofs use distinct artifacts. Initial phone and pending-phone-change flows initiate a call, store server-side verification state with purpose/target/expiry/attempt limits, and compare submitted proof before changing state. Stub mode may expose test verification data; live mode does not intentionally return it.

Phone password recovery is a three-step anonymous flow: generic request response plus restricted challenge token, proof confirmation producing an opaque one-time `PasswordReset` token, then `/reset-password`. Unknown/ineligible accounts receive the same request shape. The direct `/reset-password-by-phone` contract is retired with `410`. Successful reset returns no session tokens and invalidates prior sessions.

Legacy reverse-phone endpoints are removed (`404`) and are not a current verification protocol; see [historical artifact](reverse-phone-verification-bypass.md).

Request endpoints may return different errors for existing/missing accounts. The repository does not define a uniform anti-enumeration response contract.

**Source:** `backend/routers/auth.py`; `backend/services/verification_service.py`; `backend/services/zvonok_service.py`; `backend/sms.py`; `backend/tests/test_pending_contact_change.py`.

## 6. OAuth contract

Yandex authorization endpoints are unavailable when the feature is disabled and unavailable-for-service when required configuration is incomplete. Authoritative linking is verified session → signed OAuth state → server ticket → new tokens → authoritative profile. Query params cannot assign `ios_app`.

Login ticket exchange is one-time and produces JWTs that preserve the initiating `web_session_origin`. New-user onboarding validates ticket, verified phone state, client/master role and required acceptance flags; it does not grant `ios_app` without a server-side basis. Link requires active bearer and associates provider identity with the current account; an existing account can also be matched/linked by verified provider email according to current runtime. The «already linked» shortcut keeps the same origin.

OAuth link state and mobile-to-web handoff codes capture the source `session_version` and origin; password/session revocation before callback/exchange invalidates them. Stale OAuth/bootstrap results cannot overwrite a newer session. Until origin is resolved, commerce is fail-closed.

Frontend must never persist provider credentials. Analytics sanitizes ticket-bearing URLs at the analytics boundary before send; see [Privacy](privacy-data-handling.md).

**Source:** `backend/routers/auth.py`; `backend/tests/test_auth_yandex.py`; `frontend/src/pages/OAuthCallback.jsx`, `frontend/src/analytics/MetrikaRouteListener.jsx`.

## 7. Authorization and role contract

Bearer authentication supplies an identity; role and ownership are additional enforcement layers. `require_role` and moderator permission checkers operate on the current DB user. Core admin router root enforcement is currently defective, while several sibling routers and endpoint-local handlers use correct checkers; see [critical Debt](security-and-privacy.md#critical-admin-router-root-enforcement).

Web/mobile role guards choose UI/navigation only. They are not part of backend authorization. Demo read-only is a global application dependency plus typed `demo_access` session, not a `get_current_active_user`-only fence. Booking object mutations use the shared ownership helper in [Booking](booking.md).

**Source:** `backend/auth.py`; `backend/routers/admin.py`; `backend/routers/moderator.py`; `backend/routers/admin_promo_engine.py`; `frontend/src/App.jsx`; `mobile/app/_layout.tsx`.

## 8. Deletion and search

Self-service deletion uses a confirmation sequence and common deletion service for client/master identities. After deletion, active bearer resolution fails. Historical records may remain anonymized/linked by stable IDs; deletion is not a promise of provider/log/backup erasure.

Authenticated user search accepts a partial phone query and returns the general user schema. Its current purpose and field boundary are insufficiently restricted and tracked as [high Debt](security-and-privacy.md#high-broad-authenticated-user-search).

**Source:** `backend/routers/auth.py`; `backend/services/account_deletion.py`; `backend/tests/test_account_deletion.py`; `backend/schemas.py`.

## 9. Compatibility and UNKNOWN

- UNKNOWN: external clients outside tracked web/mobile and their refresh behavior.
- Reverse-phone verification is retired, not an unknown consumer of a live protocol.
- Error body language/shape varies by endpoint; there is no single identity error envelope.
- Token expiry values are configuration, not hardcoded client contract.
- Provider-side availability, retention and validity are outside repository proof.
