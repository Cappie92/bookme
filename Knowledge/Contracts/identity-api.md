---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-05
---

# Contract: Identity API

Repository-known `/api/auth` contract for tracked web/mobile clients. It describes current compatibility, including security gaps linked to [Debt](../Debt/security-and-privacy.md); it does not endorse those gaps.

## 1. Route families

| Family | Authentication | Current purpose |
|--------|----------------|-----------------|
| register/login/refresh | anonymous with credentials/token in body | Create account or issue/rotate JWT pair |
| users/me | active bearer | Resolve current DB account and role |
| email/phone verification | mixed anonymous or active depending operation | Verify initial contact or pending contact change |
| password change/reset | active for change; anonymous reset flows | Update password state |
| Yandex OAuth | anonymous callback/exchange/onboarding; active link | External identity login/link and new-account onboarding |
| demo-master-access | anonymous | Issue configured demo account session |
| delete-account | active bearer plus confirmation flow | Self-service client/master deletion |
| users/search | active bearer | Partial phone lookup; privacy/authorization Debt applies |

Router is mounted from `backend/main.py`. Exact dependency and object filter, not URL naming, determine authorization.

## 2. Token response and bearer contract

Successful register/login/OAuth exchange/demo/refresh responses can contain `access_token`, `refresh_token` and bearer token type. New JWT subject is stringified numeric user ID; legacy subject by email/phone remains readable. The server loads current `User` on bearer use and rejects inactive/deleted accounts.

Access and refresh token claim shapes are not distinguished by a token-purpose claim, prior refresh tokens are not repository-revoked, and password change/reset does not revoke sessions. Consumers must treat this as current [Debt](../Debt/security-and-privacy.md#high-jwt-class-and-revocation-boundaries), not a guarantee that either token is safe in every bearer context.

**Source:** `backend/auth.py`; `backend/routers/auth.py` — `_token_response_for_user`, register/login/refresh/demo/OAuth exchange.

## 3. Registration

Common body includes phone, password, role, optional email/name/birth date, and master city/timezone/promo context. Success creates an active but initially unverified account and returns tokens. Master registration creates its profile; email-delivery failure is logged but does not undo account creation.

Common request schema has no consent fields. Extra consent-like web fields are not part of the server contract. Self-service role допускает client, master и salon; admin, moderator и legacy indie не входят в common registration schema. История устранённого privileged-assignment gap сохранена в [security Debt](../Debt/security-and-privacy.md#critical-privileged-role-assignment-at-registration).

OAuth onboarding is a distinct contract limited to client/master and requires its phone/terms/personal-data checks.

**Source:** `backend/schemas.py` — `UserCreate`; `backend/routers/auth.py` — `register`, OAuth onboarding.

## 4. Login, current account and refresh

Login uses phone/password and rejects unknown, deleted or inactive accounts. It does not require completed email/phone verification. `/users/me` returns the current user schema after active-account and demo-write dependency checks.

Refresh accepts a refresh-token field, decodes it, resolves the current account and rotates a pair. Tracked web saves both tokens but has no repository-known automatic refresh call; tracked mobile saves only access token. A consumer cannot assume silent refresh is implemented merely because the server endpoint exists.

**Source:** `backend/routers/auth.py`; `frontend/src/contexts/AuthContext.jsx`, `frontend/src/modals/AuthModal.jsx`, `frontend/src/utils/api.js`; `mobile/src/auth/AuthContext.tsx`, `mobile/src/services/api/auth.ts`.

## 5. Verification and contact changes

Email verification/reset records are one-time and expire. Initial phone and pending-phone-change flows initiate a call, store server-side verification state with expiry/attempt limits, and compare the submitted code before changing verified state. Stub mode may expose test verification data in the response; live mode does not intentionally return it.

Legacy SMS and reverse-call endpoints remain mounted for compatibility. Reverse-call live status enforcement is [critical Debt](../Debt/security-and-privacy.md#critical-legacy-reverse-call-verification); clients must not rely on it as proof of provider-verified possession.

Request endpoints may return different errors for existing/missing accounts. The repository does not define a uniform anti-enumeration response contract.

**Source:** `backend/routers/auth.py`; `backend/services/verification_service.py`; `backend/services/zvonok_service.py`; `backend/sms.py`; `backend/tests/test_pending_contact_change.py`.

## 6. OAuth contract

Yandex authorization endpoints are unavailable when the feature is disabled and unavailable-for-service when required configuration is incomplete. Login/link begin with signed state. Callback exchanges provider code on the backend and redirects web with an opaque short-lived login or onboarding ticket.

Login ticket exchange is one-time and produces JWTs. New-user onboarding validates ticket, verified phone state, client/master role and required acceptance flags. Link requires active bearer and associates provider identity with the current account; an existing account can also be matched/linked by verified provider email according to current runtime.

Frontend must clean ticket-bearing callback URLs and must never persist provider credentials. Global analytics includes query data, so callback query minimization is tracked in [privacy Debt](../Debt/security-and-privacy.md#high-analytics-and-store-declaration-drift).

**Source:** `backend/routers/auth.py`; `backend/tests/test_auth_yandex.py`; `frontend/src/pages/OAuthCallback.jsx`, `frontend/src/analytics/MetrikaRouteListener.jsx`.

## 7. Authorization and role contract

Bearer authentication supplies an identity; role and ownership are additional enforcement layers. `require_role` and moderator permission checkers operate on the current DB user. Core admin router root dependency допускает admin/moderator, а endpoint-local permission checker может дополнительно ограничить moderator. История исправленного wiring gap сохранена в [security Debt](../Debt/security-and-privacy.md#critical-admin-router-root-enforcement).

Web/mobile role guards choose UI/navigation only. They are not part of backend authorization. Demo read-only is applied only by `get_current_active_user`, so it is dependency-scoped rather than a universal token capability.

**Source:** `backend/auth.py`; `backend/routers/admin.py`; `backend/routers/moderator.py`; `backend/routers/admin_promo_engine.py`; `backend/tests/test_authorization_hardening.py`; `frontend/src/App.jsx`; `mobile/app/_layout.tsx`. Remediation evidence: commit `e0b8bc7`.

## 8. Deletion and search

Self-service deletion uses a confirmation sequence and common deletion service for client/master identities. After deletion, active bearer resolution fails. Historical records may remain anonymized/linked by stable IDs; deletion is not a promise of provider/log/backup erasure.

Authenticated user search accepts a partial phone query and returns the general user schema. Its current purpose and field boundary are insufficiently restricted and tracked as [high Debt](../Debt/security-and-privacy.md#high-broad-authenticated-user-search).

**Source:** `backend/routers/auth.py`; `backend/services/account_deletion.py`; `backend/tests/test_account_deletion.py`; `backend/schemas.py`.

## 9. Compatibility and UNKNOWN

- UNKNOWN: external clients outside tracked web/mobile and their refresh behavior.
- UNKNOWN: which legacy verification/password endpoints remain actively consumed.
- Error body language/shape varies by endpoint; there is no single identity error envelope.
- Token expiry values are configuration, not hardcoded client contract.
- Provider-side availability, retention and validity are outside repository proof.
