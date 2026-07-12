"""Списание subscription points при покупке/продлении тарифа мастера."""
from __future__ import annotations

import os
import tempfile
import threading
import time
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from auth import get_password_hash
from database import Base
from models import (
    Master,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    SubscriptionPriceSnapshot,
    SubscriptionType,
    User,
    UserRole,
)
from services.promo_engine import create_subscription_points_credit, get_subscription_points_balance
from services.subscription_points import (
    InsufficientSubscriptionPointsError,
    apply_snapshot_subscription_points_debit,
    debit_subscription_points_fifo,
)
from utils.robokassa import generate_result_signature, get_robokassa_config


def _create_plan(db: Session, name: str, prices: dict, display_order: int = 2) -> int:
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
    return int(plan.id)


def _setup_master_user(db: Session, *, phone: str = "+79005550101", email: str = "sp@test.com") -> tuple[User, int]:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="SP Master",
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
    return user, int(master.id)


def _auth_headers(client, user: User) -> dict:
    resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _credit_points(db: Session, master_id: int, amount: int, source_id: int = 1) -> None:
    create_subscription_points_credit(
        db,
        master_id,
        amount,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        source_id,
        "test credit",
    )
    db.commit()


def _calculate(
    client,
    headers: dict,
    plan_id: int,
    *,
    months: int = 1,
    points: int = 0,
) -> dict:
    resp = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": months,
            "upgrade_type": "immediate",
            "subscription_points_to_use": points,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _init_payment(client, headers: dict, plan_id: int, calc_id: int, months: int = 1) -> dict:
    resp = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": months,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc_id,
            "enable_auto_renewal": False,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _robokassa_result(client, db: Session, payment_id: int) -> str:
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    assert payment is not None
    cfg = get_robokassa_config()
    invoice_id = payment.robokassa_invoice_id
    sig = generate_result_signature(float(payment.amount), invoice_id, cfg["password_2"])
    resp = client.post(
        "/api/payments/robokassa/result",
        data={
            "OutSum": f"{payment.amount:.2f}",
            "InvId": payment.robokassa_invoice_id,
            "SignatureValue": sig,
        },
    )
    assert resp.status_code == 200
    return resp.text


def _debit_count(db: Session, master_id: int) -> int:
    return (
        db.query(SubscriptionPointsLedger)
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
        )
        .count()
    )


@pytest.fixture
def robokassa_stub(monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()


def test_calculate_partial_points_redemption(client, db: Session):
    user, master_id = _setup_master_user(db)
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 300)
    headers = _auth_headers(client, user)

    data = _calculate(client, headers, plan_id, points=300)

    assert data["price_before_points"] == 1000
    assert data["subscription_points_available"] == 300
    assert data["subscription_points_used"] == 300
    assert data["final_price"] == 700
    assert data["requires_payment"] is True


def test_calculate_full_points_no_payment(client, db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550102", email="sp2@test.com")
    plan_id = _create_plan(db, "Basic", {"1": 500, "3": 450, "6": 400, "12": 350}, display_order=1)
    _credit_points(db, master_id, 800)
    headers = _auth_headers(client, user)

    data = _calculate(client, headers, plan_id, points=800)

    assert data["subscription_points_used"] == 500
    assert data["final_price"] == 0
    assert data["requires_payment"] is False


def test_calculate_insufficient_balance_caps_usage(client, db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550103", email="sp3@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 100)
    headers = _auth_headers(client, user)

    data = _calculate(client, headers, plan_id, points=500)

    assert data["subscription_points_used"] == 100
    assert data["final_price"] == 900


def test_calculate_cannot_spend_more_than_price(client, db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550104", email="sp4@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 5000)
    headers = _auth_headers(client, user)

    data = _calculate(client, headers, plan_id, points=5000)

    assert data["subscription_points_used"] == 1000
    assert data["final_price"] == 0


def test_calculate_rejects_negative_points(client, db: Session):
    user, _master_id = _setup_master_user(db, phone="+79005550105", email="sp5@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    headers = _auth_headers(client, user)

    resp = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 1,
            "upgrade_type": "immediate",
            "subscription_points_to_use": -1,
        },
    )
    assert resp.status_code == 400


