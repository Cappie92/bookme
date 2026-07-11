"""Тесты публичного endpoint проверки статуса оплаты."""
import re

from models import Payment


def _create_master_user(db):
    from auth import get_password_hash
    from models import Master, User, UserRole

    user = User(
        email="publicstatus@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001117777",
        full_name="Public Status Master",
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
    return user


def _create_payment(db, user_id, *, status="pending", subscription_apply_status=None):
    payment = Payment(
        user_id=user_id,
        amount=500.0,
        status=status,
        payment_type="subscription",
        robokassa_invoice_id=f"public-status-{status}-{subscription_apply_status}",
        subscription_apply_status=subscription_apply_status,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def test_public_status_returns_paid_applied_without_authorization(client, db):
    user = _create_master_user(db)
    payment = _create_payment(db, user.id, status="paid", subscription_apply_status="applied")

    response = client.get(f"/api/payments/public-status?payment={payment.public_id}")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data == {"status": "paid", "subscription_apply_status": "applied", "payment_source": "web"}


def test_public_status_response_has_no_internal_or_personal_fields(client, db):
    user = _create_master_user(db)
    payment = _create_payment(db, user.id, status="paid", subscription_apply_status="applied")

    response = client.get(f"/api/payments/public-status?payment={payment.public_id}")
    data = response.json()

    assert set(data.keys()) == {"status", "subscription_apply_status", "payment_source"}
    forbidden = {
        "id",
        "public_id",
        "user_id",
        "subscription_id",
        "amount",
        "phone",
        "email",
        "invoice_id",
        "robokassa_invoice_id",
        "robokassa_payment_id",
        "plan_id",
        "error_message",
        "created_at",
        "updated_at",
        "paid_at",
    }
    assert forbidden.isdisjoint(data.keys())


def test_public_status_unknown_public_id_returns_404(client):
    response = client.get("/api/payments/public-status?payment=unknown-public-id-xyz")

    assert response.status_code == 404
    assert response.json()["detail"] == "Payment not found"


def test_authenticated_status_still_requires_auth(client, db):
    user = _create_master_user(db)
    payment = _create_payment(db, user.id)

    response = client.get(f"/api/payments/status?payment={payment.public_id}")

    assert response.status_code == 401


def test_authenticated_status_still_works_with_auth(client, db):
    user = _create_master_user(db)
    payment = _create_payment(db, user.id, status="paid", subscription_apply_status="applied")

    token_resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    headers = {"Authorization": f"Bearer {token_resp.json()['access_token']}"}

    response = client.get(f"/api/payments/status?payment={payment.public_id}", headers=headers)

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["public_id"] == payment.public_id
    assert "id" not in rows[0]


def test_public_status_pending_and_failed_states(client, db):
    user = _create_master_user(db)
    pending = _create_payment(db, user.id, status="pending", subscription_apply_status="pending")
    failed = _create_payment(
        db,
        user.id,
        status="failed",
        subscription_apply_status="failed",
    )

    pending_resp = client.get(f"/api/payments/public-status?payment={pending.public_id}").json()
    failed_resp = client.get(f"/api/payments/public-status?payment={failed.public_id}").json()

    assert pending_resp["status"] == "pending"
    assert pending_resp["subscription_apply_status"] == "pending"
    assert failed_resp["status"] == "failed"
    assert failed_resp["subscription_apply_status"] == "failed"


def test_public_status_public_id_is_cryptographically_random_format(db):
    user = _create_master_user(db)
    payment = _create_payment(db, user.id)

    assert payment.public_id
    assert not str(payment.public_id).isdigit()
    assert re.fullmatch(r"[\w\-]+", payment.public_id)
