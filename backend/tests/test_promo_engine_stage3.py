from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    Master,
    Payment,
    PromoCampaign,
    PromoCampaignType,
    PromoCategory,
    PromoEngineCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromoRewardGrant,
    PromoRewardRecipientRole,
    PromoRewardType,
    Subscription,
    SubscriptionPlan,
    SubscriptionPriceSnapshot,
    SubscriptionPointsLedger,
    SubscriptionType,
    SubscriptionStatus,
    User,
    UserBalance,
    UserRole,
)
from services.promo_engine import apply_promo_rewards_for_first_payment, create_pending_redemption


def _login(client, phone: str):
    response = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.json()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _master(db: Session, idx: int, *, full_name: str = None, phone: str = None) -> Master:
    user = User(
        email=f"stage3-{idx}@example.com",
        phone=phone or f"+79993000{idx:03d}",
        full_name=full_name or f"Stage Three {idx}",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(
        user_id=user.id,
        bio="",
        experience_years=0,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


def _campaign(db: Session, *, type_=PromoCampaignType.ADMIN_CAMPAIGN, owner_master_id=None) -> PromoCampaign:
    campaign = PromoCampaign(
        name=f"Stage3 {type_.value}",
        promo_category=PromoCategory.ACQUISITION,
        type=type_,
        owner_master_id=owner_master_id,
        eligible_subscription_type=SubscriptionType.MASTER,
        first_payment_only=True,
        beneficiary_reward_config={"1": 0, "3": 15, "6": 20, "12": 25},
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def _code(db: Session, campaign: PromoCampaign, code: str) -> PromoEngineCode:
    promo_code = PromoEngineCode(campaign_id=campaign.id, code=code)
    db.add(promo_code)
    db.commit()
    db.refresh(promo_code)
    return promo_code


def _subscription(db: Session, master: Master, months: int, plan_id=None) -> Subscription:
    now = datetime.utcnow()
    sub = Subscription(
        user_id=master.user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        end_date=now + timedelta(days={1: 30, 3: 90, 6: 180, 12: 360}[months]),
        price=1000 * months,
        daily_rate=33,
        payment_period="month",
        is_active=True,
        auto_renewal=False,
        plan_id=plan_id,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _paid_payment(db: Session, master: Master, *, amount: float, months: int, status="paid", apply_status="applied", with_subscription=True) -> Payment:
    sub = _subscription(db, master, months) if with_subscription else None
    payment = Payment(
        user_id=master.user_id,
        subscription_id=sub.id if sub else None,
        amount=amount,
        status=status,
        payment_type="subscription",
        robokassa_invoice_id=f"stage3-{master.id}-{amount}-{months}-{status}-{apply_status}-{with_subscription}",
        subscription_apply_status=apply_status,
        paid_at=datetime.utcnow() if status == "paid" else None,
        payment_metadata={"selected_duration": months},
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def test_admin_campaign_rewards_are_applied_idempotently(db: Session):
    master = _master(db, 1)
    campaign = _campaign(db)
    _code(db, campaign, "ADMIN3")
    redemption = create_pending_redemption(db, master.id, "ADMIN3")
    db.commit()
    payment = _paid_payment(db, master, amount=1000, months=3)

    result = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()
    again = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()

    db.refresh(redemption)
    assert result.applied is True
    assert result.beneficiary_points == 150
    assert result.referrer_points == 0
    assert redemption.status == PromoRedemptionStatus.REDEEMED
    assert redemption.first_payment_id == payment.id
    assert db.query(PromoRewardGrant).count() == 1
    assert db.query(SubscriptionPointsLedger).count() == 1
    assert db.query(SubscriptionPointsLedger).first().amount == 150
    assert again.reason == "already_applied"
    assert db.query(PromoRewardGrant).count() == 1
    assert db.query(SubscriptionPointsLedger).count() == 1


def test_master_referral_rewards_and_trace(db: Session, client):
    referrer = _master(db, 2, full_name="Анна Смирнова", phone="+79991234567")
    invited = _master(db, 3, full_name="Мария Иванова", phone="+79997654321")
    campaign = _campaign(db, type_=PromoCampaignType.MASTER_REFERRAL, owner_master_id=referrer.id)
    _code(db, campaign, "REF3")
    create_pending_redemption(db, invited.id, "REF3")
    db.commit()
    payment = _paid_payment(db, invited, amount=1000, months=3)

    result = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()

    assert result.beneficiary_points == 150
    assert result.referrer_points == 150
    assert db.query(PromoRewardGrant).count() == 2
    assert db.query(SubscriptionPointsLedger).count() == 2
    referrer_grant = (
        db.query(PromoRewardGrant)
        .filter(PromoRewardGrant.recipient_role == PromoRewardRecipientRole.REFERRER)
        .first()
    )
    assert referrer_grant.recipient_master_id == referrer.id

    response = client.get("/api/master/subscription-points", headers=_login(client, referrer.user.phone))
    assert response.status_code == 200, response.json()
    item = response.json()["items"][0]
    assert item["description"] == "Бонусные баллы за приглашение мастера"
    assert item["promo"]["recipient_role"] == "referrer"
    assert item["promo"]["invited_master_name_masked"] == "Мария И."
    assert item["promo"]["invited_master_phone_masked"] == "+7 999 ***-**-21"


@pytest.mark.parametrize(
    ("months", "beneficiary_percent", "beneficiary_points", "referrer_points"),
    [(1, 0, 0, 0), (3, 15, 150, 150), (6, 20, 200, 150), (12, 25, 250, 150)],
)
def test_period_rules_for_referral(db: Session, months, beneficiary_percent, beneficiary_points, referrer_points):
    referrer = _master(db, 10 + months)
    invited = _master(db, 20 + months)
    campaign = _campaign(db, type_=PromoCampaignType.MASTER_REFERRAL, owner_master_id=referrer.id)
    _code(db, campaign, f"PERIOD{months}")
    redemption = create_pending_redemption(db, invited.id, f"PERIOD{months}")
    db.commit()
    payment = _paid_payment(db, invited, amount=1000, months=months)

    result = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()
    db.refresh(redemption)

    assert redemption.status == PromoRedemptionStatus.REDEEMED
    assert redemption.first_payment_period_months == months
    assert result.beneficiary_points == beneficiary_points
    assert result.referrer_points == referrer_points
    assert db.query(PromoRewardGrant).count() == (0 if months == 1 else 2)
    assert db.query(SubscriptionPointsLedger).count() == (0 if months == 1 else 2)


def test_payment_guards_do_not_create_rewards(db: Session):
    for idx, kwargs, reason in [
        (31, {"status": "failed", "apply_status": "failed"}, "payment_not_applied"),
        (32, {"status": "paid", "apply_status": "pending"}, "payment_not_applied"),
        (33, {"status": "paid", "apply_status": "applied", "with_subscription": False}, "payment_not_applied"),
    ]:
        master = _master(db, idx)
        campaign = _campaign(db)
        _code(db, campaign, f"GUARD{idx}")
        create_pending_redemption(db, master.id, f"GUARD{idx}")
        db.commit()
        payment = _paid_payment(db, master, amount=1000, months=3, **kwargs)

        result = apply_promo_rewards_for_first_payment(db, payment.id)
        db.commit()

        assert result.reason == reason

    assert db.query(PromoRewardGrant).count() == 0
    assert db.query(SubscriptionPointsLedger).count() == 0


def test_not_first_payment_guard(db: Session):
    master = _master(db, 40)
    _paid_payment(db, master, amount=500, months=1)
    campaign = _campaign(db)
    code = _code(db, campaign, "LATE3")
    db.add(
        PromoRedemption(
            campaign_id=campaign.id,
            code_id=code.id,
            redeemer_user_id=master.user_id,
            redeemer_master_id=master.id,
            promo_category_snapshot=PromoCategory.ACQUISITION,
            campaign_type_snapshot=PromoCampaignType.ADMIN_CAMPAIGN,
            status=PromoRedemptionStatus.PENDING_FIRST_PAYMENT,
            beneficiary_reward_type_snapshot=PromoRewardType.SUBSCRIPTION_POINTS,
        )
    )
    db.commit()
    payment = _paid_payment(db, master, amount=1000, months=3)

    result = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()

    assert result.reason == "not_first_payment"
    assert db.query(PromoRewardGrant).count() == 0


def test_existing_grant_without_ledger_is_completed_on_retry(db: Session):
    master = _master(db, 50)
    campaign = _campaign(db)
    _code(db, campaign, "PARTIAL3")
    redemption = create_pending_redemption(db, master.id, "PARTIAL3")
    db.commit()
    payment = _paid_payment(db, master, amount=1000, months=3)
    db.add(
        PromoRewardGrant(
            redemption_id=redemption.id,
            recipient_master_id=master.id,
            recipient_role=PromoRewardRecipientRole.BENEFICIARY,
            points_amount=150,
            status="pending",
            payment_id=payment.id,
        )
    )
    db.commit()

    result = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()

    assert result.grants_created == 0
    assert result.ledger_entries_created == 1
    assert db.query(PromoRewardGrant).count() == 1
    assert db.query(SubscriptionPointsLedger).count() == 1


def _plan(db: Session) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name="Stage3 Balance Plan",
        display_name="Stage3 Balance Plan",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000,
        price_3months=1000,
        price_6months=1000,
        price_12months=1000,
        features={},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def test_balance_apply_creates_paid_payment_and_rewards(client, db: Session):
    master = _master(db, 60)
    db.add(UserBalance(user_id=master.user_id, balance=5000, currency="RUB"))
    plan = _plan(db)
    campaign = _campaign(db)
    _code(db, campaign, "BAL3")
    create_pending_redemption(db, master.id, "BAL3")
    now = datetime.utcnow()
    snapshot = SubscriptionPriceSnapshot(
        user_id=master.user_id,
        plan_id=plan.id,
        duration_months=3,
        price_1month=1000,
        price_3months=1000,
        price_6months=1000,
        price_12months=1000,
        total_price=3000,
        monthly_price=1000,
        daily_price=34,
        reserved_balance=0,
        credit_amount=0,
        final_price=3000,
        upgrade_type="immediate",
        is_downgrade=False,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    response = client.post(
        "/api/subscriptions/apply-upgrade-balance",
        json={"calculation_id": snapshot.id},
        headers=_login(client, master.user.phone),
    )

    assert response.status_code == 200, response.json()
    payment = db.query(Payment).filter(Payment.robokassa_invoice_id == f"balance-{snapshot.id}-{master.user_id}").first()
    assert payment is not None
    assert payment.status == "paid"
    assert payment.subscription_apply_status == "applied"
    assert db.query(PromoRewardGrant).count() == 1
    assert db.query(SubscriptionPointsLedger).first().amount == 450
