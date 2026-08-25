---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Contract: Booking API

Контракт существующих booking route families. Он описывает текущую совместимость, а не рекомендует legacy paths и не заменяет authorization remediation.

## 1. Route families

| Prefix | Назначение | Authentication | Canonical note |
|--------|------------|----------------|----------------|
| `/api/public/masters/{slug}` | Primary public profile, availability, eligibility, price preview, create | reads optional/anonymous; create требует active client | Основной `/m/{slug}` web/mobile contract |
| `/api/client/bookings` | Client lists, create/update/cancel, calendar, temporary booking | active user + client router dependency | Client-owned records; compatibility create differs from primary public create |
| `/api/master/*` | Master lists/schedule/settings | active user; endpoint-specific master lookup | Operational master views and schedule writes |
| `/api/master/accounting` | Pre/post-visit status and completion | active user + booking owner filters | Completion side effects live here |
| `/api/bookings` | Generic/legacy booking, slots, any-master and edit requests | mixed: authenticated and public endpoints; `DELETE /{id}` is admin-only clean hard-delete; generic `GET`/`PUT /{id}` and edit-request create/process use Booking object-scope (404 on deny) | Remaining edit-request identity/atomicity debt tracked in [Debt](../Debt/booking-scheduling.md#critical-generic-booking-mutation-authorization) |

Router composition is explicit in `backend/main.py`; prefix text alone does not prove a role guard.

## 2. Primary public contract

Profile services use `MasterService.id`. Create resolves that row to a canonical `Service`, creating/reusing it by current runtime mapping. Availability consumes the `MasterService.duration`; Booking stores canonical `Service.id`.

Create body contains service id, aware/naive ISO start/end accepted by Pydantic, and optional loyalty usage. Server rechecks master, client role/restrictions, advance-payment restriction, working hours, overlap, discount and loyalty reserve. Success returns booking id, public reference, status, interval and price breakdown.

The server, not the client preview, owns final discount and points calculation.

**Source:** `backend/routers/public_master.py`; public schemas in the same module; `backend/utils/public_booking_loyalty.py`; `backend/tests/test_public_master.py`, `test_public_booking_client_list_price.py`, `test_public_loyalty_disabled_spend.py`.

## 3. Price fields

- `service.price`: base catalog price.
- `Booking.payment_amount`: amount after discount, before loyalty reserve/spend.
- `Booking.loyalty_points_used`: reserved points.
- API `amount_to_pay` / public `final_price`: `max(0, payment_amount - loyalty_points_used)` before completion.
- Completion `confirmed_income`: real money after actual point spend.

Compatibility responses may expose `price` as alias for amount-to-pay. Consumers must not recompute final server amount from display-only catalog fields.

**Source:** `backend/utils/booking_real_money.py`; `backend/utils/public_booking_loyalty.py`; `backend/routers/public_master.py`; client/master serializers; [completion side effects](../Domain/booking/completion-side-effects.md).

## 4. Status contract

API responses can contain raw or effective status depending on endpoint. Master past list applies effective projection in memory; database queries/bulk actions continue to use raw values. Clients therefore must treat `awaiting_confirmation` as view/workflow state whose persistence depends on route.

There is no globally enforced transition function. Accounting routes enforce their own future/past/manual guards; generic `BookingUpdate.status` remains a string mutation surface. Full lifecycle: [Booking](../Domain/booking/README.md#3-raw-и-effective-status).

## 5. Availability and time

Primary public availability returns ISO with master timezone and excludes started slots. Generic slot endpoints return scheduling service values and include compatibility variants. The four primary create paths revalidate occupancy inside a SQLite `BEGIN IMMEDIATE` transaction (`services.booking_creation`). Concurrent overlapping creates keep one occupying Booking; the loser receives `409 BOOKING_SLOT_CONFLICT`. SQLite writer timeout maps to `503 BOOKING_SLOT_BUSY` with `Retry-After: 1`. `POST /api/bookings/create-with-any-master` and TemporaryBooking confirm remain outside this create boundary.

Duration comes from selected service on primary public path; generic paths also accept client-supplied service snapshot fields. Working-hours remain a pre-atomic 400 guard on create. See [Scheduling](../Domain/scheduling/README.md).

## 6. Temporary/prepayment boundary

Temporary booking is a 20-minute application row with `pending | paid | expired | cancelled`, fixed price/discount snapshot and optional payment session/link fields. Repository runtime does not integrate this confirmation path with an external payment-provider verification contract; its confirm mutation creates a regular Booking directly and marks temporary `paid`.

The current primary public create rejects a client restricted to advance payment rather than invoking this compatibility flow. The removed legacy web module contains a stub payment UI; it is not the active `/m/{slug}` route. Therefore temporary confirmation must not be documented as proven production payment processing.

**Source:** `backend/models.py` — `TemporaryBooking`; `backend/routers/client.py` — temporary routes; `backend/services/temporary_bookings_cleanup.py`; `frontend/src/App.jsx`; `frontend/src/components/booking/MasterBookingModule.jsx`; `frontend/src/components/modals/PaymentModal.jsx`.

## 7. Authorization boundary

Authentication and ownership are distinct. Client and master cancel paths filter by owner and soft-cancel. Generic `DELETE /api/bookings/{id}` is restricted to `admin` and only deletes a future clean booking (no finance/loyalty/history blockers); otherwise `409 BOOKING_HARD_DELETE_FORBIDDEN`. Generic `GET /api/bookings/{id}`, `PUT /api/bookings/{id}`, `POST /api/bookings/{id}/edit-requests` and `PUT /api/bookings/edit-requests/{id}` deny by default: only client/master/salon/indie related to that Booking may proceed; admin, moderator and unknown roles receive `404`. Missing or invalid JWT remains `401`.

Intentional salon/indie object-scope:

- **Salon owner:** `booking.salon_id` equals the salon whose `user_id` is the current user.
- **Salon branch manager** (no owner salon row): allow a Booking of that manager’s branch; also allow a Booking of the same salon with `branch_id` unset; another salon is `404`.
- **Indie:** allow if `booking.indie_master_id == indie.id` **or** `booking.master_id == indie.master_id` for the current user’s `IndieMaster`; unrelated indie is `404`.

Residual edit-request identity and accept-atomicity debt is in [Debt](../Debt/booking-scheduling.md#critical-generic-booking-mutation-authorization).

## 8. Compatibility and UNKNOWN

- `BookingCreate` generic/client schemas include client-supplied service name/duration/price snapshots even when runtime also loads Service.
- `BookingUpdate.status` is not enum-constrained.
- Public generic phone-bootstrap and salon any-master paths remain mounted, but tracked modern web/mobile usage is not established for every path.
- **UNKNOWN:** external consumers outside this repository.
