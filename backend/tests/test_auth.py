from fastapi import status

from models import Master, User


def test_register_user(client, db):
    user_data = {
        "email": "test@example.com",
        "password": "testpassword",
        "phone": "+79001234567",
        "full_name": "Test User",
        "role": "client",
    }
    response = client.post("/api/auth/register", json=user_data)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_register_duplicate_email(client, test_user):
    user_data = {
        "email": test_user.email,
        "password": "testpassword",
        "phone": "+79001234568",
        "full_name": "Another User",
        "role": "client",
    }
    response = client.post("/api/auth/register", json=user_data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_register_master_with_city_timezone_sets_confirmed(client, db):
    """Регистрация мастера с city+timezone -> master.timezone_confirmed=True, city/timezone сохранены."""
    user_data = {
        "email": "master_reg@example.com",
        "phone": "+79001112233",
        "full_name": "Master User",
        "password": "testpassword",
        "role": "master",
        "city": "Москва",
        "timezone": "Europe/Moscow",
    }
    response = client.post("/api/auth/register", json=user_data)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    u = db.query(User).filter(User.email == user_data["email"]).first()
    assert u is not None
    m = db.query(Master).filter(Master.user_id == u.id).first()
    assert m is not None
    assert (m.city or "").strip() == "Москва"
    assert (m.timezone or "").strip() == "Europe/Moscow"
    assert m.timezone_confirmed is True


def test_register_master_without_city_or_timezone_returns_400(client, db):
    """Регистрация мастера без city или без timezone -> 400."""
    base = {
        "email": "m1@ex.com",
        "phone": "+79001112234",
        "full_name": "M1",
        "password": "testpassword",
        "role": "master",
    }
    r1 = client.post("/api/auth/register", json={**base, "phone": "+79001112234"})
    assert r1.status_code == status.HTTP_400_BAD_REQUEST

    r2 = client.post(
        "/api/auth/register",
        json={**base, "phone": "+79001112235", "city": "Москва"},
    )
    assert r2.status_code == status.HTTP_400_BAD_REQUEST

    r3 = client.post(
        "/api/auth/register",
        json={**base, "phone": "+79001112236", "timezone": "Europe/Moscow"},
    )
    assert r3.status_code == status.HTTP_400_BAD_REQUEST


def test_login_success(client, test_user):
    response = client.post(
        "/api/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, test_user):
    response = client.post(
        "/api/auth/login", json={"phone": test_user.phone, "password": "wrongpassword"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_login_nonexistent_user(client):
    response = client.post(
        "/api/auth/login", json={"phone": "+79999999999", "password": "password"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_refresh_token(client, test_user):
    # Сначала получаем токены через логин
    login_response = client.post(
        "/api/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    refresh_token = login_response.json()["refresh_token"]

    # Используем refresh token для получения нового access token
    response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_refresh_token_invalid(client):
    response = client.post("/api/auth/refresh", json={"refresh_token": "invalid_token"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_protected_route_with_token(client, test_user_token):
    headers = {"Authorization": f"Bearer {test_user_token['access_token']}"}
    response = client.get("/api/auth/users/me", headers=headers)
    assert response.status_code == status.HTTP_200_OK


def test_protected_route_without_token(client):
    response = client.get("/api/auth/users/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_admin_route_access(client, test_admin_token):
    headers = {"Authorization": f"Bearer {test_admin_token['access_token']}"}
    response = client.get("/api/admin/users", headers=headers)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    assert data["skip"] == 0
    assert data["limit"] == 30


def test_admin_route_unauthorized(client, test_user_token):
    headers = {"Authorization": f"Bearer {test_user_token['access_token']}"}
    response = client.get("/api/admin/users", headers=headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN
