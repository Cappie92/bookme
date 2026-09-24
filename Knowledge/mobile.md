---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-24
---

# Mobile architecture

Живой канон repository-known Expo/React Native client. Текущий iOS product — native-only operational companion; Android/web сохраняют полный cabinet/monetization.

Marketing version **1.1.0**. Tracked native versions in `mobile/app.config.ts`: **iOS 1.1.0 (13)** и **Android 1.1.0 (6)**. Store/review status — `REPORTED` operational fact в [Production topology](production-topology.md): iOS **SUBMITTED / IN APP REVIEW PROCESS**, Android/RuStore **SUBMITTED FOR MODERATION**. Не писать approved / released, пока нет moderation result.

## Runtime and route composition

Mobile использует Expo 54, React Native 0.81, React 19 и Expo Router 6. File-based route tree разделено на root login/welcome и три группы:

- `(public)` — публичная запись `/m/[slug]` без authentication;
- `(client)` — client dashboard, bookings, notes and settings с собственным bottom navigation;
- `(master)` — master dashboard, bookings, domain modules and subscriptions с master-only navigation providers.

Раздельные group layouts не импортируют navigation/components другой роли. Root `AuthGate` восстанавливает session, разрешает public route, сохраняет post-login booking draft/internal master route и перенаправляет authenticated user по роли. Эти client redirects — UX boundary; backend authorization остаётся обязательным.

**Sources:** `mobile/package.json`; `mobile/app/_layout.tsx`; `mobile/app/(public)/_layout.tsx`; `mobile/app/(client)/_layout.tsx`; `mobile/app/(master)/_layout.tsx`; route files under `mobile/app/`.

## Session bootstrap and state

`AuthProvider` читает persisted access/refresh tokens and user, подтверждает user через `/api/auth/users/me`, очищает session при definite authentication failure и сохраняет её при transient network/5xx failure. Access and refresh tokens use SecureStore when available with AsyncStorage duplication/fallback; Expo Go uses AsyncStorage. Storage risk belongs to [Security and privacy Debt](security-and-privacy.md).

Verify-first registration is a separate pre-auth lifecycle. `AuthContext` persists only typed pending registration metadata (opaque ticket, phone, expiry, origin/kind/role), removes any normal session before entering the flow and completes authentication only after server confirmation. `AuthGate` restores a non-expired pending flow to `/verify-phone`; cancel/expiry removes it and returns to login. Historical unverified-login proof shares the screen but is distinguished by `verification_kind` and server artifact.

Phone password recovery has its own provider and storage key, separate from auth and registration state. The route sequence is `/forgot-password` → `/password-reset-verify` → `/reset-password`; restart resumes only a non-expired typed stage. Completion/cancel/expiry clears recovery state, and password mutation helpers force canonical local logout so a revoked server session is not retained on device.

Большая часть screen state локальна или находится в contexts/hooks/AsyncStorage. Zustand используется для favorites с optimistic toggle и server re-hydration; это не общий server-state cache для всего приложения.

**Sources:** `mobile/src/auth/AuthContext.tsx`; `mobile/src/auth/tokenStorage.ts`; `mobile/src/auth/pendingPhoneVerificationStorage.ts`; `mobile/src/auth/PasswordResetRecoveryContext.tsx`; `mobile/src/auth/pendingPasswordResetStorage.ts`; `mobile/src/auth/authFlowRouting.ts`; `mobile/src/auth/passwordMutationLogout.ts`; `mobile/app/_layout.tsx`; `mobile/src/stores/favoritesStore.ts`.

## API client

Один Axios instance использует effective `API_URL`. Request interceptor нормализует `/api`, читает bearer token и в development отклоняет master-exclusive call при cached client role. Response interceptor различает expected endpoint-specific errors, передаёт authenticated non-`/me` 401 в session bridge и собирает optional debug diagnostics.

Role guard в interceptor работает только в development и не является security control. Endpoint-specific interpretation связывает client с неоднородными backend error shapes; server contract находится в [API conventions](api-conventions.md).

**Sources:** `mobile/src/services/api/client.ts`; `mobile/src/utils/normalizeApiUrl.ts`; modules under `mobile/src/services/api/`; `mobile/src/auth/authSessionBridge.ts`.

## Configuration and build-time boundary

Runtime URL precedence: Expo `extra`, затем process/`EXPO_PUBLIC_*`, затем compiled dotenv import. Development Android может использовать отдельный override. Non-development build отклоняет empty/localhost API URL; `WEB_URL` берётся из explicit sources или выводится из API URL.

