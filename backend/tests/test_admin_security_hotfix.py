from datetime import datetime

import pytest

from auth import create_user_access_token, get_password_hash, require_admin
from main import app
from models import (
    BlogPost,
    BlogPostStatus,
    ModeratorPermissions,
    Subscription,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)


def _user(db, name: str, role: UserRole) -> User:
    user = User(
        email=f"{name}@security.test",
        phone=f"+7999{abs(hash(name)) % 10_000_000:07d}",
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


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_user_access_token(user)}"}


def _moderator(db, name: str = "moderator", **grants):
    user = _user(db, name, UserRole.MODERATOR)
    permissions = ModeratorPermissions(user_id=user.id, **grants)
    db.add(permissions)
    db.commit()
    db.refresh(permissions)
    return user, permissions


@pytest.mark.parametrize(
    "role",
    [UserRole.CLIENT, UserRole.MASTER, UserRole.INDIE, UserRole.SALON],
)
def test_financial_retry_rejects_ordinary_roles_before_handler(client, db, role):
    actor = _user(db, f"retry-{role.value}", role)
    response = client.post(
        "/api/admin/payments/999999/retry-subscription-apply",
        headers=_headers(actor),
    )
    assert response.status_code == 403


def test_financial_retry_requires_auth_and_explicit_admin(client, db):
    anonymous = client.post("/api/admin/payments/999999/retry-subscription-apply")
    assert anonymous.status_code == 401

    moderator, _ = _moderator(db, "retry-moderator")
    denied = client.post(
        "/api/admin/payments/999999/retry-subscription-apply",
        headers=_headers(moderator),
    )
    assert denied.status_code == 403

    admin = _user(db, "retry-admin", UserRole.ADMIN)
    allowed_to_handler = client.post(
        "/api/admin/payments/999999/retry-subscription-apply",
        headers=_headers(admin),
    )
    assert allowed_to_handler.status_code == 404


def test_admin_router_root_dependency_executes_independently(client, db):
    actor = _user(db, "outer-admin-guard", UserRole.CLIENT)
    headers = _headers(actor)
    app.dependency_overrides[require_admin] = lambda: actor
    try:
        response = client.post(
            "/api/admin/payments/999999/retry-subscription-apply",
            headers=headers,
        )
    finally:
        app.dependency_overrides.pop(require_admin, None)

    # Endpoint-local ADMIN auth was overridden: this denial can only come from
    # the instantiated router-level admin/moderator dependency.
    assert response.status_code == 403


@pytest.mark.parametrize("new_role", [UserRole.ADMIN, UserRole.MODERATOR])
def test_moderator_cannot_promote_self_or_other_user(client, db, new_role):
    moderator, _ = _moderator(db, f"editor-{new_role.value}", can_edit_users=True)
    target = _user(db, f"target-{new_role.value}", UserRole.CLIENT)
    headers = _headers(moderator)
    user_ids = (moderator.id, target.id)

    for user_id in user_ids:
        before = db.get(User, user_id)
        original = (before.role, before.full_name)
        response = client.put(
            f"/api/admin/users/{user_id}",
            headers=headers,
            json={"full_name": "must-not-stick", "role": new_role.value},
        )
        assert response.status_code == 403
        db.expire_all()
        after = db.get(User, user_id)
        assert (after.role, after.full_name) == original


def test_moderator_profile_edit_is_allowed_but_authority_fields_are_atomic(client, db):
    moderator, _ = _moderator(db, "profile-editor", can_edit_users=True)
    target = _user(db, "profile-target", UserRole.MASTER)
    headers = _headers(moderator)
    target_id = target.id

    allowed = client.put(
        f"/api/admin/users/{target_id}",
        headers=headers,
        json={"full_name": "Updated ordinary profile"},
    )
    assert allowed.status_code == 200, allowed.text
    db.expire_all()
    assert db.get(User, target_id).full_name == "Updated ordinary profile"
    assert db.get(User, target_id).role == UserRole.MASTER

    denied = client.put(
        f"/api/admin/users/{target_id}",
        headers=headers,
        json={
            "full_name": "partial write forbidden",
            "is_always_free": True,
            "is_verified": False,
        },
    )
    assert denied.status_code == 403
    db.expire_all()
    unchanged = db.get(User, target_id)
    assert unchanged.full_name == "Updated ordinary profile"
    assert unchanged.is_always_free is False
    assert unchanged.is_verified is True


