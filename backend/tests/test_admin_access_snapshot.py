import pytest

from auth import create_user_access_token, get_password_hash
from models import ModeratorPermissions, User, UserRole

ENFORCED_ADMIN_UI_PERMISSIONS = {
    "can_view_users",
    "can_edit_users",
    "can_delete_users",
    "can_view_blog",
    "can_create_blog",
    "can_edit_blog",
    "can_delete_blog",
    "can_publish_blog",
    "can_view_stats",
}


def _user(db, name: str, role: UserRole) -> User:
    user = User(
        email=f"{name}@access.test",
        phone=f"+7998{abs(hash(name)) % 10_000_000:07d}",
        full_name=name,
        hashed_password=get_password_hash("testpassword"),
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
        is_always_free=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_user_access_token(user)}"}


def _permission_names():
    return {
        column.name
        for column in ModeratorPermissions.__table__.columns
        if column.name.startswith("can_")
    }


def test_access_requires_authentication(client):
    assert client.get("/api/admin/access").status_code == 401
    invalid = client.get("/api/admin/access", headers={"Authorization": "Bearer invalid"})
    assert invalid.status_code == 401


@pytest.mark.parametrize(
    "role", [UserRole.CLIENT, UserRole.MASTER, UserRole.INDIE, UserRole.SALON]
)
def test_access_rejects_non_staff_roles(client, db, role):
    actor = _user(db, f"access-{role.value}", role)
    response = client.get("/api/admin/access", headers=_headers(actor))
    assert response.status_code == 403
    assert "permissions" not in response.text


def test_admin_snapshot_grants_every_known_permission(client, db):
    admin = _user(db, "access-admin", UserRole.ADMIN)
    response = client.get("/api/admin/access", headers=_headers(admin))
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert set(body) == {"role", "permissions"}
    assert body["role"] == "admin"
    assert set(body["permissions"]) == _permission_names()
    assert all(value is True for value in body["permissions"].values())


def test_moderator_without_permission_row_gets_all_false(client, db):
    moderator = _user(db, "access-no-row", UserRole.MODERATOR)
    body = client.get("/api/admin/access", headers=_headers(moderator)).json()
    assert body["role"] == "moderator"
    assert set(body["permissions"]) == _permission_names()
    assert not any(body["permissions"].values())


def test_moderator_snapshot_matches_db_grants_and_null_is_false(client, db):
    moderator = _user(db, "access-mod", UserRole.MODERATOR)
    db.add(ModeratorPermissions(
        user_id=moderator.id,
        can_view_users=True,
        can_view_blog=True,
        can_edit_blog=True,
        can_view_stats=None,
    ))
    other = _user(db, "access-other-mod", UserRole.MODERATOR)
    db.add(ModeratorPermissions(user_id=other.id, can_delete_users=True, can_publish_blog=True))
    db.commit()

    body = client.get("/api/admin/access", headers=_headers(moderator)).json()
    granted = {name for name, value in body["permissions"].items() if value}
    assert granted == {"can_view_users", "can_view_blog", "can_edit_blog"}
    assert all(isinstance(value, bool) for value in body["permissions"].values())
    assert set(body) == {"role", "permissions"}


def test_snapshot_matches_endpoint_guards(client, db):
    """A snapshot grant means the guarded endpoint answers; a missing grant means 403."""
    moderator = _user(db, "access-guard-mod", UserRole.MODERATOR)
    db.add(ModeratorPermissions(user_id=moderator.id, can_view_blog=True))
    db.commit()
    headers = _headers(moderator)

    snapshot = client.get("/api/admin/access", headers=headers).json()["permissions"]
    assert snapshot["can_view_blog"] is True
    assert client.get("/api/admin/blog/posts", headers=headers).status_code == 200
    assert snapshot["can_view_users"] is False
    assert client.get("/api/admin/users", headers=headers).status_code == 403
    assert snapshot["can_view_stats"] is False
    assert client.get("/api/admin/stats", headers=headers).status_code == 403


def test_permission_change_is_visible_on_next_request(client, db):
    moderator = _user(db, "access-change", UserRole.MODERATOR)
    db.add(ModeratorPermissions(user_id=moderator.id, can_view_users=True))
    db.commit()
    moderator_id = moderator.id
    headers = _headers(moderator)
    assert client.get("/api/admin/access", headers=headers).json()["permissions"]["can_view_users"]

    db.query(ModeratorPermissions).filter_by(user_id=moderator_id).one().can_view_users = False
    db.commit()
    revoked = client.get("/api/admin/access", headers=headers).json()["permissions"]
    assert revoked["can_view_users"] is False


def test_role_change_is_read_from_db_not_from_token(client, db):
    moderator = _user(db, "access-demoted", UserRole.MODERATOR)
    moderator_id = moderator.id
    headers = _headers(moderator)
    assert client.get("/api/admin/access", headers=headers).status_code == 200

    db.query(User).filter_by(id=moderator_id).one().role = UserRole.CLIENT
    db.commit()
    assert client.get("/api/admin/access", headers=headers).status_code == 403


def test_snapshot_does_not_write_permission_rows(client, db):
    moderator = _user(db, "access-readonly", UserRole.MODERATOR)
    moderator_id = moderator.id
    assert client.get("/api/admin/access", headers=_headers(moderator)).status_code == 200
    assert db.query(ModeratorPermissions).filter_by(user_id=moderator_id).count() == 0


def test_enforced_admin_ui_permissions_exist_in_model():
    assert ENFORCED_ADMIN_UI_PERMISSIONS <= _permission_names()