Dynamic Expo config independently формирует native scheme, associated domains/intent filters and `extra`. Universal-link hosts являются build-time native config, тогда как runtime trusted host list строится из mobile env. Tracked Android manifest and iOS entitlements соответствуют default host set на момент проверки; автоматическая Expo doctor проверка синхронизации app-config fields отключена.

**Sources:** `mobile/src/config/env.ts`; `mobile/src/config/resolveMobileEnv.ts`; `mobile/app.config.ts`; `mobile/package.json` — `expo.doctor`; `mobile/android/app/src/main/AndroidManifest.xml`; `mobile/ios/DeDato/DeDato.entitlements`.

## iOS companion versus native

Текущий iOS master product (submission 1.1.0 (13)): **native-only operational companion**. User-visible surfaces: Dashboard, Schedule, Services, Settings, Bookings. Paid и Free iOS видят один и тот же native graph.

Free-companion remediation для этой submission **CLOSED** (это не Apple approval):

- browser/editor CTA сняты; `WebEditorButton.ios` возвращает `null`;
- pricing / subscription / tariff / Restore / IAP UI unreachable;
- iOS Welcome без monetization и revenue KPI;
- retired commerce / browser-editor deep links редиректятся на dashboard;
- IAP остаётся dormant и **не** является current release solution.

Android и ordinary web **не** наследуют эту iOS presentation isolation. Trusted `ios_app` web-editor policy остаётся fail-closed isolation в frontend/backend, если такая сессия появится; это не user-visible iOS CTA текущей submission.

Free-20 — backend business rule бесплатного тарифа, не iOS presentation isolation и не blocker этой submission; см. [Feature entitlements](feature-entitlements.md).

**Sources:** `mobile/src/config/iosMasterCapabilities.ts`; `mobile/src/components/WebEditorButton.ios.tsx`; `mobile/src/utils/parseAppInternalRoute.ios.ts`; `mobile/src/screens/WelcomeScreen.ios.tsx`; `mobile/src/data/welcomeSlidesData.ios.ts`; `frontend/src/utils/iosAppWebEditorPolicy.js`.

## Deep links and public booking

Root handles cold `Linking.getInitialURL()` and warm `Linking` events. Public parser accepts the app scheme, development Expo links and `/m/{slug}` only on runtime-trusted HTTPS hosts; HTTP is development-only. Internal parser: Android still maps the subscriptions app link to the master subscriptions route; **iOS** treats subscriptions/pricing/tariff/payment/web-handoff and related retired segments as dashboard `/` (`parseAppInternalRoute.ios.ts`). Module-level guards prevent repeated cold navigation and give a recent warm event priority.

Native association determines whether OS delivers an HTTPS link; parser trust determines whether runtime accepts it. Both layers must align. Canonical cross-platform rules are in [Client links and payment return](client-links-and-payment-return.md).

**Sources:** `mobile/app/_layout.tsx`; `mobile/src/utils/parsePublicMasterDeepLink.ts`; `mobile/src/utils/parseAppInternalRoute.ts`; `mobile/src/config/publicAppLinkOrigin.ts`; native config files.

## Payment handoff

Subscription checkout initializes payment with `payment_source=mobile_app`, opens the returned browser URL and persists a minimal pending payment record when a public id exists. On subscriptions screen mount, explicit user confirmation and every app return to active state, mobile asks backend public status again. Success/revenue analytics use separate persisted at-most-once-attempt claims; this is best-effort telemetry, not payment or entitlement authority.

**Sources:** `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`; `mobile/app/(master)/subscriptions/index.tsx`; `mobile/src/services/api/payments.ts`; `mobile/src/services/analytics/pendingSubscriptionPayment.ts`; `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`.

## Welcome pricing display fallback

Unauthenticated Android welcome запрашивает публичный backend pricing catalog. Непустой успешный ответ преобразуется в API-mapped display plans; при request error или пустом mapped catalog hook переключается на локальный набор welcome plans. Этот fallback компилируется в приложение и является production error/display behavior, а не mock. UI явно показывает сообщение о fallback-режиме.

**iOS Welcome** (`WelcomeScreen.ios`) не монтирует pricing UI, не показывает «Цены» и не рекламирует тариф/подписку/выручку. iOS welcome copy — operational booking/schedule/services/workflow only.

Локальный Android набор независимо хранит display names, package prices, feature/limit text и marketing copy, поэтому может устареть относительно backend catalog. Mobile при ошибке продолжает показывать эти plan cards, тогда как web public Pricing сообщает об ошибке и не показывает cards. Независимый mobile catalog и эта web/mobile divergence являются подтверждённым `P1` client-display drift (`RC-010`) для Android/web, но не финансовой или entitlement authority.

