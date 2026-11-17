---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-11-16
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

Trusted `ios_app` web isolation — отдельный fail-closed web surface, не ordinary web. Текущий iOS 1.1.0 (16) Free Companion **не** показывает user-visible browser-editor/handoff CTA; native operational product описан в [Mobile architecture](mobile.md). Если `ios_app` web session всё же появится:

- разрешённые master tabs: Dashboard, Schedule, Services, Settings;
- из этой сессии исключены commerce/subscription-dependent поверхности: Pricing, My Plan, Finance, Master Loyalty, purchase/upgrade CTA, Robokassa/DeDato payment configuration и прочие monetization surfaces вне утверждённого operational set;
- Pricing content не монтируется, pricing catalog не запрашивается (`usePricingCatalog` имеет собственный `commerceAllowed` guard и отменяет незавершённый запрос); route guard не должен зависеть только от скрытия UI;
- personal-link/domain editing и блок «Оплата через DeDato» закрыты; payment fields не отправляются из Settings. Backend также защищает domain mutation для `ios_app`.

Ordinary web и Android сохраняют обычную функциональность и монетизацию. Failed handoff монтирует изолированный error state и не падает в ordinary cabinet.

**CONFIRMED, 2026-11-14, локальная интеграция `1830b5e` / `a3fa405`:** ADMIN и
MODERATOR используют общую админку. `AdminAccessProvider` получает серверный
снимок `/api/admin/access`; общий registry разделов и действий управляет меню,
кнопками и `AdminSectionGate`. Неизвестные роли/действия и отсутствующие разрешения
закрыты. Без доступа к dashboard открывается первый разрешённый раздел; при
полном отсутствии прав показывается отдельное состояние. Прямая ссылка на
запрещённый раздел не монтирует его содержимое. `MasterWorkspaceRoute` отделяет
staff-навигацию от кабинета мастера. Запросы снимка прав и master-profile
дедуплицируются при StrictMode. Проверки `adminAccess.test.js` и
`adminShell.test.js`: 111 passed локально.

Эти проверки — UX-граница, а не authorization enforcement; серверный контракт
принадлежит [Identity and access](identity-access.md). Это проверка локального
кода, не заявление о состоянии staging/prod.

**Источники общей админки:** `frontend/src/utils/adminAccess.js`;
`frontend/src/contexts/AdminAccessContext.jsx`; `frontend/src/components/AdminSectionGate.jsx`;
`frontend/src/components/MasterWorkspaceRoute.jsx`; `frontend/src/components/AdminSidebar.jsx`.

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

## Public booking create lifecycle

Primary `/m/:slug` wizard create is owned by `publicBookingCreateLifecycle.js` (used from `PublicBookingWizard`). Current contract after `4e219cc`:

- post-auth create is not aborted on React remount;
- same logical in-flight create shares one promise;
- StrictMode/remount does not issue a second POST;
- failed create returns the draft to pending;
- success receipt is written only after server-confirmed 200 with id/`public_reference`;
- refresh of an empty success-state can restore that receipt;
- an older success receipt does not overlay a newly started booking flow;
- service ID comparisons are normalized safely.

Deferred, not current release blockers: backend `Idempotency-Key`; PostgreSQL conflict locking; DB-level interval exclusion; server re-fetch of the receipt.

**Sources:** `frontend/src/components/booking/publicBookingCreateLifecycle.js`; `frontend/src/components/booking/PublicBookingWizard.jsx`; `frontend/src/components/booking/publicBookingCreateLifecycle.test.js`.

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

## Master calendar day create UX

**CONFIRMED, 2026-11-14, frontend unit tests:** в режиме «День» пустая боковая
форма (`MasterScheduleDayDetailAside`) показывает `data-testid="master-add-event"`
и переключатель **Запись / Личное событие** (`allowTypeSwitch` →
`CalendarB3ComposerForm`). `createPrefill.mode` задаёт начальный тип; повторная команда с тем же
mode/date/startIso несёт новый `commandId` из `goDayCreateManual`.
Новая ручная запись **не** получает стартовое время 10:00; пользователь выбирает
слот из annotated grid (`calendarOccupancy.js`). Prefill без `id`, но с `start_time`/`startIso` от клика в week grid,
сохраняет явное on-grid время в select; пустой старт только если время не задано. Занятое выбранное время сбрасывается
без автоподбора первого свободного. Dashboard `manualCreateIntentKey` сбрасывается через
`useConsumeManualCreateIntent` при открытии composer. На вкладке «Расписание»
`MasterScheduleCalendar` остаётся смонтированным независимо от
`scheduleResolved`, чтобы медленный `schedule/weekly` не размонтировал календарь
после consume intent. Дневная повестка показывает bookings и личные дела (calendar blocks) из API;
синтетические «нейтральные промежутки» и клиентская availability **не**
рисуются. Подпись дня — нейтральная («Записи и личные дела»), без отсечения
awaiting как «неподтверждённых». Синхронизация выбранного события после reload —
`syncMasterDaySelection` в `frontend/src/utils/masterDaySelection.js`.

