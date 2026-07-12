"""Тесты числового Robokassa InvId (= str(Payment.id))."""
import threading
from urllib.parse import parse_qs, urlparse

import pytest

from auth import get_password_hash
from models import Master, Payment, SubscriptionPlan, SubscriptionType, User, UserRole
from tests.conftest import TestingSessionLocal, engine
from utils.payment_public_id import persist_new_robokassa_payment
from utils.robokassa import (
    ROBOKASSA_INVID_MAX,
    ROBOKASSA_INVID_MIN,
    generate_payment_url,
    generate_result_signature,
    generate_signature,
    get_robokassa_config,
    is_robokassa_numeric_invoice_id,
    is_temp_robokassa_invoice_placeholder,
    robokassa_invoice_id_from_payment_id,
)


def _create_master_user(db):
    user = User(
        email="invid@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79009998877",
        full_name="InvId Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(
        Master(
            user_id=user.id,
            bio="",
            experience_years=0,
            city="Москва",
            timezone="Europe/Moscow",
            timezone_confirmed=True,
        )
    )
    db.commit()
    return user


def _create_plan(db):
    plan = SubscriptionPlan(
        name="PremiumInvId",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1160,
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
    return plan


def test_robokassa_invoice_id_from_payment_id_numeric_and_in_range():
    assert robokassa_invoice_id_from_payment_id(6) == "6"
    assert is_robokassa_numeric_invoice_id("6")
    assert is_robokassa_numeric_invoice_id(str(ROBOKASSA_INVID_MAX))
    assert not is_robokassa_numeric_invoice_id("INV-1783880587-445")
    assert not is_robokassa_numeric_invoice_id("0")
    with pytest.raises(ValueError):
        robokassa_invoice_id_from_payment_id(0)
    with pytest.raises(ValueError):
        robokassa_invoice_id_from_payment_id(ROBOKASSA_INVID_MAX + 1)


def test_persist_new_robokassa_payment_assigns_numeric_invoice_id(db):
    user = _create_master_user(db)
    payment = Payment(
        user_id=user.id,
        amount=1160.0,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="tmp-pending",
    )
    saved = persist_new_robokassa_payment(db, payment)
    assert saved.id >= ROBOKASSA_INVID_MIN
    assert saved.robokassa_invoice_id == str(saved.id)
    assert is_robokassa_numeric_invoice_id(saved.robokassa_invoice_id)
    assert not is_temp_robokassa_invoice_placeholder(saved.robokassa_invoice_id)


def test_sequential_payments_get_distinct_numeric_invoice_ids(db):
    user = _create_master_user(db)
    ids = []
    for amount in (100.0, 200.0):
        payment = Payment(
            user_id=user.id,
            amount=amount,
            status="pending",
            payment_type="subscription",
            robokassa_invoice_id="tmp-pending",
        )
        saved = persist_new_robokassa_payment(db, payment)
        ids.append(saved.robokassa_invoice_id)
    assert ids[0] != ids[1]
    assert all(is_robokassa_numeric_invoice_id(x) for x in ids)


def test_parallel_payments_get_distinct_numeric_invoice_ids():
    from database import Base

    Base.metadata.create_all(bind=engine)
    results = []
    errors = []

    def worker(idx: int):
        session = TestingSessionLocal()
        try:
            user = User(
                email=f"parallel-{idx}@test.com",
                hashed_password=get_password_hash("testpassword"),
                phone=f"+7901{9000000 + idx:07d}",
                full_name="Parallel",
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            payment = Payment(
                user_id=user.id,
                amount=100.0 + idx,
                status="pending",
                payment_type="subscription",
                robokassa_invoice_id="tmp-pending",
            )
            saved = persist_new_robokassa_payment(session, payment)
            results.append(saved.robokassa_invoice_id)
        except Exception as exc:
            errors.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    Base.metadata.drop_all(bind=engine)

    assert not errors, errors
    assert len(results) == 4
    assert len(set(results)) == 4
    assert all(is_robokassa_numeric_invoice_id(x) for x in results)


def test_init_payment_url_contains_numeric_inv_id_and_matching_signature(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "production")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "test_p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "test_p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "dedato_test")
    from settings import reload_settings

    reload_settings()

    user = _create_master_user(db)
    plan = _create_plan(db)
    token = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"}).json()[
        "access_token"
    ]
    headers = {"Authorization": f"Bearer {token}"}

    init = client.post(
        "/api/payments/subscription/init",
        json={"plan_id": plan.id, "duration_months": 1, "payment_period": "1month"},
        headers=headers,
    )
    assert init.status_code == 200, init.text
    body = init.json()
    invoice_id = body["invoice_id"]
    assert is_robokassa_numeric_invoice_id(invoice_id)
    assert invoice_id == str(int(invoice_id))

    payment = db.query(Payment).filter(Payment.public_id == body["payment"]).first()
    assert payment.robokassa_invoice_id == invoice_id
    assert str(payment.id) == invoice_id
    assert body["payment"] != invoice_id

    cfg = get_robokassa_config()
    assert cfg["is_test"] is True
    assert cfg["credential_branch"] == "test_passwords"

    url = generate_payment_url(
        merchant_login=cfg["merchant_login"],
        amount=float(payment.amount),
        invoice_id=invoice_id,
        description="Test",
        password_1=cfg["password_1"],
        is_test=True,
    )
    parsed = urlparse(url)
    params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    assert params["InvId"] == invoice_id
    assert params.get("IsTest") == "1"
    expected_sig = generate_signature(cfg["merchant_login"], float(payment.amount), invoice_id, cfg["password_1"])
    assert params["SignatureValue"] == expected_sig


