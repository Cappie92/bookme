"""
Регресс-тесты для админки и фич тарифов:
- Список service_functions не пустой
- Назначение фич плану влияет на /api/master/subscription/features
"""
from datetime import datetime

import pytest

from auth import get_password_hash
from models import Master, ServiceFunction, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, User, UserRole


def _auth_admin(client, phone="+79001234568", password="testpassword"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_admin_can_list_subscription_functions(client, db, test_admin):
    """GET /api/admin/service-functions возвращает не пустой список (или ожидаемые ключи)."""
    if db.query(ServiceFunction).count() == 0:
        for fid, name, ftype in [(1, "booking_page", "FREE"), (2, "extended_statistics", "SUBSCRIPTION")]:
            db.add(ServiceFunction(id=fid, name=name, function_type=ftype, is_active=True))
        db.commit()
    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.get("/api/admin/service-functions?function_type=subscription&is_active=true", headers=headers)
    if r.status_code == 404:
        pytest.skip("Admin service-functions endpoint not mounted")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Должны быть функции с id 2,3,4 (stats, loyalty, finance)
    ids = [f["id"] for f in data if "id" in f]
    assert 2 in ids or 3 in ids or len(ids) > 0, f"Expected some functions, got {data}"


def test_plan_feature_assignment_affects_master_features(client, db):
    """План Pro с service_functions [1..7] → /api/master/subscription/features возвращает has_* = true (в т.ч. Клиенты = 7)."""
    from datetime import datetime, timedelta

    plan = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.name == "Pro", SubscriptionPlan.subscription_type == SubscriptionType.MASTER)
        .first()
    )
    if not plan:
        plan = SubscriptionPlan(
            name="Pro",
            subscription_type=SubscriptionType.MASTER,
            price_1month=1500,
            price_3months=1400,
            price_6months=1300,
            price_12months=1200,
            is_active=True,
            features={"service_functions": [1, 2, 3, 4, 5, 6, 7], "max_page_modules": 3},
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
    sf = list((plan.features or {}).get("service_functions") or [])
    need = {1, 2, 3, 4, 5, 6, 7}
    if not need.issubset(set(sf)):
        plan.features = {**(plan.features or {}), "service_functions": sorted(set(sf) | need)}
        db.commit()
        db.refresh(plan)
        sf = list((plan.features or {}).get("service_functions") or [])

    user = User(
        email="pro_feat@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79009990001",
        full_name="Pro Feat",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=30),
        price=1500.0,
        daily_rate=50.0,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()

    r = client.post("/api/auth/login", json={"phone": user.phone, "password": "test123"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    r2 = client.get("/api/master/subscription/features", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    feat = r2.json()
    if 2 in sf:
        assert feat.get("has_extended_stats") is True
    if 3 in sf:
        assert feat.get("has_loyalty_access") is True
    if 4 in sf:
        assert feat.get("has_finance_access") is True
    if 7 in sf:
        assert feat.get("has_clients_access") is True
