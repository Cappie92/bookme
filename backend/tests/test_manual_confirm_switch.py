"""
Тесты логики manual_confirm_enabled_at (POST-visit):
- При переключении на ручной режим: текущие AWAITING_CONFIRMATION автоподтверждаются
- В pending-confirmations только записи, созданные после manual_confirm_enabled_at
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


def _create_master_with_plan(db, plan, phone="+79001119901", auto_confirm=True):
    """Создаёт мастера с активной подпиской и auto_confirm_bookings."""
    user = User(
        email=f"{phone}@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Test Master",
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
        auto_confirm_bookings=auto_confirm,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    days = duration_months_to_days(1)
    price = (plan.price_1month or 0) or 500.0
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=days),
        price=price,
        daily_rate=price / days,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()
    return user, master


def _auth_headers(client, phone, password="testpassword"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestManualConfirmSwitch:
    """Переключение на ручной режим: автоподтверждение текущих AWAITING_CONFIRMATION."""

    def test_switch_to_manual_auto_confirms_existing_awaiting(self, client, db):
        """Включили manual: 2 AWAITING_CONFIRMATION → после переключения они подтверждены, pending пуст."""
        plan = SubscriptionPlan(
            name="Basic",
            display_name="Basic",
            subscription_type=SubscriptionType.MASTER,
            price_1month=500,
            price_3months=450,
            price_6months=400,
            price_12months=350,
            features={"service_functions": [1, 2, 3, 5, 6], "max_page_modules": 1},
            limits={},
            is_active=True,
            display_order=1,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)

        user, master = _create_master_with_plan(db, plan, "+79001119901", auto_confirm=True)
        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        past = now - timedelta(hours=2)
        b1 = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=past,
            end_time=past + timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=500,
        )
        b2 = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=past - timedelta(hours=1),
            end_time=past,
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=400,
        )
        db.add_all([b1, b2])
        db.commit()
        bid1, bid2 = b1.id, b2.id

        headers = _auth_headers(client, user.phone)
        r_pending_before = client.get("/api/master/accounting/pending-confirmations", headers=headers)
        assert r_pending_before.status_code == 200
        data_before = r_pending_before.json()
        # До переключения: manual_confirm_enabled_at = None → показываем все AWAITING_CONFIRMATION
        assert data_before["count"] >= 2

        # Переключаем на ручной режим (auto_confirm_bookings = false)
        r_put = client.put(
            "/api/master/profile",
            headers=headers,
            data={
                "auto_confirm_bookings": "false",
                "city": "Москва",
                "timezone": "Europe/Moscow",
            },
        )
        assert r_put.status_code == 200, r_put.text

        b1_after = db.query(Booking).filter(Booking.id == bid1).first()
        b2_after = db.query(Booking).filter(Booking.id == bid2).first()
        assert b1_after.status == BookingStatus.COMPLETED
        assert b2_after.status == BookingStatus.COMPLETED

        conf1 = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == bid1).first()
        conf2 = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == bid2).first()
        assert conf1 is not None
        assert conf2 is not None

        r_pending_after = client.get("/api/master/accounting/pending-confirmations", headers=headers)
        assert r_pending_after.status_code == 200
        data_after = r_pending_after.json()
        assert data_after["count"] == 0

    def test_new_booking_after_manual_enabled_appears_in_pending(self, client, db):
        """Запись создана после manual_enabled_at и стала AWAITING_CONFIRMATION → появляется в pending."""
        plan = SubscriptionPlan(
            name="Basic",
            display_name="Basic",
            subscription_type=SubscriptionType.MASTER,
            price_1month=500,
            price_3months=450,
            price_6months=400,
            price_12months=350,
            features={"service_functions": [1, 2, 3, 5, 6], "max_page_modules": 1},
            limits={},
            is_active=True,
            display_order=1,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)

        user, master = _create_master_with_plan(db, plan, "+79001119902", auto_confirm=True)
        master_id = master.id
        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        headers = _auth_headers(client, user.phone)
        # Переключаем на ручной режим
        r_put = client.put(
            "/api/master/profile",
            headers=headers,
            data={
                "auto_confirm_bookings": "false",
                "city": "Москва",
                "timezone": "Europe/Moscow",
            },
        )
        assert r_put.status_code == 200, r_put.text

        master_after = db.query(Master).filter(Master.id == master_id).first()
        assert master_after.manual_confirm_enabled_at is not None

        # Создаём новую запись (после manual_enabled_at) в AWAITING_CONFIRMATION
        now = datetime.utcnow()
        past = now - timedelta(hours=1)
        new_booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master_id,
            indie_master_id=None,
            start_time=past,
            end_time=past + timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=600,
        )
        db.add(new_booking)
        db.commit()
        new_booking_id = new_booking.id

        r_pending = client.get("/api/master/accounting/pending-confirmations", headers=headers)
        assert r_pending.status_code == 200
        data = r_pending.json()
        ids = [b["booking_id"] for b in data["pending_confirmations"]]
        assert new_booking_id in ids

    def test_old_confirmed_unchanged_on_switch(self, client, db):
        """Уже подтверждённые записи не меняются при переключении на ручной режим."""
        plan = SubscriptionPlan(
            name="Basic",
            display_name="Basic",
            subscription_type=SubscriptionType.MASTER,
            price_1month=500,
            price_3months=450,
            price_6months=400,
            price_12months=350,
            features={"service_functions": [1, 2, 3, 5, 6], "max_page_modules": 1},
            limits={},
            is_active=True,
            display_order=1,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)

        user, master = _create_master_with_plan(db, plan, "+79001119903", auto_confirm=True)
        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        past = now - timedelta(hours=3)
        completed_booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=past,
            end_time=past + timedelta(hours=1),
            status=BookingStatus.COMPLETED,
            payment_amount=500,
        )
        db.add(completed_booking)
        db.commit()
        conf = BookingConfirmation(
            booking_id=completed_booking.id,
            master_id=user.id,
            confirmed_income=500,
        )
        db.add(conf)
        db.commit()
        completed_id = completed_booking.id

        headers = _auth_headers(client, user.phone)
        r_put = client.put(
            "/api/master/profile",
            headers=headers,
            data={
                "auto_confirm_bookings": "false",
                "city": "Москва",
                "timezone": "Europe/Moscow",
            },
        )
        assert r_put.status_code == 200, r_put.text

        completed_after = db.query(Booking).filter(Booking.id == completed_id).first()
        assert completed_after.status == BookingStatus.COMPLETED
        conf_after = db.query(BookingConfirmation).filter(
            BookingConfirmation.booking_id == completed_id
        ).first()
        assert conf_after is not None
        assert conf_after.confirmed_income == 500
