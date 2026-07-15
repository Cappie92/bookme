"""Тесты истории оплат подписки и расчёта monthly_price."""
from __future__ import annotations

from datetime import datetime, timedelta

from auth import get_password_hash
from models import (
    Master,
    Payment,
    PromoCampaign,
    PromoCampaignStatus,
    PromoCampaignType,
    PromoCategory,
    PromoCodeStatus,
    PromoEngineCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromoRewardGrant,
    PromoRewardGrantStatus,
    PromoRewardRecipientRole,
    PromoRewardType,
    PromoReferrerType,
    Subscription,
    SubscriptionPlan,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    SubscriptionPriceSnapshot,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from constants import duration_months_to_days
from utils.payment_public_id import persist_new_robokassa_payment
from services.promo_engine import create_subscription_points_credit
from utils.subscription_payment_display import (
    build_payment_history_item,
    build_subscription_payment_history,
    compute_monthly_price_from_package,
    reconstruct_sequential_subscription_periods,
    resolve_subscription_payment_billing,
)


def _create_master_user(db, *, phone="+79001118888", email="history@test.com"):
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="History Master",
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
    return user


def _create_plan(db):
    plan = SubscriptionPlan(
        name="PremiumHistory",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1160.0,
        price_3months=1070.0,
        price_6months=950.0,
        price_12months=850.0,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=3,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _auth(client, user):
    resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _create_snapshot(
    db,
    user_id,
    plan_id,
    *,
    duration_months=3,
    total_price=3210.0,
    final_price=3210.0,
    points_used=0,
    price_before_points=None,
):
    pbp = price_before_points if price_before_points is not None else total_price
    snapshot = SubscriptionPriceSnapshot(
        user_id=user_id,
        plan_id=plan_id,
        duration_months=duration_months,
        price_1month=1160.0,
        price_3months=1070.0,
        price_6months=950.0,
        price_12months=850.0,
        total_price=total_price,
        monthly_price=1070.0,
        daily_price=107.0,
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=final_price,
        price_before_points=pbp,
        subscription_points_used=points_used,
        upgrade_type="immediate",
        expires_at=datetime.utcnow() + timedelta(minutes=20),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def _create_subscription(db, user_id, plan_id, *, price=3210.0, duration_days=90):
    now = datetime.utcnow()
    sub = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        end_date=now + timedelta(days=duration_days),
        price=price,
        daily_rate=36,
        is_active=True,
        auto_renewal=False,
        plan_id=plan_id,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _create_payment(
    db,
    user_id,
    plan_id,
    snapshot,
    subscription,
    *,
    status="paid",
    amount=3210.0,
    apply_status="applied",
    metadata=None,
):
    meta = {
        "calculation_id": snapshot.id if snapshot else None,
        "selected_duration": snapshot.duration_months if snapshot else None,
        "plan_name": "PremiumHistory",
        "plan_display_name": "Premium",
    }
    if metadata is not None:
        meta.update(metadata)
    if meta.get("calculation_id") is None:
        meta.pop("calculation_id", None)
    if meta.get("selected_duration") is None:
        meta.pop("selected_duration", None)

    payment = Payment(
        user_id=user_id,
        amount=amount,
        status=status,
        payment_type="subscription",
        robokassa_invoice_id="tmp",
        plan_id=plan_id,
        subscription_id=subscription.id,
        subscription_apply_status=apply_status,
        paid_at=datetime.utcnow() if status == "paid" else None,
        payment_metadata=meta,
    )
    payment = persist_new_robokassa_payment(db, payment)
    db.commit()
    db.refresh(payment)
    return payment


def test_monthly_price_3210_for_3_months_is_1070():
    assert compute_monthly_price_from_package(3210, 3) == 1070.0


def test_monthly_price_3500_for_3_months_is_1166_67_not_rounded_up():
    assert compute_monthly_price_from_package(3500, 3) == 1166.67


def test_resolve_billing_with_points(db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    snapshot = _create_snapshot(
        db,
        user.id,
        plan.id,
        total_price=3210.0,
        final_price=2729.0,
        points_used=481,
    )
    subscription = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, subscription, amount=2729.0)

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["duration_months"] == 3
    assert billing["package_value"] == 3210.0
    assert billing["amount_paid"] == 2729.0
    assert billing["points_used"] == 481
    assert billing["monthly_price"] == 1070.0
    assert billing["is_successful_purchase"] is True


def test_subscription_history_returns_only_current_master(client, db):
    user_a = _create_master_user(db, phone="+79001118881", email="a@test.com")
    user_b = _create_master_user(db, phone="+79001118882", email="b@test.com")
    plan = _create_plan(db)

    for user in (user_a, user_b):
        snapshot = _create_snapshot(db, user.id, plan.id)
        sub = _create_subscription(db, user.id, plan.id)
        _create_payment(db, user.id, plan.id, snapshot, sub)

    headers_a = _auth(client, user_a)
    response = client.get("/api/payments/subscription/history", headers=headers_a)

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["plan_display_name"] == "Premium"
    assert rows[0]["monthly_price"] == 1070
    assert rows[0]["is_successful_purchase"] is True


def test_subscription_history_includes_pending_and_failed_separately(client, db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)

    paid = _create_payment(db, user.id, plan.id, snapshot, sub, status="paid", apply_status="applied")
    paid_public_id = paid.public_id
    pending_snapshot = _create_snapshot(db, user.id, plan.id)
    pending = _create_payment(
        db, user.id, plan.id, pending_snapshot, sub, status="pending", apply_status="pending", amount=1160.0
    )
    pending_public_id = pending.public_id
    failed_snapshot = _create_snapshot(db, user.id, plan.id)
    failed = _create_payment(
        db, user.id, plan.id, failed_snapshot, sub, status="failed", apply_status="failed", amount=1160.0
    )
    failed_public_id = failed.public_id

    headers = _auth(client, user)
    rows = client.get("/api/payments/subscription/history", headers=headers).json()

    assert len(rows) == 3
    successful = [r for r in rows if r["is_successful_purchase"]]
    other = [r for r in rows if not r["is_successful_purchase"]]
    assert len(successful) == 1
    assert successful[0]["public_id"] == paid_public_id
    assert {r["public_id"] for r in other} == {pending_public_id, failed_public_id}
    assert all(r["status"] in ("pending", "failed") for r in other)


def test_my_subscription_includes_monthly_price(client, db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)
    _create_payment(db, user.id, plan.id, snapshot, sub)

    headers = _auth(client, user)
    response = client.get("/api/subscriptions/my", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["monthly_price"] == 1070
    assert data["package_value"] == 3210.0
    assert data["duration_months"] == 3


def test_build_payment_history_item(db):
    user = _create_master_user(db, phone="+79001118883", email="item@test.com")
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id, final_price=2729.0, points_used=481)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)

    item = build_payment_history_item(db, payment)

    assert item["amount_paid"] == 2729.0
    assert item["points_used"] == 481
    assert item["package_value"] == 3210.0
    assert item["monthly_price"] == 1070


def test_legacy_payment_uses_metadata_duration_not_short_subscription_dates(db):
    user = _create_master_user(db, phone="+79001118884", email="legacy-meta@test.com")
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    # Подписка ошибочно выглядит как 1 месяц по датам
    sub = _create_subscription(db, user.id, plan.id, price=3210.0, duration_days=30)
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        snapshot,
        sub,
        metadata={"selected_duration": 3, "calculation_id": None},
    )

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["duration_months"] == 3
    assert billing["package_value"] == 3210.0
    assert billing["monthly_price"] == 1070.0


def test_legacy_payment_without_snapshot_infers_duration_from_package_value(db):
    user = _create_master_user(db, phone="+79001118885", email="legacy-package@test.com")
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id, price=3210.0, duration_days=30)
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        metadata={"plan_name": "PremiumHistory", "plan_display_name": "Premium"},
    )

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["duration_months"] == 3
    assert billing["monthly_price"] == 1070.0


