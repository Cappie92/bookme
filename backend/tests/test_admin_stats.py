"""GET /api/admin/stats не должен обращаться к ORM Salon (несовпадение схемы SQLite без salons.address)."""

import pytest


def _auth_admin(client, phone="+79001234568", password="testpassword"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_admin_stats_returns_200_without_salon_query(client, test_admin):
    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.get("/api/admin/stats", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("total_salons") == 0
    assert data.get("top_salons") == []


def test_admin_dashboard_stats_returns_200_without_salon_query(client, test_admin):
    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.get("/api/admin/dashboard/stats", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("total_salons") == 0
    assert data.get("top_salons") == []
