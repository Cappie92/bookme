# Money flows — subscriptions billing

Общие правила вынесены сюда один раз; сценарии ниже ссылаются на них.

См. также: [README.md](README.md), [invariants.md](invariants.md), [../../Contracts/payments-robokassa.md](../../Contracts/payments-robokassa.md).

## Общие правила (CONFIRMED)

### Split (scheme_version=2)

Порядок покрытия цены пакета:

1. subscription points (1 балл ≈ 1 ₽, уже выбранные/валидированные);
2. весь доступный денежный баланс (`available`);
3. остаток → `card_portion` (Robokassa).

`upgrade_type` **не** меняет split.
`Payment.amount` при init с snapshot = **card_portion**.
`available` = `UserBalance.balance − reserved − active soft-holds`.

Source:

- `backend/utils/subscription_payment_split.py` — `compute_subscription_payment_split`, `PAYMENT_SCHEME_VERSION`, `build_payment_split_metadata`
- `backend/utils/balance_utils.py` — `get_user_available_balance`
- `backend/tests/test_subscription_payment_split.py`

### Snapshot

`POST /api/subscriptions/calculate` создаёт `SubscriptionPriceSnapshot` с `expires_at = now + 30 minutes` (комментарий в модели «20 минут» устарел — см. invariants / Debt).

`credit_amount` в calculate **всегда 0** (MVP; зафиксировано тестами контракта).

Source:

- `backend/routers/subscriptions.py` — `calculate_subscription_cost`
- `backend/tests/test_subscription_calculate_contract.py`

### Выбор ветки на клиентах

| Условие | Backend-путь |
|---------|----------------|
| `final_price ≈ 0` | `POST /api/subscriptions/apply-upgrade-free` |
| `card_portion ≈ 0` и нужен баланс | `POST /api/subscriptions/apply-upgrade-balance` |
| `card_portion > 0` | `POST /api/payments/subscription/init` → Robokassa |

Web: `resolveSubscriptionPaymentApplyMode`.
Mobile: `final_price ≤ 0` / `shouldPaySubscriptionFromBalance` / иначе init.

Source:

- `frontend/src/utils/subscriptionPaymentApply.js`
- `mobile/src/utils/subscriptionPayment.ts`
- `frontend/src/components/SubscriptionModal.jsx`
- `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`

### Soft-hold

Не отдельная таблица. При init с `balance_portion > 0` в `payment_metadata` выставляется активный hold; он уменьшает available до `release` (expire/fail) или `finalize` (успешный apply).

Source:

- `backend/utils/subscription_payment_split.py` — `build_payment_split_metadata`
- `backend/utils/balance_utils.py` — `release_payment_balance_hold`, `finalize_payment_balance_hold`
- `backend/routers/payments.py` — `init_subscription_payment`

---

## 1. Бесплатное применение

**Status:** CONFIRMED

**Entry point:** web/mobile CTA при `final_price ≈ 0`.

**Flow**

```text
calculate → snapshot
→ apply-upgrade-free
→ (optional) debit subscription points
→ create Subscription (обычно immediate ACTIVE)
→ mark snapshot applied
```

**State mutations:** новая `Subscription`; points ledger debit при необходимости; Payment Robokassa **не** создаётся.

**Idempotency / retry:** повтор по тому же snapshot → `already_applied` (lock snapshot).

**Web/mobile:** оба зовут один endpoint; UX toast/Alert различается.

**Sources:** `backend/routers/subscriptions.py` — `apply_upgrade_free`; `backend/tests/test_subscription_points_redemption.py`

---

## 2. Оплата только subscription points

**Status:** CONFIRMED

Сводится к сценарию 1: points снижают `final_price` до ≈0 на calculate, далее `apply-upgrade-free`.

**Sources:**

- `backend/utils/subscription_payment_split.py` — `compute_subscription_payment_split`
- `backend/routers/subscriptions.py` — `calculate_subscription_cost`, `apply_upgrade_free`
- `backend/tests/test_subscription_points_redemption.py`

---

## 3. Оплата только балансом

**Status:** CONFIRMED

**Entry point:** mode balance / `shouldPaySubscriptionFromBalance`.

**Flow**

```text
calculate → snapshot
→ apply-upgrade-balance
→ create Subscription + Reservation
→ move_available_to_reserve и/или WITHDRAWAL
→ synthetic Payment (paid, apply=applied, invoice balance-…)
→ promo best-effort
```

**State mutations:** `UserBalance` / `SubscriptionReservation`; synthetic `Payment`.

**Idempotency:** snapshot `already_applied`; balance row `with_for_update`.

**Web/mobile:** web применяет без системного confirm; mobile при `requires_payment=false` после init может показать Alert (ветка init).

**Sources:** `backend/routers/subscriptions.py` — `apply_upgrade_balance`; `backend/tests/test_apply_upgrade_balance.py`, `test_subscription_mixed_payment.py`

---

## 4. Оплата только картой

**Status:** CONFIRMED

**Flow**

```text
calculate → init (amount = card_portion, hold≈0 если balance_portion=0)
→ Robokassa URL
→ ResultURL phase1: status=paid, DEPOSIT(card) на UserBalance
→ phase2: create Subscription, finalize hold, reserve(chargeable)
→ browser Success/Fail (UX only)
```

**Web:** `window.location.href`. **Mobile:** `Linking.openURL` + pending storage + verify.

