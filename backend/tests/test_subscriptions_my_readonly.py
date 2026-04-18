"""
Тест: GET /api/subscriptions/my — read-only, не создаёт подписку при отсутствии.
"""
import pytest

from auth import get_password_hash
from models import Master, Subscription, User, UserRole


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_subscriptions_my_returns_404_when_no_subscription(client, db):
    """При отсутствии подписки /my возвращает 404, не создаёт запись."""
    user = User(
        email="master_no_sub@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79006660001",
        full_name="Master No Sub",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    count_before = db.query(Subscription).filter(Subscription.user_id == user.id).count()
    assert count_before == 0

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)

    assert resp.status_code == 404
    assert resp.json().get("detail") == "no_subscription"

    count_after = db.query(Subscription).filter(Subscription.user_id == user.id).count()
    assert count_after == 0, "GET /my не должен создавать подписку"


def test_subscriptions_my_404_on_repeat_call(client, db):
    """Повторный вызов /my при отсутствии подписки — снова 404."""
    user = User(
        email="master_no_sub2@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79006660002",
        full_name="Master No Sub 2",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")

    resp1 = client.get("/api/subscriptions/my", headers=headers)
    assert resp1.status_code == 404

    resp2 = client.get("/api/subscriptions/my", headers=headers)
    assert resp2.status_code == 404
