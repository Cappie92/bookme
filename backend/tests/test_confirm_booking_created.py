"""
Тесты confirm-booking: принимает CREATED (как cancel-booking).
"""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    Master,
    Service,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _create_master_with_booking(db, *, booking_status: BookingStatus, start_offset_hours: int):
    """Создаёт мастера и прошлую запись."""
    user = User(
        email="master@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001111111",
        full_name="Test Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(user_id=user.id, bio="", experience_years=0)
    db.add(master)
    db.commit()
    db.refresh(master)

    service = Service(name="Test", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    now = datetime.utcnow()
    booking = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=now - timedelta(hours=start_offset_hours),
        end_time=now - timedelta(hours=start_offset_hours - 1),
        status=booking_status,
        payment_amount=500,
        loyalty_points_used=0,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return user, master, booking


def test_confirm_booking_with_created_status(client, db):
    """Confirm для прошлой записи со статусом CREATED должен работать."""
    user, _, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    headers = _auth_headers(client, user.phone, "test123")

    resp = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "confirmed_income" in data or "message" in data

    booking_after = db.query(Booking).filter(Booking.id == booking.id).first()
    assert booking_after is not None
    assert booking_after.status == BookingStatus.COMPLETED

    conf = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == booking.id).first()
    assert conf is not None


def test_confirm_booking_future_returns_400(client, db):
    """Confirm для будущей записи должен вернуть 400."""
    user, _, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    # Переводим в будущее
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    db.commit()
    db.refresh(booking)

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
    assert resp.status_code == 400, resp.text
    detail = resp.json().get("detail", "").lower()
    assert "будущ" in detail or "future" in detail or "нельзя" in detail


def test_confirm_booking_with_confirmed_status_post_visit(client, db):
    """Post-visit confirm для прошлой записи со статусом CONFIRMED (pre-visit уже сделан)."""
    user, _, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CONFIRMED, start_offset_hours=2
    )
    headers = _auth_headers(client, user.phone, "test123")

    resp = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
    assert resp.status_code == 200, resp.text

    booking_after = db.query(Booking).filter(Booking.id == booking.id).first()
    assert booking_after is not None
    assert booking_after.status == BookingStatus.COMPLETED


def test_confirm_booking_already_confirmed_idempotent(client, db):
    """Повторный confirm для уже подтверждённой записи — идемпотентный 200."""
    user, _, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.AWAITING_CONFIRMATION, start_offset_hours=2
    )
    headers = _auth_headers(client, user.phone, "test123")

    resp1 = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
    assert resp1.status_code == 200, resp1.text

    resp2 = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
    assert resp2.status_code == 200, resp2.text
    msg = resp2.json().get("message", "").lower()
    assert "уже" in msg or "already" in msg


def _attach_master_subscription_with_features(db, user_id: int, service_functions: list) -> None:
    plan = SubscriptionPlan(
        name="TestPlanPreVisit",
        display_name="Test Plan PreVisit",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000,
        price_3months=900,
        price_6months=800,
        price_12months=700,
        features={"service_functions": service_functions, "max_page_modules": 3},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    days = duration_months_to_days(1)
    sub = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=days),
        price=1000,
        daily_rate=1000 / days,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()


def test_update_booking_status_pre_visit_future_manual_pro_ok_despite_dirty_column(client, db):
    """Pro + ручной режим: pre-visit разрешён даже если колонка pre_visit ещё false (грязные данные)."""
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    booking_id = booking.id
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    master.auto_confirm_bookings = False
    master.pre_visit_confirmations_enabled = False
    db.commit()

    _attach_master_subscription_with_features(db, user.id, [1, 2, 4])
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}",
        params={"new_status": "confirmed"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Booking).filter(Booking.id == booking_id).first().status == BookingStatus.CONFIRMED


def test_update_booking_status_pre_visit_future_manual_ok_without_extended_stats(client, db):
    """Ручной режим: CREATED→confirmed для будущей записи разрешён без has_extended_stats."""
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    booking_id = booking.id
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    master.auto_confirm_bookings = False
    master.pre_visit_confirmations_enabled = True
    db.commit()

    _attach_master_subscription_with_features(db, user.id, [1, 4])
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}",
        params={"new_status": "confirmed"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Booking).filter(Booking.id == booking_id).first().status == BookingStatus.CONFIRMED


def test_update_booking_status_pre_visit_future_manual_ok_without_finance_feature(client, db):
    """Будущее подтверждение записи не должно требовать has_finance_access (M5 и др.)."""
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    booking_id = booking.id
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    master.auto_confirm_bookings = False
    db.commit()

    # План без функции 4 (Финансы)
    _attach_master_subscription_with_features(db, user.id, [1, 2])
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}",
        params={"new_status": "confirmed"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Booking).filter(Booking.id == booking_id).first().status == BookingStatus.CONFIRMED


def test_update_booking_status_future_awaiting_confirmation_to_confirmed_manual_ok_without_finance(client, db):
    """Future awaiting_confirmation → confirmed: тот же bypass, без finance (согласовано с UI)."""
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.AWAITING_CONFIRMATION, start_offset_hours=2
    )
    booking_id = booking.id
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    master.auto_confirm_bookings = False
    db.commit()

    _attach_master_subscription_with_features(db, user.id, [1, 2])
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}",
        params={"new_status": "confirmed"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert db.query(Booking).filter(Booking.id == booking_id).first().status == BookingStatus.CONFIRMED


def test_update_booking_status_pre_visit_auto_mode_403(client, db):
    """Pro + авто-подтверждение без legacy override — pre-visit запрещён."""
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    booking_id = booking.id
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    master.auto_confirm_bookings = True
    master.pre_visit_confirmations_enabled = False
    db.commit()

    _attach_master_subscription_with_features(db, user.id, [1, 2, 4])
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}",
        params={"new_status": "confirmed"},
        headers=headers,
    )
    assert resp.status_code == 403, resp.text


def test_update_booking_status_pre_visit_legacy_override_auto_mode_403(client, db):
    """При авто-подтверждении ручное принятие будущей CREATED не разрешено (legacy-колонка не обходит)."""
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    booking_id = booking.id
    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    master.auto_confirm_bookings = True
    master.pre_visit_confirmations_enabled = True
    db.commit()

    _attach_master_subscription_with_features(db, user.id, [1, 2, 4])
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}",
        params={"new_status": "confirmed"},
        headers=headers,
    )
    assert resp.status_code == 403, resp.text


def test_update_booking_status_future_awaiting_confirmation_returns_400(client, db):
    """Нельзя выставить awaiting_confirmation для будущей записи.
    update-booking-status под finance-guard, поэтому нужен план с finance."""
    user, _, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    # Добавляем подписку с finance, чтобы пройти guard и проверить валидацию 400
    plan = SubscriptionPlan(
        name="WithFinance",
        display_name="With Finance",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000,
        price_3months=900,
        price_6months=800,
        price_12months=700,
        features={"service_functions": [1, 2, 3, 4, 5, 6], "max_page_modules": 3},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    days = duration_months_to_days(1)
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=days),
        price=1000,
        daily_rate=1000 / days,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()

    now = datetime.utcnow()
    booking.start_time = now + timedelta(hours=1)
    booking.end_time = now + timedelta(hours=2)
    db.commit()
    db.refresh(booking)

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.post(
        f"/api/master/accounting/update-booking-status/{booking.id}",
        params={"new_status": "awaiting_confirmation"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json().get("detail", "").lower()
    assert "будущ" in detail or "прошедш" in detail or "confirmed" in detail
