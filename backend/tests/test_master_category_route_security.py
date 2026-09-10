"""Full-app regression for removal of the legacy anonymous category writer."""

import pytest

from auth import get_password_hash
from main import app
from models import Master, MasterServiceCategory, User, UserRole


@pytest.fixture
def category_owners(db, test_master):
    other = User(
        phone="+79008889901",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.MASTER,
        is_active=True,
        is_phone_verified=True,
    )
    db.add(other)
    db.flush()
    first = Master(user_id=test_master.id, bio="", experience_years=0)
    second = Master(user_id=other.id, bio="", experience_years=0)
    db.add_all([first, second])
    db.commit()
    # The shared client fixture closes its DB session after each request.
    # Keep scalar identities rather than expired ORM objects across requests.
    return first.id, second.id


@pytest.mark.parametrize("actor", ["anonymous", "master", "admin"])
def test_removed_category_route_is_404_without_writes(
    client, db, category_owners, actor, request
):
    headers = {}
    if actor != "anonymous":
        token = request.getfixturevalue(f"test_{actor}_token")["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
    before = db.query(MasterServiceCategory).count()

    response = client.post(
        "/api/master/test-category", json={"name": "Must not be created"}, headers=headers
    )

    assert response.status_code == 404
    assert db.query(MasterServiceCategory).count() == before


def test_removed_category_route_not_mounted_in_full_app():
    assert not any(
        getattr(route, "path", "").rstrip("/") == "/api/master/test-category"
        or getattr(getattr(route, "endpoint", None), "__name__", "") == "test_create_category"
        for route in app.routes
    )


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/master/categories"),
    ("POST", "/api/master/categories"),
    ("PUT", "/api/master/categories/1"),
    ("DELETE", "/api/master/categories/1"),
])
def test_real_category_endpoints_require_auth(client, db, category_owners, method, path):
    before = db.query(MasterServiceCategory).count()
    response = client.request(method, path, json={"name": "Unauthorized"})
    assert response.status_code in (401, 403)
    assert db.query(MasterServiceCategory).count() == before


def test_real_category_crud_and_service_creation_still_work(
    client, db, category_owners, test_master_token
):
    owner_id, _ = category_owners
    headers = {"Authorization": f"Bearer {test_master_token['access_token']}"}
    created = client.post("/api/master/categories", json={"name": "Owned"}, headers=headers)
    assert created.status_code == 200
    category_id = created.json()["id"]
    assert db.get(MasterServiceCategory, category_id).master_id == owner_id
    listed = client.get("/api/master/categories", headers=headers)
    assert listed.status_code == 200
    assert category_id in {item["id"] for item in listed.json()}
    updated = client.put(
        f"/api/master/categories/{category_id}", json={"name": "Renamed"}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"
    service = client.post(
        "/api/master/services",
        json={"name": "Owned service", "category_id": category_id, "duration": 30, "price": 100},
        headers=headers,
    )
    assert service.status_code == 200
    assert service.json()["category_id"] == category_id
    # Delete the service explicitly: this test does not alter category cascade semantics.
    assert client.delete(f"/api/master/services/{service.json()['id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/master/categories/{category_id}", headers=headers).status_code == 200
    assert db.get(MasterServiceCategory, category_id) is None


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_other_master_cannot_modify_category(
    client, db, category_owners, test_master_token, method
):
    _, other_owner_id = category_owners
    category = MasterServiceCategory(master_id=other_owner_id, name="Other owner")
    db.add(category)
    db.commit()
    category_id = category.id
    headers = {"Authorization": f"Bearer {test_master_token['access_token']}"}

    listed = client.get("/api/master/categories", headers=headers)
    assert listed.status_code == 200
    assert category_id not in {item["id"] for item in listed.json()}
    response = client.request(
        method, f"/api/master/categories/{category_id}", json={"name": "Not allowed"}, headers=headers
    )
    # Preserve the existing policy: foreign PUT is 400, foreign DELETE is 404.
    assert response.status_code == (400 if method == "PUT" else 404)
    db.expire_all()
    preserved = db.get(MasterServiceCategory, category_id)
    assert preserved is not None
    assert preserved.master_id == other_owner_id
    assert preserved.name == "Other owner"
