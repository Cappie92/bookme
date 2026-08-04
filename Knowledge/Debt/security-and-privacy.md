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

## Critical: privileged role assignment at registration

- **Severity:** `critical`
- **Confidence:** CONFIRMED
- **Trust boundary:** anonymous registration request → persisted account role and authorization identity.
- **Category:** missing server-side allowlist for privileged role assignment.
- **Confirmed scope:** common registration schema accepts the complete role enum and the handler persists the supplied role; OAuth onboarding separately limits new accounts to client/master.
- **Potential impact:** creation of an identity with privileges not intended for self-service registration.
- **Sources:** `backend/schemas.py` — `UserCreate`; `backend/routers/auth.py` — `register`, `_create_user_from_oauth_onboarding`.
- **Status:** active repository-known debt; this is not canonical business policy.
- **Required action:** separate authorization remediation with code and regression tests.

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

## Critical: legacy reverse-call verification

- **Severity:** `critical`
- **Confidence:** CONFIRMED
- **Trust boundary:** untrusted verification request → phone-verified identity state.
- **Category:** verification decision without a live-provider status check.
- **Confirmed scope:** the legacy reverse-call status service returns a successful verified result in live mode without contacting the provider; the current code-based verification path uses separately stored server-side state.
- **Potential impact:** an identity attribute may be marked verified without evidence from the external verification provider.
- **Sources:** `backend/services/zvonok_service.py` — `check_call_status`, `verify_phone_digits`; `backend/routers/auth.py` — reverse verification handlers and current phone verification handlers.
- **Status:** active repository-known debt; it is not the intended verification invariant.
- **Required action:** separate identity/security remediation and deprecation or corrected enforcement.

## High: JWT class and revocation boundaries

- **Severity:** `high`
- **Confidence:** CONFIRMED
- **Category:** access and refresh tokens are not cryptographically distinguished by token type; sessions are stateless and have no repository-known revocation store.
- **Confirmed scope:** both token creators use the same signing algorithm and claim shape apart from expiry; bearer authentication validates signature/expiry and resolves the current active user. Refresh rotates tokens but does not invalidate the prior token, and password changes do not revoke issued JWTs.
- **Potential impact:** token purpose cannot be enforced by the generic bearer dependency and invalidation is delayed until expiry unless the account is deactivated/deleted.
- **Sources:** `backend/auth.py` — token creators and bearer dependencies; `backend/routers/auth.py` — login, refresh and password-change/reset handlers.
- **Required action:** separate session-security design and remediation.

## High: client token persistence

- **Severity:** `high`
- **Confidence:** CONFIRMED
- **Category:** bearer credentials are persisted in script-readable or non-secure client storage.
- **Confirmed scope:** web stores access and refresh tokens in `localStorage`; mobile stores access token in SecureStore when available but also duplicates/falls back to AsyncStorage, while Expo Go uses AsyncStorage only. Tracked mobile auth does not persist the returned refresh token.
- **Potential impact:** compromise of client runtime/storage has a larger credential exposure window; refresh behavior differs between server contract and tracked clients.
- **Sources:** `frontend/src/contexts/AuthContext.jsx`, `frontend/src/modals/AuthModal.jsx`, `frontend/src/pages/OAuthCallback.jsx`; `mobile/src/auth/tokenStorage.ts`, `mobile/src/auth/AuthContext.tsx`, `mobile/src/services/api/auth.ts`.
- **Required action:** separate client session-hardening decision and implementation.

## High: registration consent evidence

- **Severity:** `high`
- **Confidence:** CONFIRMED
- **Category:** displayed consent controls are not consistently enforced or persisted as auditable evidence.
- **Confirmed scope:** web common registration sends consent-like extra fields absent from `UserCreate`; the handler neither validates nor persists them. Mobile common registration has no equivalent request fields. OAuth onboarding requires terms and personal-data booleans but does not persist consent evidence; marketing choice is accepted but not persisted.
- **Potential impact:** repository data cannot establish which legal text/version and choices were accepted for an account.
- **Sources:** `backend/schemas.py` — `UserCreate`; `backend/routers/auth.py` — `OAuthOnboardingCompleteRequest`, `_create_user_from_oauth_onboarding`, `register`; `frontend/src/modals/AuthModal.jsx`; `mobile/src/services/api/auth.ts`, `mobile/src/components/auth/RegistrationAgreementRow.tsx`.
- **Required action:** separate privacy/legal contract decision followed by schema, storage and client alignment.

## High: analytics and store-declaration drift

- **Severity:** `high`
- **Confidence:** CONFIRMED for repository declarations and data-flow code; production/provider receipt is UNKNOWN.
- **Category:** runtime analytics data categories are not represented by the tracked iOS privacy manifest; web analytics is initialized without a repository-known consent gate.
- **Confirmed scope:** mobile analytics can set an internal user profile ID and report role/event context, revenue and crash data, while the iOS manifest declares no collected data. Web analytics is enabled by default unless explicitly disabled and builds page hits from path, query, hash and referrer. OAuth callback tickets are carried in query parameters; whether runtime effect ordering sends a ticket before URL cleanup is UNKNOWN.
- **Potential impact:** privacy/store disclosures or consent behavior may not match runtime data flows; URL query data may cross an analytics boundary.
- **Sources:** `mobile/src/services/analytics/Analytics.ts`, `mobile/src/services/analytics/providers/AppMetricaProvider.ts`, `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`, `mobile/ios/DeDato/PrivacyInfo.xcprivacy`; `frontend/src/analytics/metrika.js`, `frontend/src/analytics/MetrikaRouteListener.jsx`, `frontend/src/App.jsx`, `frontend/src/pages/OAuthCallback.jsx`.
- **Required action:** separate privacy review covering consent, URL minimization and store declarations.

## High: sensitive logging surfaces

- **Severity:** `high`
- **Confidence:** CONFIRMED for log statements; production log routing and retention are UNKNOWN.
- **Category:** authentication and verification paths log personal or credential-bearing structures.
- **Confirmed scope:** registration and mobile auth diagnostics include account contact attributes; the live call-verification service logs request/response structures that can contain phone and credential-like/provider verification data.
- **Potential impact:** sensitive data may be copied into logs outside its primary storage boundary.
- **Sources:** `backend/routers/auth.py` — `register`; `backend/services/zvonok_service.py` — live request/response logging; `mobile/src/auth/AuthContext.tsx` — diagnostic fields.
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
