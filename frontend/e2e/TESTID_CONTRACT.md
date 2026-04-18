# E2E Test ID Contract

This document lists all `data-testid` attributes used by E2E tests. **Do not remove or rename these without updating the corresponding tests.**

## Navigation (MasterDashboard, MasterTariff)
- `nav-dashboard` — Dashboard tab/button
- `nav-schedule` — Schedule tab/button
- `nav-services` — Services tab/button (if exists)
- `nav-settings` — Settings tab/button
- `nav-tariff` — "Мой тариф" tab/button

## Settings (MasterSettings)
- `settings-save` — Save button in settings form
- `settings-save-success` — Success indicator (visually hidden span, appears for 5s after save)

## Bookings & Confirmations (BookingConfirmations, MasterDashboardStats)
- `postvisit-section` — Section containing post-visit pending confirmations
- `postvisit-confirm-first` — "Подтвердить" button for first pending booking

## Tariffs & Subscriptions (MasterTariff, SubscriptionModal)
- `tariff-page-title` — "Мой тариф" page heading
- `tariff-buy-button` — "Купить подписку" button on tariff page
- `tariff-plan-{name}` — Subscription plan card in modal (e.g., `tariff-plan-basic`, `tariff-plan-pro`, `tariff-plan-premium`)
- `tariff-payment-button` — "Перейти к оплате" button in subscription modal

## Payment (PaymentSuccess)
- `payment-success-page` — Root element of payment success page

## Demo & Locked Features (PopupCard, DemoAccessBanner)
- `locked-open-demo` — "Открыть демо" button in locked feature popover/banner
- `locked-finance` — Locked finance section (if exists)
- `locked-stats` — Locked stats section (if exists)

## Public Pages (PublicMasterPage)
- `public-book-button` — "Записаться" button on public master page
- `service-select` — Service selection dropdown/list

## Client Pages (ClientDashboard)
- `client-booking-cancel` — Cancel booking button (if exists)

## Rules

1. **Uniqueness**: Each `data-testid` should be unique within its context. If used in multiple places (e.g., desktop/mobile menus), tests should use `.first()` or scope to a specific container.

2. **Stability**: These IDs are part of the E2E contract. Changing them requires updating tests in `frontend/e2e/*.spec.ts`.

3. **Naming Convention**: Use kebab-case, descriptive names (e.g., `postvisit-confirm-first`, not `btn1`).

4. **Visibility**: Elements with `data-testid` can be visually hidden (e.g., `settings-save-success` with `sr-only` class), but must be present in DOM when expected by tests.

## Adding New Test IDs

When adding E2E tests for new features:
1. Add `data-testid` to the relevant UI element
2. Document it in this file
3. Use the ID in your test
4. Verify the test passes with `RUNS=3 ./scripts/e2e_full.sh`
