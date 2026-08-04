# Subscriptions → Payments → Balance

Канонический обзор **денежного контура SaaS-подписки мастера**: расчёт, оплата (баллы / баланс / Robokassa), применение подписки, резерв и ежедневные списания.

Связанные документы:

- [money-flows.md](money-flows.md) — сценарии
- [invariants.md](invariants.md) — инварианты
- [../../Contracts/payments-robokassa.md](../../Contracts/payments-robokassa.md) — контракт Robokassa
- [../../Contracts/feature-entitlements.md](../../Contracts/feature-entitlements.md) — effective subscription и capability enforcement
- [../../Architecture/background-jobs.md](../../Architecture/background-jobs.md) — lifecycle daily charge и cleanup jobs
- [../../Debt/subscriptions-billing.md](../../Debt/subscriptions-billing.md) — ограничения и долг

## 1. Назначение

Контур отвечает за покупку и продление **тарифа сервиса DeDato** для роли master (и связанных billing-полей), а не за оплату клиентом услуги у мастера.

Мастер (владелец тарифа) получает: план на период, запись `Subscription`, feature entitlements и дальнейшие дневные списания с внутреннего баланса (после card-депозита и/или резерва).

## 2. Границы

**Входит**

- каталог `SubscriptionPlan`, расчёт `SubscriptionPriceSnapshot`;
- split: subscription points → денежный баланс → карта (Robokassa);
- apply free / balance / Robokassa ResultURL;
- soft-hold баланса в `Payment.payment_metadata` (scheme_version=2);
- `SubscriptionReservation`, daily charges;
- promo grants / points ledger, связанные с оплатой подписки;
- web/mobile UI покупки и return/verify.

**Не входит**

- оплата клиентом записи/услуги (отдельный booking/loyalty money path);
- пополнение баланса «просто так» через deposit API (endpoints возвращают **410 Gone**);
- IAP / RevenueCat (в mobile-стеке не используются).

## 3. Высокоуровневый путь

```text
calculate → SubscriptionPriceSnapshot (TTL 30 мин)
  → split (points → balance → card)
  → free | apply-balance | init Robokassa
  → [карта] ResultURL: deposit(card) → apply Subscription → finalize hold → reserve
  → daily_charges (SUB_DAILY_FEE + уменьшение reserved)
  → cleanup брошенных pending (expired + release hold)
```

`upgrade_type` влияет на **даты** применения, не на порядок split.
`calculation_id` в API = `SubscriptionPriceSnapshot.id`.

Подробные сценарии — в [money-flows.md](money-flows.md); контракт карты — в [payments-robokassa.md](../../Contracts/payments-robokassa.md).

Source:

- `backend/utils/subscription_payment_split.py` — `compute_subscription_payment_split`
- `backend/routers/subscriptions.py` — `calculate_subscription_cost`
- `backend/routers/payments.py` — `init_subscription_payment`, `robokassa_result`
- `backend/services/daily_charges.py`, `backend/services/expired_payments_cleanup.py`

## 4. Деньги: balance / available / reserve / soft-hold

| Понятие | Что это | Где живёт |
|---------|---------|-----------|
| `UserBalance.balance` | Номинальный денежный остаток | таблица `user_balances` |
| `reserved` | Сумма под активную подписку (дневные списания) | `SubscriptionReservation.reserved_amount` |
| soft-hold | Временная «бронь» `balance_portion` на время pending Robokassa | флаги в `Payment.payment_metadata` (не отдельная таблица) |
| `available` | `balance − reserved − active soft-holds` | `get_user_available_balance` |

После успешного card-flow: card → DEPOSIT на `balance`, затем soft-hold finalize и часть средств уходит в `reserved`.

Source: `backend/utils/balance_utils.py` — `get_user_available_balance`, `move_available_to_reserve`, `release_payment_balance_hold`, `finalize_payment_balance_hold`

## 5. Компоненты

### Backend

| Область | Файлы |
|---------|--------|
| HTTP | `backend/routers/subscriptions.py`, `backend/routers/payments.py`, `backend/routers/balance.py`, `backend/routers/subscription_plans.py`, `backend/routers/subscription_plans_public.py`; admin retry — `backend/routers/admin.py` |
| Split / deposit / billing | `backend/utils/subscription_payment_split.py`, `backend/utils/subscription_payment_deposit.py`, `backend/utils/subscription_billing_calc.py`, `backend/utils/subscription_apply_dates.py` |
| Balance / holds | `backend/utils/balance_utils.py` |
| Entitlements | `backend/utils/subscription_features.py` |
| Jobs | `backend/services/daily_charges.py`, `backend/services/expired_payments_cleanup.py` |
| Points / promo | `backend/services/subscription_points.py`, `backend/services/promo_engine.py` |
| Robokassa helpers | `backend/utils/robokassa.py`, `backend/utils/payment_public_id.py` |

### Web

