---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-11-13
---

# Mobile architecture

Живой канон repository-known Expo/React Native client. Текущий iOS product — native-only operational companion; Android/web сохраняют полный cabinet/monetization.

Marketing version **1.1.0**. Tracked native versions: **iOS 1.1.0 (16)** (`buildNumber`, `CURRENT_PROJECT_VERSION`, `CFBundleVersion`) и **Android 1.1.0 (6)**. Bundle ID `com.dedato.app`. Build 16 is the current App Store candidate. Build 15 is superseded and is not the current version. Store/ASC status: [Production topology](production-topology.md). Prior rejections: [iOS App Store releases](ios-app-store-releases.md). Не писать approved / released. Native Maestro E2E is not a root CI gate; web Playwright is — [Testing strategy](testing-strategy.md).

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

Текущий App Store product — **Free Companion**, кандидат **1.1.0 (16)**. Native requests marked `client_surface=ios_fixed`. Маркер **не удалён**. Удалён только специальный booking-cap `min(plan, 20)`. Booking capacity — обычное account business rule; контракт лимита: [Feature entitlements](feature-entitlements.md#6-limits).

`ios_fixed` по-прежнему задаёт native capabilities, paid-field projection, ограничения CRM, Finance, Loyalty, subscription/commerce, а также web handoff и native Free Companion isolation. Paid web entitlement не открывает дополнительные native digital capabilities.

Master bottom navigation: Dashboard, Schedule, Services, Settings.

Commit `19120d2` добавил optional **guided master onboarding tour** (`MasterTourProvider`): авто-приглашение с Dashboard после eligible login, overlay по основным master-экранам, переключение Schedule Day/Week во время тура, replay из Settings. Статус (`started` / `completed` / `skipped`) хранится локально (`masterTourStorage`); тур координируется с push-registration prompt через `PromptCoordinationContext`. Юнит-покрытие: `mobile/__tests__/unit/components/onboarding/`. Store-review impact `UNKNOWN`; это не меняет Free Companion commerce isolation.

**CONFIRMED, 2026-11-14, исходники локальной B3-ветки:** `CalendarB3Sheet` добавляет master manual booking и private blocks в DayView/WeekView; используется отдельный B3 API, описанный в [Booking API](booking-api.md#calendar-b3-master-api). «Открыть слот» делает время доступным и не создаёт Booking. Paid и Free видят один native graph. Guided tour сохранён при merge. Проверены 147 focused mobile tests календаря, layout и tour; новая native сборка и App Store состояние не проверялись.

Free-companion presentation **CLOSED** как implementation (это не Apple approval):

- нет покупки/upgrade/checkout подписки DeDato, Restore Purchases и external purchase CTA;
- browser/editor CTA сняты; `WebEditorButton.ios` возвращает `null`;
- iOS Welcome без monetization и revenue KPI;
- retired commerce / browser-editor deep links редиректятся на dashboard;
- IAP и RevenueCat не являются current release strategy; StoreKit path остаётся dormant.

Android и ordinary web не наследуют эту presentation isolation. Trusted `ios_app` web session остаётся fail-closed для commerce, если такая сессия появится.

Известные ограничения, не исправленные в 1.1.0: у обычных booking cards нет полного прямого navigation path к details/reschedule; отдельное master-detail cancellation вызывает client endpoint и может вернуть 404 для booking другого клиента. Не описывать это как исправленное и не обещать эти flows в Review Notes.

**Sources:** `mobile/src/config/iosMasterCapabilities.ts`; `mobile/src/components/WebEditorButton.ios.tsx`; `mobile/src/utils/parseAppInternalRoute.ios.ts`; `mobile/src/screens/WelcomeScreen.ios.tsx`; `backend/utils/ios_free_companion.py`; [Feature entitlements](feature-entitlements.md).

## Schedule initial position and booking blocks

Commit `60eba89`. Day и Week открываются на 09:00 и не возвращают пользователя туда при обычном rerender/refetch.

Day: 60 px / 30 min, one-shot `scrollTo({ y: 1080 })` после готовности viewport и content. Жест до позиционирования отменяет автоскролл. `scrollsToTop={false}` на вертикальном `ScrollView`. RefreshControl сохранён. Одна запись — один непрерывный блок, включая 12:10–13:40 и 23:30–00:00.

Week: 40 px / 30 min, `initialScrollIndex = 18`, offset 720, `getItemLayout` по высоте строки, без второго scroll через 80 ms. `scrollsToTop={false}` на вертикальном `FlatList`. `WeekGridScroll` нужен, потому что VirtualizedList заменяет children `renderScrollComponent`; overlay рисуется в том же `ScrollView`.

Самопроизвольный уход к 00:00: runtime diagnostics показали native animated offset 1080→0 без второго JS `scrollTo`, без remount и без смены layout/content size. A/B без RefreshControl это не убрал. `scrollsToTop={false}` убрал скачок в Day и Week и является production regression contract: тесты падают, если prop снят с вертикального timeline. Таймер или retry для начальной позиции 09:00 не требуется.

Focused schedule tests после этого контракта: 3 suites / 107 tests. Full mobile на том же baseline: 103 suites / 951 tests.

**Sources:** `mobile/src/components/schedule/DayView.tsx`; `mobile/src/components/schedule/WeekView.tsx`; `mobile/__tests__/unit/components/DayView.test.tsx`; `mobile/__tests__/unit/components/WeekView.test.tsx`.

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

Клиентская регистрация устройства, commit `60eba89`. Зависимость `expo-device ~8.0.10` зафиксирована как ExpoDevice **8.0.10**.

Native sync invariant: `Podfile.lock` содержит ExpoDevice; canonical `project.pbxproj` содержит `ExpoDevice_privacy.bundle` в Pods resource input и output lists. `DevelopmentTeam`, `ProvisioningStyle`, `DEVELOPMENT_TEAM`, `CODE_SIGN_IDENTITY` и `CODE_SIGN_STYLE`, которые локально дописывает `expo run:ios`, — local signing drift. В canonical repo diff их быть не должно.

iOS Simulator (`Platform.OS === 'ios' && !Device.isDevice`) пропускает token acquisition и backend registration. Android emulator не пропускается только из-за `Device.isDevice === false`. Сырой APNs/FCM token никогда не уходит на backend как Expo token. Native token event конвертируется через `getExpoPushTokenAsync({ projectId, devicePushToken })`. Backend `provider=expo` принимает только валидный `ExpoPushToken[...]` или `ExponentPushToken[...]`.

Регистрация идёт через sequential queue. Guards держат session generation и access token операции; stale session отбрасывается. Operation ordering не даёт более старому пути записать результат поверх более нового. Timeout acquisition около 10 секунд снимает очередь и допускает recovery; поздний resolve/reject timed-out native promise сам не делает PUT. Listener может восстановить регистрацию после такого timeout, если native token уже есть. Повтор того же Expo token не делает второй PUT. Listener и `AppState` cleanup сохраняются.

Accepted SDK limitation: строгая provenance позднего native listener event недоступна, потому что Expo listener не отдаёт operation provenance. Последний валидный OS/SDK native event считается current. Не переоткрывать этот теоретический вопрос без runtime evidence.

Android fresh-install: Expo `denied` + `canAskAgain=true` трактуется как askable first-run, не как terminal denial. Path: education → system permission → granted → channel → Expo token → PUT device registration. Manual Settings grant: `AppState` active re-checks permission and restores registration. Android notification handler **не** подавляет banner/list/sound. iOS handler behavior остаётся намеренно неизменным.

Focused push tests на этом baseline: 45 PASS.

Notification Center refetch на open/focus и релевантный `AppState` active; manual pull-to-refresh остаётся, но не является единственным способом увидеть новые события.

Stale-token behavior: старый Android token может быть помечен `dead_token` через Expo receipt; новая installation остаётся active. Исторический token id=2 не описывать как current device.

`Notification` schema не хранит `actor_user_id`. Commit `3639e74` добавляет structured actor logging без migration; этот backend change есть в `main`, но **ещё не** в production backend image `96f3f27`. Историческая неоднозначность `booking_cancelled` (notification id=9 / booking 1069) — не active release blocker.

**Sources:** `mobile/src/notifications/`; `mobile/src/hooks/useMasterNotifications.ts`; `backend/models.py` — `Notification`, `PushDevice`, `NotificationOutbox`; `backend/services/push_worker.py`; `backend/services/notification_events.py`; [Configuration](configuration.md); [Production topology](production-topology.md).

### Android launcher icon

Canonical visual source: `mobile/assets/icon.png`. Adaptive foreground раньше занимал ~60% canvas и после Android inner viewport (~2/3) выглядел ~90%. Current target: adaptive foreground ≈ footprint `icon.png` × 2/3 ≈ 40% full foreground canvas. Android build 6 smoke PASS. Иконка не является active blocker.

**Sources:** `mobile/assets/icon.png`; `mobile/assets/adaptive-icon.png`; `mobile/scripts/dev/generate_app_icons.py`.
