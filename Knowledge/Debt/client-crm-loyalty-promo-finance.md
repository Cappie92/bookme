# Debt — Client CRM, Loyalty, Promo and Operational Finance

Repository-known failure boundaries этих доменов. Это не target design и не инструкция изменения production data.

## CRM restriction uniqueness does not match ownership lifecycle

- **Confidence:** CONFIRMED
- **Evidence:** unique index содержит salon/indie owner, phone и type, но не `master_id` или `is_active`; owner columns nullable. Application uniqueness проверяет только active rows выбранного owner.
- **Failure scenario:** master-only duplicates не предотвращаются DB constraint; salon/legacy owner после soft-deactivation может столкнуться с прежней unique row при повторном создании того же type.
- **Sources:** `backend/models.py` — `ClientRestriction`; create/deactivate paths in `backend/routers/master_clients.py`, `backend/routers/master.py`, `backend/routers/salon.py`.
- **Required action:** отдельный CRM data-contract remediation с owner-aware active uniqueness и migration plan.

## Automatic restriction cancellation coverage

- **Confidence:** CONFIRMED
- **Evidence:** rule counter учитывает только `BookingStatus.CANCELLED`, тогда как client cancellation paths сохраняют отдельные early/late cancelled statuses.
- **Failure scenario:** client-originated cancellations могут не увеличивать порог автоматического restriction rule, хотя сохраняют compatible cancellation reason.
- **Sources:** `backend/utils/client_restrictions.py` — `count_cancellations_by_reason`; `backend/models.py` — `BookingStatus`; client/accounting cancellation paths.
- **Required action:** CRM/Booking owners define which terminal statuses count and cover each with regression tests.

## Eligibility check performs durable mutation

- **Confidence:** CONFIRMED
- **Evidence:** `check_client_restrictions` materializes automatic restriction and commits; it is called from read-like public/master eligibility handlers as well as booking create handlers.
- **Failure scenario:** an eligibility read can commit CRM state independently of a later booking transaction; a later booking failure does not roll that state back.
- **Sources:** `backend/utils/client_restrictions.py` — `check_client_restrictions`, `apply_automatic_restrictions`; `backend/routers/public_master.py` — `get_public_eligibility`; `backend/routers/master.py` — `check_booking_eligibility`.
- **Required action:** separate transaction/command-query boundary remediation.

## CRM identity and note-store fragmentation

- **Confidence:** CONFIRMED
- **Evidence:** master metadata and generic client note are phone-keyed, other client notes/favorites are user-keyed, and multiple note tables represent different directions/contexts.
- **Failure scenario:** phone change, account merge/deletion or UI reuse can leave logically related views inconsistent unless every store is handled explicitly.
- **Sources:** `backend/models.py` — `MasterClientMetadata`, `ClientNote`, `ClientMasterNote`, `ClientSalonNote`, `ClientFavorite`; `backend/routers/client.py`; `backend/services/account_deletion.py`.
- **Required action:** privacy/CRM owner defines identity key and store ownership; do not merge tables without migration semantics.

## Loyalty ledger idempotency is application-only

- **Confidence:** CONFIRMED
- **Evidence:** completion checks existing `(booking_id, transaction_type)` before creating spend/earn, but `loyalty_transactions` has only non-unique indexes for these fields.
- **Failure scenario:** a concurrent or future writer outside the `BookingConfirmation` transaction guard can create duplicate earn/spend entries.
- **Existing protection:** common completion path is transaction-scoped and `BookingConfirmation.booking_id` is DB-unique.
- **Sources:** `backend/models.py` — `LoyaltyTransaction`, `BookingConfirmation`; `backend/services/booking_visit_finalize.py`; `backend/utils/loyalty.py`.
- **Required action:** loyalty owner defines ledger source/idempotency key and DB constraint.

## Loyalty balance and statistics semantics diverge

- **Confidence:** CONFIRMED
- **Evidence:** client balance excludes expired earn and subtracts all spend; master `current_balance` uses all-time earned minus spent, while active-clients count asks only whether any unexpired earn exists.
- **Failure scenario:** master stats can disagree with client effective/ledger balance, especially after expiry or full spend.
- **Sources:** `backend/utils/loyalty.py` — `calculate_client_balance`; `backend/routers/master_loyalty.py` — `get_loyalty_stats`; `backend/routers/client_loyalty.py`.
- **Required action:** define named metrics (issued, expired, spent, outstanding, reserved, available) and reuse them.

## Loyalty completion can succeed without earn

