"""Security regression: admin-only hard delete чистой будущей брони."""
from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    AppliedDiscount,
    Booking,
    BookingConfirmation,
    BookingEditRequest,
    BookingStatus,
    EditRequestStatus,
    Income,
    LoyaltyTransaction,
    Master,
    MissedRevenue,
    ModeratorPermissions,
    Service,
    User,
    UserRole,
)


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login_headers(client, phone: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert r.status_code == 200, r.json()
    return _headers(r.json()["access_token"])


@pytest.fixture
def world(db: Session):
    client = User(
        email="hd.client@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110001",
        full_name="HD Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    master_user = User(
        email="hd.master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110002",
        full_name="HD Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    salon_user = User(
        email="hd.salon@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110003",
        full_name="HD Salon",
        role=UserRole.SALON,
        is_active=True,
        is_verified=True,
    )
    indie_user = User(
        email="hd.indie@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110004",
        full_name="HD Indie",
        role=UserRole.INDIE,
        is_active=True,
        is_verified=True,
    )
    moderator = User(
        email="hd.mod@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110005",
        full_name="HD Moderator",
        role=UserRole.MODERATOR,
        is_active=True,
        is_verified=True,
    )
    admin = User(
        email="hd.admin@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110006",
        full_name="HD Admin",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add_all([client, master_user, salon_user, indie_user, moderator, admin])
    db.commit()
    for u in (client, master_user, salon_user, indie_user, moderator, admin):
        db.refresh(u)

    master = Master(user_id=master_user.id, bio="bio", experience_years=1)
    db.add(master)
    db.commit()
    db.refresh(master)

    perms = ModeratorPermissions(
        user_id=moderator.id,
        can_view_bookings=True,
        can_edit_bookings=True,
        can_delete_bookings=True,
    )
    db.add(perms)

    service = Service(name="HD Service", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    return {
        "client": client,
        "master_user": master_user,
        "master": master,
        "salon_user": salon_user,
        "indie_user": indie_user,
        "moderator": moderator,
        "admin": admin,
        "service": service,
    }


def _future_booking(
    db: Session,
    *,
    client: User,
    service: Service,
    master: Master,
    status: str = BookingStatus.CREATED.value,
    days: int = 2,
    loyalty_points_used: int = 0,
    is_paid: bool = False,
    start_time=...,
) -> Booking:
    if start_time is ...:
        start = datetime.utcnow().replace(minute=0, second=0, microsecond=0) + timedelta(
            days=days
        )
    else:
        start = start_time
    end = (start + timedelta(hours=1)) if start is not None else None
    booking = Booking(
        client_id=client.id,
        service_id=service.id,
        master_id=master.id,
        start_time=start,
        end_time=end,
        status=status,
        loyalty_points_used=loyalty_points_used,
        is_paid=is_paid,
        payment_amount=1000.0,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _assert_forbidden(response, expected_blocker: str, booking_id: int, db: Session):
    assert response.status_code == 409, response.text
    assert response.headers.get("X-Error-Code") == "BOOKING_HARD_DELETE_FORBIDDEN"
    detail = response.json()["detail"]
    assert detail["code"] == "BOOKING_HARD_DELETE_FORBIDDEN"
    assert expected_blocker in detail["blockers"]
    assert detail["hint"] == "use_soft_cancel"
    assert db.query(Booking).filter(Booking.id == booking_id).first() is not None


# --- Authorization ---


def test_delete_without_token_keeps_booking(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    r = client.delete(f"/api/bookings/{bid}")
    assert r.status_code == 401
    assert db.query(Booking).filter(Booking.id == bid).first() is not None


def test_delete_invalid_token_keeps_booking(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    r = client.delete(
        f"/api/bookings/{bid}",
        headers=_headers("not.a.valid.jwt"),
    )
    assert r.status_code == 401
    assert db.query(Booking).filter(Booking.id == bid).first() is not None


@pytest.mark.parametrize(
    "user_key",
    ["client", "master_user", "salon_user", "indie_user", "moderator"],
)
def test_non_admin_roles_forbidden(client, db, world, user_key):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    headers = _login_headers(client, world[user_key].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    assert r.status_code == 403, r.text
    assert db.query(Booking).filter(Booking.id == bid).first() is not None


def test_moderator_with_can_delete_bookings_still_403(client, db, world):
    perms = (
        db.query(ModeratorPermissions)
        .filter(ModeratorPermissions.user_id == world["moderator"].id)
        .first()
    )
    assert perms is not None
    assert perms.can_delete_bookings is True
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    headers = _login_headers(client, world["moderator"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    assert r.status_code == 403
    assert db.query(Booking).filter(Booking.id == bid).first() is not None


def test_client_cannot_delete_foreign_booking(client, db, world):
    other = User(
        email="hd.other@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001110099",
        full_name="Other",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    b = _future_booking(db, client=other, service=world["service"], master=world["master"])
    bid = b.id
    headers = _login_headers(client, world["client"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    assert r.status_code == 403
    assert db.query(Booking).filter(Booking.id == bid).first() is not None


# --- Allowed ---


@pytest.mark.parametrize(
    "status",
    [
        BookingStatus.CREATED.value,
        BookingStatus.CONFIRMED.value,
        BookingStatus.AWAITING_PAYMENT.value,
    ],
)
def test_admin_deletes_clean_future_booking(client, db, world, status):
    b = _future_booking(
        db,
        client=world["client"],
        service=world["service"],
        master=world["master"],
        status=status,
    )
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    assert r.status_code == 200, r.text
    assert db.query(Booking).filter(Booking.id == bid).first() is None


def test_admin_deletes_clean_booking_with_edit_requests(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    er = BookingEditRequest(
        booking_id=b.id,
        proposed_start=b.start_time + timedelta(days=1),
        proposed_end=b.end_time + timedelta(days=1),
        status=EditRequestStatus.PENDING,
    )
    db.add(er)
    db.commit()
    er_id = er.id
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    assert r.status_code == 200, r.text
    assert db.query(Booking).filter(Booking.id == bid).first() is None
    assert db.query(BookingEditRequest).filter(BookingEditRequest.id == er_id).first() is None


# --- Forbidden blockers ---


def test_blocked_by_income(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    db.add(
        Income(
            booking_id=bid,
            total_amount=1000,
            master_earnings=1000,
            salon_earnings=0,
            income_date=date.today(),
            service_date=date.today(),
        )
    )
    db.commit()
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "income", bid, db)
    assert db.query(Income).filter(Income.booking_id == bid).first() is not None


def test_blocked_by_missed_revenue(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    db.add(
        MissedRevenue(
            booking_id=bid,
            client_id=world["client"].id,
            missed_amount=1000,
            service_price=1000,
            missed_date=date.today(),
            booking_date=date.today(),
        )
    )
    db.commit()
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "missed_revenue", bid, db)
    assert db.query(MissedRevenue).filter(MissedRevenue.booking_id == bid).first() is not None


def test_blocked_by_loyalty_transaction(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    db.add(
        LoyaltyTransaction(
            master_id=world["master"].id,
            client_id=world["client"].id,
            booking_id=bid,
            transaction_type="earned",
            points=10,
            earned_at=datetime.utcnow(),
        )
    )
    db.commit()
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "loyalty_transaction", bid, db)
    assert (
        db.query(LoyaltyTransaction).filter(LoyaltyTransaction.booking_id == bid).first()
        is not None
    )


def test_blocked_by_applied_discount(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    db.add(
        AppliedDiscount(
            booking_id=bid,
            discount_percent=10.0,
            discount_amount=100.0,
        )
    )
    db.commit()
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "applied_discount", bid, db)
    assert db.query(AppliedDiscount).filter(AppliedDiscount.booking_id == bid).first() is not None


def test_blocked_by_loyalty_reserve(client, db, world):
    b = _future_booking(
        db,
        client=world["client"],
        service=world["service"],
        master=world["master"],
        loyalty_points_used=50,
    )
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "loyalty_reserve", bid, db)


def test_blocked_by_is_paid(client, db, world):
    b = _future_booking(
        db,
        client=world["client"],
        service=world["service"],
        master=world["master"],
        is_paid=True,
    )
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "is_paid", bid, db)


def test_blocked_by_booking_confirmation(client, db, world):
    # confirmation implies history; use future slot still blocked by confirmation row
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    bid = b.id
    db.add(
        BookingConfirmation(
            booking_id=bid,
            master_id=world["master_user"].id,
            confirmed_income=1000.0,
        )
    )
    db.commit()
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "booking_confirmation", bid, db)
    assert (
        db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == bid).first()
        is not None
    )


def test_blocked_by_past_booking(client, db, world):
    past = datetime.utcnow() - timedelta(hours=2)
    b = _future_booking(
        db,
        client=world["client"],
        service=world["service"],
        master=world["master"],
        start_time=past,
        status=BookingStatus.CREATED.value,
    )
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "past_booking", bid, db)


def test_blocked_by_missing_start_time(client, db, world):
    b = _future_booking(
        db,
        client=world["client"],
        service=world["service"],
        master=world["master"],
        start_time=None,
    )
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "missing_start_time", bid, db)


@pytest.mark.parametrize(
    "status",
    [
        BookingStatus.COMPLETED.value,
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        BookingStatus.AWAITING_CONFIRMATION.value,
        BookingStatus.PAYMENT_EXPIRED.value,
    ],
)
def test_blocked_by_historical_status(client, db, world, status):
    b = _future_booking(
        db,
        client=world["client"],
        service=world["service"],
        master=world["master"],
        status=status,
        days=3,
    )
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)
    r = client.delete(f"/api/bookings/{bid}", headers=headers)
    _assert_forbidden(r, "historical_status", bid, db)


def test_rollback_on_error_keeps_booking_and_edit_requests(client, db, world):
    b = _future_booking(db, client=world["client"], service=world["service"], master=world["master"])
    er = BookingEditRequest(
        booking_id=b.id,
        proposed_start=b.start_time + timedelta(days=1),
        proposed_end=b.end_time + timedelta(days=1),
        status=EditRequestStatus.PENDING,
    )
    db.add(er)
    db.commit()
    er_id = er.id
    bid = b.id
    headers = _login_headers(client, world["admin"].phone)

    def _partial_then_fail(session, booking):
        session.query(BookingEditRequest).filter(
            BookingEditRequest.booking_id == booking.id
        ).delete(synchronize_session=False)
        session.flush()
        raise RuntimeError("simulated delete failure")

    with patch("routers.bookings.delete_clean_booking", side_effect=_partial_then_fail):
        with pytest.raises(RuntimeError, match="simulated delete failure"):
            client.delete(f"/api/bookings/{bid}", headers=headers)

    db.expire_all()
    assert db.query(Booking).filter(Booking.id == bid).first() is not None
    assert db.query(BookingEditRequest).filter(BookingEditRequest.id == er_id).first() is not None
