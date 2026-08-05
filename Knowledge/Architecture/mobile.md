---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-05
---

# Mobile architecture

Живой канон repository-known Expo/React Native client. Документ не описывает store release state или фактическую production installation: без внешней проверки это `UNKNOWN`.

## Runtime and route composition

Mobile использует Expo 54, React Native 0.81, React 19 и Expo Router 6. File-based route tree разделено на root login/welcome и три группы:

- `(public)` — публичная запись `/m/[slug]` без authentication;
- `(client)` — client dashboard, bookings, notes and settings с собственным bottom navigation;
- `(master)` — master dashboard, bookings, domain modules and subscriptions с master-only navigation providers.

Раздельные group layouts не импортируют navigation/components другой роли. Root `AuthGate` восстанавливает session, разрешает public route, сохраняет post-login booking draft/internal master route и перенаправляет authenticated user по роли. Эти client redirects — UX boundary; backend authorization остаётся обязательным.

**Sources:** `mobile/package.json`; `mobile/app/_layout.tsx`; `mobile/app/(public)/_layout.tsx`; `mobile/app/(client)/_layout.tsx`; `mobile/app/(master)/_layout.tsx`; route files under `mobile/app/`.

## Session bootstrap and state

`AuthProvider` читает persisted token/user, подтверждает user через `/api/auth/users/me`, очищает session при definite authentication failure и сохраняет её при transient network/5xx failure. Storage contract и refresh-token divergence принадлежат [Identity and access](../Domain/identity-access.md) и [Security and privacy Debt](../Debt/security-and-privacy.md).

Большая часть screen state локальна или находится в contexts/hooks/AsyncStorage. Zustand используется для favorites с optimistic toggle и server re-hydration; это не общий server-state cache для всего приложения.

**Sources:** `mobile/src/auth/AuthContext.tsx`; `mobile/src/auth/tokenStorage.ts`; `mobile/src/stores/favoritesStore.ts`; `mobile/src/contexts/`; `mobile/src/hooks/`.

## API client

Один Axios instance использует effective `API_URL`. Request interceptor нормализует `/api`, читает bearer token и в development отклоняет master-exclusive call при cached client role. Response interceptor различает expected endpoint-specific errors, передаёт authenticated non-`/me` 401 в session bridge и собирает optional debug diagnostics.

Role guard в interceptor работает только в development и не является security control. Endpoint-specific interpretation связывает client с неоднородными backend error shapes; server contract находится в [API conventions](../Contracts/api-conventions.md).

**Sources:** `mobile/src/services/api/client.ts`; `mobile/src/utils/normalizeApiUrl.ts`; modules under `mobile/src/services/api/`; `mobile/src/auth/authSessionBridge.ts`.

## Configuration and build-time boundary

Runtime URL precedence: Expo `extra`, затем process/`EXPO_PUBLIC_*`, затем compiled dotenv import. Development Android может использовать отдельный override. Non-development build отклоняет empty/localhost API URL; `WEB_URL` берётся из explicit sources или выводится из API URL.

Dynamic Expo config independently формирует native scheme, associated domains/intent filters and `extra`. Universal-link hosts являются build-time native config, тогда как runtime trusted host list строится из mobile env. Tracked Android manifest and iOS entitlements соответствуют default host set на момент проверки; автоматическая Expo doctor проверка синхронизации app-config fields отключена.

**Sources:** `mobile/src/config/env.ts`; `mobile/src/config/resolveMobileEnv.ts`; `mobile/app.config.ts`; `mobile/package.json` — `expo.doctor`; `mobile/android/app/src/main/AndroidManifest.xml`; `mobile/ios/DeDato/DeDato.entitlements`.

## Deep links and public booking

Root handles cold `Linking.getInitialURL()` and warm `Linking` events. Public parser accepts the app scheme, development Expo links and `/m/{slug}` only on runtime-trusted HTTPS hosts; HTTP is development-only. Internal parser currently maps the subscriptions app link to the master subscriptions route. Module-level guards prevent repeated cold navigation and give a recent warm event priority.

Native association determines whether OS delivers an HTTPS link; parser trust determines whether runtime accepts it. Both layers must align. Canonical cross-platform rules are in [Client links and payment return](../Contracts/client-links-and-payment-return.md).

