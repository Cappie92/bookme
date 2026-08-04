---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Client links and payment return contract

Cross-platform repository-known contract for public master links, app navigation links and external subscription-payment return. Backend payment state, not a browser route or client callback, is authoritative.

## Public master link

Canonical resource path is `/m/{slug}`:

- web resolves it through `MasterPublicBookingPage`;
- mobile exposes `(public)/m/[slug]` without authentication;
- mobile-generated share links use a configured/default HTTPS origin plus the same path;
- mobile accepts HTTPS only for trusted hosts; plain HTTP is development-only.

Slug is decoded without forced lowercasing. Domain ownership, collision and booking behavior belong to Booking/Product canon.

**Sources:** `frontend/src/App.jsx`; `frontend/src/pages/MasterPublicBookingPage.jsx`; `mobile/app/(public)/m/[slug].tsx`; `mobile/src/utils/parsePublicMasterDeepLink.ts`; `mobile/src/config/publicAppLinkOrigin.ts`.

## Native delivery versus runtime acceptance

HTTPS app links require two independent conditions:

1. OS/native association delivers the link using associated domains or verified intent filters built from `app.config.ts`;
2. runtime parser accepts the hostname from `WEB_URL`/extra trusted hosts.

Custom scheme `dedato:` supports public `/m/{slug}` and the current internal `subscriptions` route. Scheme links do not replace backend authorization or entitlement checks.

**Sources:** `mobile/app.config.ts`; `mobile/android/app/src/main/AndroidManifest.xml`; `mobile/ios/DeDato/DeDato.entitlements`; `mobile/src/utils/parsePublicMasterDeepLink.ts`; `mobile/src/utils/parseAppInternalRoute.ts`; `mobile/app/_layout.tsx`.

## Payment initialization

Client sends `payment_source` as `web` or `mobile_app` when initializing subscription payment. Backend persists/normalizes this source and exposes it in the safe public-status response. Unknown source values are not accepted by the initialization schema.

The initialization response may require an external card payment or may direct the caller to free/balance application paths. Exact price split and idempotent application rules belong to [Subscriptions billing](../Domain/subscriptions-billing/README.md) and [Robokassa contract](payments-robokassa.md).

**Sources:** `backend/routers/payments.py`; payment request/response schemas; `frontend/src/components/modals/PaymentModal.jsx`; `frontend/src/components/SubscriptionModal.jsx`; `mobile/src/services/api/payments.ts`; `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`; `backend/tests/test_payment_source.py`.

## Public status confirmation

`GET /api/payments/public-status` accepts a public payment id or legacy invoice id and returns only:

- payment status;
- subscription apply status;
- payment source.

Lookup by public id takes precedence when both identifiers exist. Missing/unknown identifier maps to not-found. Clients derive display states from both payment and apply status: a paid payment whose subscription is still pending is not presented as fully complete.

This endpoint is intentionally unauthenticated for system-browser returns, but uses non-sequential public id as the normal lookup key. Invoice-id fallback is compatibility behavior and is tracked as an enumeration boundary in billing Debt.

**Sources:** `backend/routers/payments.py` — `get_payment_public_status`; `backend/tests/test_payment_public_status.py`; `backend/tests/test_payment_source.py`; `frontend/src/utils/paymentPublicStatus.js`; `mobile/src/services/api/payments.ts`; `mobile/src/utils/paymentPublicStatus.ts`.

## Web return flow

Provider return pages are `/payment/success` and `/payment/failed`. Route name/query alone never confirms success: both pages call public status and render `success`, `activating`, `pending`, `failed`, `not_found` or `error` states.

For web-source success the page returns to master tariff after a countdown. For mobile-source payment it offers the app subscriptions deep link and does not run the web countdown. Source is taken from backend public status, not from the return query.

**Sources:** `frontend/src/pages/PaymentSuccess.jsx`; `frontend/src/pages/PaymentFailed.jsx`; `frontend/src/utils/paymentReturnFlow.js`; `frontend/src/components/PaymentReturnCta.jsx`.

## Mobile return flow

Mobile opens the backend-provided payment URL in the system browser, stores pending public id and analytics context locally, then verifies public status on subscriptions mount, explicit paid-button action and app transition to active. Pending/activating state remains available for later verification; terminal success/failure clears the pending record according to the verifier.

Client analytics delivery is `at-most-once attempt`, best effort. It is not an exactly-once payment ledger and cannot prove provider settlement or subscription application. Backend payment/subscription records remain authoritative.

**Sources:** `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`; `mobile/app/(master)/subscriptions/index.tsx`; `mobile/src/services/analytics/pendingSubscriptionPayment.ts`; `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`.

## Security and failure rules

- Never treat client navigation, UI role or return route as authorization/payment proof.
- Never log or persist the full external payment URL unless a separately reviewed diagnostic policy permits it.
- A failure to open the app link must retain a usable browser path.
- Host/build/runtime trust-list drift and duplicated state mapping are tracked in [Client platforms Debt](../Debt/client-platforms.md).
- Credential and analytics privacy boundaries are tracked in [Security and privacy Debt](../Debt/security-and-privacy.md).