- **Confidence:** CONFIRMED
- **Evidence:** finalize catches loyalty earn exceptions, logs them and continues confirmation/income/expense completion.
- **Failure scenario:** Booking and finance commit as completed while expected earn is absent; there is no durable retry marker in the loyalty ledger.
- **Source:** `backend/services/booking_visit_finalize.py` — earn block.
- **Required action:** owner chooses atomicity or durable retry/reconciliation semantics in a separate code track.

## Legacy promo activation concurrency and selection

- **Confidence:** CONFIRMED
- **Evidence:** activation uniqueness and use limit are query-before-insert/increment with no DB unique `(promo_code_id, user_id)`; existing subscription is selected by `user_id` only and updated without normal effective-subscription selector or full field normalization.
- **Failure scenario:** concurrent activations can exceed intended limits or duplicate a user activation; an arbitrary/disabled subscription row can be updated while fields used by other billing paths remain stale.
- **Sources:** `backend/models.py` — `PromoCodeActivation`, `Subscription`; `backend/routers/promo_codes.py` — `activate_promo_code`; effective selector in `backend/utils/subscription_features.py`.
- **Required action:** decide legacy retirement/migration or align it with canonical subscription/payment/idempotency contracts.

## Promo Engine pending-redemption uniqueness is application-only

- **Confidence:** CONFIRMED
- **Evidence:** service queries current acquisition redemption and campaign/code limits before insert, while `promo_redemptions` has indexes but no DB uniqueness for the active acquisition state per redeemer.
- **Failure scenario:** concurrent apply/registration paths can both pass pre-checks and create competing pending redemptions.
- **Existing protection:** reward grants are DB-unique per redemption/recipient role after first payment.
- **Sources:** `backend/models.py` — `PromoRedemption`, `PromoRewardGrant`; `backend/services/promo_engine.py` — `create_pending_redemption`, current-redemption lookup.
- **Required action:** Promo owner defines a DB-enforced active-redemption key and concurrency test.

## Operational finance has parallel, unreconciled stores

- **Confidence:** CONFIRMED
- **Evidence:** master accounting uses `MasterExpense`/`BookingConfirmation`; legacy salon/indie routes use `Expense`/`Income`/`MissedRevenue`. No repository aggregation or synchronization joins these families.
- **Failure scenario:** reports from the two APIs can represent different populations and totals for the same human master.
- **Sources:** `backend/routers/accounting.py`, `backend/routers/expenses.py`; named models in `backend/models.py`; `backend/main.py`.
- **Required action:** finance owner chooses authoritative ledgers and an explicit compatibility/migration boundary.

## Completion Income has no canonical master owner

- **Confidence:** CONFIRMED
- **Evidence:** `Income` supports salon/indie ownership but no canonical `Master.id`/`User.id`; master completion creates an Income with salon/indie owner fields unset. Legacy master income queries filter by `indie_master_id`.
- **Failure scenario:** completion Income exists by booking but is not visible in legacy master income list; operational reporting instead relies on BookingConfirmation.
- **Sources:** `backend/models.py` — `Income`; `backend/services/booking_visit_finalize.py`; `backend/routers/expenses.py` — `get_master_incomes`.
- **Required action:** resolve Income versus BookingConfirmation ownership before treating either as a universal ledger.

## Legacy Income and MissedRevenue create contracts are incomplete

- **Confidence:** CONFIRMED from schema/model construction; no targeted success tests found.
- **Evidence:** request schemas omit `booking_id` and, for missed revenue, `client_id`; corresponding model columns are non-null and handlers do not derive them before insert.
- **Failure scenario:** mounted create endpoints reach database integrity failure instead of creating a valid row.
- **Sources:** `backend/schemas.py` — `IncomeCreate`, `MissedRevenueCreate`; `backend/models.py` — `Income`, `MissedRevenue`; create handlers in `backend/routers/expenses.py`.
- **Required action:** define caller-supplied versus server-derived references, ownership validation and tests.

## Tax-rate entitlement and recalculation drift

- **Confidence:** CONFIRMED
- **Evidence:** tax-rate router requires active authentication but not `has_finance_access`; `recalculate_existing=true` only counts matching confirmations and does not mutate stored or derived amounts.
- **Failure scenario:** tax configuration mutation has a different entitlement boundary from finance reports, and response wording/count can imply recalculation that did not occur.
- **Sources:** `backend/routers/tax_rates.py`; comparison with `_ensure_finance_access` call sites in `backend/routers/accounting.py`.
- **Required action:** finance owner defines entitlement and whether taxes are always derived or materialized; align API naming/behavior.
