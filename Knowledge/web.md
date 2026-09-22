---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-22
---

# Web architecture

Живой канон repository-known web client. Документ описывает composition, navigation, data access и delivery boundaries; бизнес-правила остаются в соответствующих domain/contract owner-documents.

## Runtime and composition

Web — React 18 single-page application, собранное Vite. `main.jsx` монтирует `App` в `StrictMode`, один раз перезагружает страницу при stale dynamic chunk и включает временный error capture только в development по query flag.

`App.jsx` строит `BrowserRouter`, глобальные providers и один lazy-loaded route tree. Немедленно загружаются shell, home/error pages и глобальные modals; остальные страницы разделяются через `React.lazy` и общий `Suspense` fallback.

**Sources:** `frontend/package.json`; `frontend/src/main.jsx`; `frontend/src/App.jsx`; `frontend/vite.config.js`.

## Route surfaces

Route tree одновременно обслуживает:

- публичный marketing/blog/legal UI и публичную запись `/m/:slug`;
- OAuth callback и payment return pages;
- client, master, salon и admin workspaces;
- legacy/compatibility paths и redirects;
- test/demo/design pages, перечисленные непосредственно в production route tree.

Trusted iOS companion — отдельный web surface, не ordinary web:

- native iOS application + trusted `ios_app` web companion;
- разрешённые master tabs: Dashboard, Schedule, Services, Settings;
- из companion исключены commerce/subscription-dependent поверхности: Pricing, My Plan, Finance, Master Loyalty, purchase/upgrade CTA, Robokassa/DeDato payment configuration и прочие monetization surfaces вне утверждённого operational companion;
- Pricing content не монтируется, pricing catalog не запрашивается (`usePricingCatalog` имеет собственный `commerceAllowed` guard и отменяет незавершённый запрос); route guard не должен зависеть только от скрытия UI;
- personal-link/domain editing и блок «Оплата через DeDato» закрыты; payment fields не отправляются из Settings. Backend также защищает domain mutation для `ios_app`.

Ordinary web и Android сохраняют обычную функциональность и монетизацию. Failed handoff монтирует изолированный error state и не падает в ordinary cabinet.

`AdminRoute` скрывает admin UI от anonymous/non-admin users и открывает login modal или перенаправляет по локально известной роли. Остальные workspace pages в разной степени опираются на page-level bootstrap и backend responses. Любая client-side проверка является навигационной/UX границей, а не authorization enforcement; серверные boundaries принадлежат [Identity and access](identity-access.md).

**Sources:** `frontend/src/App.jsx` — route declarations, `AdminRoute` and commerce guard; `frontend/src/utils/iosAppWebEditorPolicy.js`; `frontend/src/hooks/usePricingCatalog.js`; `frontend/src/utils/authSession.js`; `frontend/src/components/AuthSafetyBoundary.jsx`; `frontend/src/layouts/`; `frontend/src/pages/`.

## Authentication and local state

`AuthProvider` восстанавливает сессию через `/api/auth/users/me`, хранит current user в React state и синхронизирует logout между API wrapper, соседними вкладками и focus events. Bootstrap fail-closed определяет origin: stale result не перезаписывает более новую session; unresolved origin ≠ anonymous; auth/origin error закрывает commerce. Bearer token persistence и связанные риски описаны в [Security and privacy Debt](security-and-privacy.md).

Common password registration is verify-first inside `AuthModal`: the first response is an opaque registration-verification ticket, not a JWT session; the modal requests the bound call, confirms digits and only then installs the returned access/refresh pair. Closing or cancelling the flow calls the cancellation endpoint and clears in-memory verification state. Login for a historical unverified account uses the same UI but a distinct server artifact and `verification_kind`.

`MasterBookingModule`, `SalonBookingModule` and `BranchBookingModule` now use the same verify-first boundary for anonymous public booking. Initial specific-master and any-master requests return an opaque pending-booking ticket without `User`, `Booking` or normal JWT; the UI requests the bound call, keeps the submitted phone read-only, and installs the post-proof access token only after confirm has created the booking. Cancel discards the pending state and wrong proof keeps the flow pending without reporting booking success.

Phone password recovery is an explicit three-step modal state machine: request challenge, confirm call proof, submit the opaque reset token with the new password. These artifacts are not written into normal auth token keys. Successful password change/setup/reset uses the shared local-session clearing path, matching server-side session revocation.

Repository не использует единую application-wide server-state library. Runtime state распределён между React context/local state, browser storage и component-specific caches. Например, web favorites живут в `FavoritesContext`; declared React Query/SWR/Zustand/Redux dependencies не импортируются из `frontend/src` на момент проверки и поэтому не являются фактической web architecture.