**Sources:** `frontend/src/components/master/CalendarB3Composer.jsx`;
`frontend/src/components/master/MasterScheduleDayDetailAside.jsx`;
`frontend/src/components/master/MasterScheduleDayCompact.jsx`;
`frontend/src/components/MasterScheduleCalendar.jsx`;
`frontend/src/utils/calendarOccupancy.js`.

## Calendar B3 local integration

**CONFIRMED, 2026-11-14, восстановленный локальный web-редизайн:**
основной экран `MasterScheduleCalendar` имеет режимы **День / Неделя / Расписание**.
`MasterScheduleWeekTimeline` отображает события недели; `MasterScheduleDayCompact`
и боковые компоненты показывают день, событие и форму создания. Дашборд также
обновлён, включая действие «Новая запись». API и guards:
[Booking API](booking-api.md#calendar-b3-master-api). Тарифные замки остальных
разделов остаются.

Один merge `feature/calendar-b3-ui` до `8e39e12` этого дизайна не включает:
коммит содержит B3-функции поверх прежнего экрана. 35 файлов UI, helpers, CSS и
тестов были сохранены вне Git во временной копии; они восстановлены в основном
рабочем дереве. Соответствующие существующие frontend-файлы до восстановления
совпадали с `8e39e12`; более поздние tracked/dirty правки ими не замещались.
Теперь источник — текущий `frontend/src`, не временный worktree. Пока эти файлы
не закоммичены, другой checkout по тому же SHA не получит редизайн.

`frontend/src/index.css` импортирует `styles/dedato-design-language-v1.css`
до `@font-face` и прочих CSS statements. Иначе PostCSS отверждает порядок import,
и визуальная проверка стилей недостоверна. Vite build восстановленной версии
прошёл; в браузере при 1440 px проверены новый Dashboard, переключение День/Неделя
и появление боковой формы. Эта проверка не подтверждает Figma pixel matching
или готовность к release. Тестовые ограничения — [Testing strategy](testing-strategy.md#restored-calendar-design-checks).

**CONFIRMED, 2026-11-16, упрощённый режим «Расписание» (`calendarLayoutMode === 'schedule'`):**
поверхность одна: без вложенного `mcCard` hub внутри
`master-schedule-calendar-card`. Основной блок — `MasterScheduleTemplatePanel`
(«Текущее расписание»): loading / error / empty / rules / materialized; дни и
часы по данным API (`scheduleRules`, `MasterSchedule`, weekly
`AvailabilitySlot`, материализованный prop `schedule`), не по
`lastCreatedSchedule` в localStorage. Часовой пояс мастера явно; повтор /
период — только когда есть в сохранённых правилах. **CONFIRMED, 2026-11-17:**
действия «Создать расписание» / «Изменить расписание» (`data-testid`
`master-schedule-create-template` / `master-schedule-edit-template`) и меню
**Ещё** — в одной строке с заголовком «Текущее расписание» (desktop: заголовок
слева, действия справа; на узкой ширине — перенос без обрезки текста). Меню
«Ещё» якорится `right-0`, чтобы не обрезаться у правого края viewport. Primary
CTA: зелёная заливка + белый текст через `--dedato-text-on-primary` в
`dedato-design-language-v1.css` и `mcBtnPrimary`/`mcBtnPrimarySm`.
`materializedPreview` («Примеры на календаре») **не** рендерится; основной
materialized-only список остаётся в `overview.rows`. Prefill в
`CreateScheduleModal`, reload rules после create; второстепенные «Обзор месяца»,
«Управление слотами», «Прошедшие записи» — в **Ещё**. Убраны с поверхности календаря:
цветовая легенда «Источник», блок «Конфликты расписания», «Посмотреть
расписание», недельные toggles «Рабочее/Нерабочее время», подсказка «создавайте
только в День» (создание доступно из Недели/hero/toolbar). Backend-валидация
пересечений и сообщения в форме создания сохранены. Helpers —
`masterScheduleOverview.js`; тесты `MasterScheduleTemplatePanel.test.js`,
`masterScheduleOverview.test.js`. Источники: `MasterScheduleCalendar.jsx`,
`MasterScheduleTemplatePanel.jsx`.

**CONFIRMED, 2026-11-17, недельная сетка событий:** в `MasterScheduleWeekTimeline`
рамка/фон/радиус (`gridEventSurface`) только на внешнем absolute-`button`;
`DedatoCalendarEvent` с `density="Grid"` — содержимое без второй рамки/фона
(один контур для 30‑мин и длинных событий). **CONFIRMED, 2026-11-17 (polish):**
`weekGridVariantFromHeight` — при высоте &lt; 40px (`gridVariant="compact"`) одна
центрированная строка «иконка источника + время»; название не рендерится в плитке
(доступно через hover/клик, `aria-label` на внешней кнопке). ≥60 мин —
`standard` (время + title). Agenda density без изменений.

**CONFIRMED, 2026-11-16, панель расписания (Figma DISCUSSION 16.11):** верх
календаря вынесен в `MasterScheduleHeader` внутри `MasterScheduleCalendar`;
дублирующий `<h1>` на вкладке `MasterDashboard` удалён. Макеты:
[Desktop Week](https://www.figma.com/design/btC3DhbFLLZ6BtJy1FdaOj?node-id=294-14186),
[Desktop Day](https://www.figma.com/design/btC3DhbFLLZ6BtJy1FdaOj?node-id=294-14395),
[Mobile Week](https://www.figma.com/design/btC3DhbFLLZ6BtJy1FdaOj?node-id=294-14612),
[Mobile Day](https://www.figma.com/design/btC3DhbFLLZ6BtJy1FdaOj?node-id=294-14764),
[компоненты шапки](https://www.figma.com/design/btC3DhbFLLZ6BtJy1FdaOj?node-id=296-14508).
Desktop (≥`lg`): ряд 1 — заголовок «Расписание» и две outline-кнопки
`+ Новая запись` / `+ Личное дело` (168×44, `#4caf50` контур); ряд 2 —
сегментированный переключатель **День / Неделя / Расписание** (трек `#f3f4f6`,
активный сегмент белый без зелёной заливки, 358×48) и навигация периода
`ChevronLeft` → дата (Regular 16/24) → `ChevronRight` → **Сегодня** (heroicons
24 outline, иконки 18px). Mobile: заголовок Semibold 24/32, строка IANA
timezone мастера через `formatTimezoneLabel` (без хардкода города), кнопки
171×44, селектор 350×48, навигация 350px, поля **20px** (`max-lg:-mx-4
max-lg:px-5` на обёртке вкладки `MasterDashboard`, не на `master-schedule-surface`);
surface — `w-full max-w-[350px]` без `overflow-x-hidden`/negative margin; межрядовый gap 12 (mobile) / 24
(desktop). Шапка на фоне кабинета **вне** белой карточки; контент календаря в
`data-testid="master-schedule-calendar-card"` с `lg:mt-6` (24px) под шапкой.
Недельная дата — компактно `16–22 ноября 2026` (`masterSchedulePeriodLabel.js`);
tablist — roving `tabIndex` + стрелки/Home/End на `onKeyDown`. Токены — `mcCal*`
в `masterCabinetUi.js`.

**CONFIRMED, 2026-11-14, вход в «Расписание»:** режим календаря по умолчанию —
**Неделя** (`calendarLayoutMode` initial + `scheduleSurfaceKey` при переходе на
вкладку и повторном клике «Расписание» в sidebar). Явные действия (таб «День»,
клик по слоту недели, hero «Новая запись» с day-inline) могут открыть **День**.
Toolbar недели/дня содержит **+ Новая запись** и **+ Личное дело**
(`data-testid` `master-schedule-new-booking` / `master-schedule-new-block`): на
неделе открывают `CalendarB3Composer` modal без принудительного перехода в День;
в режиме День на desktop — inline aside.

**CONFIRMED, 2026-11-14, локальный responsive day aside:** при ширине
viewport **1200 px** (кабинет с `lg:ml-64`) дневной split больше не обрезает
правую форму: `mcDaySplitGrid` в `masterCabinetUi.js` использует
`minmax(0,566fr)` / `minmax(0,530fr)` вместо жёстких `566px`+`530px`; колонка
aside (`mcDayAsideShell`) — `min-w-0`, вертикальный `overflow-y-auto` (до
`max-h` области календаря), без `overflow-hidden` по горизонтали. Точка
`max-w-[1120px]` сохраняется при ≥1440 px контентной ширины. Переключатель
«Запись / Личное событие» и поля формы доступны без горизонтального клипа.

`PublicBookingCalendarGrid` и `availabilityRequest.js` стабилизируют выбранный
месяц и отвергают устаревшие ответы availability. До восстановления редизайна были проверены 185 web-тестов
(calendar/date/public availability + admin access), Vite build и браузерные
create/cancel manual booking, create/delete private block. Источники:
`frontend/src/components/master/CalendarB3Composer.jsx`,
`frontend/src/components/MasterDayDrawerModal.jsx`,
`frontend/src/components/master/MasterScheduleHeader.jsx`;
`frontend/src/components/MasterScheduleCalendar.jsx`;
`frontend/src/utils/masterCabinetUi.js`;
`frontend/src/components/booking/PublicBookingCalendarGrid.jsx`,
`frontend/src/components/booking/availabilityRequest.js`.