**Sources:** `mobile/app/_layout.tsx`; `mobile/src/utils/parsePublicMasterDeepLink.ts`; `mobile/src/utils/parseAppInternalRoute.ts`; `mobile/src/config/publicAppLinkOrigin.ts`; native config files.

## Payment handoff

Subscription checkout initializes payment with `payment_source=mobile_app`, opens the returned browser URL and persists a minimal pending payment record when a public id exists. On subscriptions screen mount, explicit user confirmation and every app return to active state, mobile asks backend public status again. Success/revenue analytics use separate persisted at-most-once-attempt claims; this is best-effort telemetry, not payment or entitlement authority.

**Sources:** `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`; `mobile/app/(master)/subscriptions/index.tsx`; `mobile/src/services/api/payments.ts`; `mobile/src/services/analytics/pendingSubscriptionPayment.ts`; `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`.

## Welcome pricing display fallback

Unauthenticated welcome запрашивает публичный backend pricing catalog. Непустой успешный ответ преобразуется в API-mapped display plans; при request error или пустом mapped catalog hook переключается на локальный набор welcome plans. Этот fallback компилируется в приложение и является production error/display behavior, а не mock. UI явно показывает сообщение о fallback-режиме.

Локальный набор независимо хранит display names, package prices, feature/limit text и marketing copy, поэтому может устареть относительно backend catalog. Mobile при ошибке продолжает показывать эти plan cards, тогда как web public Pricing сообщает об ошибке и не показывает cards. Независимый mobile catalog и эта web/mobile divergence являются подтверждённым `P1` client-display drift (`RC-010`), но не финансовой или entitlement authority.

Выбор plan/period на welcome не переносится в authenticated purchase: CTA открывает регистрацию без fallback plan ID, периода или цены. После authentication purchase modal повторно загружает backend plans, а фактическую сумму определяют backend calculation и `SubscriptionPriceSnapshot`; денежный lifecycle принадлежит [Subscriptions billing](../Domain/subscriptions-billing/README.md). Effective access определяется backend subscription/plan и guards, а не welcome feature list; authority описана в [Feature entitlements](../Contracts/feature-entitlements.md).

**Sources:** `mobile/src/data/welcomePricingData.ts` — local plans, notice and default selection; `mobile/src/hooks/useWelcomePricingCatalog.ts` — API/empty/error decision; `mobile/src/utils/welcomePricingMapper.ts` — catalog projection; `mobile/src/components/welcome/WelcomePricingModal.tsx` — registration navigation; `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx` — authenticated plan reload and calculate handoff; `backend/routers/subscription_plans_public.py` — pricing catalog; `backend/routers/subscriptions.py` — `calculate_subscription_cost` and price snapshot; [Subscriptions billing](../Domain/subscriptions-billing/README.md); [Feature entitlements](../Contracts/feature-entitlements.md).

## Shared code

Metro aliases selected repository `shared/` modules for semantic colors, feature/display labels, contact channels and stats formatting. Mobile also contains platform-specific stores, API types and duplicated client mappings. Shared code is therefore a narrow utility boundary, not a shared application layer.

**Sources:** `mobile/babel.config.js`; `mobile/tsconfig.json`; imports from `shared` under `mobile/src`; `shared/`.

## Analytics, diagnostics and incomplete surfaces

App analytics initializes independently of route bootstrap failure and records acquisition/payment/domain events. Development flags can expose auth traces, full effective API URLs and buffered response previews in a copyable debug panel. Sensitive-data/logging remediation is tracked in [Security and privacy Debt](../Debt/security-and-privacy.md) and [Client platforms Debt](../Debt/client-platforms.md).

The master notification sheet is currently populated from `notificationsMock`; repository evidence does not establish a backend notification feed, delivery service or persistence contract. It must be described as mock UI, not a production notification subsystem.

**Sources:** `mobile/src/services/analytics/`; `mobile/src/debug/`; `mobile/src/services/api/client.ts`; `mobile/src/hooks/useMasterNotifications.ts`; `mobile/src/components/master/notifications/notificationsMock.ts`.