def test_result_callback_finds_payment_by_numeric_inv_id_and_is_idempotent(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()

    user = _create_master_user(db)
    plan = _create_plan(db)
    token = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"}).json()[
        "access_token"
    ]
    headers = {"Authorization": f"Bearer {token}"}

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 3, "upgrade_type": "immediate"},
    )
    assert calc.status_code == 200
    calc_id = calc.json()["calculation_id"]

    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc_id,
            "enable_auto_renewal": False,
        },
    ).json()
    invoice_id = init["invoice_id"]
    public_id = init["payment"]
    assert is_robokassa_numeric_invoice_id(invoice_id)

    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    cfg = get_robokassa_config()
    sig = generate_result_signature(float(payment.amount), invoice_id, cfg["password_2"])
    payload = {"OutSum": f"{payment.amount:.2f}", "InvId": invoice_id, "SignatureValue": sig}

    r1 = client.post("/api/payments/robokassa/result", data=payload)
    assert r1.status_code == 200
    body1 = (r1.text or "").strip().strip('"')
    assert body1 == f"OK{invoice_id}"

    db.expire_all()
    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    assert payment.status == "paid"

    r2 = client.post("/api/payments/robokassa/result", data=payload)
    assert r2.status_code == 200
    body2 = (r2.text or "").strip().strip('"')
    assert body2 == f"OK{invoice_id}"


def test_stub_complete_works_with_numeric_inv_id(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "http://localhost:5173/payment/success")
    from settings import reload_settings

    reload_settings()

    user = _create_master_user(db)
    plan = _create_plan(db)
    token = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"}).json()[
        "access_token"
    ]
    headers = {"Authorization": f"Bearer {token}"}

    init = client.post(
        "/api/payments/subscription/init",
        json={"plan_id": plan.id, "duration_months": 1, "payment_period": "1month"},
        headers=headers,
    ).json()
    invoice_id = init["invoice_id"]
    assert is_robokassa_numeric_invoice_id(invoice_id)

    class FakeResponse:
        def __init__(self, body):
            self.text = body

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse(f"OK{invoice_id}")

    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    response = client.get(
        f"/api/payments/robokassa/stub-complete?invoice_id={invoice_id}",
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert f"payment={init['payment']}" in response.headers["location"]