**Sources:** `frontend/src/contexts/AuthContext.jsx`; `frontend/src/modals/AuthModal.jsx`; `frontend/src/modals/PasswordSetupModal.jsx`; `frontend/src/utils/api.js`; `frontend/src/utils/publicBookingVerification.js`; `frontend/src/components/booking/MasterBookingModule.jsx`; `frontend/src/components/booking/SalonBookingModule.jsx`; `frontend/src/components/booking/BranchBookingModule.jsx`; `frontend/src/contexts/FavoritesContext.jsx`; import inventory under `frontend/src`; `frontend/package.json`.

## API access

Основной origin contract — relative URLs. Vite dev server и production Nginx proxy передают `/api` и несколько legacy top-level path families backend-у; uploads также проходят через backend. `utils/api.js` добавляет bearer header, credentials и локальную обработку demo writes/401 для вручную перечисленных protected prefixes.

При этом многие components/pages используют `fetch` напрямую, а отдельные domain helpers имеют собственные wrappers. Поэтому единый transport/error/auth contract в web отсутствует: фактическое поведение нужно проверять по call site. Backend HTTP conventions находятся в [API conventions](api-conventions.md), подтверждённый drift — в [Client platforms Debt](client-platforms.md).

**Sources:** `frontend/src/utils/api.js`; direct `fetch` call-site inventory under `frontend/src`; `frontend/vite.config.js`; `frontend/nginx.conf`.

## Public links and payment return

Публичный master entrypoint — `/m/:slug`. Payment provider возвращает browser на `/payment/success` или `/payment/failed`; страницы не доверяют названию return route, а запрашивают public payment status и выбирают UI по backend status/apply status. `payment_source` из backend response определяет web redirect или CTA возврата в mobile app.

Межплатформенные правила принадлежат [Client links and payment return](client-links-and-payment-return.md).

**Sources:** `frontend/src/pages/MasterPublicBookingPage.jsx`; `frontend/src/pages/PaymentSuccess.jsx`; `frontend/src/pages/PaymentFailed.jsx`; `frontend/src/utils/paymentPublicStatus.js`; `frontend/src/utils/paymentReturnFlow.js`.

## Build and delivery

Production Docker build выполняет `npm ci` и Vite build, добавляя repository `shared/` для aliases, затем отдаёт статический `dist` через Nginx. Hashed assets получают immutable cache, HTML — no-cache; SPA fallback возвращает `index.html`. `main.jsx` допускает одну controlled reload при несовместимом stale chunk.

Nginx `/health` проверяет только frontend process, а `/api/health` proxy-ит статический backend health. Ни один из этих endpoints не доказывает готовность database, migrations, jobs или providers.

**Sources:** `frontend/Dockerfile.prod`; `frontend/vite.config.js`; `frontend/nginx.conf`; `frontend/src/main.jsx`; `backend/main.py` — `health_check`.

## Shared client boundary

Web импортирует repository `shared/` через Vite alias или relative paths. Shared scope ограничен отдельными display/config helpers: theme colors, subscription feature labels, contact channels, mailing lock and stats labels. Он не является generated API client или общим navigation/auth/payment runtime.

**Sources:** `shared/`; `frontend/vite.config.js`; imports from `shared` under `frontend/src`.

## Pending bookings first load

Dashboard pending count и Pending tab используют один load path: Pending должен заполняться при первом открытии без обходного Past → Pending. Поздний schedule/booking response не должен перезаписывать уже выбранный период — web/mobile используют request-generation/current-period protection.

**Sources:** `frontend/src/components/MasterDashboardStats.jsx`; `frontend/src/components/MasterScheduleCalendar.jsx`; `mobile/app/(master)/master/schedule.tsx`.

## Reschedule date handling

Web reschedule is **closed / smoke PASS**. `selectedDate` is normalized to `YYYY-MM-DD`; initial slots load immediately; weekend hard-ban is removed; the reschedule path does not use UTC `toISOString` date shift; display is `DD.MM.YY`. Living contract: [Booking](booking.md#reschedule).

## Settings save UX

В trusted `ios_app` Settings informational styling использует фирменное зелёное оформление. После успешного save success-message может исчезнуть из-за parent loading → unmount/remount. Save при этом проходит и данные сохраняются; это known baseline UX debt, не authorization/isolation regression. См. [Client platforms Debt](client-platforms.md).

## Analytics and diagnostics

Route listener и domain call sites отправляют web analytics. Sanitization URL credentials выполняется на analytics boundary **до** отправки и не зависит от того, успел ли lazy `MobileHandoff` очистить address bar. Consent и store-declaration drift остаются в [Privacy and data handling](privacy-data-handling.md) и [Security and privacy Debt](security-and-privacy.md).

**Sources:** `frontend/src/analytics/analyticsUrl.js`; `frontend/src/analytics/MetrikaRouteListener.jsx`; `frontend/src/analytics/`; `frontend/src/tempDebugErrorCapture.js`; `frontend/src/main.jsx`; `frontend/src/App.jsx`.
