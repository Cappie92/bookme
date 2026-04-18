from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from constants import duration_months_to_days
from models import (
    BalanceTransaction,
    Subscription,
    SubscriptionPlan,
    SubscriptionPriceSnapshot,
    SubscriptionReservation,
    SubscriptionStatus,
    SubscriptionType,
    TransactionType,
    UserBalance,
    User,
)


def _create_plan(db: Session, name: str, prices: dict, display_order: int) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name=name,
        display_name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=float(prices["1"]),
        price_3months=float(prices["3"]),
        price_6months=float(prices["6"]),
        price_12months=float(prices["12"]),
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=display_order,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _create_active_subscription_with_reserve(
    db: Session,
    user: User,
    plan: SubscriptionPlan,
    *,
    reserved_amount: float,
) -> Subscription:
    now = datetime.utcnow()
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=5),
        end_date=now + timedelta(days=25),
        price=float(plan.price_1month),
        daily_rate=float(plan.price_1month) / float(duration_months_to_days(1)),
        auto_renewal=False,
        payment_period="month",
        plan_id=plan.id,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    res = SubscriptionReservation(user_id=user.id, subscription_id=sub.id, reserved_amount=float(reserved_amount))
    db.add(res)
    db.commit()
    return sub


def _create_snapshot(
    db: Session,
    user: User,
    plan: SubscriptionPlan,
    *,
    months: int,
    total_price: float,
    final_price: float,
    upgrade_type: str,
    credit_amount: float,
    is_downgrade: bool = False,
    forced_upgrade_type=None,
) -> SubscriptionPriceSnapshot:
    now = datetime.utcnow()
    snap = SubscriptionPriceSnapshot(
        user_id=user.id,
        plan_id=plan.id,
        duration_months=int(months),
        price_1month=float(plan.price_1month),
        price_3months=float(plan.price_3months),
        price_6months=float(plan.price_6months),
        price_12months=float(plan.price_12months),
        total_price=float(total_price),
        monthly_price=float(total_price) / float(months),
        daily_price=float(total_price) / float(duration_months_to_days(months)),
        reserved_balance=0.0,
        credit_amount=float(credit_amount),
        final_price=float(final_price),
        upgrade_type=upgrade_type,
        is_downgrade=bool(is_downgrade),
        forced_upgrade_type=forced_upgrade_type,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def test_apply_upgrade_free_is_idempotent(client, db: Session, test_master: User, master_auth_headers):
    user_id = test_master.id
    basic = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350}, display_order=1)
    pro = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700}, display_order=3)

    _create_active_subscription_with_reserve(db, test_master, basic, reserved_amount=1000.0)
    snap = _create_snapshot(
        db,
        test_master,
        pro,
        months=1,
        total_price=1000.0,
        final_price=0.0,
        credit_amount=1000.0,
        upgrade_type="immediate",
    )
    snap_id = snap.id

    before = db.query(Subscription).filter(Subscription.user_id == user_id).count()

    r1 = client.post(
        "/api/subscriptions/apply-upgrade-free",
        json={"calculation_id": snap_id},
        headers=master_auth_headers,
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert body1["success"] is True
    assert body1["already_applied"] is False
    sub_id = body1["subscription_id"]

    after_first = db.query(Subscription).filter(Subscription.user_id == user_id).count()
    assert after_first == before + 1

    r2 = client.post(
        "/api/subscriptions/apply-upgrade-free",
        json={"calculation_id": snap_id},
        headers=master_auth_headers,
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["success"] is True
    assert body2["already_applied"] is True
    assert body2["subscription_id"] == sub_id

    after_second = db.query(Subscription).filter(Subscription.user_id == user_id).count()
    assert after_second == after_first  # не создаём вторую подписку


def test_apply_upgrade_free_rejects_downgrade_snapshot(client, db: Session, test_master: User, master_auth_headers):
    pro = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700}, display_order=3)
    basic = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350}, display_order=1)

    _create_active_subscription_with_reserve(db, test_master, pro, reserved_amount=1000.0)

    # специально подделываем snapshot как "immediate" но is_downgrade=True
    snap = _create_snapshot(
        db,
        test_master,
        basic,
        months=1,
        total_price=500.0,
        final_price=0.0,
        credit_amount=1000.0,
        upgrade_type="immediate",
        is_downgrade=True,
        forced_upgrade_type="after_expiry",
    )
    snap_id = snap.id

    r = client.post(
        "/api/subscriptions/apply-upgrade-free",
        json={"calculation_id": snap_id},
        headers=master_auth_headers,
    )
    assert r.status_code == 400
    assert "Downgrade" in r.json().get("detail", "")


def test_apply_upgrade_free_over_credit_caps_reserve_and_releases_extra(client, db: Session, test_master: User, master_auth_headers):
    """MVP: резерв не используется. apply-upgrade-free создаёт подписку и new_res с reserved_amount=0."""
    user_id = test_master.id
    basic = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350}, display_order=1)
    pro = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700}, display_order=3)

    old_sub = _create_active_subscription_with_reserve(db, test_master, basic, reserved_amount=1500.0)
    old_sub_id = old_sub.id
    ub = UserBalance(user_id=user_id, balance=1500.0, currency="RUB")
    db.add(ub)
    db.commit()

    snap = _create_snapshot(
        db,
        test_master,
        pro,
        months=1,
        total_price=1000.0,
        final_price=0.0,
        credit_amount=1500.0,
        upgrade_type="immediate",
    )
    snap_id = snap.id

    r1 = client.post(
        "/api/subscriptions/apply-upgrade-free",
        json={"calculation_id": snap_id},
        headers=master_auth_headers,
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert body1["already_applied"] is False
    new_sub_id = body1["subscription_id"]

    # MVP: new reserve = 0, резерв не используется
    new_res = db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id == new_sub_id).first()
    assert new_res is not None
    assert float(new_res.reserved_amount) == 0.0

    # old reserve не трогаем в apply-upgrade-free (резерв вне бизнес-логики)
    old_res = db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id == old_sub_id).first()
    assert old_res is not None
    ub2 = db.query(UserBalance).filter(UserBalance.user_id == user_id).first()
    assert ub2 is not None
    assert float(ub2.balance) == 1500.0

    # MVP: over-credit audit tx удалён (резерв не используется)
    r2 = client.post(
        "/api/subscriptions/apply-upgrade-free",
        json={"calculation_id": snap_id},
        headers=master_auth_headers,
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["already_applied"] is True

