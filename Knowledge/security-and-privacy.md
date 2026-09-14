---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-13
---

# Debt — security and privacy

Repository-known security/privacy debt. Документ не содержит credential values, персональные данные, эксплуатационные сценарии или инструкции обхода controls.

## Credential-like literal in tracked documentation

- **Evidence class:** repository evidence
- **Sensitivity:** HIGH
- **Type:** credential-like literal for a third-party API configuration category
- **Validity:** UNKNOWN
- **Location:** `frontend/src/components/YANDEX_API_SETUP.md`
- **Validity evidence:** подтверждение действительности отсутствует; literal нельзя считать ни действующим, ни отозванным.
- **Required action:** separate security remediation; Knowledge track не открывает, не копирует и не проверяет значение.

Подобные находки классифицируются как `repository evidence` + `validity: UNKNOWN` + `requires separate remediation` и не блокируют остальные Knowledge packages, если их канонизация не требует раскрытия содержимого.

## Credential-like literal in tracked Compose configuration

- **Evidence class:** repository evidence
- **Sensitivity:** HIGH
- **Type:** credential-like literal in application configuration
- **Validity:** UNKNOWN
- **Location:** `docker-compose.yml`
- **Validity evidence:** подтверждение действительности отсутствует; literal нельзя считать ни действующим, ни отозванным.
- **Required action:** separate security remediation; Knowledge track не копирует и не проверяет значение.

## Credential-like literal in tracked mobile analytics configuration

- **Evidence class:** repository evidence
- **Sensitivity:** HIGH
- **Type:** credential-like literal in mobile analytics configuration
- **Validity:** UNKNOWN
- **Location:** `mobile/src/services/analytics/apiKey.ts`
- **Validity evidence:** подтверждение действительности отсутствует; literal нельзя считать ни действующим, ни отозванным.
- **Required action:** separate security remediation; Knowledge track не открывает, не копирует и не проверяет значение.

## Credential-like literal in tracked backend test fixture

- **Evidence class:** repository evidence
- **Sensitivity:** HIGH
- **Type:** credential-like literal in test authentication fixture
- **Validity:** UNKNOWN
- **Location:** `backend/tests/conftest.py`
- **Validity evidence:** подтверждение действительности отсутствует; literal нельзя считать ни действующим, ни отозванным, ни безопасным примером.
- **Required action:** separate security remediation; Knowledge track не повторяет и не проверяет значение.

## Access-named tracked artifacts not inspected

- **Evidence class:** repository evidence by path and file type; contents intentionally not inspected
- **Sensitivity:** HIGH
- **Type:** credential-like/access material candidates
- **Validity:** UNKNOWN
- **Locations:** `TOKEN_SETTINGS.md`; `backend/test_system_access.csv`; `backend/test_system_access.xlsx`; `users_from_access.csv`; `ДОСТУПЫ!.xlsx`; `ДОСТУПЫ!_upd.csv`.
- **Validity evidence:** подтверждение наличия или действительности credentials отсутствует; файлы нельзя считать ни безопасными fixtures, ни retired material без отдельной проверки.
- **Required action:** authorized security/data owner performs separate inventory, containment and remediation without copying values into Knowledge.

## Additional credential-like literals in tracked operator/Yandex artifacts

- **Evidence class:** repository evidence; values intentionally not reproduced or externally validated.
- **Sensitivity:** HIGH
- **Validity:** UNKNOWN
- **Locations:** `YANDEX_API_SOLUTION.md`; `backend/reset_admin_password.py`; `frontend/test_yandex_api.html`; `update_master_passwords.py`.
- **Validity evidence:** the repository contains credential-shaped assignments, but current provider/account validity is not established. None was introduced by the A–F added-line diff.
- **Required action:** authorized security owner inventories and rotates/removes or replaces them with environment-only inputs in a separate history-aware remediation.

## Open: production credential exposure

- **Evidence class:** operational incident
- **Sensitivity:** HIGH
- **Validity:** exposed values must be treated as compromised
- **Status:** open follow-up; rotation was not mixed into the stable release cutover
- **Fact:** production environment values were printed to a terminal during a failed manual backend replacement and entered a conversation transcript.
- **Required action:** controlled credential rotation by the authorized credential owner. Knowledge does not store, quote or reconstruct the values.
- **Historical artifact:** [Incident: production credential exposure](production-credential-exposure.md).

## Critical: admin router root enforcement

