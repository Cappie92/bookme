"""Tests for create_completed_bookings: owner invariants, is_indie, salon_id.
Run with: ENVIRONMENT=development ENABLE_DEV_TESTDATA=1 pytest backend/tests/test_create_completed_bookings_owner.py
"""
import pytest


@pytest.fixture
def admin_user(db):
    """Admin user for dev endpoints."""
    from models import User, UserRole
    from auth import get_password_hash
    u = User(
        phone="+79031078685",
        email="admin@test.dev",
        hashed_password=get_password_hash("test123"),
        full_name="Admin",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def master_with_indie_and_services(db):
    """Master with IndieMaster and indie service (salon_id=NULL)."""
    from models import Master, IndieMaster, Service, User
    from auth import get_password_hash

    mu = User(
        phone="+79001112233",
        email="master@test.dev",
        hashed_password=get_password_hash("test123"),
        full_name="Master",
        role="master",
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    m = Master(user_id=mu.id, bio="", experience_years=0, can_work_independently=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    indie = IndieMaster(user_id=mu.id, master_id=m.id, domain="test-indie-owner")
    db.add(indie)
    db.commit()
    db.refresh(indie)
    indie_svc = Service(
        name="Indie Svc",
        duration=30,
        price=1200,
        salon_id=None,
        indie_master_id=indie.id,
    )
    db.add(indie_svc)
    db.commit()
    db.refresh(indie_svc)
    return {
        "master_id": m.id,
        "indie_id": indie.id,
        "indie_svc_id": indie_svc.id,
    }


def test_create_completed_bookings_indie_no_salon(client, db, admin_user, master_with_indie_and_services):
    """is_indie=True creates booking with salon_id=NULL."""
    from models import User
    from auth import get_password_hash

    r = client.post("/api/auth/login", json={"phone": admin_user.phone, "password": "test123"})
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    data = master_with_indie_and_services
    master_id = data["master_id"]
    indie_svc_id = data["indie_svc_id"]
    client_phone = "+79991112233"
    cu = User(
        phone=client_phone,
        email="c@test.dev",
        hashed_password=get_password_hash("x"),
        full_name="Client",
        role="client",
        is_active=True,
    )
    db.add(cu)
    db.commit()

    body = {
        "master_id": master_id,
        "bookings": [{
            "client_phone": client_phone,
            "service_id": indie_svc_id,
            "days_ago": 1,
            "status": "completed",
            "is_indie": True,
        }],
    }
    r = client.post("/api/dev/testdata/create_completed_bookings", headers=headers, json=body)
    if r.status_code in (404, 405):
        pytest.skip("Dev testdata router not available (ENABLE_DEV_TESTDATA=1).")
    assert r.status_code == 200, r.text
    from models import Booking
    b = db.query(Booking).filter(Booking.service_id == indie_svc_id).first()
    assert b is not None
    assert b.indie_master_id is not None
    assert b.salon_id is None
    assert b.branch_id is None


def test_create_completed_bookings_salon_service_null_returns_400(client, db, admin_user, master_with_indie_and_services):
    """is_indie=False with indie service (salon_id NULL) returns 400."""
    from models import User
    from auth import get_password_hash

    r = client.post("/api/auth/login", json={"phone": admin_user.phone, "password": "test123"})
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    data = master_with_indie_and_services
    master_id = data["master_id"]
    indie_svc_id = data["indie_svc_id"]  # salon_id is NULL
    client_phone = "+79991112234"
    cu = User(
        phone=client_phone,
        email="c2@test.dev",
        hashed_password=get_password_hash("x"),
        full_name="Client2",
        role="client",
        is_active=True,
    )
    db.add(cu)
    db.commit()

    body = {
        "master_id": master_id,
        "bookings": [{
            "client_phone": client_phone,
            "service_id": indie_svc_id,
            "days_ago": 1,
            "status": "completed",
            "is_indie": False,
        }],
    }
    r = client.post("/api/dev/testdata/create_completed_bookings", headers=headers, json=body)
    if r.status_code in (404, 405):
        pytest.skip("Dev testdata router not available (ENABLE_DEV_TESTDATA=1).")
    assert r.status_code == 400, r.text
