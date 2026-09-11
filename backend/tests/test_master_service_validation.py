import pytest
from models import Master, MasterService


@pytest.fixture
def service_fixture(client, db, test_master, test_master_token):
    db.add(Master(user_id=test_master.id, timezone="Europe/Moscow"))
    db.commit()
    headers = {"Authorization": f"Bearer {test_master_token['access_token']}"}
    category = client.post("/api/master/categories", headers=headers, json={"name": "Validation"})
    assert category.status_code == 200
    payload = {"name": "Service", "category_id": category.json()["id"], "duration": 30, "price": 100, "description": "Remove me"}
    created = client.post("/api/master/services", headers=headers, json=payload)
    assert created.status_code == 200
    return headers, payload, created.json()["id"]


@pytest.mark.parametrize("field,value", [
    ("price", -1), ("price", "NaN"), ("price", "Infinity"), ("price", "-Infinity"),
    ("duration", -1), ("duration", 0), ("duration", 9), ("duration", 481), ("duration", 10.5),
])
@pytest.mark.parametrize("method", ["POST", "PUT"])
def test_service_numeric_bounds_before_database_write(client, db, service_fixture, field, value, method):
    headers, payload, service_id = service_fixture
    path = "/api/master/services" + (f"/{service_id}" if method == "PUT" else "")
    response = client.request(method, path, headers=headers, json={**payload, "name": "Changed", field: value})
    assert response.status_code == 422
    db.expire_all()
    assert db.query(MasterService).count() == 1
    saved = db.get(MasterService, service_id)
    assert (saved.name, saved.duration, saved.price) == ("Service", 30, 100)


@pytest.mark.parametrize("price,duration", [(0, 10), (100.5, 480), (1000000, 30)])
def test_service_create_edit_zero_and_clear_description_refetch(client, service_fixture, price, duration):
    headers, payload, service_id = service_fixture
    created = client.post("/api/master/services", headers=headers, json={**payload, "name": "Second", "price": price, "duration": duration})
    assert created.status_code == 200
    edited = client.put(f"/api/master/services/{service_id}", headers=headers, json={"description": "", "price": price, "duration": duration, "category_id": None})
    assert edited.status_code == 200
    listed = client.get("/api/master/services", headers=headers).json()
    saved = next(row for row in listed if row["id"] == service_id)
    assert (saved["description"], saved["price"], saved["duration"]) == ("", price, duration)
    assert saved["category_id"] == payload["category_id"]


def test_create_still_requires_category(client, service_fixture):
    headers, payload, _ = service_fixture
    payload.pop("category_id")
    assert client.post("/api/master/services", headers=headers, json=payload).status_code == 422
