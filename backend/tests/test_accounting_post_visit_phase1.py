"""
Phase 1: POST-visit подтверждения работают без finance-guard.
- Мастер без finance: pending-confirmations, confirm-booking, cancel-booking, confirm-all, cancel-all → 200
- Мастер без finance: summary, operations, export → 403
- Indie master: pending-confirmations возвращает записи с indie_master_id, confirm работает
"""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    IndieMaster,
    Master,
    Service,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)


def _create_master_with_plan(db, plan, phone="+79001112233"):
    """Создаёт мастера с активной подпиской на план."""
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
    master = Master(user_id=user.id, bio="", experience_years=0)
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


class TestPostVisitNoFinance:
    """POST-visit endpoints доступны без finance-фичи."""

    def test_pending_confirmations_200_without_finance(self, client, db):
        """Мастер без finance получает 200 на GET pending-confirmations."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, master = _create_master_with_plan(db, plan, "+79001112201")
        headers = _auth_headers(client, user.phone)

        r = client.get("/api/master/accounting/pending-confirmations", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pending_confirmations" in data
        assert "count" in data
        assert isinstance(data["pending_confirmations"], list)

    def test_confirm_booking_200_without_finance(self, client, db):
        """Мастер без finance может подтвердить запись (POST confirm-booking)."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, master = _create_master_with_plan(db, plan, "+79001112202")

        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=500,
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        headers = _auth_headers(client, user.phone)
        r = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
        assert r.status_code == 200, r.text

        booking_after = db.query(Booking).filter(Booking.id == booking.id).first()
        assert booking_after.status == BookingStatus.COMPLETED
        conf = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == booking.id).first()
        assert conf is not None

    def test_cancel_booking_200_without_finance(self, client, db):
        """Мастер без finance может отклонить запись."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, master = _create_master_with_plan(db, plan, "+79001112203")

        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=500,
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        headers = _auth_headers(client, user.phone)
        r = client.post(
            f"/api/master/accounting/cancel-booking/{booking.id}",
            params={"cancellation_reason": "client_no_show"},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        booking_after = db.query(Booking).filter(Booking.id == booking.id).first()
        assert booking_after.status == BookingStatus.CANCELLED

    def test_confirm_all_200_without_finance(self, client, db):
        """Мастер без finance может confirm-all (если есть pending)."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, master = _create_master_with_plan(db, plan, "+79001112204")

        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=500,
        )
        db.add(booking)
        db.commit()

        headers = _auth_headers(client, user.phone)
        r = client.post("/api/master/accounting/confirm-all", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json().get("confirmed_count", 0) >= 1

    def test_cancel_all_200_without_finance(self, client, db):
        """Мастер без finance может cancel-all."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, master = _create_master_with_plan(db, plan, "+79001112205")

        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=master.id,
            indie_master_id=None,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=500,
        )
        db.add(booking)
        db.commit()

        headers = _auth_headers(client, user.phone)
        r = client.post("/api/master/accounting/cancel-all", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json().get("cancelled_count", 0) >= 1


class TestFinanceEndpointsStill403:
    """Finance endpoints по-прежнему 403 без finance-фичи."""

    def test_summary_403_without_finance(self, client, db):
        """Мастер без finance получает 403 на summary."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, _ = _create_master_with_plan(db, plan, "+79001112210")
        headers = _auth_headers(client, user.phone)

        r = client.get("/api/master/accounting/summary", headers=headers)
        assert r.status_code == 403, r.text

    def test_operations_403_without_finance(self, client, db):
        """Мастер без finance получает 403 на operations."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, _ = _create_master_with_plan(db, plan, "+79001112211")
        headers = _auth_headers(client, user.phone)

        r = client.get("/api/master/accounting/operations", headers=headers)
        assert r.status_code == 403, r.text

    def test_export_403_without_finance(self, client, db):
        """Мастер без finance получает 403 на export."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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
        user, _ = _create_master_with_plan(db, plan, "+79001112212")
        headers = _auth_headers(client, user.phone)

        r = client.get("/api/master/accounting/export", headers=headers)
        assert r.status_code == 403, r.text


class TestIndieMasterPostVisit:
    """Indie master: pending-confirmations и confirm работают для записей с indie_master_id."""

    def test_indie_master_pending_confirmations_returns_booking(self, client, db):
        """Indie master: pending-confirmations возвращает запись с indie_master_id."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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

        user = User(
            email="indie@test.com",
            hashed_password=get_password_hash("testpassword"),
            phone="+79001112220",
            full_name="Indie Master",
            role=UserRole.MASTER,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        master = Master(user_id=user.id, bio="", experience_years=0, can_work_independently=True)
        db.add(master)
        db.commit()
        db.refresh(master)

        indie = IndieMaster(
            user_id=user.id,
            master_id=master.id,
            bio="",
            experience_years=0,
            domain="indie-test",
        )
        db.add(indie)
        db.commit()
        db.refresh(indie)

        sub = Subscription(
            user_id=user.id,
            subscription_type=SubscriptionType.MASTER,
            status=SubscriptionStatus.ACTIVE,
            plan_id=plan.id,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30),
            price=500,
            daily_rate=500 / 30,
            is_active=True,
            auto_renewal=False,
            salon_branches=0,
            salon_employees=0,
            master_bookings=0,
        )
        db.add(sub)
        db.commit()

        service = Service(
            name="Indie Service",
            price=800,
            duration=60,
            salon_id=None,
            indie_master_id=indie.id,
        )
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=None,
            indie_master_id=indie.id,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=800,
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        headers = _auth_headers(client, user.phone)
        r = client.get("/api/master/accounting/pending-confirmations", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] >= 1
        ids = [b["booking_id"] for b in data["pending_confirmations"]]
        assert booking.id in ids

    def test_indie_master_confirm_booking_works(self, client, db):
        """Indie master: confirm-booking для записи с indie_master_id работает."""
        plan = SubscriptionPlan(
            name="NoFinance",
            display_name="No Finance",
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

        user = User(
            email="indie2@test.com",
            hashed_password=get_password_hash("testpassword"),
            phone="+79001112221",
            full_name="Indie Master 2",
            role=UserRole.MASTER,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        master = Master(user_id=user.id, bio="", experience_years=0, can_work_independently=True)
        db.add(master)
        db.commit()
        db.refresh(master)

        indie = IndieMaster(
            user_id=user.id,
            master_id=master.id,
            bio="",
            experience_years=0,
            domain="indie-test-2",
        )
        db.add(indie)
        db.commit()
        db.refresh(indie)

        sub = Subscription(
            user_id=user.id,
            subscription_type=SubscriptionType.MASTER,
            status=SubscriptionStatus.ACTIVE,
            plan_id=plan.id,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30),
            price=500,
            daily_rate=500 / 30,
            is_active=True,
            auto_renewal=False,
            salon_branches=0,
            salon_employees=0,
            master_bookings=0,
        )
        db.add(sub)
        db.commit()

        service = Service(
            name="Indie Service 2",
            price=900,
            duration=60,
            salon_id=None,
            indie_master_id=indie.id,
        )
        db.add(service)
        db.commit()
        db.refresh(service)

        now = datetime.utcnow()
        booking = Booking(
            client_id=user.id,
            service_id=service.id,
            master_id=None,
            indie_master_id=indie.id,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION,
            payment_amount=900,
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        headers = _auth_headers(client, user.phone)
        r = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
        assert r.status_code == 200, r.text

        booking_after = db.query(Booking).filter(Booking.id == booking.id).first()
        assert booking_after.status == BookingStatus.COMPLETED
        conf = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == booking.id).first()
        assert conf is not None
