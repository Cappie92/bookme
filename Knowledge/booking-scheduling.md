---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-13
---

# Debt — booking and scheduling

Подтверждённые ограничения текущих Booking/Scheduling runtime paths. Это не remediation plan и не инструкция по воспроизведению дефектов.

См. [Booking](booking.md), [Scheduling](scheduling.md), [Booking API](booking-api.md).

## Closed: generic booking mutation authorization

- **Severity:** was `critical`
- **Status:** closed / remediated
- **Historical residual:** after hard-delete was already admin-only, generic edit-request create/accept/reject still lacked uniform object-level enforcement.
- **Resolution:** that residual authorization gap is closed in runtime. This debt item is not a second current policy owner.
- **Living current contract:** [Booking API](booking-api.md#7-authorization-boundary).
- **Regression:** `backend/tests/test_demo_readonly_booking_ownership.py`.
- **Required action:** none for current policy; do not re-describe the retired unauthenticated mutation surface as open debt.

Эксплуатационные шаги и углублённый exploitability analysis намеренно не входят в Knowledge.

## Divergent create semantics

- **Confidence:** CONFIRMED
- **Evidence:** primary public create всегда пишет `created`; generic create branches могут писать `completed` при `auto_confirm_bookings`; temporary confirm также создаёт `completed`.
- **Failure scenario:** status не означает одинаковый lifecycle факт для записей из разных route families; completion side effects могут отсутствовать у строки со status `completed`.
- **Sources:** `backend/routers/public_master.py`, `backend/routers/bookings.py`, `backend/routers/client.py`.
- **Investigation:** унификация только в отдельной product/code задаче.

## Declared transition graph не enforced

- **Confidence:** CONFIRMED
- **Evidence:** `backend/utils/booking_status.py::is_status_transition_allowed` не имеет runtime call sites; routers присваивают status по собственным правилам, а `BookingUpdate.status` — string.
- **Failure scenario:** разные API допускают разные переходы и произвольные значения.
- **Existing protection:** accounting endpoint-specific guards.

## Status column length drift

- **Confidence:** CONFIRMED
- **Evidence:** `Booking.status = String(16)`, но `cancelled_by_client_early/late` длиннее; production SQLite не обеспечивает ожидаемое ограничение длины как строгий cross-DB contract.
- **Failure scenario:** portability/schema-validation drift при другой DB.
- **Source:** `backend/models.py`; [data and migrations](data-and-migrations.md).

## Slot-blocking predicate drift

- **Confidence:** CONFIRMED
- **Evidence:** common scheduling исключает только `cancelled` и строку `rejected`; schedule writers исключают все client-cancel variants; client create сравнивает только equal start.
- **Failure scenario:** отменённые/expired rows могут скрывать slots, а partial overlaps — пройти отдельный compatibility create path.
- **Sources:** `backend/services/scheduling.py`, `backend/routers/master.py`, `backend/routers/client.py`.

## Temporary hold не глобален

- **Confidence:** CONFIRMED
- **Evidence:** `TemporaryBooking` отсутствует в common availability/conflict queries; temporary create проверяет equal start отдельно.
- **Failure scenario:** hold и regular create не образуют единую взаимно исключающую reservation boundary.
- **Existing protection:** application pre-check внутри temporary family; 20-minute expiry cleanup.

## Prepayment verification не интегрирован

- **Confidence:** CONFIRMED repository-known
- **Evidence:** temporary confirm path не проверяет внешний provider result/session; primary public path для advance restriction отклоняет create; legacy PaymentModal содержит stub.
- **Failure scenario:** repository path нельзя считать подтверждённым payment processing contract.
- **Unknown:** используется ли этот compatibility path внешним клиентом или на production.
- **Boundary:** не смешивать с Robokassa subscription payments.

## Completion idempotency частичная

- **Confidence:** CONFIRMED
- **Evidence:** unique `BookingConfirmation.booking_id`; `Income.booking_id` не unique; materialized service expense не хранит booking FK.
- **Failure scenario:** защита side effects зависит от прохождения общего finalize service и confirmation guard.
- **Existing protection:** common service checks confirmation and loyalty transaction types.

## Auto-to-manual compatibility bypass

- **Confidence:** CONFIRMED
- **Evidence:** `auto_confirm_awaiting_on_manual_switch` создаёт confirmation и status `completed`, но не вызывает общий finalize service.
- **Failure scenario:** отсутствуют Income, loyalty spend/earn и service expenses, ожидаемые от обычного completion.
- **Source:** `backend/routers/accounting.py`; `backend/routers/master.py` settings update.

## Reverse completion неполон

- **Confidence:** CONFIRMED
- **Evidence:** уход из `completed` удаляет confirmation и одну Income row, но не компенсирует loyalty ledger и materialized expenses.
- **Failure scenario:** status correction оставляет часть экономических side effects.
- **Source:** `backend/routers/accounting.py::update_booking_status`.

## Нет schema-level overlap constraint

- **Confidence:** CONFIRMED
- **Evidence:** DB exclusion/unique interval constraint отсутствует; актуальные SQLite create paths сериализованы одним request-owned `BEGIN IMMEDIATE` и используют общий occupancy predicate до INSERT.
- **Failure scenario:** обход guarded production create matrix не получает application-level serialization.
- **Existing protection:** real-SQLite same-slot и Free 19→20 concurrency tests.

## MissedRevenue не является автоматическим outcome

- **Confidence:** CONFIRMED
- **Evidence:** common cancel/finalize service не создаёт `MissedRevenue`; writers находятся в expenses router.
- **Failure scenario:** аналитика, предполагающая automatic cancellation loss, неверна.
