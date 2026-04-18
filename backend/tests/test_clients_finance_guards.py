"""
Тесты 403 guards для разделов «Клиенты» и «Финансы».
- Мастер без clients-фичи получает 403 на /api/master/clients
- Мастер с clients-фичей получает 200
- Мастер без finance-фичи получает 403 на /api/master/accounting/*
- Мастер с finance-фичей получает 200
"""
from datetime import datetime, timedelta

import pytest
from auth import get_password_hash
from constants import duration_months_to_days
from models import Master, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, User, UserRole


def _create_master_with_plan(db, plan, phone="+79001112233"):
    """Создаёт мастера, привязанного к плану с активной подпиской."""
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
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()
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
    return user


def _auth_master(client, phone, password="testpassword"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestClientsGuard:
    """Guards для раздела «Клиенты» (has_clients_access, service_function id=7)."""

    def test_master_without_clients_gets_403_on_list(self, client, db):
        """Мастер без clients-фичи получает 403 на GET /api/master/clients."""
        plan = SubscriptionPlan(
            name="NoClients",
            display_name="No Clients",
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
        user = _create_master_with_plan(db, plan, "+79001112201")
        headers = _auth_master(client, user.phone)

        r = client.get("/api/master/clients", headers=headers)
        assert r.status_code == 403, r.text
        assert r.headers.get("X-Error-Code") == "FEATURE_NOT_AVAILABLE" or "detail" in r.json()

    def test_master_with_clients_gets_200_on_list(self, client, db):
        """Мастер с clients-фичей получает 200 на GET /api/master/clients."""
        plan = SubscriptionPlan(
            name="WithClients",
            display_name="With Clients",
            subscription_type=SubscriptionType.MASTER,
            price_1month=1000,
            price_3months=900,
            price_6months=800,
            price_12months=700,
            features={"service_functions": [1, 2, 3, 4, 5, 6, 7], "max_page_modules": 3},
            limits={},
            is_active=True,
            display_order=2,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        user = _create_master_with_plan(db, plan, "+79001112202")
        headers = _auth_master(client, user.phone)

        r = client.get("/api/master/clients", headers=headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


class TestFinanceGuard:
    """Guards для раздела «Финансы» (has_finance_access, service_function id=4)."""

    def test_master_without_finance_gets_403_on_summary(self, client, db):
        """Мастер без finance-фичи получает 403 на GET /api/master/accounting/summary."""
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
        user = _create_master_with_plan(db, plan, "+79001112203")
        headers = _auth_master(client, user.phone)

        r = client.get("/api/master/accounting/summary", headers=headers)
        assert r.status_code == 403, r.text

    def test_master_with_finance_gets_200_on_summary(self, client, db):
        """Мастер с finance-фичей получает 200 на GET /api/master/accounting/summary."""
        plan = SubscriptionPlan(
            name="WithFinance",
            display_name="With Finance",
            subscription_type=SubscriptionType.MASTER,
            price_1month=1500,
            price_3months=1400,
            price_6months=1300,
            price_12months=1200,
            features={"service_functions": [1, 2, 3, 4, 5, 6], "max_page_modules": 3},
            limits={},
            is_active=True,
            display_order=2,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        user = _create_master_with_plan(db, plan, "+79001112204")
        headers = _auth_master(client, user.phone)

        r = client.get("/api/master/accounting/summary", headers=headers)
        assert r.status_code == 200, r.text