- **Severity:** `critical`
- **Confidence:** CONFIRMED
- **Trust boundary:** authenticated identity → administrative mutations and operational data.
- **Category:** dependency factory wired without instantiating its role checker.
- **Confirmed scope:** the core admin router registers the factory itself as a root dependency; endpoint-local role/permission dependencies still protect only the handlers that declare them. Other admin/moderator routers use instantiated checkers correctly.
- **Potential impact:** administrative handlers relying only on the ineffective root dependency may execute without the intended admin/moderator role enforcement.
- **Sources:** `backend/auth.py` — `require_admin_or_moderator`; `backend/routers/admin.py` — router declaration and endpoint-local dependencies; comparison with `backend/routers/moderator.py`, `backend/routers/admin_promo_engine.py`, `backend/routers/subscription_plans.py`, `backend/routers/service_functions.py`.
- **Status:** active repository-known debt; frontend route guards do not compensate for backend enforcement.
- **Required action:** separate authorization remediation with endpoint inventory and regression tests.

## Closed: legacy reverse-call verification

- **Severity:** was `critical`
- **Status:** remediated; not a current verification mechanism
- **Resolution:** both legacy reverse-phone endpoints and the unused status helper were removed. Current runtime answers `404`.
- **Historical artifact:** [Reverse-phone verification bypass](reverse-phone-verification-bypass.md).
- **Remaining related debt:** live Zvonok contract fragmentation below no longer includes reverse endpoints.

## Critical: live Zvonok verification contract is fragmented

- **Severity:** `critical`
- **Confidence:** CONFIRMED for repository behavior; provider/account behavior is UNKNOWN.
- **Trust boundary:** Zvonok callback data and user-entered digits → verified phone or destructive account action.
- **Category:** multiple incompatible challenge implementations prevent safe live-provider enablement.
- **Confirmed scope:** common registration uses `VerificationService` purpose/target/call binding, expiry and attempt limits. Account deletion instead persists a locally generated random code while separately starting a provider call, so the value being checked is not the provider `pincode`. OAuth onboarding stores an ad-hoc ticket challenge rather than consuming the common contract. Phone change performs several binding checks but implements its own non-locking read/check/clear sequence instead of an atomic common challenge consume. Reverse-phone endpoints are not part of this remaining live-Zvonok surface; they are retired (`404`) and recorded in the closed item above.
- **Additional provider boundary:** the service hard-codes its campaign identifier and live request/response logging includes the request payload and provider response, which may expose API key, phone, call ID and `pincode`.
- **Potential impact:** enabling `ZVONOK_MODE` live can create unverifiable, replay/race-prone or disclosure-prone identity flows; not every successful call initiation can be safely bound to the later action.
- **Sources:** `backend/services/verification_service.py` — common challenge contract; `backend/services/zvonok_service.py` — campaign selection and live logging; `backend/routers/auth.py` — account deletion, OAuth onboarding and phone change.
- **Status:** live Zvonok is blocked on staging; stub mode is the current staging contract.
- **Required action:** migrate remaining phone-proof flows to the unified challenge contract with atomic consume/row locking; redact live logs; move campaign selection to `ZVONOK_CAMPAIGN_ID`; add focused concurrency/provider-contract tests before live smoke.

## High: remaining session and client token boundaries

- **Severity:** `high`
- **Confidence:** CONFIRMED
- **Category:** normal JWT invalidation is account-wide/version-based, while credential persistence and refresh lifecycle retain broader exposure than per-device sessions.
- **Confirmed scope:** access/refresh token class and `session_version` are enforced and password mutations revoke prior pairs. There is no repository-known per-device session list, refresh-token rotation/reuse store or server logout endpoint. Web stores both tokens in `localStorage`; mobile stores both via SecureStore when available but duplicates/falls back to AsyncStorage, while Expo Go uses AsyncStorage only.
- **Potential impact:** client runtime/storage compromise exposes bearer credentials until expiry or an account-wide version change; one device cannot selectively revoke another session and refresh-token replay is not tracked server-side.
- **Sources:** `frontend/src/contexts/AuthContext.jsx`, `frontend/src/modals/AuthModal.jsx`, `frontend/src/pages/OAuthCallback.jsx`; `mobile/src/auth/tokenStorage.ts`, `mobile/src/auth/AuthContext.tsx`, `mobile/src/services/api/auth.ts`.
- **Required action:** separate client session-hardening decision and implementation.

## High: auth abuse controls and compatibility retirement

- **Severity:** `high`
- **Confidence:** CONFIRMED for repository code; edge/provider controls outside the repository are UNKNOWN.
- **Category:** incomplete server-side abuse controls and rollout retirement mechanism.
- **Confirmed scope:** phone challenges enforce expiry and attempt limits after creation, and password-recovery request responses are semantically generic. The repository does not establish a shared per-IP/per-phone request throttle, timing normalization, CAPTCHA/device risk boundary or durable audit trail for registration/login/recovery attempts. JWT compatibility flags are manual environment switches with no repository-known telemetry or automatic retirement gate.
- **Potential impact:** call/request endpoints can consume provider capacity or leak timing distinctions under abuse; compatibility acceptance may remain enabled longer than intended without an operational signal.
- **Sources:** `backend/routers/auth.py` — registration/login/password-recovery request paths; `backend/services/verification_service.py`; `backend/settings.py` — JWT compatibility flags.
- **Required action:** separately define rate/abuse policy and rollout observability, then retire both compatibility flags after measured client expiry.

