---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# Promo

Канон двух одновременно mounted promo-контуров: legacy subscription promo codes и новый Promo Engine. Они используют разные таблицы и lifecycle и не являются aliases одного API.

## Legacy promo activation

`POST /api/promo-codes/activate` ищет `PromoCode`, проверяет active/expiry/use limit, отсутствие прежней активации пользователя и совместимость subscription type с ролью. Затем в одной transaction создаёт `PromoCodeActivation`, увеличивает `used_count` и создаёт либо обновляет найденную `Subscription` на бесплатный период.

Legacy admin CRUD и analytics находятся в core admin router и используют moderator permission dependencies на соответствующих handlers.

**Sources:** `backend/models.py` — `PromoCode`, `PromoCodeActivation`; `backend/routers/promo_codes.py`; promo-code handlers in `backend/routers/admin.py`; `backend/main.py` — mounted routers.

## Promo Engine lifecycle

Новый контур использует `PromoCampaign`, `PromoEngineCode`, `PromoRedemption`, `PromoRewardGrant` и `SubscriptionPointsLedger`.

Master применяет code до первой успешной SaaS-оплаты. Успешная проверка создаёт acquisition redemption в `PENDING_FIRST_PAYMENT`; она ещё не является наградой. После paid/applied first subscription payment billing path вызывает promo service, который:

1. проверяет payment, period и отсутствие более ранней успешной оплаты;
2. создаёт beneficiary/referrer grants по snapshot rules;
3. создаёт credit entries в subscription-points ledger;
4. связывает grants с ledger/payment;
5. переводит redemption в `REDEEMED`.

`PromoRewardGrant` имеет uniqueness по `(redemption_id, recipient_role)`. Это основной DB idempotency boundary выдачи каждой стороне. Subscription-points debit имеет отдельный partial unique source boundary в Billing.

**Sources:** `backend/models.py` — Promo Engine models and `SubscriptionPointsLedger`; `backend/services/promo_engine.py` — `create_pending_redemption`, `apply_promo_rewards_for_first_payment`; `backend/routers/payments.py`, `backend/routers/subscriptions.py`; `backend/tests/test_promo_engine_foundation.py`, `backend/tests/test_promo_engine_stage2.py`, `backend/tests/test_promo_engine_stage3.py`.

## Referral codes и API

Master routes:

- `GET /api/master/referral-code` возвращает referral representation, но при отсутствии code создаёт shared campaign/code и commits — это write-on-read;
- `POST /api/master/promo-code/apply` создаёт pending redemption;
- `GET /api/master/promo-code/current` возвращает current acquisition state;
- `GET /api/master/subscription-points` возвращает balance/history SaaS points.

Эти routes разрешены только active users с master/indie role и существующим `Master`. Web и mobile имеют клиентов этого API. Admin Promo Engine router имеет router-level `require_admin` и предоставляет campaign/code/redemption/grant/ledger views и mutations.

**Sources:** `backend/routers/promo_engine.py`; `backend/routers/admin_promo_engine.py`; `frontend/src/utils/promoEngineApi.js`; `mobile/src/services/api/promoEngine.ts`; `backend/main.py`.

## Границы

- Promo Engine владеет campaign eligibility, redemption и reward grants.
- Billing владеет применением subscription points к стоимости SaaS-подписки и итоговым payment/subscription state.
- Client Loyalty владеет скидками и баллами на услугу; Promo не пишет `LoyaltyTransaction`.
- Registration может сохранить pending promo redemption через общий Promo Engine service, но Identity не владеет reward lifecycle (`backend/routers/auth.py` — registration promo path).

Legacy/new coexistence и concurrency/selection gaps описаны в [Debt](client-crm-loyalty-promo-finance.md).
