"""Выборка активных подписок для daily charge — enum-safe (status ACTIVE/active)."""
from datetime import datetime, timedelta

from sqlalchemy import text

from auth import get_password_hash
from models import (
    Master,
    Subscription,
    SubscriptionReservation,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserBalance,
    UserRole,
)
from services.daily_charges import (
    catch_up_missed_daily_charges,
    get_active_subscription_ids_for_date,
    process_all_daily_charges,
)


def _seed_active_master_sub(db, *, status_value: str = "active"):
    user = User(
        email=f"dc_sel_{status_value}@test.com",
        hashed_password=get_password_hash("test123"),
        phone=f"+7900777{abs(hash(status_value)) % 10000:04d}",
        full_name="DC Sel",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Master(user_id=user.id, bio="", experience_years=0, city="Москва"))
    db.commit()

    now = datetime.utcnow()
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now,
        end_date=now + timedelta(days=30),
        price=1000.0,
        daily_rate=10.0,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.flush()

    if status_value != SubscriptionStatus.ACTIVE.value:
        db.execute(
            text("UPDATE subscriptions SET status = :st WHERE id = :id"),
            {"st": status_value, "id": sub.id},
        )

    db.add(SubscriptionReservation(user_id=user.id, subscription_id=sub.id, reserved_amount=500.0))
    db.add(UserBalance(user_id=user.id, balance=10000.0, currency="RUB"))
    db.commit()
    db.refresh(sub)
    return sub


def test_get_active_subscription_ids_with_active_status(db):
    sub = _seed_active_master_sub(db, status_value="active")
    ids = get_active_subscription_ids_for_date(db, datetime.utcnow().date())
    assert sub.id in ids


def test_get_active_subscription_ids_with_ACTIVE_uppercase_in_db(db):
    sub = _seed_active_master_sub(db, status_value="ACTIVE")
    ids = get_active_subscription_ids_for_date(db, datetime.utcnow().date())
    assert sub.id in ids


def test_process_all_daily_charges_does_not_raise_on_uppercase_status(db):
    sub = _seed_active_master_sub(db, status_value="ACTIVE")
    result = process_all_daily_charges(datetime.utcnow().date(), db=db)
    assert "error" not in result or not result.get("error")
    assert result.get("total_subscriptions", 0) >= 1
    assert sub.id in get_active_subscription_ids_for_date(db, datetime.utcnow().date())


def test_catch_up_does_not_raise_on_uppercase_status(db):
    _seed_active_master_sub(db, status_value="ACTIVE")
    result = catch_up_missed_daily_charges(datetime.utcnow().date(), db=db)
    assert isinstance(result.get("errors"), list)
