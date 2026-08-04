---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Operational finance

Операционный учёт доходов, расходов, налоговых ставок и упущенной выручки мастера/салона. Он не является SaaS Billing: Robokassa, subscription payments, UserBalance и daily subscription charges описаны в [Subscriptions Billing](subscriptions-billing/README.md).

## Canonical master accounting path

`/api/master/accounting` использует две identity dimensions намеренно:

- `Booking.master_id` ссылается на `Master.id` и определяет владение записью;
- `BookingConfirmation.master_id`, `MasterExpense.master_id` и `TaxRate.master_id` хранят `User.id` мастера.

`BookingConfirmation` — unique по `booking_id` факт post-visit completion с подтверждённым денежным доходом. `MasterExpense` поддерживает recurring, service-based и one-time rows. `TaxRate` выбирается как последняя ставка с `effective_from_date` не позже даты операции.

**Sources:** `backend/models.py` — named models; `backend/routers/accounting.py` — owner helpers, confirmation/expense/summary paths; `backend/tests/test_accounting_master_id_consistency.py`.

## Completion и доступ

Post-visit pending/confirm/cancel operations являются частью Booking outcome workflow и доступны мастеру без finance entitlement. Summary, operations, expense CRUD и export проверяют `has_finance_access`.

Completion синхронно создаёт `BookingConfirmation`, operational `Income`, loyalty effects и materialized service-based expenses; детали transaction ordering находятся в [Booking completion side effects](booking/completion-side-effects.md).

**Sources:** `backend/routers/accounting.py`; `backend/services/booking_visit_finalize.py`; `backend/tests/test_accounting_post_visit_phase1.py`.

## Summary semantics

Accounting summary строит:

- confirmed income из `BookingConfirmation`, уменьшенный на tax rate для даты confirmation;
- expected income из ещё не подтверждённых active pre/post-visit Booking statuses в выбранном календарном окне;
- active expenses из `MasterExpense`;
- net profit как confirmed after-tax income минус expenses;
- отдельно сумму использованных client loyalty points.

Operations view также объединяет confirmation income и master expenses в in-memory timeline. Периодические границы переиспользуют master dashboard calendar helper.

**Sources:** `backend/routers/accounting.py` — `get_accounting_summary`, `get_operations`, `resolve_accounting_calendar_bounds`; `backend/utils/booking_real_money.py`.

## Legacy salon/indie accounting

Одновременно mounted `/api/expenses` использует отдельные таблицы `ExpenseType`, `Expense`, `ExpenseTemplate`, `Income`, `MissedRevenue` с salon/branch или `IndieMaster` ownership. Он предоставляет отдельные list/create/stats families для salon и indie master.

Эти rows не агрегируются `/api/master/accounting`, который читает `MasterExpense` и `BookingConfirmation`. Наличие похожих терминов `Expense`/`MasterExpense` и `Income`/`BookingConfirmation` не означает общий ledger.

`MissedRevenue` не создаётся общим booking cancellation service; repository-known writers находятся только в legacy expenses router. Нельзя считать каждую отмену автоматически отражённой как упущенная выручка.

**Sources:** `backend/models.py` — legacy finance models; `backend/routers/expenses.py`; `backend/main.py`; repository call-site search.

## Recurring expenses и jobs

Recurring `MasterExpense` материализуются process-local background loop. Его cadence, catch-up и idempotency constraints принадлежат [Background jobs](../Architecture/background-jobs.md) и [Debt](../Debt/feature-entitlements-and-jobs.md#recurring-expense-recovery-and-idempotency).

## Подтверждённые ограничения

Параллельные stores, incomplete legacy create contracts, tax recalculation semantics и entitlement drift описаны в [CRM/Loyalty/Promo/Finance Debt](../Debt/client-crm-loyalty-promo-finance.md).
