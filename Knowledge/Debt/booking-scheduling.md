# Debt — booking and scheduling

Подтверждённые ограничения текущих Booking/Scheduling runtime paths. Это не remediation plan и не инструкция по воспроизведению дефектов.

См. [Booking](../Domain/booking/README.md), [Scheduling](../Domain/scheduling/README.md), [Booking API](../Contracts/booking-api.md).

## Critical: generic booking mutation authorization

- **Severity:** `critical` (остаточный scope)
- **Confidence:** CONFIRMED
- **Trust boundary:** authenticated identity → mutation of a Booking and its reschedule requests.
- **Category:** missing/inconsistent object-level authorization enforcement.
- **Mitigated:** `DELETE /api/bookings/{id}` (`delete_booking`) теперь admin-only через `require_admin` и разрешает hard delete только будущей «чистой» брони; финансовые/loyalty/исторические связи → `409 BOOKING_HARD_DELETE_FORBIDDEN`. Client/master soft-cancel paths не затронуты.
- **Remaining confirmed scope:** generic `create_edit_request` / `update_edit_request` (и сравнение с ownership checks в `update_booking`) всё ещё без полного object-level enforcement.
- **Potential impact (остаточный):** нарушение целостности reschedule-запросов за пределами разрешённого пользователю объекта.
- **Sources:** `backend/main.py` — booking router composition; `backend/routers/bookings.py` — `delete_booking`, `create_edit_request`, `update_edit_request`, comparison with `update_booking`; `backend/utils/booking_hard_delete.py`.
- **Status:** partially remediated for hard delete; remaining edit-request authorization debt is active.
- **Required action:** отдельный authorization remediation track для оставшихся generic edit-request mutations.

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
- **Source:** `backend/models.py`; [data and migrations](../Architecture/data-and-migrations.md).

## Slot-blocking predicate drift

- **Confidence:** CONFIRMED (частично закрыто для четырёх create path)
- **Mitigated:** create и availability/`get_best_master_for_slot` используют `services.booking_occupancy`. Client exact-start create check удалён.
- **Remaining:** reschedule/restore/edit-accept/temp-confirm и `create-with-any-master` ещё не на atomic writer. TemporaryBooking hold не входит в occupancy SELECT.
- **Sources:** `backend/services/booking_creation.py`, `backend/services/scheduling.py`, `backend/routers/master.py`.

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

## Нет DB-level exclusion constraint; PostgreSQL writer не реализован

- **Confidence:** CONFIRMED (частично закрыто для SQLite create)
- **Mitigated:** четыре основных create path атомарно делают SQLite `BEGIN IMMEDIATE` → unified overlap SELECT → write на Connection-owned txn.
- **Remaining:** `POST /api/bookings/create-with-any-master` остаётся racy и unauthenticated. Frontend test/demo callers есть (`SalonBookingModule`, `/test/any-master`). Коллега переписывает endpoint на verify-first; после их merge `_create_any_master_public_booking_after_proof` и `_create_specific_public_booking_after_proof` должны вызывать atomic writer, а не свой SELECT→INSERT/commit. P1 не закрыт до этого follow-up. DB exclusion constraint отсутствует; PostgreSQL locking strategy не реализована (`BOOKING_ATOMIC_UNSUPPORTED`).
- **Sources:** `backend/services/booking_creation.py`; `backend/routers/bookings.py`.

## MissedRevenue не является автоматическим outcome

- **Confidence:** CONFIRMED
- **Evidence:** common cancel/finalize service не создаёт `MissedRevenue`; writers находятся в expenses router.
- **Failure scenario:** аналитика, предполагающая automatic cancellation loss, неверна.