def test_history_api_legacy_3_month_purchase_shows_1070_per_month(client, db):
    user = _create_master_user(db, phone="+79001118886", email="legacy-api@test.com")
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id, price=3210.0, duration_days=30)
    _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        metadata={"selected_duration": 3, "plan_display_name": "Premium"},
    )

    headers = _auth(client, user)
    rows = client.get("/api/payments/subscription/history", headers=headers).json()

    assert len(rows) == 1
    assert rows[0]["duration_months"] == 3
    assert rows[0]["package_value"] == 3210.0
    assert rows[0]["monthly_price"] == 1070.0


def test_pending_payment_without_snapshot_uses_payment_amount_as_package_value(db):
    user = _create_master_user(db, phone="+79001118887", email="pending-legacy@test.com")
    plan = _create_plan(db)
    payment = Payment(
        user_id=user.id,
        amount=1160.0,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="tmp",
        plan_id=plan.id,
        subscription_id=None,
        subscription_apply_status="pending",
        payment_metadata={"selected_duration": 1, "plan_display_name": "Premium"},
    )
    payment = persist_new_robokassa_payment(db, payment)
    db.commit()
    db.refresh(payment)

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["package_value"] == 1160.0
    assert billing["amount_paid"] == 1160.0
    assert billing["duration_months"] == 1
    assert billing["monthly_price"] == 1160.0


