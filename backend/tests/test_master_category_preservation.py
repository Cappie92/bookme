"""Deleting a master category must never delete its services (all platforms)."""
import pytest
from auth import get_current_active_user
from main import app
from models import Master, MasterService, MasterServiceCategory, User, UserRole


@pytest.mark.parametrize("service_count", [1, 3])
def test_category_delete_preserves_services_and_unrelated_state(client, db, service_count):
    user = User(phone="+79000000031", hashed_password="local-test-only", role=UserRole.MASTER,
                full_name="Category fixture", is_active=True)
    other_user = User(phone="+79000000032", hashed_password="local-test-only", role=UserRole.MASTER,
                      full_name="Other fixture", is_active=True)
    db.add_all([user, other_user])
    db.flush()
    master, other = Master(user_id=user.id), Master(user_id=other_user.id)
    db.add_all([master, other])
    db.flush()
    category = MasterServiceCategory(master_id=master.id, name="Removed category")
    unrelated = MasterServiceCategory(master_id=other.id, name="Untouched category")
    db.add_all([category, unrelated])
    db.flush()
    services = [MasterService(master_id=master.id, category_id=category.id,
                              name=f"Preserved {i}", price=100, duration=30)
                for i in range(service_count)]
    untouched = MasterService(master_id=other.id, category_id=unrelated.id,
                              name="Untouched", price=200, duration=60)
    db.add_all([*services, untouched])
    db.commit()
    category_id, unrelated_id = category.id, unrelated.id
    service_ids, untouched_id = [s.id for s in services], untouched.id
    app.dependency_overrides[get_current_active_user] = lambda: user
    try:
        forbidden = client.delete(f"/api/master/categories/{unrelated_id}")
        assert forbidden.status_code == 404
        response = client.delete(f"/api/master/categories/{category_id}")
        assert response.status_code == 200
        assert response.json() == {"message": "Категория удалена, услуги сохранены без категории"}
        db.expire_all()
        assert db.get(MasterServiceCategory, category_id) is None
        for service_id in service_ids:
            preserved = db.get(MasterService, service_id)
            assert preserved is not None
            assert preserved.category_id is None
            assert preserved.price == 100
            assert preserved.duration == 30
        assert db.get(MasterService, untouched_id).category_id == unrelated_id
        assert db.get(MasterServiceCategory, unrelated_id) is not None
        listed = client.get("/api/master/services")
        assert listed.status_code == 200
        assert {s["id"] for s in listed.json()} == set(service_ids)
        assert all(s["category_id"] is None and s["category_name"] is None
                   for s in listed.json())
        repeated = client.delete(f"/api/master/categories/{category_id}")
        assert repeated.status_code == 404
        assert db.query(MasterService).count() == service_count + 1
        # Existing uncategorized services accept explicit null on an ordinary edit.
        updated = client.put(f"/api/master/services/{service_ids[0]}", json={
            "name": "Edited without category", "description": "Preserved edit",
            "price": 150, "duration": 60, "category_id": None,
        })
        assert updated.status_code == 200
        assert updated.json()["category_id"] is None
        db.expire_all()
        edited = db.get(MasterService, service_ids[0])
        assert (edited.name, edited.price, edited.duration, edited.description) == (
            "Edited without category", 150, 60, "Preserved edit",
        )
        assert edited.category_id is None
        forbidden_edit = client.put(f"/api/master/services/{untouched_id}", json={
            "name": "Forbidden", "category_id": None,
        })
        assert forbidden_edit.status_code == 404
        db.expire_all()
        assert db.get(MasterService, untouched_id).name == "Untouched"
        assert db.get(MasterService, untouched_id).category_id == unrelated_id
        assert db.query(MasterService).count() == service_count + 1
    finally:
        app.dependency_overrides.pop(get_current_active_user, None)
