---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-12
---

# Web architecture

Живой канон repository-known web client. Документ описывает composition, navigation, data access и delivery boundaries; бизнес-правила остаются в Domain/Contracts.

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

`AdminRoute` скрывает admin UI от anonymous/non-admin users и открывает login modal или перенаправляет по локально известной роли. Остальные workspace pages в разной степени опираются на page-level bootstrap и backend responses. Любая client-side проверка является навигационной/UX границей, а не authorization enforcement; серверные boundaries принадлежат [Identity and access](../Domain/identity-access.md).

**Sources:** `frontend/src/App.jsx` — route declarations and `AdminRoute`; `frontend/src/layouts/`; `frontend/src/pages/`.

## Authentication and local state

`AuthProvider` восстанавливает сессию через `/api/auth/users/me`, хранит current user в React state и синхронизирует logout между API wrapper, соседними вкладками и focus events. Bearer token persistence и связанные риски описаны в [Security and privacy Debt](../Debt/security-and-privacy.md).

Common password registration is verify-first inside `AuthModal`: the first response is an opaque registration-verification ticket, not a JWT session; the modal requests the bound call, confirms digits and only then installs the returned access/refresh pair. Closing or cancelling the flow calls the cancellation endpoint and clears in-memory verification state. Login for a historical unverified account uses the same UI but a distinct server artifact and `verification_kind`.

`MasterBookingModule`, `SalonBookingModule` and `BranchBookingModule` now use the same verify-first boundary for anonymous public booking. Initial specific-master and any-master requests return an opaque pending-booking ticket without `User`, `Booking` or normal JWT; the UI requests the bound call, keeps the submitted phone read-only, and installs the post-proof access token only after confirm has created the booking. Cancel discards the pending state and wrong proof keeps the flow pending without reporting booking success.

Phone password recovery is an explicit three-step modal state machine: request challenge, confirm call proof, submit the opaque reset token with the new password. These artifacts are not written into normal auth token keys. Successful password change/setup/reset uses the shared local-session clearing path, matching server-side session revocation.

Repository не использует единую application-wide server-state library. Runtime state распределён между React context/local state, browser storage и component-specific caches. Например, web favorites живут в `FavoritesContext`; declared React Query/SWR/Zustand/Redux dependencies не импортируются из `frontend/src` на момент проверки и поэтому не являются фактической web architecture.

**Sources:** `frontend/src/contexts/AuthContext.jsx`; `frontend/src/modals/AuthModal.jsx`; `frontend/src/modals/PasswordSetupModal.jsx`; `frontend/src/utils/api.js`; `frontend/src/utils/publicBookingVerification.js`; `frontend/src/components/booking/MasterBookingModule.jsx`; `frontend/src/components/booking/SalonBookingModule.jsx`; `frontend/src/components/booking/BranchBookingModule.jsx`; `frontend/src/contexts/FavoritesContext.jsx`; import inventory under `frontend/src`; `frontend/package.json`.

## API access

Основной origin contract — relative URLs. Vite dev server и production Nginx proxy передают `/api` и несколько legacy top-level path families backend-у; uploads также проходят через backend. `utils/api.js` добавляет bearer header, credentials и локальную обработку demo writes/401 для вручную перечисленных protected prefixes.

При этом многие components/pages используют `fetch` напрямую, а отдельные domain helpers имеют собственные wrappers. Поэтому единый transport/error/auth contract в web отсутствует: фактическое поведение нужно проверять по call site. Backend HTTP conventions находятся в [API conventions](../Contracts/api-conventions.md), подтверждённый drift — в [Client platforms Debt](../Debt/client-platforms.md).

**Sources:** `frontend/src/utils/api.js`; direct `fetch` call-site inventory under `frontend/src`; `frontend/vite.config.js`; `frontend/nginx.conf`.

## Public links and payment return

Публичный master entrypoint — `/m/:slug`. Payment provider возвращает browser на `/payment/success` или `/payment/failed`; страницы не доверяют названию return route, а запрашивают public payment status и выбирают UI по backend status/apply status. `payment_source` из backend response определяет web redirect или CTA возврата в mobile app.

Межплатформенные правила принадлежат [Client links and payment return](../Contracts/client-links-and-payment-return.md).

**Sources:** `frontend/src/pages/MasterPublicBookingPage.jsx`; `frontend/src/pages/PaymentSuccess.jsx`; `frontend/src/pages/PaymentFailed.jsx`; `frontend/src/utils/paymentPublicStatus.js`; `frontend/src/utils/paymentReturnFlow.js`.

## Build and delivery

Production Docker build выполняет `npm ci` и Vite build, добавляя repository `shared/` для aliases, затем отдаёт статический `dist` через Nginx. Hashed assets получают immutable cache, HTML — no-cache; SPA fallback возвращает `index.html`. `main.jsx` допускает одну controlled reload при несовместимом stale chunk.

Nginx `/health` проверяет только frontend process, а `/api/health` proxy-ит статический backend health. Ни один из этих endpoints не доказывает готовность database, migrations, jobs или providers.

**Sources:** `frontend/Dockerfile.prod`; `frontend/vite.config.js`; `frontend/nginx.conf`; `frontend/src/main.jsx`; `backend/main.py` — `health_check`.

## Shared client boundary

Web импортирует repository `shared/` через Vite alias или relative paths. Shared scope ограничен отдельными display/config helpers: theme colors, subscription feature labels, contact channels, mailing lock and stats labels. Он не является generated API client или общим navigation/auth/payment runtime.

**Sources:** `shared/`; `frontend/vite.config.js`; imports from `shared` under `frontend/src`.

## Analytics and diagnostics

Route listener и domain call sites отправляют web analytics; temporary error capture доступен только в development. Consent, URL minimization и sensitive logging boundaries принадлежат [Privacy and data handling](../Domain/privacy-data-handling.md) и [Security and privacy Debt](../Debt/security-and-privacy.md).

**Sources:** `frontend/src/analytics/`; `frontend/src/tempDebugErrorCapture.js`; `frontend/src/main.jsx`; `frontend/src/App.jsx`.
