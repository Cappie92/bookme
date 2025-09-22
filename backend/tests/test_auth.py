from fastapi import status

def test_register_user(client, db):
    user_data = {
        "email": "test@example.com",
        "password": "testpassword",
        "phone": "+79001234567",
        "full_name": "Test User",
        "role": "client",
    }
    response = client.post("/auth/register", json=user_data)
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
    response = client.post("/auth/register", json=user_data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_login_success(client, test_user):
    response = client.post(
        "/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, test_user):
    response = client.post(
        "/auth/login", json={"phone": test_user.phone, "password": "wrongpassword"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_login_nonexistent_user(client):
    response = client.post(
        "/auth/login", json={"phone": "+79999999999", "password": "password"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_refresh_token(client, test_user):
    # Сначала получаем токены через логин
    login_response = client.post(
        "/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    refresh_token = login_response.json()["refresh_token"]

    # Используем refresh token для получения нового access token
    response = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_refresh_token_invalid(client):
    response = client.post("/auth/refresh", json={"refresh_token": "invalid_token"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_protected_route_with_token(client, test_user_token):
    headers = {"Authorization": f"Bearer {test_user_token['access_token']}"}
    response = client.get("/auth/users/me", headers=headers)
    assert response.status_code == status.HTTP_200_OK


def test_protected_route_without_token(client):
    response = client.get("/auth/users/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_admin_route_access(client, test_admin_token):
    headers = {"Authorization": f"Bearer {test_admin_token['access_token']}"}
    response = client.get("/admin/users", headers=headers)
    assert response.status_code == status.HTTP_200_OK


def test_admin_route_unauthorized(client, test_user_token):
    headers = {"Authorization": f"Bearer {test_user_token['access_token']}"}
    response = client.get("/admin/users", headers=headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN
