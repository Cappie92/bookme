"""Stage 1 push/notification foundations: schema, API, ownership, no Expo sender."""
from __future__ import annotations

from datetime import datetime, timedelta
from hashlib import sha256
from types import SimpleNamespace
from uuid import uuid4

from auth import create_user_access_token
from models import Notification, NotificationOutbox, PushDevice, User
from services.notifications import create_notification
from settings import get_settings


INSTALL_A = "11111111-1111-1111-1111-111111111111"
INSTALL_B = "22222222-2222-2222-2222-222222222222"
TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]"
TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]"


def _actor(user: User) -> SimpleNamespace:
    """Capture id/headers before TestClient closes the shared session."""
    return SimpleNamespace(
        id=int(user.id),
        headers={"Authorization": f"Bearer {create_user_access_token(user)}"},
    )


def _register_body(**overrides):
    body = {
        "installation_id": INSTALL_A,
        "token": TOKEN_A,
        "provider": "expo",
        "platform": "ios",
        "app_version": "1.0.1",
        "build_number": "8",
        "locale": "ru-RU",
        "timezone": "Europe/Moscow",
    }
    body.update(overrides)
    return body


def _snapshot(db) -> str:
    db.expire_all()
    from database import Base

    with db.get_bind().connect() as connection:
        rows = [
            (table.name, sorted(map(repr, connection.execute(table.select()).all())))
            for table in Base.metadata.sorted_tables
        ]
    return sha256(repr(rows).encode()).hexdigest()


def _seed_notification(db, user_id: int, *, title: str, dedup_key: str | None = None, **kwargs):
    row, created = create_notification(
        db,
        user_id=user_id,
        type="booking_created",
        title=title,
        body="Test body",
        dedup_key=dedup_key,
        **kwargs,
    )
    assert created is True
    return row


def test_register_first_device(client, db, test_user):
    actor = _actor(test_user)
    response = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["installation_id"] == INSTALL_A
    assert payload["is_active"] is True
    assert TOKEN_A not in response.text
    assert set(payload) == {"id", "installation_id", "is_active"}

    device = db.query(PushDevice).filter(PushDevice.id == payload["id"]).one()
    assert device.user_id == actor.id
    assert device.token == TOKEN_A
    assert device.provider == "expo"
    assert device.platform == "ios"
    assert device.is_active is True
    assert device.invalidated_at is None
    assert device.invalid_reason is None


def test_register_same_install_is_idempotent_and_refreshes_token(client, db, test_user):
    actor = _actor(test_user)
    first = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(),
    )
    assert first.status_code == 200
    first_id = first.json()["id"]

    second = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(token=TOKEN_B, app_version="1.0.2"),
    )
    assert second.status_code == 200
    assert second.json()["id"] == first_id
    assert db.query(PushDevice).count() == 1
    device = db.query(PushDevice).one()
    assert device.token == TOKEN_B
    assert device.app_version == "1.0.2"
    assert device.is_active is True


def test_same_install_rebinds_to_new_user(client, db, test_user, test_master):
    owner = _actor(test_user)
    next_owner = _actor(test_master)
    assert (
        client.put(
            "/api/push/devices",
            headers=owner.headers,
            json=_register_body(),
        ).status_code
        == 200
    )
    rebound = client.put(
        "/api/push/devices",
        headers=next_owner.headers,
        json=_register_body(token=TOKEN_B),
    )
    assert rebound.status_code == 200
    assert db.query(PushDevice).count() == 1
    device = db.query(PushDevice).one()
    assert device.user_id == next_owner.id
    assert device.token == TOKEN_B
    assert device.is_active is True
    assert device.invalidated_at is None


def test_same_token_on_another_install_deactivates_previous(client, db, test_user, test_master):
    owner = _actor(test_user)
    other_owner = _actor(test_master)
    assert (
        client.put(
            "/api/push/devices",
            headers=owner.headers,
            json=_register_body(),
        ).status_code
        == 200
    )
    other = client.put(
        "/api/push/devices",
        headers=other_owner.headers,
        json=_register_body(installation_id=INSTALL_B, token=TOKEN_A),
    )
    assert other.status_code == 200
    rows = {row.installation_id: row for row in db.query(PushDevice).all()}
    assert rows[INSTALL_A].is_active is False
    assert rows[INSTALL_A].invalid_reason == "replaced"
    assert rows[INSTALL_A].token == f"replaced:{rows[INSTALL_A].id}"
    assert rows[INSTALL_A].user_id == owner.id
    assert rows[INSTALL_B].is_active is True
    assert rows[INSTALL_B].token == TOKEN_A
    assert rows[INSTALL_B].user_id == other_owner.id
    assert db.query(PushDevice).filter(PushDevice.token == TOKEN_A).count() == 1