Выбор plan/period на welcome не переносится в authenticated purchase: CTA открывает регистрацию без fallback plan ID, периода или цены. После authentication purchase modal повторно загружает backend plans, а фактическую сумму определяют backend calculation и `SubscriptionPriceSnapshot`; денежный lifecycle принадлежит [Subscriptions billing](subscriptions-billing.md). Effective access определяется backend subscription/plan и guards, а не welcome feature list; authority описана в [Feature entitlements](feature-entitlements.md).

**Sources:** `mobile/src/data/welcomePricingData.ts` — local plans, notice and default selection; `mobile/src/hooks/useWelcomePricingCatalog.ts` — API/empty/error decision; `mobile/src/utils/welcomePricingMapper.ts` — catalog projection; `mobile/src/components/welcome/WelcomePricingModal.tsx` — registration navigation; `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx` — authenticated plan reload and calculate handoff; `backend/routers/subscription_plans_public.py` — pricing catalog; `backend/routers/subscriptions.py` — `calculate_subscription_cost` and price snapshot; [Subscriptions billing](subscriptions-billing.md); [Feature entitlements](feature-entitlements.md).

## Shared code

Metro aliases selected repository `shared/` modules for semantic colors, feature/display labels, contact channels and stats formatting. Mobile also contains platform-specific stores, API types and duplicated client mappings. Shared code is therefore a narrow utility boundary, not a shared application layer.

**Sources:** `mobile/babel.config.js`; `mobile/tsconfig.json`; imports from `shared` under `mobile/src`; `shared/`.

## Analytics, notifications and diagnostics

App analytics initializes independently of route bootstrap failure and records acquisition/payment/domain events. Development flags can expose auth traces, full effective API URLs and buffered response previews in a copyable debug panel. Sensitive-data/logging remediation is tracked in [Security and privacy Debt](security-and-privacy.md) and [Client platforms Debt](client-platforms.md).

### OS push notifications

Push v1 **operational**. Smoke PASS на iOS и Android: permission lifecycle, system presentation, in-app Notification Center, create/reschedule/cancel fan-out. Это не unimplemented feature и не current blocker.

Backend source of truth события — `Notification`; доставка — `PushDevice` + `NotificationOutbox` + in-process Expo sender, receipt polling и dead-token handling. Booking event types: `booking_created`, `booking_rescheduled`, `booking_cancelled`. Sender rollout остаётся controlled: production `PUSH_REGISTRATION_ENABLED=true`, `PUSH_NOTIFICATIONS_ENABLED=true`, allowlist `user_id 11`. Global sender rollout не канонизировать без отдельного runtime evidence.

Android fresh-install: Expo `denied` + `canAskAgain=true` трактуется как askable first-run, не как terminal denial. Path: education → system permission → granted → channel → Expo token → PUT device registration. Manual Settings grant: `AppState` active re-checks permission and restores registration. Android notification handler **не** подавляет banner/list/sound. iOS handler behavior остаётся намеренно неизменным.

Notification Center refetch на open/focus и релевантный `AppState` active; manual pull-to-refresh остаётся, но не является единственным способом увидеть новые события.

Stale-token behavior: старый Android token может быть помечен `dead_token` через Expo receipt; новая installation остаётся active. Исторический token id=2 не описывать как current device.

`Notification` schema не хранит `actor_user_id`. Commit `3639e74` добавляет structured actor logging без migration; этот backend change есть в `main`, но **ещё не** в production backend image `96f3f27`. Историческая неоднозначность `booking_cancelled` (notification id=9 / booking 1069) — не active release blocker.

**Sources:** `mobile/src/notifications/`; `mobile/src/hooks/useMasterNotifications.ts`; `backend/models.py` — `Notification`, `PushDevice`, `NotificationOutbox`; `backend/services/push_worker.py`; `backend/services/notification_events.py`; [Configuration](configuration.md); [Production topology](production-topology.md).

### Android launcher icon

Canonical visual source: `mobile/assets/icon.png`. Adaptive foreground раньше занимал ~60% canvas и после Android inner viewport (~2/3) выглядел ~90%. Current target: adaptive foreground ≈ footprint `icon.png` × 2/3 ≈ 40% full foreground canvas. Android build 6 smoke PASS. Иконка не является active blocker.

**Sources:** `mobile/assets/icon.png`; `mobile/assets/adaptive-icon.png`; `mobile/scripts/generate_app_icons.py`.
