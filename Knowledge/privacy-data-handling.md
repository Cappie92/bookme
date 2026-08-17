---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-12
---

# Privacy and data handling

Канон repository-known personal-data categories, local lifecycle и third-party boundaries. Это не юридическое заключение: применимые основания, сроки, production logs/backups и processor retention остаются owner-controlled или UNKNOWN.

## 1. Data categories and owners

| Category | Repository-known examples | Primary owner |
|----------|---------------------------|---------------|
| Account identity | email, phone, name, birth date, role, verification state | Identity / `User` |
| OAuth identity | provider identifier and provider email link | Identity / `UserOAuthAccount` |
| Professional profile | public name, description, address/city/timezone, media, salon/master attributes | Profiles |
| Booking relationship | parties, service/time, notes, price/outcome history | Booking |
| Master CRM | client phone/alias/notes/restrictions and master-specific metadata | Client CRM |
| Billing/finance | payment/subscription identifiers, amounts and provider metadata | Subscription Billing / Finance |
| Client telemetry | internal user id, role, events/screens, page URL/referrer, revenue and crash context | Analytics integrations |

Domain ownership does not imply unlimited disclosure. API response schemas, endpoint authorization and third-party exports are separate boundaries.

**Source:** `backend/models.py`; `frontend/src/analytics/metrika.js`; `mobile/src/services/analytics/Analytics.ts`.

## 2. Collection and consent evidence

Web registration UI requires agreement controls and sends terms/personal-data/marketing fields, but common backend `UserCreate` does not declare them and registration does not validate or persist consent. Mobile shows legal-document links/agreement UI but common register request has no consent evidence fields.