def test_logout_deactivates_own_install_and_is_idempotent(client, db, test_user):
    actor = _actor(test_user)
    assert (
        client.put(
            "/api/push/devices",
            headers=actor.headers,
            json=_register_body(),
        ).status_code
        == 200
    )
    first = client.delete(f"/api/push/devices/{INSTALL_A}", headers=actor.headers)
    assert first.status_code == 204
    device = db.query(PushDevice).one()
    assert device.is_active is False
    assert device.invalid_reason == "logout"
    assert device.invalidated_at is not None
    assert device.token == TOKEN_A

    second = client.delete(f"/api/push/devices/{INSTALL_A}", headers=actor.headers)
    assert second.status_code == 204
    assert db.query(PushDevice).one().invalid_reason == "logout"


def test_cannot_deactivate_foreign_install(client, db, test_user, test_master):
    owner = _actor(test_user)
    other = _actor(test_master)
    assert (
        client.put(
            "/api/push/devices",
            headers=owner.headers,
            json=_register_body(),
        ).status_code
        == 200
    )
    response = client.delete(
        f"/api/push/devices/{INSTALL_A}",
        headers=other.headers,
    )
    assert response.status_code == 204
    device = db.query(PushDevice).one()
    assert device.user_id == owner.id
    assert device.is_active is True
    assert device.invalid_reason is None


def test_deactivate_unknown_install_is_silent_204(client, db, test_user):
    actor = _actor(test_user)
    response = client.delete(
        f"/api/push/devices/{uuid4()}",
        headers=actor.headers,
    )
    assert response.status_code == 204
    assert db.query(PushDevice).count() == 0


def test_registration_flag_off_returns_503(client, db, test_user, monkeypatch):
    actor = _actor(test_user)
    monkeypatch.setattr(get_settings(), "PUSH_REGISTRATION_ENABLED", "false")
    response = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(),
    )
    assert response.status_code == 503
    assert response.headers.get("X-Error-Code") == "PUSH_REGISTRATION_DISABLED"
    assert db.query(PushDevice).count() == 0


def test_sender_flag_off_does_not_block_registration(client, db, test_user, monkeypatch):
    actor = _actor(test_user)
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
    response = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(),
    )
    assert response.status_code == 200
    assert db.query(PushDevice).count() == 1


def test_list_only_own_notifications(client, db, test_user, test_master):
    actor = _actor(test_user)
    other = _actor(test_master)
    mine_id = int(_seed_notification(db, actor.id, title="Mine").id)
    other_id = int(_seed_notification(db, other.id, title="Other").id)
    db.commit()

    response = client.get("/api/notifications", headers=actor.headers)
    assert response.status_code == 200
    payload = response.json()
    ids = [item["id"] for item in payload["items"]]
    assert ids == [mine_id]
    assert other_id not in ids
    assert payload["unread_count"] == 1
    assert "phone" not in response.text
    assert "user_id" not in payload["items"][0]
    assert set(payload["items"][0]) == {
        "id",
        "type",
        "title",
        "body",
        "entity_type",
        "entity_id",
        "data",
        "read_at",
        "created_at",
    }


def test_notification_cursor_pagination(client, db, test_user):
    actor = _actor(test_user)
    base = datetime(2026, 9, 14, 12, 0, 0)
    for index in range(5):
        row = _seed_notification(db, actor.id, title=f"N{index}", dedup_key=f"page-{index}")
        row.created_at = base + timedelta(seconds=index)
    db.commit()

    first = client.get(
        "/api/notifications",
        headers=actor.headers,
        params={"limit": 2},
    )
    assert first.status_code == 200
    page = first.json()
    assert [item["title"] for item in page["items"]] == ["N4", "N3"]
    assert page["next_cursor"]
    assert page["unread_count"] == 5

    second = client.get(
        "/api/notifications",
        headers=actor.headers,
        params={"limit": 2, "cursor": page["next_cursor"]},
    )
    assert [item["title"] for item in second.json()["items"]] == ["N2", "N1"]
    third = client.get(
        "/api/notifications",
        headers=actor.headers,
        params={"limit": 2, "cursor": second.json()["next_cursor"]},
    )
    assert [item["title"] for item in third.json()["items"]] == ["N0"]
    assert third.json()["next_cursor"] is None


def test_unread_count_and_mark_one_read(client, db, test_user, test_master):
    actor = _actor(test_user)
    other = _actor(test_master)
    mine_id = int(_seed_notification(db, actor.id, title="Mine").id)
    other_id = int(_seed_notification(db, other.id, title="Other").id)
    db.commit()

    count = client.get("/api/notifications/unread-count", headers=actor.headers)
    assert count.status_code == 200
    assert count.json() == {"unread_count": 1}

    read = client.post(f"/api/notifications/{mine_id}/read", headers=actor.headers)
    assert read.status_code == 200
    assert read.json()["read_at"] is not None
    again = client.post(f"/api/notifications/{mine_id}/read", headers=actor.headers)
    assert again.status_code == 200
    assert again.json()["read_at"] == read.json()["read_at"]

    assert client.get(
        "/api/notifications/unread-count", headers=actor.headers
    ).json() == {"unread_count": 0}
    assert db.get(Notification, other_id).read_at is None


