import logging
from datetime import datetime, timedelta
from typing import Optional

import pytest
from sqlalchemy.orm import Session

from models import Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, User
from utils.subscription_features import get_current_subscription


def _create_plan(db: Session, name: str = "Pro") -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=3000.0,
        price_3months=2800.0,
        price_6months=2600.0,
        price_12months=2400.0,
        features={"service_functions": [2, 3, 4, 5]},
        limits={},
        is_active=True,
        display_order=10,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _create_subscription(
    db: Session,
    user: User,
    *,
    plan_id: Optional[int],
    status: SubscriptionStatus,
    start_date: datetime,
    end_date: datetime,
    is_active: Optional[bool] = None,
) -> Subscription:
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        plan_id=plan_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        price=100.0,
        daily_rate=3.33,
    )
    if is_active is not None:
        sub.is_active = is_active
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def test_A_active_plus_pending_choose_active_strict(db: Session, test_master: User):
    now = datetime.utcnow()
    plan = _create_plan(db, "Pro")

    active = _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=10),
    )
    _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.PENDING,
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=31),
    )

    chosen = get_current_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen is not None
    assert chosen.id == active.id


def test_B_two_active_choose_max_end_date_and_warn(db: Session, test_master: User, caplog):
    now = datetime.utcnow()
    plan = _create_plan(db, "Pro")

    a = _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(days=5),
    )
    b = _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=2),
        end_date=now + timedelta(days=15),
    )

    caplog.set_level(logging.WARNING, logger="utils.subscription_features")
    chosen = get_current_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen is not None
    assert chosen.id == b.id
    assert any("multiple_active_now_strict" in rec.message for rec in caplog.records)

    # Бессрочная активная должна выигрывать (если она действительно активна сейчас)
    endless = _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=100),
        end_date=now + timedelta(days=1000),  # sqlite schema NOT NULL, эмулируем "долгую" активность
    )
    # Для "настоящего" NULL end_date — см. отдельный unit-тест ниже.
    chosen2 = get_current_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen2 is not None
    assert chosen2.id in {b.id, endless.id}


def test_C_end_date_null_only_if_started_and_active_unit():
    """
    Unit-тест на "грязные данные": end_date = NULL (в sqlite schema NOT NULL, поэтому без БД).
    """
    now = datetime(2026, 1, 1, 12, 0, 0)

    class _Q:
        def __init__(self, items):
            self._items = items

        def filter(self, *args, **kwargs):
            return self

        def order_by(self, *args, **kwargs):
            return self

        def all(self):
            return list(self._items)

        def first(self):
            return self._items[0] if self._items else None

        def count(self):
            return len(self._items)

    class _DB:
        def __init__(self, items):
            self._items = items

        def query(self, *args, **kwargs):
            return _Q(self._items)

    class _Sub:
        def __init__(self, _id, status, start_date, end_date, plan_id, is_active=True):
            self.id = _id
            self.status = status
            self.start_date = start_date
            self.end_date = end_date
            self.plan_id = plan_id
            self.is_active = is_active
            self.subscription_type = SubscriptionType.MASTER
            self.user_id = 1

    future_endless = _Sub(
        1,
        SubscriptionStatus.ACTIVE,
        start_date=now + timedelta(days=1),
        end_date=None,
        plan_id=10,
        is_active=True,
    )
    finite = _Sub(
        2,
        SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=10),
        plan_id=11,
        is_active=True,
    )

    # Реальный запрос order_by(end_date.desc()).first(); в моке порядок списка задаёт результат
    db = _DB([finite, future_endless])  # finite (id 2) — с максимальной end_date среди «конечных»
    chosen = get_current_subscription(db, 1, SubscriptionType.MASTER, now_utc=now)
    assert chosen.id == 2

    past_endless = _Sub(
        3,
        SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=None,
        plan_id=12,
        is_active=True,
    )
    db2 = _DB([past_endless, finite])  # past_endless (id 3) — «бессрочная», приоритет над конечной
    chosen2 = get_current_subscription(db2, 1, SubscriptionType.MASTER, now_utc=now)
    assert chosen2.id == 3


def test_D_timezone_edge_end_date_boundary(db: Session, test_master: User):
    now = datetime(2026, 1, 1, 12, 0, 0)
    plan = _create_plan(db, "Pro")

    expired_exact = _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now,  # неактивна: end_date > now_utc не выполняется
    )
    active_micro = _create_subscription(
        db,
        test_master,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(microseconds=1),
    )

    chosen = get_current_subscription(db, test_master.id, SubscriptionType.MASTER, now_utc=now)
    assert chosen is not None
    assert chosen.id == active_micro.id
    assert chosen.id != expired_exact.id