OAuth onboarding requires terms and personal-data booleans before account creation, accepts a marketing choice, and does not persist any of those choices with text/version/time evidence. Therefore current DB cannot prove consent history for either common or OAuth registration. This is [high privacy Debt](security-and-privacy.md#high-registration-consent-evidence), not a claim that no legal basis exists.

**Source:** `frontend/src/modals/AuthModal.jsx`; `mobile/src/components/auth/RegistrationAgreementRow.tsx`, `mobile/src/services/api/auth.ts`; `backend/schemas.py` — `UserCreate`; `backend/routers/auth.py` — OAuth onboarding and register.

## 3. Local storage and transit boundaries

Backend persists account/profile/booking/CRM/billing data in the application database and local uploaded media under repository-known upload paths. Production database and volume ownership are described in [data and migrations](data-and-migrations.md); host backup/encryption/retention facts are UNKNOWN.

Web stores JWTs and role/demo state in `localStorage`. Mobile stores cached user JSON in AsyncStorage and both access/refresh tokens in SecureStore plus AsyncStorage fallback/duplicate; Expo Go uses AsyncStorage. These are repository-known client persistence choices and tracked as [security Debt](security-and-privacy.md#high-remaining-session-and-client-token-boundaries).

Repository transport integrations use HTTP clients and configured provider endpoints. Production TLS termination and network topology are described only to the extent confirmed in [production topology](production-topology.md).

## 4. External processors and data categories

| Integration | Repository-known transmitted category | Configuration/runtime note |
|-------------|----------------------------------------|----------------------------|
| Yandex OAuth | OAuth code exchange; provider identifier, email and profile fields | Optional feature; server callback and opaque client ticket |
| Call/SMS verification providers | phone, call/request identifiers and verification state | Stub/live modes; logging debt applies |
| Email provider | recipient email and verification/reset content | Delivery failure does not roll back common registration |
| Yandex Metrika | web path/query/hash, referrer, page/goal context; click/link/session features | Enabled by default unless explicitly disabled |
| AppMetrica | internal user id, role/event context, revenue, errors/crashes | NoOp when key absent; ad identifiers/location disabled in wrapper |
| Payment provider | payment identifier, amount and callback metadata | Subscription billing contract owns details |
| Maps/geocoding | address/search query context | Consumer of profile/location input |

Provider-side retention, geographic processing, subprocessors and production account settings are UNKNOWN from repository evidence. Credential values are outside Knowledge.

**Source:** `backend/routers/auth.py`; `backend/services/zvonok_service.py`; `backend/services/plusofon_service.py`; `backend/services/email/unisender_provider.py`; `backend/routers/payments.py`; `frontend/src/analytics/metrika.js`; `mobile/src/services/analytics/providers/AppMetricaProvider.ts`; `backend/routers/yandex_geocoder.py`; `frontend/src/components/AddressAutocomplete.jsx`.

## 5. Analytics behavior

Web `MetrikaRouteListener` mounts globally and initializes analytics without a repository-known consent check. Counter is active by default unless environment configuration explicitly disables it. SPA hit URL includes pathname, query and hash; referrer is included when parsable. OAuth callback uses short-lived ticket query parameters and later cleans the URL. Whether the async analytics hit observes ticket-bearing URL before cleanup is runtime-order dependent and UNKNOWN; query minimization is tracked as [Debt](security-and-privacy.md#high-analytics-and-store-declaration-drift).

Mobile analytics chooses AppMetrica only when configured, otherwise NoOp. The wrapper disables advertising identifiers and location tracking, enables session/crash reporting, sets internal account ID as profile ID and can report events and real payment revenue. Logout clears provider user identity.

**Source:** `frontend/src/App.jsx`, `frontend/src/analytics/MetrikaRouteListener.jsx`, `frontend/src/analytics/metrika.js`, `frontend/src/pages/OAuthCallback.jsx`; `mobile/src/services/analytics/Analytics.ts`, `mobile/src/services/analytics/providers/AppMetricaProvider.ts`, `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`.

## 6. Platform privacy and permissions

Tracked iOS privacy manifest declares tracking disabled and no collected data types, while mobile runtime can transmit profile ID, event/revenue and crash categories. That repository-level drift is CONFIRMED; exact App Store declarations outside the repository are UNKNOWN.

Android manifest removes advertising-ID permission and disables backup, but declares network, storage/media, audio, overlay and vibration permissions. iOS app metadata includes camera/microphone/photo usage descriptions. A manifest declaration proves requested capability, not that every permission is exercised or correctly disclosed in stores.

**Source:** `mobile/ios/DeDato/PrivacyInfo.xcprivacy`; `mobile/ios/DeDato/Info.plist`; `mobile/android/app/src/main/AndroidManifest.xml`; `mobile/app.config.ts`; `mobile/src/services/analytics/providers/AppMetricaProvider.ts`.

## 7. Logs and diagnostics

Registration, mobile auth diagnostics and call-verification service contain log statements that can include contact attributes or credential/provider response structures. Production reach, sinks and retention are UNKNOWN. Knowledge does not reproduce those values; the confirmed exposure surface is tracked in [sensitive logging Debt](security-and-privacy.md#high-sensitive-logging-surfaces).

**Source:** `backend/routers/auth.py`; `backend/services/zvonok_service.py`; `mobile/src/auth/AuthContext.tsx`.

## 8. Deletion, anonymization and retained history

Client/master deletion anonymizes/deactivates the account, clears auth/contact state and current role-specific data, and cancels future operational records. Historical booking/financial identifiers remain to preserve history. Local uploaded profile files are removed best-effort.

Repository does not establish legal retention periods or deletion from DB backups, logs, analytics, payment, email, OAuth or verification providers. Unsupported account roles also need an owner-defined process. Detailed behavior and gap: [Identity deletion](identity-access.md#8-account-deletion) and [Debt](security-and-privacy.md#account-deletion-and-retention-gaps).

## 9. Privacy invariants

- Never place credentials, tokens or personal values in Knowledge, source examples or reports.
- Authentication does not by itself authorize access to another person's data; endpoint purpose, role and object ownership remain mandatory.
- Client/UI hiding is not privacy enforcement.
- Repository code proves a possible data flow, not provider receipt, production retention or legal compliance.
- Unknown retention/declaration facts must remain `UNKNOWN` until verified by the responsible owner or system.
