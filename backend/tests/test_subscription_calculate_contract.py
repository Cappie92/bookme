from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models import Subscription, SubscriptionPlan, SubscriptionReservation, SubscriptionStatus, SubscriptionType, User


def _create_plan(db: Session, name: str, prices: dict) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name=name,
        display_name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=float(prices["1"]),
        price_3months=float(prices["3"]),
        price_6months=float(prices["6"]),
        price_12months=float(prices["12"]),
        features={"service_functions": [1, 2, 3, 4, 5, 6]},
        limits={},
        is_active=True,
        display_order=1,
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
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(days=20),
        price=plan.price_1month,  # не критично для теста calculate
        daily_rate=float(plan.price_1month) / 30.0,
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


def test_calculate_immediate_upgrade_applies_credit_from_reserved(client, db: Session, master_auth_headers, test_master: User):
    """MVP: credit=0, final_price=total_price. Проверяем immediate upgrade, расчёт total/final."""
    basic = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350})
    pro = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _create_active_subscription_with_reserve(db, test_master, basic, reserved_amount=200.0)

    resp = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": pro.id, "duration_months": 1, "upgrade_type": "immediate"},
        headers=master_auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_price"] == 1000
    assert data["final_price"] == 1000  # MVP: credit=0
    assert data["upgrade_type"] == "immediate"
    assert data.get("is_downgrade") in (False, None)


def test_calculate_after_expiry_credit_is_zero(client, db: Session, master_auth_headers, test_master: User):
    basic = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350})
    pro = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _create_active_subscription_with_reserve(db, test_master, basic, reserved_amount=200.0)

    resp = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": pro.id, "duration_months": 1, "upgrade_type": "after_expiry"},
        headers=master_auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_price"] == 1000
    assert data["final_price"] == 1000
    assert data["upgrade_type"] == "after_expiry"


def test_calculate_downgrade_forces_after_expiry_by_period_price(client, db: Session, master_auth_headers, test_master: User):
    basic = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350})
    pro = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _create_active_subscription_with_reserve(db, test_master, pro, reserved_amount=200.0)

    resp = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": basic.id, "duration_months": 3, "upgrade_type": "immediate"},
        headers=master_auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("is_downgrade") is True
    assert data.get("forced_upgrade_type") == "after_expiry"
    assert data["upgrade_type"] == "after_expiry"
    assert data["final_price"] == data["total_price"]