def _create_minimal_redemption(db, master, *, code_suffix="1"):
    campaign = PromoCampaign(
        name=f"History Promo {code_suffix}",
        promo_category=PromoCategory.ACQUISITION,
        type=PromoCampaignType.ADMIN_CAMPAIGN,
        status=PromoCampaignStatus.ACTIVE,
        beneficiary_reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_config={"percent": 10},
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    code = PromoEngineCode(
        campaign_id=campaign.id,
        code=f"HIST{code_suffix}",
        status=PromoCodeStatus.ACTIVE,
    )
    db.add(code)
    db.commit()
    db.refresh(code)
    redemption = PromoRedemption(
        campaign_id=campaign.id,
        code_id=code.id,
        redeemer_user_id=master.user_id,
        redeemer_master_id=master.id,
        promo_category_snapshot=PromoCategory.ACQUISITION,
        campaign_type_snapshot=PromoCampaignType.ADMIN_CAMPAIGN,
        referrer_type_snapshot=PromoReferrerType.SYSTEM,
        status=PromoRedemptionStatus.REDEEMED,
        beneficiary_reward_type_snapshot=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_value_snapshot={"percent": 10},
    )
    db.add(redemption)
    db.commit()
    db.refresh(redemption)
    return redemption


def _attach_promo_grant_with_ledger(db, master, payment, redemption, *, points=321):
    grant = PromoRewardGrant(
        redemption_id=redemption.id,
        recipient_master_id=master.id,
        recipient_role=PromoRewardRecipientRole.BENEFICIARY,
        reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        points_amount=points,
        status=PromoRewardGrantStatus.APPLIED,
        payment_id=payment.id,
    )
    db.add(grant)
    db.flush()
    entry = create_subscription_points_credit(
        db,
        master_id=master.id,
        amount=points,
        source_type=SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
        source_id=grant.id,
        description="Promo reward",
    )
    grant.subscription_points_ledger_id = entry.id if entry else None
    db.commit()
    return grant


def test_legacy_wrong_subscription_price_uses_plan_total_not_monthly_price(db):
    user = _create_master_user(db, phone="+79001119901", email="wrong-price@test.com")
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id, price=1160.0, duration_days=30)
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        amount=3210.0,
        metadata={"selected_duration": 3, "plan_display_name": "Premium"},
    )

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["duration_months"] == 3
    assert billing["package_value"] == 3210.0
    assert billing["monthly_price"] == 1070.0


def test_legacy_payment_amount_3210_with_wrong_subscription_price_1160(db):
    """386,67 ₽/мес = 1160/3 — regression: package_value must be 3210 from payment.amount."""
    user = _create_master_user(db, phone="+79001119902", email="legacy-amount@test.com")
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id, price=1160.0, duration_days=90)
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        amount=3210.0,
        metadata={"selected_duration": 3},
    )

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["package_value"] == 3210.0
    assert billing["monthly_price"] == 1070.0


def test_partial_points_2729_plus_481_resolves_package_3210(db):
    user = _create_master_user(db, phone="+79001119903", email="partial-points@test.com")
    plan = _create_plan(db)
    snapshot = _create_snapshot(
        db,
        user.id,
        plan.id,
        total_price=2729.0,
        final_price=2729.0,
        points_used=481,
        price_before_points=3210.0,
    )
    sub = _create_subscription(db, user.id, plan.id, price=3210.0)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["package_value"] == 3210.0
    assert billing["monthly_price"] == 1070.0
    assert billing["amount_paid"] == 2729.0
    assert billing["points_spent"] == 481


