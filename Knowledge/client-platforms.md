---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-12
---

# Debt — client platforms

Подтверждённые ограничения web/mobile composition и cross-platform contracts. Это не target-state roadmap.

## Fragmented web transport

- **Confidence:** CONFIRMED.
- **Evidence:** `utils/api.js` вручную классифицирует protected prefixes/public exceptions, но десятки components/pages выполняют direct `fetch`; auth registration/recovery modals and domain-specific wrappers also implement their own response/error handling.
- **Failure scenario:** новый или перемещённый endpoint может получить другое bearer, 401, credentials, demo-mode или error-body поведение в зависимости от call site.
- **Sources:** `frontend/src/utils/api.js`; `frontend/src/modals/AuthModal.jsx`; direct `fetch` inventory under `frontend/src`; `frontend/src/utils/adminPromoEngineApi.js`; `frontend/src/utils/subscriptionsApi.js`.
- **Required action:** отдельный client transport contract/remediation; backend enforcement не должен зависеть от client prefix list.

## Client guards are not authorization

- **Confidence:** CONFIRMED.
- **Evidence:** web `AdminRoute` and mobile `AuthGate`/development Axios role guard choose UI/navigation using client-known role. Mobile master/client groups reduce accidental imports but do not prove caller permissions.
- **Failure scenario:** UI restriction may be mistaken for object/role authorization while direct API access is governed only by backend dependencies and ownership checks.
- **Sources:** `frontend/src/App.jsx`; `mobile/app/_layout.tsx`; `mobile/app/(client)/_layout.tsx`; `mobile/app/(master)/_layout.tsx`; `mobile/src/services/api/client.ts`.
- **Required action:** keep client guards as UX controls and remediate server authorization in the separate authorization track referenced by [Security Debt](security-and-privacy.md).

## Production-mounted web test surfaces

- **Confidence:** CONFIRMED for route composition; actual production usage is UNKNOWN.
- **Evidence:** `/test/*`, `/design-system` and demo routes are unconditional declarations in the same `App.jsx` build used by production Docker image.
- **Failure scenario:** internal diagnostics/demo UI becomes externally discoverable, drifts from supported product paths or invokes endpoints with unexpected side effects.
- **Sources:** `frontend/src/App.jsx`; `frontend/Dockerfile.prod`.
- **Required action:** separately inventory and classify each route, then gate/remove it by explicit environment/product ownership.

## Native/runtime link configuration drift

- **Confidence:** CONFIRMED risk; current tracked default scheme/hosts align.
- **Evidence:** native associated domains/intent filters are build-time values from `app.config.ts`, runtime host acceptance comes from `env`, and Expo doctor `appConfigFieldsNotSyncedCheck` is disabled while generated native files are tracked.
- **Failure scenario:** an accepted runtime link is not delivered by the OS, or an OS-delivered link is rejected by runtime after environment/native changes.
- **Sources:** `mobile/app.config.ts`; `mobile/package.json`; `mobile/src/config/env.ts`; `mobile/src/utils/parsePublicMasterDeepLink.ts`; Android manifest and iOS entitlements.
- **Required action:** separate build verification must compare dynamic config, generated native files and runtime trust hosts per release profile.

## Duplicated cross-platform mappings

- **Confidence:** CONFIRMED.
- **Evidence:** payment status/application mapping and subscription payment decisions have separate web JavaScript and mobile TypeScript implementations; booking/status/date display helpers are also platform-specific. `shared/` covers only selected utilities.
- **Failure scenario:** a backend status/field evolves on one client while the other keeps older display or fallback semantics.
- **Sources:** `frontend/src/utils/paymentPublicStatus.js`; `mobile/src/utils/paymentPublicStatus.ts`; `frontend/src/utils/subscriptionPaymentApply.js`; `mobile/src/utils/subscriptionPayment.ts`; `shared/` import inventory.
- **Required action:** define contract tests/fixtures or generated/shared schemas before claiming client parity.

## Diagnostic data exposure

- **Severity:** `high`.
- **Confidence:** CONFIRMED for code paths; build flag values and production collection are UNKNOWN.
- **Evidence:** mobile development diagnostics can retain copyable response-body previews, full/effective API URLs and auth traces; payment fallback logging can include a prefix of an unparsed external payment URL. Web has query-enabled temporary development error capture.
- **Failure scenario:** personal, bearer-like, payment or internal URL data may cross into console/debug clipboard outside its primary UI boundary.
- **Sources:** `mobile/src/services/api/client.ts`; `mobile/src/debug/`; `mobile/src/config/env.ts`; `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`; `frontend/src/main.jsx`; `frontend/src/tempDebugErrorCapture.js`.
- **Required action:** separate logging/redaction review; do not copy runtime diagnostic payloads into Knowledge.

## Client payment analytics is best effort

- **Confidence:** CONFIRMED.
- **Evidence:** mobile persists pending payment and at-most-once-attempt flags locally; it clears terminal records after a verification attempt. Code explicitly does not promise exactly-once or at-least-once delivery.
- **Failure scenario:** app crash, storage failure or analytics SDK loss can omit revenue/success telemetry even when backend payment is correct.
- **Sources:** `mobile/src/services/analytics/pendingSubscriptionPayment.ts`; `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`.
- **Required action:** financial/reconciliation analytics requiring delivery guarantees must originate from a durable backend path.

## Notification UI is mock-backed

- **Confidence:** CONFIRMED.
- **Evidence:** master dashboard notification hook derives items from `notificationsMock`; no repository-known notification API/feed is connected to this UI.
- **Failure scenario:** screenshots/UI may be interpreted as a delivered notification capability although data is local fixture-derived and non-durable.
- **Sources:** `mobile/src/hooks/useMasterNotifications.ts`; `mobile/src/components/master/notifications/notificationsMock.ts`; `mobile/src/components/master/notifications/NotificationsSheet.tsx`.
- **Required action:** retain mock classification until a real delivery/read-state contract exists.

## Split health semantics

- **Confidence:** CONFIRMED.
- **Evidence:** frontend Nginx `/health` is a static frontend response; `/api/health` proxies backend static process health. Neither checks database, migrations, jobs or providers.
- **Failure scenario:** external monitoring may call the wrong endpoint or interpret liveness as application readiness.
- **Sources:** `frontend/nginx.conf`; `backend/main.py` — `health_check`; [Backend architecture](backend.md).
- **Required action:** infrastructure owner defines separate liveness/readiness dependency semantics.
