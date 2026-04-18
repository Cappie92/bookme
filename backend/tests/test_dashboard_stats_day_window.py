"""
Тесты для day window mode: anchor_date, window_before, window_after.
"""
from datetime import date, datetime, timedelta

import pytest

from auth import get_password_hash
from models import Master, User, UserRole


def _auth_headers(client, phone: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def master_user(db):
    user = User(
        email="stats_day@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001112233",
        full_name="Stats Day",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()
    return user


def test_day_window_19_points(client, db, master_user):
    """period=day + anchor_date + window_before=9, window_after=9 => 19 точек, selected_index=9."""
    anchor = "2026-01-15"
    headers = _auth_headers(client, master_user.phone, "test123")
    r = client.get(
        f"/api/master/dashboard/stats?period=day&anchor_date={anchor}&window_before=9&window_after=9",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    weeks = data.get("weeks_data", [])
    assert len(weeks) == 19, f"expected 19 points, got {len(weeks)}"
    assert data.get("anchor_date") == anchor
    assert data.get("range_start") == "2026-01-06"
    assert data.get("range_end") == "2026-01-24"
    assert data.get("selected_index") == 9
    # Проверяем непрерывность дат
    for i, p in enumerate(weeks):
        expected_date = (date(2026, 1, 6) + timedelta(days=i)).isoformat()
        assert p.get("period_start") == expected_date, f"point {i}: expected {expected_date}, got {p.get('period_start')}"


def test_day_window_zero_fill(client, db, master_user):
    """Дни без данных должны иметь bookings=0, income=0."""
    anchor = "2026-02-01"
    headers = _auth_headers(client, master_user.phone, "test123")
    r = client.get(
        f"/api/master/dashboard/stats?period=day&anchor_date={anchor}&window_before=2&window_after=2",
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    weeks = data.get("weeks_data", [])
    assert len(weeks) == 5
    for p in weeks:
        assert "bookings" in p
        assert "income" in p
        assert isinstance(p["bookings"], (int, float))
        assert isinstance(p["income"], (int, float))
        # Stacked chart contract (Phase 1)
        assert p.get("bookings_total") == p["bookings"]
        assert p.get("income_confirmed_rub") == p["income"]
        for key in (
            "bookings_confirmed",
            "bookings_pending",
            "bookings_total",
            "income_confirmed_rub",
            "income_pending_rub",
            "income_total_rub",
        ):
            assert key in p
        assert (p["bookings_confirmed"] or 0) + (p["bookings_pending"] or 0) == p["bookings_total"]


def test_day_backward_compat(client, db, master_user):
    """Без window_* параметров day возвращает 5 точек (legacy)."""
    headers = _auth_headers(client, master_user.phone, "test123")
    r = client.get("/api/master/dashboard/stats?period=day&offset=0", headers=headers)
    assert r.status_code == 200
    data = r.json()
    weeks = data.get("weeks_data", [])
    assert len(weeks) == 5
    assert "anchor_date" not in data or data.get("anchor_date") is None
