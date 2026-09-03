"""Regression: web_session_origin=ios_app blocks external digital-subscription purchase."""
from fastapi.testclient import TestClient
from jose import jwt

from auth import ALGORITHM, SECRET_KEY
from models import Payment, Subscription
from routers import auth as auth_router


def _auth_headers(token_payload: dict) -> dict:
    return {"Authorization": f"Bearer {token_payload['access_token']}"}


def _ios_app_tokens(client, user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(user.id, "ios_app", user.session_version, "settings")
    return client.post("/api/auth/web-handoff/exchange", json={"code": code}).json()


def test_subscription_init_forbidden_for_ios_app_no_side_effects(
    client, db, test_master, test_master_token, monkeypatch
):
    tokens = _ios_app_tokens(client, test_master, monkeypatch)
    payments_before = db.query(Payment).count()
    subs_before = db.query(Subscription).count()

    payload = {
        "plan_id": 1,
        "duration_months": 1,
        "payment_period": "month",
        "upgrade_type": "immediate",
    }
    blocked = client.post(
        "/api/payments/subscription/init",
        json=payload,
        headers=_auth_headers(tokens),
    )
    assert blocked.status_code == 403, blocked.text
    assert "Robokassa" in blocked.json()["detail"]

    db.expire_all()
    assert db.query(Payment).count() == payments_before
    assert db.query(Subscription).count() == subs_before

    # Ordinary web/session JWT (no ios_app claim) is not blocked by this gate
    normal_payload = jwt.decode(
        test_master_token["access_token"], SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert normal_payload.get("web_session_origin") != "ios_app"

    normal = client.post(
        "/api/payments/subscription/init",
        json=payload,
        headers=_auth_headers(test_master_token),
    )
    assert normal.status_code != 403


def test_legacy_subscription_upgrade_forbidden_for_ios_app_no_side_effects(
    client, db, test_master, test_master_token, monkeypatch
):
    tokens = _ios_app_tokens(client, test_master, monkeypatch)
    payments_before = db.query(Payment).count()
    subs_before = db.query(Subscription).count()

    payload = {
        "subscription_type": "master",
        "plan_id": 1,
        "payment_period": "month",
    }
    blocked = client.post(
        "/api/subscriptions/upgrade",
        json=payload,
        headers=_auth_headers(tokens),
    )
    assert blocked.status_code == 403, blocked.text
    assert "Robokassa" in blocked.json()["detail"]

    db.expire_all()
    assert db.query(Payment).count() == payments_before
    assert db.query(Subscription).count() == subs_before

    # Ordinary session must not hit the ios_app 403 gate.
    # Legacy handler may error later (unrelated ImportError); only assert no 403.
    normal_payload = jwt.decode(
        test_master_token["access_token"], SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert normal_payload.get("web_session_origin") != "ios_app"

    with TestClient(client.app, raise_server_exceptions=False) as soft_client:
        normal = soft_client.post(
            "/api/subscriptions/upgrade",
            json=payload,
            headers=_auth_headers(test_master_token),
        )
    assert normal.status_code != 403


def test_subscription_apply_endpoints_forbidden_for_ios_app_no_side_effects(
    client, db, test_master, monkeypatch
):
    tokens = _ios_app_tokens(client, test_master, monkeypatch)
    payments_before = db.query(Payment).count()
    subs_before = db.query(Subscription).count()

    for endpoint in (
        "/api/subscriptions/apply-upgrade-free",
        "/api/subscriptions/apply-upgrade-balance",
    ):
        blocked = client.post(
            endpoint,
            json={"calculation_id": 1},
            headers=_auth_headers(tokens),
        )
        assert blocked.status_code == 403, (endpoint, blocked.text)

    db.expire_all()
    assert db.query(Payment).count() == payments_before
    assert db.query(Subscription).count() == subs_before
