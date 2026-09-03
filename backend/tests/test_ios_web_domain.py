from datetime import datetime, timedelta

import pytest

from models import Master, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType
from routers import auth as auth_router


def _headers(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _ios_headers(client, user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(
        user.id, "ios_app", user.session_version, "settings"
    )
    tokens = client.post("/api/auth/web-handoff/exchange", json={"code": code}).json()
    return _headers(tokens)


@pytest.mark.parametrize("entitlement", ["free", "paid"])
def test_ios_web_domain_update_has_free_paid_parity(
    entitlement, client, db, test_master, monkeypatch
):
    master = Master(
        user_id=test_master.id,
        domain=f"old-{entitlement}",
        can_work_independently=True,
        bio="",
        experience_years=0,
    )
    db.add(master)
    if entitlement == "paid":
        plan = SubscriptionPlan(
            name="DomainPaid",
            display_name="Domain Paid",
            subscription_type=SubscriptionType.MASTER,
            price_1month=1,
            price_3months=1,
            price_6months=1,
            price_12months=1,
            features={"can_customize_domain": True},
            limits={},
        )
        db.add(plan)
        db.flush()
        db.add(Subscription(
            user_id=test_master.id,
            subscription_type=SubscriptionType.MASTER,
            status=SubscriptionStatus.ACTIVE,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30),
            price=1,
            daily_rate=1,
            is_active=True,
            plan_id=plan.id,
        ))
    db.commit()

    response = client.put(
        "/api/master/ios-web/domain",
        json={"domain": f"  fixed-{entitlement}  "},
        headers=_ios_headers(client, test_master, monkeypatch),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"domain": f"fixed-{entitlement}"}


def test_ios_web_domain_rejects_reserved_and_duplicate(
    client, db, test_master, test_user, monkeypatch
):
    other_user_id = test_user.id
    master = Master(
        user_id=test_master.id,
        domain="original-domain",
        can_work_independently=True,
        bio="",
        experience_years=0,
    )
    db.add(master)
    db.commit()
    headers = _ios_headers(client, test_master, monkeypatch)

    reserved = client.put(
        "/api/master/ios-web/domain", json={"domain": "pricing"}, headers=headers
    )
    assert reserved.status_code == 400

    db.add(Master(
        user_id=other_user_id,
        domain="occupied-domain",
        can_work_independently=True,
        bio="",
        experience_years=0,
    ))
    db.commit()
    duplicate = client.put(
        "/api/master/ios-web/domain", json={"domain": "occupied-domain"}, headers=headers
    )
    assert duplicate.status_code == 400


def test_ordinary_free_web_domain_policy_remains_denied(
    client, db, test_master, test_master_token
):
    db.add(Master(
        user_id=test_master.id,
        domain="existing-free-domain",
        can_work_independently=True,
        bio="",
        experience_years=0,
    ))
    db.commit()

    dedicated = client.put(
        "/api/master/ios-web/domain",
        json={"domain": "ordinary-free-domain"},
        headers=_headers(test_master_token),
    )
    assert dedicated.status_code == 403

    legacy = client.put(
        "/api/master/profile",
        data={"domain": "ordinary-free-domain"},
        headers=_headers(test_master_token),
    )
    assert legacy.status_code in {400, 403}
    db.expire_all()
    assert db.query(Master).filter(Master.user_id == test_master.id).one().domain == "existing-free-domain"
