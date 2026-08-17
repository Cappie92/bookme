---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# Client loyalty

Программа скидок и баллов клиента у конкретного мастера. Это отдельный money-like контур от subscription points, UserBalance и SaaS-платежей DeDato.

## Скидки на запись

`LoyaltyDiscount` задаёт quick/complex rules, `PersonalDiscount` — client-specific rule, а `AppliedDiscount` сохраняет выбранный результат на Booking. Evaluation фильтрует активные master rules, проверяет поддерживаемые conditions и выбирает применимый результат; booking create paths повторно вычисляют и сохраняют discount server-side.

`AppliedDiscount` — snapshot факта применения к записи; он ссылается на rule, но сохраняет применённые percent/amount. Booking остаётся владельцем момента расчёта и создания записи.

**Sources:** `backend/models.py` — `LoyaltyDiscount`, `PersonalDiscount`, `AppliedDiscount`; `backend/utils/loyalty_discounts.py` — `evaluate_discount_candidates`, applied-discount helpers; `backend/routers/loyalty.py`; create paths in `backend/routers/public_master.py`, `backend/routers/client.py`, `backend/routers/bookings.py`; `backend/tests/test_loyalty_discounts.py`.

## Балльный ledger

`LoyaltySettings` — одна строка на `Master`: enabled state, accrual percent, maximum payment percent и optional lifetime. `LoyaltyTransaction` хранит положительные `earned`/`spent` entries по master/client и optional booking/service.

Баланс клиента у мастера вычисляется как сумма неистёкших `earned` минус сумма всех `spent`. Истёкшие entries не удаляются. Реализация не распределяет spend по earned entries: упоминание FIFO в helper comment не подтверждено отдельным allocation state.

Один балл используется как одна денежная единица. Максимальное списание ограничено effective balance, discounted price и `max_payment_percent`. Списание уже накопленных баллов разрешено даже при выключенном `LoyaltySettings.is_enabled`; флаг управляет видимостью программы и новым earn, а не аннулирует накопленный баланс.

**Sources:** `backend/models.py` — `LoyaltySettings`, `LoyaltyTransaction`; `backend/utils/loyalty.py`; `backend/utils/public_booking_loyalty.py`; `backend/tests/test_public_loyalty_disabled_spend.py`.

## Reservation и completion

До завершения визита выбранные баллы не являются `spent` ledger entry. Они резервируются числом в `Booking.loyalty_points_used`. Effective available balance равен ledger balance минус сумма резервов записей в active pre-visit statuses; результат ограничивается снизу нулём.

При отмене reserve обнуляется без ledger transaction. При completion общий finalize service:

1. создаёт `spent`, если для Booking его ещё нет;
2. вычисляет реальную денежную оплату после баллов;
3. начисляет `earned` с этой денежной суммы, только если программа включена и настроен accrual;
4. сохраняет Booking completed вместе с остальными completion side effects в caller transaction.

Повторный completion прежде всего останавливает unique `BookingConfirmation`. Детальная orchestration принадлежит [Booking completion side effects](booking-completion-side-effects.md).

**Sources:** `backend/utils/public_booking_loyalty.py`; `backend/utils/booking_loyalty_reserve.py`; `backend/services/booking_visit_finalize.py`; `backend/tests/test_loyalty_reserve_cancel_finalize.py`.

## API и access

Master API `/api/master/loyalty` управляет settings и читает history/stats; все эти handlers проверяют `has_loyalty_access`. GET settings создаёт и commits default disabled row, если её ещё нет.

Client API `/api/client/loyalty` требует client role и всегда ограничивает transactions текущим `client_id`. Он показывает ledger, active reserves, effective balance, history конкретного мастера и public settings. Этот read/spend boundary не требует, чтобы программа сейчас была enabled.

**Sources:** `backend/routers/master_loyalty.py`; `backend/routers/client_loyalty.py`; `backend/routers/public_master.py`.

## Граница с Promo и Billing

`LoyaltyTransaction` оплачивает услугу клиента у мастера. `SubscriptionPointsLedger`, создаваемый promo rewards и расходуемый на SaaS-подписку, принадлежит [Promo](promo.md) и [Subscriptions Billing](subscriptions-billing.md). Балансы не суммируются и не конвертируются друг в друга repository runtime.

Подтверждённые semantic/idempotency gaps описаны в [Debt](client-crm-loyalty-promo-finance.md).