def test_moderator_profile_edit_does_not_rewrite_always_free_subscription(client, db):
    moderator, _ = _moderator(db, "always-free-editor", can_edit_users=True)
    target = _user(db, "always-free-target", UserRole.MASTER)
    target.is_always_free = True
    original_end = datetime(2030, 1, 1)
    subscription = Subscription(
        user_id=target.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime(2029, 1, 1),
        end_date=original_end,
        price=123.0,
        daily_rate=1.0,
        is_active=True,
    )
    db.add(subscription)
    db.commit()
    headers = _headers(moderator)
    target_id = target.id
    subscription_id = subscription.id

    response = client.put(
        f"/api/admin/users/{target_id}",
        headers=headers,
        json={
            "full_name": "Allowed profile change",
            "always_free_plan_id": None,
        },
    )
    assert response.status_code == 200, response.text
    db.expire_all()
    unchanged = db.get(Subscription, subscription_id)
    assert unchanged.end_date == original_end
    assert unchanged.price == 123.0


def test_moderator_cannot_edit_other_staff_but_admin_can_change_role(client, db):
    moderator, _ = _moderator(db, "staff-editor", can_edit_users=True)
    other, _ = _moderator(db, "other-staff")
    moderator_headers = _headers(moderator)
    other_id = other.id
    denied = client.put(
        f"/api/admin/users/{other_id}",
        headers=moderator_headers,
        json={"full_name": "forbidden staff edit"},
    )
    assert denied.status_code == 403

    admin = _user(db, "role-admin", UserRole.ADMIN)
    target = _user(db, "admin-transition-target", UserRole.CLIENT)
    admin_headers = _headers(admin)
    target_id = target.id
    allowed = client.put(
        f"/api/admin/users/{target_id}",
        headers=admin_headers,
        json={"role": UserRole.MODERATOR.value},
    )
    assert allowed.status_code == 200, allowed.text
    db.expire_all()
    assert db.get(User, target_id).role == UserRole.MODERATOR


def test_moderator_cannot_delete_other_moderator(client, db):
    moderator, _ = _moderator(db, "staff-deleter", can_delete_users=True)
    target, _ = _moderator(db, "staff-delete-target")
    headers = _headers(moderator)
    target_id = target.id

    response = client.delete(f"/api/admin/users/{target_id}", headers=headers)
    assert response.status_code == 403
    assert db.get(User, target_id) is not None


def _blog_payload(**overrides):
    payload = {
        "title": "Security post",
        "content": "<p>Security content with enough words for analysis.</p>",
        "status": BlogPostStatus.DRAFT.value,
    }
    payload.update(overrides)
    return payload


def test_blog_permissions_and_publish_through_create_status(client, db):
    moderator, permissions = _moderator(
        db,
        "blog-create",
        can_create_blog=True,
    )
    headers = _headers(moderator)
    permissions_id = permissions.id

    denied = client.post(
        "/api/admin/blog/posts",
        headers=headers,
        json=_blog_payload(status=BlogPostStatus.PUBLISHED.value),
    )
    assert denied.status_code == 403
    assert db.query(BlogPost).count() == 0

    created = client.post(
        "/api/admin/blog/posts",
        headers=headers,
        json=_blog_payload(),
    )
    assert created.status_code == 200, created.text
    assert created.json()["status"] == BlogPostStatus.DRAFT.value

    permissions = db.get(ModeratorPermissions, permissions_id)
    permissions.can_publish_blog = True
    db.commit()
    published = client.post(
        "/api/admin/blog/posts",
        headers=headers,
        json=_blog_payload(
            title="Published by explicit permission",
            status=BlogPostStatus.PUBLISHED.value,
            published_at=datetime.utcnow().isoformat(),
        ),
    )
    assert published.status_code == 200, published.text


