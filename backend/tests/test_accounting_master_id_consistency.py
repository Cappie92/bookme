from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    Master,
    MasterExpense,
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
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_user(db, *, phone: str, role: UserRole) -> User:
    user = User(
        email=f"{phone}@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name=f"User {phone}",
        role=role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.mark.parametrize("use_confirm_endpoint", [True, False])
def test_accounting_uses_user_id_for_finance_models_even_when_user_id_differs_from_master_id(
    client, db, use_confirm_endpoint
):
    # Создаем "лишнего" пользователя, чтобы гарантировать user.id != master.id
    _create_user(db, phone="+79000000001", role=UserRole.CLIENT)

    master_user = _create_user(db, phone="+79000000002", role=UserRole.MASTER)
    master_profile = Master(user_id=master_user.id, bio="bio", experience_years=1)
    db.add(master_profile)
    db.commit()
    db.refresh(master_profile)

    # План с доступом к финансам (service_functions: 4 = has_finance_access)
    plan = SubscriptionPlan(
        name="FinanceTest",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000.0,
        price_3months=900.0,
        price_6months=800.0,
        price_12months=700.0,
        features={"service_functions": [1, 2, 3, 4, 5, 6], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    sub = Subscription(
        user_id=master_user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=30),
        price=1000.0,
        daily_rate=1000.0 / 30,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()

    assert master_user.id != master_profile.id, "Тест должен воспроизводить user.id != master.id"

    service = Service(name="Test Service", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    booking = Booking(
        client_id=master_user.id,  # не важно для этого теста
        service_id=service.id,
        master_id=master_profile.id,  # Booking.master_id -> masters.id
        start_time=datetime.utcnow() - timedelta(hours=2),
        end_time=datetime.utcnow() - timedelta(hours=1),
        status=BookingStatus.AWAITING_CONFIRMATION,
        payment_amount=1500,
        loyalty_points_used=0,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    headers = _auth_headers(client, master_user.phone, "testpassword")

    if use_confirm_endpoint:
        resp = client.post(f"/api/master/accounting/confirm-booking/{booking.id}", headers=headers)
        assert resp.status_code == 200, resp.text
    else:
        resp = client.post(
            f"/api/master/accounting/update-booking-status/{booking.id}",
            params={"new_status": "completed"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    confirmation = (
        db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == booking.id).first()
    )
    assert confirmation is not None
    assert confirmation.master_id == master_user.id

    # Создаем расход (endpoint принимает query params)
    resp = client.post(
        "/api/master/accounting/expenses",
        params={
            "name": "Test expense",
            "expense_type": "one_time",
            "amount": 200.0,
            "expense_date": datetime.utcnow().isoformat(),
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    expense = (
        db.query(MasterExpense)
        .filter(MasterExpense.name == "Test expense")
        .order_by(MasterExpense.id.desc())
        .first()
    )
    assert expense is not None
    assert expense.master_id == master_user.id

    # summary/operations должны видеть и доход, и расход
    resp = client.get("/api/master/accounting/summary", params={"period": "week", "offset": 0}, headers=headers)
    assert resp.status_code == 200, resp.text
    summary = resp.json()
    assert (summary.get("total_income") or 0) > 0
    assert (summary.get("total_expense") or 0) > 0

    resp = client.get(
        "/api/master/accounting/operations",
        params={"page": 1, "limit": 50, "operation_type": "all"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    operations = resp.json()["operations"]
    income_ops = [
        op for op in operations
        if op.get("operation_type") == "income" and str(op.get("id", "")).startswith("income_")
    ]
    assert len(income_ops) >= 1
    assert any(op.get("operation_type") == "expense" for op in operations)