**Sources:**

- `backend/routers/payments.py` — `init_subscription_payment`, `robokassa_result`
- `backend/utils/subscription_payment_deposit.py` — `resolve_subscription_deposit_amount`

---

## 5. Смешанная оплата (points + balance + card)

**Status:** CONFIRMED

Как сценарий 4, но при init soft-hold на `balance_portion`; после успешного apply hold финализируется и сумма уходит в reserve. Card депозитится на баланс в phase1.

**Sources:**

- `backend/routers/payments.py` — `init_subscription_payment`, `robokassa_result`
- `backend/utils/subscription_payment_split.py` — `build_payment_split_metadata`
- `backend/utils/balance_utils.py` — `finalize_payment_balance_hold`
- `backend/tests/test_subscription_mixed_payment.py`

---

## 6. Продление

**Status:** CONFIRMED (частично)

Даты новой подписки задаёт `resolve_new_subscription_period` / `upgrade_type` (в т.ч. renewal / after_expiry).
**Автосписание картой (Recurring Robokassa) не реализовано** — см. Debt / daily_charges comments.

Пользовательский renew = новый calculate + оплата как выше.

**Sources:**

- `backend/utils/subscription_apply_dates.py` — `resolve_new_subscription_period`
- `backend/services/daily_charges.py` (комментарий recurring)

---

## 7. Immediate upgrade

**Status:** CONFIRMED

При immediate apply новая подписка становится активной; предыдущая active → `EXPIRED` (в apply-путях). Credit из старого reserved в calculate **не применяется** (`credit_amount=0`).

**Sources:**

- `backend/routers/subscriptions.py` — `apply_upgrade_free`, `apply_upgrade_balance`, `calculate_subscription_cost`
- `backend/routers/payments.py` — `robokassa_result` (phase2 apply)
- `backend/tests/test_subscription_calculate_contract.py`

---

## 8. Downgrade / after-expiry

**Status:** CONFIRMED

Downgrade / `after_expiry`: новая подписка часто `PENDING` до даты; apply-free требует immediate и отказывает на downgrade. Точные ветки — в calculate (`forced_upgrade_type`, `is_downgrade`) и `resolve_new_subscription_period`.

**Sources:**

- `backend/routers/subscriptions.py` — `calculate_subscription_cost`
- `backend/utils/subscription_apply_dates.py` — `resolve_new_subscription_period`
- `backend/tests/test_subscription_calculate_contract.py`

---

## 9. Ошибка внешней оплаты

**Status:** CONFIRMED

Неверная подпись / amount mismatch → `Payment.status=failed`, release soft-hold; пользователь на Fail URL.

**Sources:**

- `backend/routers/payments.py` — `robokassa_result`
- `backend/utils/balance_utils.py` — `release_payment_balance_hold`

---

## 10. Истечение pending payment

**Status:** CONFIRMED

TTL pending subscription Payment = **30 минут**. Cleanup → `expired` + release hold. Записи не удаляются.

**Sources:** `backend/services/expired_payments_cleanup.py` — `PENDING_SUBSCRIPTION_PAYMENT_TTL`; `backend/tests/test_expired_payments_cleanup.py`

---

## 11. Повторный ResultURL callback

**Status:** CONFIRMED

Если уже `paid` + `subscription_apply_status=applied` + `subscription_id` → ответ `OK{InvId}` без повторного phase1/2 (promo best-effort).

Deposit phase1 также защищён флагом `subscription_deposit_applied`.

**Sources:**

- `backend/routers/payments.py` — `robokassa_result`
- `backend/tests/test_subscription_payment_deposit.py`
- `backend/tests/test_subscription_points_redemption.py`

---

## 12. Paid, но subscription apply failed

**Status:** CONFIRMED

Phase1 (paid + deposit) **не откатывается**, если phase2 упал: деньги на балансе, `subscription_apply_status=failed`. Восстановление: admin retry (§13).

**Sources:**

- `backend/routers/payments.py` — `robokassa_result`
- `backend/routers/admin.py` — `retry_subscription_apply`
- `backend/tests/test_subscription_payment_deposit.py`

---

## 13. Admin retry

**Status:** CONFIRMED

`POST /api/admin/payments/{payment_id}/retry-subscription-apply` — повтор apply для уже paid; для v2 финализирует hold / reserve. TTL snapshot не блокирует (деньги уже получены).

**Sources:**

- `backend/routers/admin.py` — `retry_subscription_apply`
- `backend/tests/test_subscription_mixed_payment.py`

---

## 14. Promo grants после успешного применения

**Status:** CONFIRMED

После applied payment promo engine начисляет grants (best-effort в ResultURL). Идемпотентность: unique `(redemption_id, recipient_role)` и проверки `already_applied`.

**Sources:** `backend/services/promo_engine.py`; `backend/models.py` — `PromoRewardGrant`

---

## Web / mobile verify drift (сводка)

| | Web return page | Mobile pending verify |
|--|-----------------|------------------------|
| Успех UX | `paid` и apply ∈ `{applied, null, ''}` → `success` | строго `paid` + `applied` |
| Иначе при paid | `activating` / error | `activating` пока не applied |

**Status:** CONFIRMED

**Sources:**

- `frontend/src/utils/paymentPublicStatus.js` — `resolvePaymentVerifyState`
- `mobile/src/utils/paymentPublicStatus.ts` — `resolvePaymentVerifyState`
