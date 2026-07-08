"""Тесты публичного идентификатора платежа."""
import re

from models import Payment


def test_payment_gets_public_id_on_create(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    from auth import get_password_hash
    from models import Master, SubscriptionPlan, SubscriptionType, User, UserRole

    user = User(
        email="publicid@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001116666",
        full_name="Public Id Master",
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

    plan = SubscriptionPlan(
        name="Basic",
        display_name="Basic",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=350,
        features={"service_functions": [1, 2, 3], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    token_resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    init = client.post(
        "/api/payments/subscription/init",
        json={"plan_id": plan.id, "duration_months": 1, "payment_period": "1month"},
        headers=headers,
    )
    assert init.status_code == 200, init.text
    data = init.json()
    public_id = data["payment"]
    assert public_id
    assert not str(public_id).isdigit()
    assert re.fullmatch(r"[\w\-]+", public_id)

    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    assert payment is not None

    status = client.get(f"/api/payments/status?payment={public_id}", headers=headers)
    assert status.status_code == 200
    rows = status.json()
    assert len(rows) == 1
    assert rows[0]["public_id"] == public_id
    assert "id" not in rows[0]
    assert rows[0]["status"] == "pending"


def test_payment_public_id_immutable_after_create(db):
    from auth import get_password_hash
    from models import User, UserRole

    user = User(
        email="immutable@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001114444",
        full_name="Immutable Pay",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    payment = Payment(
        user_id=user.id,
        amount=100.0,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="immutable-test-1",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    original = payment.public_id

    payment.public_id = "hacked-id"
    db.commit()
    db.refresh(payment)
    assert payment.public_id == original


def test_persist_new_payment_retries_public_id_collision(db, monkeypatch):
    from auth import get_password_hash
    from models import User, UserRole
    from utils import payment_public_id as pid_mod

    user = User(
        email="retry@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001113333",
        full_name="Retry Pay",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    calls = {"n": 0}
    real_gen = pid_mod.generate_payment_public_id_candidate

    def flaky_gen():
        calls["n"] += 1
        if calls["n"] in (1, 2):
            return "fixed-collision-token"
        return real_gen()

    monkeypatch.setattr(pid_mod, "generate_payment_public_id_candidate", flaky_gen)

    seed = Payment(
        user_id=user.id,
        amount=50.0,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="collision-seed",
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)
    assert seed.public_id == "fixed-collision-token"

    payment = Payment(
        user_id=user.id,
        amount=75.0,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="collision-retry",
    )
    saved = pid_mod.persist_new_payment(db, payment)
    assert saved.public_id != "fixed-collision-token"
    assert calls["n"] >= 2


def test_full_payment_flow_uses_public_id_only(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()

    from auth import get_password_hash
    from models import Master, SubscriptionPlan, SubscriptionType, User, UserRole
    from utils.robokassa import generate_result_signature, get_robokassa_config

    user = User(
        email="flow@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001112222",
        full_name="Flow Master",
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

    plan = SubscriptionPlan(
        name="Premium",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1200,
        price_3months=1070,
        price_6months=950,
        price_12months=850,
        features={"service_functions": [1, 2, 3], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=2,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    token = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 3, "upgrade_type": "immediate"},
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
            "enable_auto_renewal": False,
        },
    )
    assert init.status_code == 200, init.text
    body = init.json()
    assert "payment_id" not in body
    public_id = body["payment"]
    invoice_id = body["invoice_id"]

    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    cfg = get_robokassa_config()
    sig = generate_result_signature(float(payment.amount), invoice_id, cfg["password_2"])
    result = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": f"{payment.amount:.2f}", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert result.status_code == 200
    assert f"OK{invoice_id}" in result.text

    status = client.get(f"/api/payments/status?payment={public_id}", headers=headers)
    assert status.status_code == 200
    rows = status.json()
    assert rows[0]["public_id"] == public_id
    assert rows[0]["status"] == "paid"
    assert "id" not in rows[0]

    legacy = client.get(f"/api/payments/status?payment_id=999999", headers=headers)
    assert legacy.status_code == 200
    rows_all = client.get("/api/payments/status", headers=headers).json()
    assert len(legacy.json()) == len(rows_all)


def test_payment_public_ids_are_unique(db):
    from auth import get_password_hash
    from models import User, UserRole

    user = User(
        email="uniqpay@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001115555",
        full_name="Uniq Pay",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    ids = set()
    for i in range(5):
        payment = Payment(
            user_id=user.id,
            amount=100.0 + i,
            status="pending",
            payment_type="subscription",
            robokassa_invoice_id=f"uniq-test-{i}",
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
        assert payment.public_id not in ids
        ids.add(payment.public_id)
