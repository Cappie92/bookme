---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# Booking completion side effects

Владелец синхронных side effects post-visit completion. Это не event-driven pipeline: все действия выполняются в том же SQLAlchemy transaction path, который вызывает `finalize_post_visit_booking`.

## Входы

Общий finalize service вызывают:

- accounting `confirm-booking`;
- `update-booking-status → completed`;
- `confirm-all`.

Single confirm требует past start; status update вызывает service с `require_past_start=False`, а endpoint-specific guards определяют допустимость. Auto-to-manual compatibility helper не вызывает service и описан в [Debt](booking-scheduling.md).

**Source:** `backend/services/booking_visit_finalize.py`; `backend/routers/accounting.py`.

## Transaction sequence

Если `BookingConfirmation` уже существует, service приводит status к `completed` и возвращает idempotent result без повторного Income/earn/expenses. Иначе он в рамках caller transaction:

1. списывает зарезервированные loyalty points, если нет transaction `spent` для booking;
2. вычисляет реальные деньги как `max(0, payment_amount - points_spent)`;
3. создаёт `BookingConfirmation` с `confirmed_income`;
4. создаёт `Income` на реальную денежную сумму;
5. начисляет loyalty points с реальной денежной суммы, если программа включена и нет transaction `earned`;
6. материализует активные `service_based` expense templates как `one_time` expenses;
7. ставит Booking `completed`.

Caller commit фиксирует результат целиком; exception до commit приводит к rollback в основных single-confirm/status paths. Ошибка loyalty earn перехватывается внутри service и не отменяет остальные completion side effects.

**Source:** `backend/services/booking_visit_finalize.py`; `backend/utils/loyalty.py`; `backend/routers/accounting.py`; `backend/tests/test_loyalty_reserve_cancel_finalize.py`.

## Idempotency boundaries

- `BookingConfirmation.booking_id` имеет DB uniqueness и служит completion guard.
- Loyalty spend/earn дополнительно проверяются по `booking_id` и transaction type; ledger constraints принадлежат Loyalty package.
- `Income.booking_id` индексирован, но не unique; защита от дубля зависит от confirmation guard и transaction ordering.
- Созданные one-time expenses не имеют booking foreign key: повторный первый проход предотвращается confirmation guard, но их происхождение кодируется только в имени.

## Reverse transition

`update-booking-status` при уходе из `completed` удаляет первую найденную `BookingConfirmation` и `Income`, затем меняет status. Этот path не обращает loyalty spend/earn и не удаляет materialized one-time expenses. Поэтому reverse transition не является полной компенсационной транзакцией.

**Source:** `backend/routers/accounting.py` — `update_booking_status`; `backend/models.py` — `BookingConfirmation`, `Income`, `MasterExpense`.

## MissedRevenue

`MissedRevenue` — связанная с booking финансовая запись, но общий cancel/finalize service её не создаёт. Подтверждённые writers находятся в `backend/routers/expenses.py`; автоматическую связь «cancellation → missed revenue» утверждать нельзя.

## Граница доменов

Booking владеет моментом completion и orchestration. Loyalty владеет правилами/ledger spend и earn, Finance — экономической интерпретацией Income/expense/MissedRevenue. До появления реального publisher/consumer это синхронные вызовы, не доменные события.