def test_points_spent_only_from_snapshot(db):
    user = _create_master_user(db, phone="+79001118889", email="spent@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id, final_price=2729.0, points_used=481)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )
    db.commit()

    item = build_payment_history_item(db, payment)

    assert item["points_spent"] == 481
    assert item["points_earned"] == 0
    assert item["points_used"] == 481


def test_points_spent_prefers_ledger_over_snapshot(db):
    user = _create_master_user(db, phone="+79001118898", email="spent-ledger@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id, final_price=2729.0, points_used=999)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )
    db.commit()

    item = build_payment_history_item(db, payment)

    assert item["points_spent"] == 481


def test_points_earned_only_from_applied_grant(db):
    user = _create_master_user(db, phone="+79001118890", email="earned@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub)
    redemption = _create_minimal_redemption(db, master, code_suffix="EARN")
    _attach_promo_grant_with_ledger(db, master, payment, redemption, points=321)

    item = build_payment_history_item(db, payment)

    assert item["points_spent"] == 0
    assert item["points_earned"] == 321


def test_points_earned_fallback_to_grant_without_ledger(db):
    user = _create_master_user(db, phone="+79001118897", email="earned-fallback@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub)
    redemption = _create_minimal_redemption(db, master, code_suffix="FALL")
    db.add(
        PromoRewardGrant(
            redemption_id=redemption.id,
            recipient_master_id=master.id,
            recipient_role=PromoRewardRecipientRole.BENEFICIARY,
            reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
            points_amount=321,
            status=PromoRewardGrantStatus.APPLIED,
            payment_id=payment.id,
        )
    )
    db.commit()

    item = build_payment_history_item(db, payment)

    assert item["points_earned"] == 321


def test_points_spent_and_earned_together(db):
    user = _create_master_user(db, phone="+79001118891", email="both-points@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id, final_price=2729.0, points_used=481)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)
    redemption = _create_minimal_redemption(db, master, code_suffix="BOTH")
    _attach_promo_grant_with_ledger(db, master, payment, redemption, points=321)
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )
    db.commit()

    item = build_payment_history_item(db, payment)

    assert item["points_spent"] == 481
    assert item["points_earned"] == 321


def test_points_grant_and_ledger_not_doubled(db):
    user = _create_master_user(db, phone="+79001118899", email="no-double-grant-ledger@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub)
    redemption = _create_minimal_redemption(db, master, code_suffix="NODBL2")
    _attach_promo_grant_with_ledger(db, master, payment, redemption, points=321)

    item = build_payment_history_item(db, payment)

    assert item["points_earned"] == 321


def test_points_spent_fallback_to_ledger_when_snapshot_missing(db):
    user = _create_master_user(db, phone="+79001118892", email="ledger-spent@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        metadata={"selected_duration": 1},
    )
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )
    db.commit()

    item = build_payment_history_item(db, payment)

    assert item["points_spent"] == 481
    assert item["points_earned"] == 0


def test_points_earned_not_doubled_for_single_payment(db):
    user = _create_master_user(db, phone="+79001118893", email="no-double-earned@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub)
    redemption = _create_minimal_redemption(db, master, code_suffix="NODBL")
    _attach_promo_grant_with_ledger(db, master, payment, redemption, points=321)

    first = build_payment_history_item(db, payment)
    second = build_payment_history_item(db, payment)

    assert first["points_earned"] == 321
    assert second["points_earned"] == 321


def test_reconstruct_four_sequential_one_month_periods(db):
    user = _create_master_user(db, phone="+79001118894", email="seq4@test.com")
    plan = _create_plan(db)
    base = datetime(2026, 1, 1, 12, 0, 0)
    payments = []
    for index in range(4):
        snapshot = _create_snapshot(db, user.id, plan.id, duration_months=1, total_price=1160.0, final_price=1160.0)
        sub = _create_subscription(
            db,
            user.id,
            plan.id,
            price=1160.0,
            duration_days=30,
        )
        sub.start_date = base
        sub.end_date = base + timedelta(days=30)
        db.commit()
        payment = _create_payment(
            db,
            user.id,
            plan.id,
            snapshot,
            sub,
            amount=1160.0,
            metadata={"selected_duration": 1},
        )
        payment.paid_at = base + timedelta(days=index * 31)
        db.commit()
        payments.append(payment)

    items = build_subscription_payment_history(db, payments)
    successful = sorted(
        [item for item in items if item["is_successful_purchase"]],
        key=lambda item: item["payment_id"],
    )

    assert len(successful) == 4
    for index in range(3):
        prev_end = successful[index]["subscription_end_date"]
        next_start = successful[index + 1]["subscription_start_date"]
        assert next_start - prev_end == timedelta(days=1)
    period_days = duration_months_to_days(1)
    for item in successful:
        assert (
            item["subscription_end_date"] - item["subscription_start_date"]
        ).days == period_days - 1


def test_three_month_purchase_after_active_starts_at_previous_end(db):
    user = _create_master_user(db, phone="+79001118895", email="seq3m@test.com")
    plan = _create_plan(db)
    base = datetime(2026, 7, 12, 10, 0, 0)

    snap1 = _create_snapshot(db, user.id, plan.id, duration_months=1, total_price=1160.0, final_price=1160.0)
    sub1 = _create_subscription(db, user.id, plan.id, price=1160.0, duration_days=30)
    sub1.start_date = base
    sub1.end_date = base + timedelta(days=30)
    db.commit()
    pay1 = _create_payment(db, user.id, plan.id, snap1, sub1, amount=1160.0, metadata={"selected_duration": 1})
    pay1.paid_at = base
    db.commit()

    snap2 = _create_snapshot(db, user.id, plan.id, duration_months=3, total_price=3210.0, final_price=3210.0)
    sub2 = _create_subscription(db, user.id, plan.id, price=3210.0, duration_days=90)
    sub2.start_date = base + timedelta(days=5)
    sub2.end_date = base + timedelta(days=95)
    db.commit()
    pay2 = _create_payment(db, user.id, plan.id, snap2, sub2, amount=3210.0, metadata={"selected_duration": 3})
    pay2.paid_at = base + timedelta(days=5)
    db.commit()

    items = build_subscription_payment_history(db, [pay2, pay1])
    by_payment = {item["payment_id"]: item for item in items}

    assert by_payment[pay1.id]["subscription_start_date"] == base
    assert (
        by_payment[pay2.id]["subscription_start_date"]
        - by_payment[pay1.id]["subscription_end_date"]
    ) == timedelta(days=1)
    assert (
        by_payment[pay2.id]["subscription_end_date"]
        - by_payment[pay2.id]["subscription_start_date"]
    ).days == duration_months_to_days(3) - 1


def test_history_api_includes_points_and_period_fields(client, db):
    user = _create_master_user(db, phone="+79001118896", email="api-points@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id, final_price=2729.0, points_used=481)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)
    redemption = _create_minimal_redemption(db, master, code_suffix="APIPT")
    _attach_promo_grant_with_ledger(db, master, payment, redemption, points=321)
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )
    db.commit()

    headers = _auth(client, user)
    rows = client.get("/api/payments/subscription/history", headers=headers).json()

    assert len(rows) == 1
    assert rows[0]["package_value"] == 3210.0
    assert rows[0]["monthly_price"] == 1070.0
    assert rows[0]["points_spent"] == 481
    assert rows[0]["points_earned"] == 321
    assert rows[0]["subscription_start_date"] is not None
    assert rows[0]["subscription_end_date"] is not None


def test_my_subscription_legacy_without_snapshot_partial_points(client, db):
    """payment_id=5 prod case: no snapshot, 2729+481, subscription.price=3210."""
    user = _create_master_user(db, phone="+79001119999", email="my-legacy@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id, price=3210.0, duration_days=90)
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        amount=2729.0,
        metadata={"selected_duration": 3, "plan_display_name": "Premium"},
    )
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )
    db.commit()

    headers = _auth(client, user)
    response = client.get("/api/subscriptions/my", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["duration_months"] == 3
    assert data["package_value"] == 3210.0
    assert data["monthly_price"] == 1070.0
    assert data["amount_paid"] == 2729.0
    assert data["points_used"] == 481
    assert data["points_spent"] == 481


def test_my_subscription_one_month_package(client, db):
    user = _create_master_user(db, phone="+79001119998", email="my-1m@test.com")
    plan = _create_plan(db)
    sub = _create_subscription(db, user.id, plan.id, price=1160.0, duration_days=30)
    _create_payment(
        db,
        user.id,
        plan.id,
        None,
        sub,
        amount=1160.0,
        metadata={"selected_duration": 1},
    )

    headers = _auth(client, user)
    response = client.get("/api/subscriptions/my", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["duration_months"] == 1
    assert data["package_value"] == 1160.0
    assert data["monthly_price"] == 1160.0
    assert data["amount_paid"] == 1160.0


def _create_pending_subscription(db, user_id, plan_id, *, sub_id_hint=None, price=1160.0):
    """PENDING подписка с будущим start_date (after_expiry / не применена)."""
    now = datetime.utcnow()
    sub = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.PENDING,
        start_date=now + timedelta(days=95),
        end_date=now + timedelta(days=125),
        price=price,
        daily_rate=39.0,
        is_active=False,
        auto_renewal=False,
        plan_id=plan_id,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def test_my_subscription_active_not_mixed_with_newer_pending_subscriptions(client, db):
    """
    ACTIVE №20 (3 мес) + три PENDING №21–23 (1 мес, 1160) с paid/applied payment.
    Billing только от подписки №20 и payment №5.
    """
    user = _create_master_user(db, phone="+79001118877", email="my-mixed@test.com")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    plan = _create_plan(db)
    now = datetime.utcnow()

    active_sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=5),
        end_date=now + timedelta(days=85),
        price=3210.0,
        daily_rate=36.0,
        is_active=True,
        auto_renewal=False,
        plan_id=plan.id,
    )
    db.add(active_sub)
    db.flush()

    active_payment = _create_payment(
        db,
        user.id,
        plan.id,
        None,
        active_sub,
        amount=2729.0,
        metadata={"selected_duration": 3, "plan_display_name": "Premium"},
    )
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=481,
            remaining_amount=0,
            direction=SubscriptionPointsDirection.DEBIT,
            source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
            source_id=active_payment.id,
            status=SubscriptionPointsStatus.ACTIVE,
        )
    )

    for _ in range(3):
        pending_sub = _create_pending_subscription(db, user.id, plan.id, price=1160.0)
        _create_payment(
            db,
            user.id,
            plan.id,
            None,
            pending_sub,
            amount=1160.0,
            metadata={"selected_duration": 1},
        )

    db.commit()
    active_sub_id = active_sub.id

    headers = _auth(client, user)
    response = client.get("/api/subscriptions/my", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == active_sub_id
    assert data["duration_months"] == 3
    assert data["package_value"] == 3210.0
    assert data["monthly_price"] == 1070.0
    assert data["amount_paid"] == 2729.0
    assert data["points_used"] == 481
    assert data["points_spent"] == 481


def test_my_subscription_active_without_payment_does_not_use_pending_payment(client, db):
    """ACTIVE без linked payment — billing null, даже если у PENDING есть paid/applied payment."""
    user = _create_master_user(db, phone="+79001118876", email="my-no-pay@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()

    active_sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=5),
        end_date=now + timedelta(days=25),
        price=3210.0,
        daily_rate=36.0,
        is_active=True,
        auto_renewal=False,
        plan_id=plan.id,
    )
    db.add(active_sub)
    db.flush()

    pending_sub = _create_pending_subscription(db, user.id, plan.id, price=1160.0)
    _create_payment(
        db,
        user.id,
        plan.id,
        None,
        pending_sub,
        amount=1160.0,
        metadata={"selected_duration": 1},
    )
    db.commit()
    active_sub_id = active_sub.id

    headers = _auth(client, user)
    response = client.get("/api/subscriptions/my", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == active_sub_id
    assert data["duration_months"] is None
    assert data["package_value"] is None
    assert data["monthly_price"] is None
    assert data["amount_paid"] is None
    assert data["points_used"] is None
    assert data["points_spent"] is None
