"""Cleanup plan: daily_subscription_charges только для smoke subscription_ids."""
from datetime import date, datetime, timedelta

from auth import get_password_hash
from models import (
    DailyChargeStatus,
    DailySubscriptionCharge,
    Master,
    Subscription,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)

import scripts.reseed_prod_stats_smoke as smoke_reseed


def _user_sub_charge(db, *, email: str, phone: str):
    user = User(
        email=email,
        hashed_password=get_password_hash("test123"),
        phone=phone,
        full_name="Sub",
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
        price=6120.0,
        daily_rate=34.0,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.flush()
    charge = DailySubscriptionCharge(
        subscription_id=sub.id,
        charge_date=date.today(),
        amount=34.0,
        daily_rate=34.0,
        balance_before=50000.0,
        balance_after=49966.0,
        status=DailyChargeStatus.SUCCESS,
    )
    db.add(charge)
    db.commit()
    db.refresh(charge)
    return user, sub, charge


def test_cleanup_plan_daily_charges_only_for_smoke_subscriptions(db):
    smoke_user, smoke_sub, smoke_charge = _user_sub_charge(
        db,
        email=smoke_reseed.EMAIL_MASTER,
        phone=smoke_reseed.PHONE_MASTER,
    )
    _other_user, other_sub, other_charge = _user_sub_charge(
        db,
        email="other-not-smoke@test.com",
        phone="+79009999999",
    )

    plan = smoke_reseed.collect_cleanup_plan(db)

    assert smoke_sub.id in plan["subscriptions"]
    assert smoke_charge.id in plan["daily_subscription_charges"]
    assert other_charge.id not in plan["daily_subscription_charges"]
    assert other_sub.id not in plan["subscriptions"]


def test_cleanup_deletes_smoke_daily_charges(db):
    _smoke_user, smoke_sub, smoke_charge = _user_sub_charge(
        db,
        email=smoke_reseed.EMAIL_MASTER,
        phone=smoke_reseed.PHONE_MASTER,
    )
    _other_user, other_sub, other_charge = _user_sub_charge(
        db,
        email="other-not-smoke2@test.com",
        phone="+79008888888",
    )

    smoke_charge_id = smoke_charge.id
    other_charge_id = other_charge.id

    smoke_reseed.cleanup_smoke_data(db)
    db.commit()
    db.expire_all()

    assert db.query(DailySubscriptionCharge).filter(DailySubscriptionCharge.id == smoke_charge_id).first() is None
    assert db.query(DailySubscriptionCharge).filter(DailySubscriptionCharge.id == other_charge_id).first() is not None
    assert db.query(Subscription).filter(Subscription.id == other_sub.id).first() is not None