- `frontend/src/components/SubscriptionModal.jsx`
- `frontend/src/utils/subscriptionPaymentApply.js` — `resolveSubscriptionPaymentApplyMode`
- return: `frontend/src/pages/PaymentSuccess.jsx`, `frontend/src/pages/PaymentFailed.jsx`, `frontend/src/utils/paymentPublicStatus.js`, `frontend/src/utils/paymentReturnFlow.js`

### Mobile

- `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx`
- `mobile/src/utils/subscriptionPayment.ts` — `shouldPaySubscriptionFromBalance`
- API: `mobile/src/services/api/payments.ts`, `mobile/src/services/api/subscriptions.ts`
- verify: `mobile/src/services/analytics/verifyPendingSubscriptionPayment.ts`, `mobile/src/utils/paymentPublicStatus.ts`
- return в app: deeplink `dedato://subscriptions` (через web CTA)

`payment_source` (`web` | `mobile_app`) влияет на UX return, не на split/apply.
Различия verify success: [money-flows.md](money-flows.md#web--mobile-verify-drift-сводка).

## 6. Основные сущности

| Модель | Роль |
|--------|------|
| `SubscriptionPlan` | Тариф: цены пакетов, `features`/`limits` |
| `Subscription` | Период подписки пользователя (`status`, `is_active`, даты, `daily_rate`) |
| `SubscriptionPriceSnapshot` | Зафиксированный расчёт; API `calculation_id` = `id`; TTL; idempotency apply |
| `Payment` | Robokassa-платёж; `status`; `subscription_apply_status`; `payment_metadata` (v2 hold/split) |
| `UserBalance` / `BalanceTransaction` | Денежный баланс и журнал |
| Soft-hold | **Не таблица**: флаги в `Payment.payment_metadata` |
| `SubscriptionReservation` | Резерв под активную подписку (1:1) |
| `SubscriptionPointsLedger` | Баллы на оплату подписки |
| `PromoRewardGrant` | Идемпотентные начисления после applied payment |
| `DailySubscriptionCharge` | Дневные списания |

Source: `backend/models.py` — соответствующие классы.

## 7. Состояния (компактно)

Не смешивать четыре оси:

| Ось | Значения (фактически) | Где |
|-----|------------------------|-----|
| `Subscription.status` | `active`, `expired`, `pending`, `cancelled` | enum `SubscriptionStatus` |
| `Subscription.is_active` | bool; `False` после failed daily charge → не effective | billing + features |
| `Payment.status` | `pending`, `paid`, `failed`, `cancelled`, `expired` | string field |
| `Payment.subscription_apply_status` | `pending`, `applied`, `failed` | string field |

Effective entitlement: `status=ACTIVE` ∧ `is_active=True` ∧ `start_date ≤ now < end_date`; при нескольких кандидатах — max `end_date` (строгий unique «одна active» **нет**).

Source:

- `backend/models.py` — `Subscription`, `Payment`
- `backend/utils/subscription_features.py` — `get_user_subscription_with_plan`, `check_feature_access`

## 8. SaaS vs оплата услуги клиентом

| | SaaS-подписка мастера (этот домен) | Услуга клиенту |
|--|-----------------------------------|----------------|
| Плательщик | мастер (user тарифа) | клиент мастера |
| Провайдер | Robokassa subscription / internal balance / points | booking/loyalty (вне этого пакета) |
| Результат | `Subscription` + entitlements | запись / скидка / баллы лояльности |

## 9. Effective subscription и entitlements

`check_feature_access(db, user_id, feature_key, …)` читает effective subscription и `SubscriptionPlan.features`. Полный mapping, fallback и endpoint enforcement принадлежат [feature entitlements contract](../../Contracts/feature-entitlements.md).

На read-path при отсутствии подписки и флаге `User.is_always_free` может **создаться** подписка AlwaysFree (side effect). См. [Debt](../../Debt/subscriptions-billing.md).

Source: `backend/utils/subscription_features.py` — `get_user_subscription_with_plan`, `check_feature_access`

## 10. Как читать код (15 минут)

1. `backend/utils/subscription_payment_split.py` — порядок денег.
2. `backend/routers/subscriptions.py` — `calculate_subscription_cost` → snapshot.
3. `apply_upgrade_free` / `apply_upgrade_balance`.
4. `backend/routers/payments.py` — `init_subscription_payment` → soft-hold; `robokassa_result` phase1/2.
5. `backend/routers/admin.py` — `retry_subscription_apply` (paid + apply failed).
6. `backend/utils/subscription_features.py` — `get_user_subscription_with_plan`.
7. Clients: `subscriptionPaymentApply.js` vs `subscriptionPayment.ts` + [verify drift](money-flows.md#web--mobile-verify-drift-сводка).
8. Тесты: `backend/tests/test_subscription_mixed_payment.py`, `test_subscription_points_redemption.py`.
