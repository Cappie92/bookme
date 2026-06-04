"""Daily charge: списание уменьшает total balance и reserved, available не меняется."""
from datetime import datetime, timedelta

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
from utils.balance_utils import (
    get_user_available_balance,
    get_user_reserved_total,
    process_daily_charge,
)


def _master_with_reserve(db):
    user = User(
        email="reserve_charge@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79007770301",
        full_name="Reserve Charge",
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
        end_date=now + timedelta(days=180),
        price=6120.0,
        daily_rate=34.0,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.flush()
    db.add(
        SubscriptionReservation(
            user_id=user.id,
            subscription_id=sub.id,
            reserved_amount=6120.0,
        )
    )
    db.add(UserBalance(user_id=user.id, balance=50000.0, currency="RUB"))
    db.commit()
    db.refresh(sub)
    return user, sub


def test_daily_charge_decreases_balance_and_reserved_keeps_available(db):
    """balance 50k / reserved 6120 / available 43880 → charge 34 → 49966 / 6086 / 43880."""
    user, sub = _master_with_reserve(db)
    charge_date = datetime.utcnow().date()

    assert get_user_reserved_total(db, user.id) == 6120.0
    assert get_user_available_balance(db, user.id) == 43880.0

    result = process_daily_charge(db, sub.id, charge_date)
    assert result["success"] is True, result
    assert result["charge_amount"] == 34
    assert result["balance_before"] == 50000.0
    assert result["balance_after"] == 49966.0
    assert result["reserved_before"] == 6120.0
    assert result["reserved_after"] == 6086.0
    assert result["available_after"] == 43880.0

    db.expire_all()
    assert get_user_reserved_total(db, user.id) == 6086.0
    assert get_user_available_balance(db, user.id) == 43880.0