def test_blog_update_status_requires_publish_permission_without_partial_write(client, db):
    author = _user(db, "blog-author", UserRole.ADMIN)
    post = BlogPost(
        title="Original title",
        slug="security-original",
        content="original content",
        status=BlogPostStatus.DRAFT,
        author_id=author.id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    post_id = post.id

    moderator, permissions = _moderator(
        db,
        "blog-editor",
        can_edit_blog=True,
    )
    headers = _headers(moderator)
    permissions_id = permissions.id
    denied = client.put(
        f"/api/admin/blog/posts/{post_id}",
        headers=headers,
        json={
            "title": "must not stick",
            "status": BlogPostStatus.PUBLISHED.value,
        },
    )
    assert denied.status_code == 403
    db.expire_all()
    unchanged = db.get(BlogPost, post_id)
    assert unchanged.title == "Original title"
    assert unchanged.status == BlogPostStatus.DRAFT

    permissions = db.get(ModeratorPermissions, permissions_id)
    permissions.can_publish_blog = True
    db.commit()
    allowed = client.put(
        f"/api/admin/blog/posts/{post_id}",
        headers=headers,
        json={
            "title": "published safely",
            "status": BlogPostStatus.PUBLISHED.value,
        },
    )
    assert allowed.status_code == 200, allowed.text


def test_blog_edit_allows_unchanged_draft_status_without_publish_permission(client, db):
    author = _user(db, "blog-draft-author", UserRole.ADMIN)
    post = BlogPost(
        title="Draft title",
        slug="draft-title",
        content="draft content",
        status=BlogPostStatus.DRAFT,
        author_id=author.id,
    )
    db.add(post)
    db.commit()
    post_id = post.id
    moderator, _ = _moderator(db, "draft-editor", can_edit_blog=True)
    headers = _headers(moderator)

    response = client.put(
        f"/api/admin/blog/posts/{post_id}",
        headers=headers,
        json={
            "title": "Edited draft",
            "status": BlogPostStatus.DRAFT.value,
            "scheduled_at": None,
        },
    )
    assert response.status_code == 200, response.text


def test_blog_read_delete_publish_and_authoring_permissions_are_independent(
    client, db, monkeypatch
):
    author = _user(db, "blog-admin-author", UserRole.ADMIN)
    post = BlogPost(
        title="Permission matrix",
        slug="permission-matrix",
        content="content",
        status=BlogPostStatus.DRAFT,
        author_id=author.id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    post_id = post.id

    moderator, permissions = _moderator(db, "blog-matrix")
    headers = _headers(moderator)
    permissions_id = permissions.id
    assert client.get("/api/admin/blog/posts", headers=headers).status_code == 403
    assert client.get(f"/api/admin/blog/posts/{post_id}", headers=headers).status_code == 403
    assert client.get("/api/admin/blog/tags", headers=headers).status_code == 403
    assert client.post(
        "/api/admin/blog/import/preview",
        headers=headers,
        files={"file": ("post.md", b"# title", "text/markdown")},
    ).status_code == 403
    assert client.post(
        f"/api/admin/blog/posts/{post_id}/publish",
        headers=headers,
    ).status_code == 403
    assert client.delete(
        f"/api/admin/blog/posts/{post_id}",
        headers=headers,
    ).status_code == 403

    permissions = db.get(ModeratorPermissions, permissions_id)
    permissions.can_view_blog = True
    permissions.can_create_blog = True
    db.commit()
    assert client.get("/api/admin/blog/posts", headers=headers).status_code == 200
    assert client.get(f"/api/admin/blog/posts/{post_id}", headers=headers).status_code == 200
    assert client.get("/api/admin/blog/tags", headers=headers).status_code == 200
    assert client.post(
        "/api/admin/blog/import/preview",
        headers=headers,
        files={"file": ("post.md", b"# title", "text/markdown")},
    ).status_code == 200

    monkeypatch.setattr("routers.admin.ping_search_engines", lambda _url: {})
    permissions = db.get(ModeratorPermissions, permissions_id)
    permissions.can_publish_blog = True
    db.commit()
    assert client.post(
        f"/api/admin/blog/posts/{post_id}/publish",
        headers=headers,
    ).status_code == 200

    permissions = db.get(ModeratorPermissions, permissions_id)
    permissions.can_delete_blog = True
    db.commit()
    assert client.delete(
        f"/api/admin/blog/posts/{post_id}",
        headers=headers,
    ).status_code == 200


def test_admin_retains_full_blog_access(client, db, monkeypatch):
    admin = _user(db, "blog-full-admin", UserRole.ADMIN)
    headers = _headers(admin)
    created = client.post(
        "/api/admin/blog/posts",
        headers=headers,
        json=_blog_payload(),
    )
    assert created.status_code == 200, created.text
    post_id = created.json()["id"]
    assert client.get("/api/admin/blog/posts", headers=headers).status_code == 200
    monkeypatch.setattr("routers.admin.ping_search_engines", lambda _url: {})
    assert client.post(
        f"/api/admin/blog/posts/{post_id}/publish",
        headers=headers,
    ).status_code == 200
