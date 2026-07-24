# Contract: Robokassa и subscription payments

Контракт внешней оплаты **SaaS-подписки мастера**. Не руководство по выдаче паролей и не описание оплаты услуги клиентом.

См. домен: [../Domain/subscriptions-billing/README.md](../Domain/subscriptions-billing/README.md), [money-flows.md](../Domain/subscriptions-billing/money-flows.md).

## 1. Роль Robokassa

Robokassa принимает **только card_portion** смешанной/карточной оплаты подписки. После ResultURL сумма card зачисляется на `UserBalance` (внутренний депозит подписки), затем создаётся/применяется `Subscription` и резерв.

Внутренние пути free/balance Robokassa не вызывают.

## 2. Какие платежи проходят через неё

- `Payment.payment_type = 'subscription'` с `card_portion > 0` (современный путь с snapshot).
- Legacy subscription init без `calculation_id` (полная сумма, без scheme_version=2).
- Тип `deposit` в модели и ResultURL ещё обработан, но **HTTP init deposit отключён (410)**.

Source: `backend/routers/payments.py`; `backend/models.py` — `Payment`

## 3. Init

`POST /api/payments/subscription/init` (auth master).

С `calculation_id`:

- пересчёт split под lock `UserBalance`;
- если `card_portion ≈ 0` → `requires_payment=false` (клиент идёт в apply-free/balance), Payment может не создаваться;
- иначе создаётся `Payment(status=pending, subscription_apply_status=pending)`, metadata scheme_version=2 + soft-hold, URL Robokassa (или stub).

Поле `payment_source`: `web` | `mobile_app` (default `web`) — для return UX.

Source: `backend/routers/payments.py` — `init_subscription_payment`

## 4. `Payment.amount` при scheme_version=2

**CONFIRMED:** amount = **card_portion** (не полная цена пакета).

Source:

- `backend/routers/payments.py` — `init_subscription_payment`
- `backend/utils/subscription_payment_split.py` — `compute_subscription_payment_split`

## 5. ResultURL

`POST /api/payments/robokassa/result` — единственный backend-путь, который **применяет** подписку после карты.

Последовательность (CONFIRMED):

1. Проверка подписи (`utils/robokassa` / passwords по mode/test).
2. Поиск `Payment` по `robokassa_invoice_id`.
3. Сверка суммы; mismatch → `failed` + release hold.
4. Если уже `paid`+`applied`+`subscription_id` → идемпотентный `OK{InvId}`.
5. **Phase 1:** `status=paid`, идемпотентный DEPOSIT(card) на баланс (`subscription_deposit_applied`).
6. **Phase 2:** debit points при необходимости, создать `Subscription`, finalize hold, `move_available_to_reserve`, `subscription_apply_status=applied`.
7. Ответ вида `OK{InvId}` (в т.ч. если phase2 упал — paid уже зафиксирован; apply=`failed`).

Source: `backend/routers/payments.py` — `robokassa_result`

Stub: `GET /api/payments/robokassa/stub-complete` вызывает result и редиректит на success/fail.

## 6. SuccessURL и FailURL

Браузерные URL (обычно `/payment/success`, `/payment/failed`) — **только UX**: public-status, toast/Metrika/deeplink CTA.

Они **не** применяют подписку на backend.

Source: `frontend/src/pages/PaymentSuccess.jsx`, `PaymentFailed.jsx`; env names `ROBOKASSA_SUCCESS_URL`, `ROBOKASSA_FAIL_URL` в `backend/settings.py`

## 7. Public status

`GET /api/payments/public-status?payment=` или `?invoice_id=`

Read-only: `status`, `subscription_apply_status`, `payment_source`.

Source: `backend/routers/payments.py` — `get_payment_public_status`; `backend/tests/test_payment_public_status.py`

## 8. Web / mobile return

Открытие оплаты и return UX различаются (web SPA vs mobile deeplink).
Канон успеха на backend: `paid` + `applied`. Различие клиентского verify — в [money-flows.md](../Domain/subscriptions-billing/money-flows.md#web--mobile-verify-drift-сводка).

Source: `frontend/src/utils/paymentPublicStatus.js`; `mobile/src/utils/paymentPublicStatus.ts`; `frontend/src/utils/paymentReturnFlow.js`

## 9. `payment_source`

Хранится на `Payment`; отдаётся в public-status. **Не** ветвит split, hold, deposit amount, apply, daily charge.

Source: `backend/models.py` — `Payment.payment_source`; init/public-status

## 10. Legacy без `calculation_id`

Init может создать Payment на полную сумму без `scheme_version=2` / soft-hold. Deposit semantics в ResultURL для legacy отличаются (полная сумма vs card_portion).

Source:

- `backend/routers/payments.py` — `init_subscription_payment`
- `backend/utils/subscription_payment_deposit.py` — `resolve_subscription_deposit_amount`

## 11. Deposit endpoints → 410

- `POST /api/payments/deposit/init`
- `POST /api/balance/deposit`

Пополнение баланса вне subscription-flow отключено.

Source:

- `backend/routers/payments.py` — `init_deposit_payment`
- `backend/routers/balance.py` — `deposit_balance_endpoint`

## 12. Имена env (без значений)

Из `backend/settings.py` (и prod example):
`ROBOKASSA_MODE`, `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD_1/2`, `ROBOKASSA_IS_TEST`, `ROBOKASSA_TEST_PASSWORD_1/2`, `ROBOKASSA_RESULT_URL`, `ROBOKASSA_SUCCESS_URL`, `ROBOKASSA_FAIL_URL`, `ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST`, плюс `DATABASE_URL` / frontend base для URL.

## 13. Failure recovery

| Ситуация | Поведение |
|----------|-----------|
| Pending истёк | cleanup → `expired` + release hold |
| Apply failed после paid | деньги на балансе; admin `retry-subscription-apply` |
| Failed signature/amount | `failed` + release hold |

Source:

- `backend/services/expired_payments_cleanup.py`
- `backend/routers/admin.py` — `retry_subscription_apply`

## 14. Security / idempotency assumptions

- Подпись ResultURL обязательна.
- Идемпотентность: applied early-return; deposit flag; payment/balance locks.
- Secrets не логировать и не коммитить.
- Stub mode — только осознанная конфигурация окружения.

## 15. Sources (сводка)

- `backend/routers/payments.py` — `init_subscription_payment`, `robokassa_result`, `get_payment_public_status`, `init_deposit_payment`
- `backend/utils/robokassa.py`
- `backend/utils/subscription_payment_split.py`
- `backend/utils/subscription_payment_deposit.py`
- `backend/settings.py`
- `backend/tests/test_subscription_mixed_payment.py`, `test_subscription_payment_deposit.py`, `test_payment_public_status.py`
