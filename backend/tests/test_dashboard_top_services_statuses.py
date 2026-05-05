from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from sqlalchemy import insert

from models import Booking, BookingStatus, Master, Service, ServiceType, User, UserRole, master_services


def _auth_headers(client, phone: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def master_user(db):
    user = User(
        email="top_svc@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001112244",
        full_name="Top Services",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(user_id=user.id, bio="", experience_years=0, can_work_independently=False)
    db.add(master)
    db.commit()
    db.refresh(master)
    return user, master


def test_top_services_consistent_status_filter(client, db, master_user):
    """
    /api/master/dashboard/stats:
    - "по записям" и "по доходу" должны учитывать одинаковый набор не-отменённых статусов
    - отменённые не должны попадать в топ
    """
    user, master = master_user
    # Подстраховка: взять Master, привязанный к текущей сессии (на некоторых фикстурах объект может быть detached)
    master = db.query(Master).filter(Master.id == master.id).first()
    assert master is not None
    headers = _auth_headers(client, user.phone, "test123")

    svc_ok = Service(name="OK", description="", duration=30, price=1000, service_type=ServiceType.SUBSCRIPTION)
    svc_cancel = Service(name="CANCEL", description="", duration=30, price=2000, service_type=ServiceType.SUBSCRIPTION)
    db.add_all([svc_ok, svc_cancel])
    db.commit()
    db.refresh(svc_ok)
    db.refresh(svc_cancel)
    svc_ok_id = svc_ok.id
    svc_cancel_id = svc_cancel.id
    # Привязка услуг к мастеру через association table master_services (без ORM relationship, чтобы избежать detached)
    db.execute(insert(master_services).values(master_id=master.id, service_id=svc_ok_id))
    db.execute(insert(master_services).values(master_id=master.id, service_id=svc_cancel_id))
    db.commit()

    now = datetime.utcnow()
    # OK service: 4 записи в разных "живых" статусах
    ok_statuses = [
        BookingStatus.CREATED.value,
        BookingStatus.AWAITING_CONFIRMATION.value,
        BookingStatus.CONFIRMED.value,
        BookingStatus.COMPLETED.value,
    ]
    for i, st in enumerate(ok_statuses):
        db.add(
            Booking(
                client_id=None,
                    service_id=svc_ok_id,
                master_id=master.id,
                start_time=now + timedelta(days=i + 1),
                end_time=now + timedelta(days=i + 1, minutes=30),
                status=st,
                payment_amount=1000.0,
            )
        )

    # CANCEL service: много отменённых — не должны попасть в топ ни по записям, ни по доходу
    cancel_statuses = [
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
    ]
    for i, st in enumerate(cancel_statuses):
        db.add(
            Booking(
                client_id=None,
                    service_id=svc_cancel_id,
                master_id=master.id,
                start_time=now + timedelta(days=10 + i),
                end_time=now + timedelta(days=10 + i, minutes=30),
                status=st,
                payment_amount=9999.0,
            )
        )
    db.commit()

    r = client.get("/api/master/dashboard/stats?period=week&offset=0", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()

    top_b = data.get("top_services_by_bookings") or []
    top_e = data.get("top_services_by_earnings") or []

    # OK service должен быть в топе по записям и доходу
    ok_b = next((x for x in top_b if x.get("service_id") == svc_ok_id), None)
    ok_e = next((x for x in top_e if x.get("service_id") == svc_ok_id), None)
    assert ok_b is not None
    assert ok_e is not None
    assert int(ok_b.get("booking_count") or 0) == 4
    assert float(ok_e.get("total_earnings") or 0) == pytest.approx(4000.0)

    # CANCEL service не должен попасть
    assert all(x.get("service_id") != svc_cancel_id for x in top_b)
    assert all(x.get("service_id") != svc_cancel_id for x in top_e)