def test_pending_payment_does_not_debit_points(client, db: Session, robokassa_stub):
    user, master_id = _setup_master_user(db, phone="+79005550106", email="sp6@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 200)
    headers = _auth_headers(client, user)

    calc = _calculate(client, headers, plan_id, points=200)
    init = _init_payment(client, headers, plan_id, calc["calculation_id"])

    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = int(payment.id)
    assert payment.status == "pending"
    assert get_subscription_points_balance(db, master_id) == 200
    assert _debit_count(db, master_id) == 0


def test_paid_applied_creates_single_debit(client, db: Session, robokassa_stub):
    user, master_id = _setup_master_user(db, phone="+79005550107", email="sp7@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 250)
    headers = _auth_headers(client, user)

    calc = _calculate(client, headers, plan_id, points=250)
    init = _init_payment(client, headers, plan_id, calc["calculation_id"])
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = int(payment.id)

    _robokassa_result(client, db, payment_id)
    db.expire_all()

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    assert payment.status == "paid"
    assert payment.subscription_apply_status == "applied"
    assert _debit_count(db, master_id) == 1
    assert get_subscription_points_balance(db, master_id) == 0

    debit = (
        db.query(SubscriptionPointsLedger)
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
        )
        .one()
    )
    assert debit.amount == 250
    assert debit.source_type == SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT
    assert debit.source_id == payment_id


def test_duplicate_result_url_does_not_double_debit(client, db: Session, robokassa_stub):
    user, master_id = _setup_master_user(db, phone="+79005550108", email="sp8@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 100)
    headers = _auth_headers(client, user)

    calc = _calculate(client, headers, plan_id, points=100)
    init = _init_payment(client, headers, plan_id, calc["calculation_id"])
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = int(payment.id)

    _robokassa_result(client, db, payment_id)
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    assert _debit_count(db, master_id) == 1
    assert get_subscription_points_balance(db, master_id) == 0


def test_apply_upgrade_free_debits_points_without_robokassa(client, db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550109", email="sp9@test.com")
    plan_id = _create_plan(db, "Basic", {"1": 400, "3": 360, "6": 320, "12": 280}, display_order=1)
    _credit_points(db, master_id, 400)
    headers = _auth_headers(client, user)

    calc = _calculate(client, headers, plan_id, points=400)
    assert calc["final_price"] == 0

    resp = client.post(
        "/api/subscriptions/apply-upgrade-free",
        headers=headers,
        json={"calculation_id": calc["calculation_id"]},
    )
    assert resp.status_code == 200, resp.text
    assert _debit_count(db, master_id) == 1
    assert get_subscription_points_balance(db, master_id) == 0
    assert db.query(Subscription).filter(Subscription.user_id == user.id).count() == 1

    debit = (
        db.query(SubscriptionPointsLedger)
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
        )
        .one()
    )
    assert debit.source_type == SubscriptionPointsSourceType.SUBSCRIPTION_SNAPSHOT
    assert debit.source_id == calc["calculation_id"]

    resp2 = client.post(
        "/api/subscriptions/apply-upgrade-free",
        headers=headers,
        json={"calculation_id": calc["calculation_id"]},
    )
    assert resp2.status_code == 200
    assert resp2.json().get("already_applied") is True
    assert _debit_count(db, master_id) == 1


def _create_points_snapshot(
    db: Session,
    user_id: int,
    plan_id: int,
    *,
    final_price: float,
    points_used: int,
    price_before_points: float,
) -> SubscriptionPriceSnapshot:
    snap = SubscriptionPriceSnapshot(
        user_id=user_id,
        plan_id=plan_id,
        duration_months=1,
        price_1month=1000.0,
        price_3months=900.0,
        price_6months=800.0,
        price_12months=700.0,
        total_price=price_before_points,
        monthly_price=price_before_points,
        daily_price=price_before_points / 30.0,
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=final_price,
        price_before_points=price_before_points,
        subscription_points_used=points_used,
        upgrade_type="immediate",
        is_downgrade=False,
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def test_concurrent_snapshots_cannot_spend_same_points_twice(db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550110", email="sp10@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 300)

    snap_a = _create_points_snapshot(
        db, user.id, plan_id, final_price=700.0, points_used=300, price_before_points=1000.0
    )
    snap_b = _create_points_snapshot(
        db, user.id, plan_id, final_price=700.0, points_used=300, price_before_points=1000.0
    )

    apply_snapshot_subscription_points_debit(
        db, snapshot=snap_a, master_id=master_id, payment_id=9001
    )
    db.commit()

    with pytest.raises(InsufficientSubscriptionPointsError):
        apply_snapshot_subscription_points_debit(
            db, snapshot=snap_b, master_id=master_id, payment_id=9002
        )

    assert _debit_count(db, master_id) == 1
    assert get_subscription_points_balance(db, master_id) == 0


def test_sqlite_concurrent_debit_two_sessions_only_one_succeeds():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False, "timeout": 30},
            poolclass=NullPool,
        )
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

        setup_db = SessionLocal()
        user, master_id = _setup_master_user(setup_db, phone="+79005550120", email="sp20@test.com")
        _credit_points(setup_db, master_id, 481)
        plan_id = _create_plan(setup_db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
        snap_a = _create_points_snapshot(
            setup_db, user.id, plan_id, final_price=700.0, points_used=300, price_before_points=1000.0
        )
        snap_b = _create_points_snapshot(
            setup_db, user.id, plan_id, final_price=700.0, points_used=300, price_before_points=1000.0
        )
        snap_a_id = int(snap_a.id)
        snap_b_id = int(snap_b.id)
        setup_db.close()

        barrier = threading.Barrier(2)
        results: list[str] = []
        lock = threading.Lock()

        def _worker(snapshot_id: int, payment_id: int) -> None:
            session = SessionLocal()
            try:
                snapshot = session.query(SubscriptionPriceSnapshot).filter(
                    SubscriptionPriceSnapshot.id == snapshot_id
                ).one()
                barrier.wait(timeout=5)
                apply_snapshot_subscription_points_debit(
                    session,
                    snapshot=snapshot,
                    master_id=master_id,
                    payment_id=payment_id,
                )
                session.commit()
                with lock:
                    results.append("ok")
            except InsufficientSubscriptionPointsError:
                session.rollback()
                with lock:
                    results.append("insufficient")
            except Exception as exc:
                session.rollback()
                with lock:
                    results.append(f"error:{type(exc).__name__}:{exc}")
            finally:
                session.close()

        t1 = threading.Thread(target=_worker, args=(snap_a_id, 10001))
        t2 = threading.Thread(target=_worker, args=(snap_b_id, 10002))
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        verify_db = SessionLocal()
        try:
            assert results.count("ok") == 1, results
            assert results.count("insufficient") == 1, results
            assert _debit_count(verify_db, master_id) == 1
            assert get_subscription_points_balance(verify_db, master_id) == 181
            credits = (
                verify_db.query(SubscriptionPointsLedger)
                .filter(
                    SubscriptionPointsLedger.master_id == master_id,
                    SubscriptionPointsLedger.direction == SubscriptionPointsDirection.CREDIT,
                )
                .all()
            )
            assert all(int(c.remaining_amount or 0) >= 0 for c in credits)
        finally:
            verify_db.close()
            engine.dispose()
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_debit_unique_constraint_prevents_duplicate_source(db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550121", email="sp21@test.com")
    _credit_points(db, master_id, 100)

    first = debit_subscription_points_fifo(
        db,
        master_id=master_id,
        points=50,
        source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
        source_id=555,
        description="first",
    )
    db.commit()
    second = debit_subscription_points_fifo(
        db,
        master_id=master_id,
        points=50,
        source_type=SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
        source_id=555,
        description="second",
    )
    assert first is not None
    assert second is not None
    assert first.id == second.id
    assert _debit_count(db, master_id) == 1


def test_stale_snapshot_fails_after_points_spent_by_other_payment(client, db: Session, robokassa_stub):
    user, master_id = _setup_master_user(db, phone="+79005550122", email="sp22@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 300)
    headers = _auth_headers(client, user)

    calc_a = _calculate(client, headers, plan_id, points=300)
    calc_b = _calculate(client, headers, plan_id, points=300)

    init_a = _init_payment(client, headers, plan_id, calc_a["calculation_id"])
    time.sleep(1.1)
    init_b = _init_payment(client, headers, plan_id, calc_b["calculation_id"])

    payment_a_id = int(db.query(Payment).filter(Payment.public_id == init_a["payment"]).one().id)
    payment_b_id = int(db.query(Payment).filter(Payment.public_id == init_b["payment"]).one().id)

    _robokassa_result(client, db, payment_a_id)
    db.expire_all()

    assert _debit_count(db, master_id) == 1
    assert get_subscription_points_balance(db, master_id) == 0

    _robokassa_result(client, db, payment_b_id)
    db.expire_all()

    payment_b = db.query(Payment).filter(Payment.id == payment_b_id).one()
    assert payment_b.subscription_apply_status == "failed"
    assert _debit_count(db, master_id) == 1
    assert get_subscription_points_balance(db, master_id) == 0


def test_promo_credit_remaining_after_debit_fifo(client, db: Session, robokassa_stub):
    user, master_id = _setup_master_user(db, phone="+79005550111", email="sp11@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})

    older = create_subscription_points_credit(
        db,
        master_id,
        120,
        SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
        101,
        "promo older",
    )
    newer = create_subscription_points_credit(
        db,
        master_id,
        80,
        SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
        102,
        "promo newer",
    )
    older_id = int(older.id)
    newer_id = int(newer.id)
    db.commit()

    headers = _auth_headers(client, user)
    calc = _calculate(client, headers, plan_id, points=150)
    init = _init_payment(client, headers, plan_id, calc["calculation_id"])
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = int(payment.id)
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    older = db.query(SubscriptionPointsLedger).filter(SubscriptionPointsLedger.id == older_id).one()
    newer = db.query(SubscriptionPointsLedger).filter(SubscriptionPointsLedger.id == newer_id).one()
    assert older.remaining_amount == 0
    assert older.status == SubscriptionPointsStatus.CONSUMED
    assert newer.remaining_amount == 50
    assert newer.status == SubscriptionPointsStatus.ACTIVE
    assert get_subscription_points_balance(db, master_id) == 50


def test_web_and_mobile_calculate_return_same_amounts(client, db: Session):
    user, master_id = _setup_master_user(db, phone="+79005550112", email="sp12@test.com")
    plan_id = _create_plan(db, "Pro", {"1": 1000, "3": 900, "6": 800, "12": 700})
    _credit_points(db, master_id, 350)
    headers = _auth_headers(client, user)

    payload = {
        "plan_id": plan_id,
        "duration_months": 3,
        "upgrade_type": "immediate",
        "subscription_points_to_use": 350,
    }
    web = client.post("/api/subscriptions/calculate", headers=headers, json=payload)
    mobile = client.post(
        "/api/subscriptions/calculate",
        headers={**headers, "X-Client-Platform": "mobile_app"},
        json={**payload, "payment_source": "mobile_app"},
    )
    assert web.status_code == 200
    assert mobile.status_code == 200
    w, m = web.json(), mobile.json()
    for key in (
        "price_before_points",
        "subscription_points_available",
        "subscription_points_used",
        "final_price",
        "requires_payment",
        "total_price",
    ):
        assert w[key] == m[key], key
