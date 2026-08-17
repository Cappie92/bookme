---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-07-24
---

# Invariants — subscriptions billing

Классификация защиты: **enforced** / **partially enforced** / **assumed or unsupported** / **known inconsistencies**.

См. [subscriptions-billing.md](subscriptions-billing.md), [subscriptions-billing-money-flows.md](subscriptions-billing-money-flows.md).

---

## 1. Enforced

### Split: points → balance → card

После баллов `after_points ≈ balance_portion + card_portion` (с денежным допуском).

- **Где:** `backend/utils/subscription_payment_split.py` — `compute_subscription_payment_split`
- **Защита:** conditional check (pure function)
- **Тесты:** `backend/tests/test_subscription_payment_split.py`
- **Ограничение:** клиент обязан передать согласованный snapshot; пересчёт на init с lock баланса

Source: `backend/utils/subscription_payment_split.py` — `compute_subscription_payment_split`

### Один snapshot не применяется дважды

- **Где:** `backend/routers/subscriptions.py` — `apply_upgrade_free`, `apply_upgrade_balance` (и apply в ResultURL через snapshot)
- **Защита:** row lock (`with_for_update`) + поля `applied_subscription_id` / `applied_at` + ответ `already_applied`
- **Тесты:** apply / points / mixed suites
- **Ограничение:** зависит от использования одного `calculation_id`

Source: `backend/routers/subscriptions.py` — `apply_upgrade_free`, `apply_upgrade_balance`

### ResultURL не повторно применяет подписку

Если `paid` + `subscription_apply_status=applied` + `subscription_id` → ранний `OK{InvId}`.

- **Защита:** status flags + early return; phase2 также под lock Payment
- **Тесты:** duplicate ResultURL в deposit/points tests

Source: `backend/routers/payments.py` — `robokassa_result`

### Card deposit не дублируется

Флаг metadata `subscription_deposit_applied`.

- **Защита:** status flag + `with_for_update` на Payment/UserBalance
- **Тесты:** `backend/tests/test_subscription_payment_deposit.py`

Source:

- `backend/routers/payments.py` — `robokassa_result` (phase1)
- `backend/utils/subscription_payment_deposit.py` — `resolve_subscription_deposit_amount`

### Soft-hold release / finalize

Expire/fail → `release_payment_balance_hold`; успешный apply → `finalize_payment_balance_hold` (+ reserve).

- **Защита:** flags в JSON metadata + обновление Payment
- **Тесты:** `backend/tests/test_subscription_mixed_payment.py`, `backend/tests/test_expired_payments_cleanup.py`
- **Ограничение:** hold не в отдельной таблице; корректность зависит от записи metadata

Source:

- `backend/utils/subscription_payment_split.py` — `build_payment_split_metadata`
- `backend/utils/balance_utils.py` — `release_payment_balance_hold`, `finalize_payment_balance_hold`

### Points debit не дублируется по source

Unique index на debit `(master_id, source_type, source_id)`.

- **Защита:** DB constraint (+ application checks)
- **Тесты:** `backend/tests/test_subscription_points_redemption.py`

Source: `backend/models.py` — `SubscriptionPointsLedger`; migration `20260713_subscription_points_debit_unique`

### Promo grant не дублируется по роли redemption

`UniqueConstraint(redemption_id, recipient_role)`.

- **Защита:** DB constraint + `already_applied` в сервисе
- **Тесты:** promo engine test suite

Source: `backend/models.py` — `PromoRewardGrant`; `backend/services/promo_engine.py`

### Pending payment expiry идемпотентен

Повторный cleanup не трогает уже expired/paid.

- **Защита:** conditional на `status`
- **Тесты:** `backend/tests/test_expired_payments_cleanup.py` — second run zero changes

Source: `backend/services/expired_payments_cleanup.py`

### Entitlement из effective subscription

`check_feature_access` опирается на селектор active+is_active+dates.

- **Защита:** conditional check
- **Тесты:** `backend/tests/test_subscription_features.py`, selector tests

Source: `backend/utils/subscription_features.py`

---

## 2. Partially enforced

### «Не больше одной активной подписки сейчас»

Селектор берёт max `end_date` и пишет warning при `count > 1`. **Нет** UNIQUE constraint на (user, type, active window).

- **Защита:** convention + selector + logging
- **Тесты:** `test_effective_subscription_selector.py`, `test_current_subscription_selector.py`
- **Ограничение:** параллельные apply теоретически могут создать несколько overlapping ACTIVE

Source: `backend/utils/subscription_features.py` — `get_user_subscription_with_plan`

### `Payment.amount` = card_portion (v2)

Соблюдается на пути с `calculation_id`. Legacy init без snapshot может писать полную сумму.

- **Защита:** conditional на современном пути
- **Ограничение:** legacy branch

Source: `backend/routers/payments.py` — `init_subscription_payment`

### Web/mobile «успех оплаты»

Канон бэкенда: `paid` + `applied`. Web return page допускает null/'' apply как UX-legacy success; mobile — нет.

- **Защита:** convention на клиентах (разные)
- **Тесты:** unit на каждой стороне; **нет** общего контракт-теста

Source: `frontend/src/utils/paymentPublicStatus.js`; `mobile/src/utils/paymentPublicStatus.ts`

---

## 3. Assumed or currently unsupported

### Recurring Robokassa auto-renewal

`auto_renewal` на модели есть; автоматическое списание картой **не реализовано** (explicit в daily_charges).

- **Защита:** none (feature unsupported)
- Source: `backend/services/daily_charges.py`

### Пополнение баланса deposit API

`POST /api/payments/deposit/init` и `POST /api/balance/deposit` → **410 Gone**.

- Source: `backend/routers/payments.py` — `init_deposit_payment`; `backend/routers/balance.py` — `deposit_balance_endpoint`

### Горизонтальное масштабирование API + jobs

In-process asyncio tasks предполагают один writer/один процесс — не enforced.

- Source: `backend/main.py` (startup tasks); см. Debt

---

## 4. Known inconsistencies

### Snapshot TTL: comment 20 vs runtime 30

- Модель: комментарий `created_at + 20 минут`
- Runtime calculate: `timedelta(minutes=30)` (согласовано с TTL pending Payment)

**Status:** CONFIRMED inconsistency (docs-in-code vs runtime)

Source: `backend/models.py` — `SubscriptionPriceSnapshot`; `backend/routers/subscriptions.py` — `calculate_subscription_cost`; `expired_payments_cleanup.PENDING_SUBSCRIPTION_PAYMENT_TTL`

### Duplicate `SubscriptionType` enum в `models.py`

Два определения класса с одним именем в одном модуле.

**Status:** CONFIRMED code smell; какой binding «побеждает» при import — **INFERRED** (обычный Python: последнее определение)

Source: `backend/models.py` (два `class SubscriptionType`)

### Credit-from-reserved

В calculate `credit_amount` всегда **0** (MVP; тесты контракта явно фиксируют).

**Status:** CONFIRMED current behavior

Source:

- `backend/routers/subscriptions.py` — `calculate_subscription_cost`
- `backend/tests/test_subscription_calculate_contract.py`