## High: registration consent evidence

- **Severity:** `high`
- **Confidence:** CONFIRMED
- **Category:** displayed consent controls are not consistently enforced or persisted as auditable evidence.
- **Confirmed scope:** common password registration on web/mobile and OAuth onboarding require terms and personal-data booleans; marketing choice is accepted. Pending flows carry these choices long enough to complete registration, but the resulting account has no auditable consent record containing legal text/version/timestamp; marketing choice is not persisted as consent evidence.
- **Potential impact:** repository data cannot establish which legal text/version and choices were accepted for an account.
- **Sources:** `backend/schemas.py` — `UserCreate`; `backend/routers/auth.py` — pending registration and OAuth onboarding; `frontend/src/modals/AuthModal.jsx`; `mobile/src/services/api/auth.ts`, `mobile/src/components/auth/RegistrationAgreementRow.tsx`.
- **Required action:** separate privacy/legal contract decision followed by schema, storage and client alignment.

## High: analytics and store-declaration drift

- **Severity:** `high`
- **Confidence:** CONFIRMED for repository declarations and data-flow code; production/provider receipt is UNKNOWN.
- **Category:** runtime analytics data categories are not represented by the tracked iOS privacy manifest; web analytics is initialized without a repository-known consent gate.
- **Confirmed scope:** mobile analytics can set an internal user profile ID and report role/event context, revenue and crash data, while the iOS manifest declares no collected data. Web analytics is enabled by default unless explicitly disabled. Hit URL sanitization now strips handoff codes, OAuth/onboarding tickets, email verification and password-reset parameters at the analytics boundary before send; ordinary safe query dimensions are kept. Remaining gap is consent/store-declaration alignment, not the former ticket-before-cleanup race.
- **Potential impact:** privacy/store disclosures or consent behavior may not match runtime data flows; URL query data may cross an analytics boundary.
- **Sources:** `mobile/src/services/analytics/Analytics.ts`, `mobile/src/services/analytics/providers/AppMetricaProvider.ts`, `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`, `mobile/ios/DeDato/PrivacyInfo.xcprivacy`; `frontend/src/analytics/analyticsUrl.js`, `frontend/src/analytics/metrika.js`, `frontend/src/analytics/MetrikaRouteListener.jsx`, `frontend/src/App.jsx`.
- **Required action:** separate privacy review covering consent and store declarations; URL credential sanitization is already a current analytics-boundary contract.

## High: sensitive logging surfaces

- **Severity:** `high`
- **Confidence:** CONFIRMED for log statements; production log routing and retention are UNKNOWN.
- **Category:** authentication and verification paths log personal or credential-bearing structures.
- **Confirmed scope:** mobile auth diagnostics include account contact attributes; the live call-verification service logs request/response structures that can contain phone and credential-like/provider verification data.
- **Potential impact:** sensitive data may be copied into logs outside its primary storage boundary.
- **Sources:** `backend/services/zvonok_service.py` — live request/response logging; `mobile/src/auth/AuthContext.tsx` — diagnostic fields.
- **Required action:** separate logging inventory, redaction and retention remediation.

## High: broad authenticated user search

- **Severity:** `high`
- **Confidence:** CONFIRMED
- **Category:** insufficient purpose/role restriction on personal-data discovery.
- **Confirmed scope:** any active authenticated account can perform partial phone search and receives the general user response schema for matches.
- **Potential impact:** personal account attributes may be disclosed beyond a demonstrated business-purpose boundary.
- **Sources:** `backend/routers/auth.py` — `search_users`; `backend/schemas.py` — `User` response schema.
- **Required action:** separate authorization/privacy remediation defining caller purpose, returned fields and auditability.

## Account deletion and retention gaps

- **Confidence:** CONFIRMED for repository behavior; legal/provider/backup retention is UNKNOWN.
- **Evidence:** self-service deletion supports client and master/indie identities, anonymizes the user, removes auth side tables and domain-specific current data, cancels future bookings/subscriptions, and preserves historical booking/financial identifiers. Other account roles are not supported by the common deletion service.
- **Failure scenario:** unsupported roles and data outside the local transactional model need an owner-defined deletion/retention process; repository code cannot prove removal from backups, logs or third-party systems.
- **Sources:** `backend/services/account_deletion.py`; `backend/tests/test_account_deletion.py`.
- **Required action:** privacy owner defines retention and processor deletion obligations; implementation is a separate track.