def test_mark_foreign_notification_read_is_404(client, db, test_user, test_master):
    actor = _actor(test_user)
    other_id = int(_seed_notification(db, _actor(test_master).id, title="Other").id)
    db.commit()
    response = client.post(
        f"/api/notifications/{other_id}/read",
        headers=actor.headers,
    )
    assert response.status_code == 404
    assert db.get(Notification, other_id).read_at is None


def test_read_all_only_own(client, db, test_user, test_master):
    actor = _actor(test_user)
    other = _actor(test_master)
    _seed_notification(db, actor.id, title="A", dedup_key="a")
    _seed_notification(db, actor.id, title="B", dedup_key="b")
    other_id = int(_seed_notification(db, other.id, title="C", dedup_key="c").id)
    db.commit()

    response = client.post("/api/notifications/read-all", headers=actor.headers)
    assert response.status_code == 200
    assert response.json()["updated_count"] == 2
    assert db.query(Notification).filter(
        Notification.user_id == actor.id,
        Notification.read_at.is_(None),
    ).count() == 0
    assert db.get(Notification, other_id).read_at is None


def test_get_notifications_has_no_writes(client, db, test_user):
    actor = _actor(test_user)
    _seed_notification(db, actor.id, title="Mine")
    db.commit()
    before = _snapshot(db)
    listed = client.get("/api/notifications", headers=actor.headers)
    unread = client.get("/api/notifications/unread-count", headers=actor.headers)
    assert listed.status_code == 200
    assert unread.status_code == 200
    assert _snapshot(db) == before


def test_create_notification_dedup_and_no_outbox(db, test_user):
    first, created = create_notification(
        db,
        user_id=test_user.id,
        type="booking_created",
        title="Hello",
        body="Body",
        entity_type="booking",
        entity_id=42,
        dedup_key="booking:42:created",
        data={"booking_id": 42, "phone": "+79001234567", "token": TOKEN_A},
    )
    assert created is True
    second, created_again = create_notification(
        db,
        user_id=test_user.id,
        type="booking_created",
        title="Hello again",
        body="Body again",
        dedup_key="booking:42:created",
    )
    assert created_again is False
    assert second.id == first.id
    assert first.title == "Hello"
    assert first.data_json == {"booking_id": 42}
    assert db.query(Notification).count() == 1
    assert db.query(NotificationOutbox).count() == 0

    extra, extra_created = create_notification(
        db,
        user_id=test_user.id,
        type="booking_cancelled",
        title="No key",
        body="Body",
    )
    assert extra_created is True
    assert extra.dedup_key is None
    third, third_created = create_notification(
        db,
        user_id=test_user.id,
        type="booking_rescheduled",
        title="Also no key",
        body="Body",
    )
    assert third_created is True
    assert db.query(Notification).count() == 3


def test_unread_only_filter(client, db, test_user):
    actor = _actor(test_user)
    unread_id = int(_seed_notification(db, actor.id, title="Unread", dedup_key="u").id)
    read = _seed_notification(db, actor.id, title="Read", dedup_key="r")
    read.read_at = datetime.utcnow()
    db.commit()

    response = client.get(
        "/api/notifications",
        headers=actor.headers,
        params={"unread_only": True},
    )
    assert [item["id"] for item in response.json()["items"]] == [unread_id]
    assert response.json()["unread_count"] == 1


def test_deleted_and_inactive_users_cannot_mutate(client, db, test_user, test_master):
    inactive_headers = _actor(test_user).headers
    deleted_headers = _actor(test_master).headers
    test_user.is_active = False
    test_master.deleted_at = datetime.utcnow()
    db.commit()

    for headers in (inactive_headers, deleted_headers):
        register = client.put(
            "/api/push/devices",
            headers=headers,
            json=_register_body(),
        )
        assert register.status_code == 401
        deactivate = client.delete(f"/api/push/devices/{INSTALL_A}", headers=headers)
        assert deactivate.status_code == 401
        listed = client.get("/api/notifications", headers=headers)
        assert listed.status_code == 401
    assert db.query(PushDevice).count() == 0


def test_unauthenticated_requests_are_rejected(client):
    assert client.put("/api/push/devices", json=_register_body()).status_code == 401
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/read-all").status_code == 401


def test_invalid_provider_and_token_rejected(client, db, test_user):
    actor = _actor(test_user)
    bad_provider = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(provider="fcm"),
    )
    assert bad_provider.status_code == 422
    bad_platform = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(platform="web"),
    )
    assert bad_platform.status_code == 422
    bad_token = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(token="replaced:1"),
    )
    assert bad_token.status_code == 422
    assert db.query(PushDevice).count() == 0


def test_responses_and_logs_do_not_include_full_token(client, db, test_user, caplog):
    actor = _actor(test_user)
    caplog.set_level("DEBUG")
    response = client.put(
        "/api/push/devices",
        headers=actor.headers,
        json=_register_body(),
    )
    assert response.status_code == 200
    listed = client.get("/api/notifications", headers=actor.headers)
    assert TOKEN_A not in response.text
    assert TOKEN_A not in listed.text
    assert TOKEN_A not in caplog.text
