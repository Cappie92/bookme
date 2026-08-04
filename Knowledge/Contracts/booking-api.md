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
| `/api/bookings` | Generic/legacy booking, slots, any-master and edit requests | mixed: authenticated and public endpoints | Authorization enforcement heterogeneous; critical gap is tracked in [Debt](../Debt/booking-scheduling.md#critical-generic-booking-mutation-authorization) |

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

Primary public availability returns ISO with master timezone and excludes started slots. Generic slot endpoints return scheduling service values and include compatibility variants. Create always needs server revalidation because availability is not a reservation and concurrent requests can race.

Duration comes from selected service on primary public path; generic paths also accept client-supplied service snapshot fields. Working-hours and overlap behavior is route-specific; see [Scheduling](../Domain/scheduling/README.md).

## 6. Temporary/prepayment boundary

Temporary booking is a 20-minute application row with `pending | paid | expired | cancelled`, fixed price/discount snapshot and optional payment session/link fields. Repository runtime does not integrate this confirmation path with an external payment-provider verification contract; its confirm mutation creates a regular Booking directly and marks temporary `paid`.

The current primary public create rejects a client restricted to advance payment rather than invoking this compatibility flow. The removed legacy web module contains a stub payment UI; it is not the active `/m/{slug}` route. Therefore temporary confirmation must not be documented as proven production payment processing.

**Source:** `backend/models.py` — `TemporaryBooking`; `backend/routers/client.py` — temporary routes; `backend/services/temporary_bookings_cleanup.py`; `frontend/src/App.jsx`; `frontend/src/components/booking/MasterBookingModule.jsx`; `frontend/src/components/modals/PaymentModal.jsx`.

## 7. Authorization boundary

Authentication and ownership are distinct. Some route families filter Booking by client/master owner; generic mutations do not have uniform ownership enforcement. This is a `critical` trust-boundary defect, not intended business behavior. Only sanitized scope is recorded in [Debt](../Debt/booking-scheduling.md#critical-generic-booking-mutation-authorization); detailed remediation belongs to a separate authorized track.

## 8. Compatibility and UNKNOWN

- `BookingCreate` generic/client schemas include client-supplied service name/duration/price snapshots even when runtime also loads Service.
- `BookingUpdate.status` is not enum-constrained.
- Public generic phone-bootstrap and salon any-master paths remain mounted, but tracked modern web/mobile usage is not established for every path.
- **UNKNOWN:** external consumers outside this repository.
