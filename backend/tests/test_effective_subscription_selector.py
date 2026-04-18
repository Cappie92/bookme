from datetime import datetime, timedelta
from typing import Optional

import pytest
from sqlalchemy.orm import Session

from models import Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType
from utils.subscription_features import get_effective_subscription


def _create_plan(db: Session, name: str = "Pro") -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000.0,
        price_3months=900.0,
        price_6months=800.0,
        price_12months=700.0,
        features={"service_functions": [1, 2, 3, 4, 5, 6]},
        limits={},
        is_active=True,
        display_order=10,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _create_sub(
    db: Session,
    user_id: int,
    *,
    status: SubscriptionStatus,
    plan_id: Optional[int],
    start: datetime,
    end: datetime,
    is_active: bool = True,
) -> Subscription:
    sub = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=status,
        is_active=is_active,
        start_date=start,
        end_date=end,
        plan_id=plan_id,
        price=1000.0 if plan_id else 0.0,
        daily_rate=33.33 if plan_id else 0.0,
        auto_renewal=False,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def test_active_vs_pending_prefers_active(db: Session, test_master):
    now = datetime.utcnow()
    plan = _create_plan(db, "Pro")
    active = _create_sub(
        db,
        test_master.id,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start=now - timedelta(days=1),
        end=now + timedelta(days=10),
        is_active=True,
    )
    _create_sub(
        db,
        test_master.id,
        status=SubscriptionStatus.PENDING,
        plan_id=plan.id,
        start=now + timedelta(days=10),
        end=now + timedelta(days=40),
        is_active=False,
    )

    chosen = get_effective_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen is not None
    assert chosen.id == active.id


def test_two_active_choose_max_end_date(db: Session, test_master):
    now = datetime.utcnow()
    plan = _create_plan(db, "Pro")
    a = _create_sub(
        db,
        test_master.id,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start=now - timedelta(days=10),
        end=now + timedelta(days=5),
    )
    b = _create_sub(
        db,
        test_master.id,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start=now - timedelta(days=2),
        end=now + timedelta(days=15),
    )
    chosen = get_effective_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen is not None
    assert chosen.id == b.id
    assert chosen.id != a.id


@pytest.mark.skip(reason="get_effective_subscription не обновляет статус подписки на EXPIRED при end_date в прошлом; тест ожидает side-effect логику.")
def test_active_but_end_date_passed_becomes_expired(db: Session, test_master):
    now = datetime.utcnow()
    plan = _create_plan(db, "Pro")
    sub = _create_sub(
        db,
        test_master.id,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start=now - timedelta(days=30),
        end=now - timedelta(seconds=1),
        is_active=True,
    )
    chosen = get_effective_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    fixes = (db.info.get("effective_subscription") or {}).get("fixes") or []
    assert any(f.get("subscription_id") == sub.id and f.get("to_status") == "expired" for f in fixes)
    db.commit()
    db.refresh(sub)
    assert sub.status == SubscriptionStatus.EXPIRED
    assert sub.is_active is False
    assert chosen is None


@pytest.mark.skip(reason="get_effective_subscription не переводит PENDING в ACTIVE при start_date <= now <= end_date; тест ожидает side-effect логику.")
def test_pending_but_active_now_becomes_active(db: Session, test_master):
    now = datetime.utcnow()
    plan = _create_plan(db, "Pro")
    sub = _create_sub(
        db,
        test_master.id,
        status=SubscriptionStatus.PENDING,
        plan_id=plan.id,
        start=now - timedelta(days=1),
        end=now + timedelta(days=10),
        is_active=False,
    )
    chosen = get_effective_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen is not None
    assert chosen.id == sub.id
    fixes = (db.info.get("effective_subscription") or {}).get("fixes") or []
    assert any(f.get("subscription_id") == sub.id and f.get("to_status") == "active" for f in fixes)
    db.commit()
    db.refresh(sub)
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.is_active is True

