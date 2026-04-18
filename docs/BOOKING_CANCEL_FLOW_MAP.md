# Карта Cancel Booking Flow

## Backend

- **Endpoint**: `POST /api/master/accounting/cancel-booking/{booking_id}?cancellation_reason=...`
- **Файл**: `backend/routers/accounting.py` (строки 895–948)
- **Статусы**: принимает только `CREATED`, `AWAITING_CONFIRMATION`
- **Причины**: `client_requested`, `client_no_show`, `mutual_agreement`, `master_unavailable`
- **Backend enum**: `backend/utils/client_restrictions.py` → `get_cancellation_reasons()`

## Единый список причин (UI)

| key | label (RU) |
|-----|------------|
| client_requested | Клиент попросил отменить |
| client_no_show | Клиент не пришел |
| mutual_agreement | Обоюдное согласие |
| master_unavailable | Мастер недоступен |

## API вызовы

- **Mobile**: `cancelBookingConfirmation(bookingId, reason)` → `mobile/src/services/api/master.ts`
- **Web**: `apiPost(\`/api/master/accounting/cancel-booking/${id}?cancellation_reason=${reason}\`)`

## Логика canCancel

Запись можно отменить, если `status in ['created', 'awaiting_confirmation']`.

- `needsOutcome` — только прошлые записи (подтвердить/отменить)
- `canCancelBooking` — любые CREATED/AWAITING_CONFIRMATION (включая будущие)

## Места для кнопки «Отменить» (реализовано)

| # | Платформа | Компонент | Статус |
|---|-----------|-----------|--------|
| 1 | Web | MasterDashboardStats «Ближайшие записи» | ✅ Добавлена, reason picker |
| 2 | Web | AllBookingsModal | ✅ canCancelBooking + reason picker |
| 3 | Web | PopupCard (schedule) | ✅ Добавлена, reason picker |
| 4 | Mobile | index.tsx «Ближайшие записи» | ✅ Добавлена, Alert reason picker |
| 5 | Mobile | AllBookingsModal | ✅ canCancelBooking + Alert reason picker |
| 6 | Mobile | DayDrawer | ✅ Добавлена, height 85%, reason picker |
