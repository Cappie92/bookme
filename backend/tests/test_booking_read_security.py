from datetime import datetime, timedelta

import pytest

from auth import create_user_access_token, get_password_hash
from models import (
    Booking,
    BookingStatus,
    IndieMaster,
    Master,
    ModeratorPermissions,
    Salon,
    SalonBranch,
    Service,
    User,
    UserRole,
)


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_user_access_token(user)}"}


@pytest.fixture
def booking_read_world(db):
    users = {}
    for index, (name, role) in enumerate(
        [
            ("client_a", UserRole.CLIENT),
            ("client_b", UserRole.CLIENT),
            ("master_a", UserRole.MASTER),
            ("master_b", UserRole.MASTER),
            ("indie", UserRole.INDIE),
            ("salon", UserRole.SALON),
            ("manager", UserRole.SALON),
            ("moderator", UserRole.MODERATOR),
            ("admin", UserRole.ADMIN),
        ]
    ):
        user = User(
            email=f"booking-{name}@security.test",
            phone=f"+798800000{index:02d}",
            full_name=f"Booking {name}",
            hashed_password=get_password_hash("testpassword"),
            role=role,
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
        )
        db.add(user)
        db.flush()
        users[name] = user

    masters = {}
    for name in ("master_a", "master_b"):
        profile = Master(
            user_id=users[name].id,
            domain=f"booking-{name}",
            timezone="Europe/Moscow",
            timezone_confirmed=True,
        )
        db.add(profile)
        db.flush()
        masters[name] = profile

    indie_master_base = Master(
        user_id=users["indie"].id,
        domain="booking-indie-base",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(indie_master_base)
    db.flush()
    indie = IndieMaster(
        user_id=users["indie"].id,
        master_id=indie_master_base.id,
        domain="booking-indie",
    )
    db.add(indie)

    salon = Salon(
        user_id=users["salon"].id,
        name="Booking Salon",
        domain="booking-salon",
        phone="+79889999999",
        email="booking-salon@security.test",
    )
    service = Service(name="Security Service", duration=60, price=100)
    db.add_all([salon, service])
    db.flush()
    branch = SalonBranch(
        salon_id=salon.id,
        name="Managed Branch",
        manager_id=users["manager"].id,
    )
    db.add(branch)
    db.flush()

    start = datetime.utcnow() + timedelta(days=7)
    bookings = {
        "master_a": Booking(
            client_id=users["client_a"].id,
            service_id=service.id,
            master_id=masters["master_a"].id,
            start_time=start,
            end_time=start + timedelta(hours=1),
            status=BookingStatus.CREATED,
        ),
        "master_b": Booking(
            client_id=users["client_b"].id,
            service_id=service.id,
            master_id=masters["master_b"].id,
            start_time=start + timedelta(hours=2),
            end_time=start + timedelta(hours=3),
            status=BookingStatus.CREATED,
        ),
        "indie": Booking(
            client_id=users["client_a"].id,
            service_id=service.id,
            indie_master_id=indie.id,
            start_time=start + timedelta(hours=4),
            end_time=start + timedelta(hours=5),
            status=BookingStatus.CREATED,
        ),
        "salon": Booking(
            client_id=users["client_b"].id,
            service_id=service.id,
            salon_id=salon.id,
            start_time=start + timedelta(hours=6),
            end_time=start + timedelta(hours=7),
            status=BookingStatus.CREATED,
        ),
        "salon_branch": Booking(
            client_id=users["client_b"].id,
            service_id=service.id,
            salon_id=salon.id,
            branch_id=branch.id,
            start_time=start + timedelta(hours=8),
            end_time=start + timedelta(hours=9),
            status=BookingStatus.CREATED,
        ),
    }
    db.add_all(bookings.values())
    db.add(ModeratorPermissions(user_id=users["moderator"].id))
    db.commit()
    for booking in bookings.values():
        db.refresh(booking)

    # User ids and profile ids intentionally differ; the old list endpoint
    # incorrectly compared these different identifier domains.
    assert users["master_a"].id != masters["master_a"].id
    return {
        "users": users,
        "masters": masters,
        "indie": indie,
        "salon": salon,
        "branch": branch,
        "bookings": bookings,
    }


@pytest.mark.parametrize(
    ("actor", "expected"),
    [
        ("client_a", {"master_a", "indie"}),
        ("master_a", {"master_a"}),
        ("master_b", {"master_b"}),
        ("indie", {"indie"}),
        ("salon", {"salon", "salon_branch"}),
        ("manager", {"salon_branch"}),
        ("admin", {"master_a", "master_b", "indie", "salon", "salon_branch"}),
    ],
)
def test_booking_list_scopes_by_actor(client, booking_read_world, actor, expected):
    world = booking_read_world
    response = client.get(
        "/api/bookings/",
        headers=_headers(world["users"][actor]),
    )
    assert response.status_code == 200, response.text
    ids = {item["id"] for item in response.json()}
    expected_ids = {world["bookings"][name].id for name in expected}
    assert ids == expected_ids


def test_moderator_booking_reads_require_permission(client, db, booking_read_world):
    world = booking_read_world
    moderator = world["users"]["moderator"]
    headers = _headers(moderator)
    moderator_id = moderator.id
    booking_count = len(world["bookings"])
    master_b_booking_id = world["bookings"]["master_b"].id

    assert client.get("/api/bookings/", headers=headers).status_code == 403
    # Permission is checked before lookup; a missing object cannot be used as
    # an existence oracle by an unauthorized moderator.
    assert client.get("/api/bookings/999999", headers=headers).status_code == 403

    permissions = db.query(ModeratorPermissions).filter(
        ModeratorPermissions.user_id == moderator_id
    ).one()
    permissions.can_view_bookings = True
    db.commit()

    listing = client.get("/api/bookings/", headers=headers)
    assert listing.status_code == 200, listing.text
    assert len(listing.json()) == booking_count
    detail = client.get(
        f"/api/bookings/{master_b_booking_id}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text


@pytest.mark.parametrize("role", [UserRole.MASTER, UserRole.INDIE])
def test_booking_list_missing_profile_is_controlled_404(client, db, role):
    user = User(
        email=f"missing-{role.value}@security.test",
        phone=f"+7977000000{1 if role == UserRole.MASTER else 2}",
        full_name=f"Missing {role.value}",
        hashed_password=get_password_hash("testpassword"),
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.commit()
    headers = _headers(user)

    response = client.get("/api/bookings/", headers=headers)
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("actor", "own", "foreign"),
    [
        ("client_a", "master_a", "master_b"),
        ("master_a", "master_a", "master_b"),
        ("indie", "indie", "master_a"),
        ("salon", "salon", "master_a"),
        ("manager", "salon_branch", "salon"),
    ],
)
def test_booking_detail_object_authorization(
    client, booking_read_world, actor, own, foreign
):
    world = booking_read_world
    headers = _headers(world["users"][actor])
    own_id = world["bookings"][own].id
    foreign_id = world["bookings"][foreign].id
    allowed = client.get(
        f"/api/bookings/{own_id}",
        headers=headers,
    )
    assert allowed.status_code == 200, allowed.text
    denied = client.get(
        f"/api/bookings/{foreign_id}",
        headers=headers,
    )
    assert denied.status_code == 403


def test_admin_missing_booking_is_404_and_anonymous_is_401(
    client, booking_read_world
):
    admin_headers = _headers(booking_read_world["users"]["admin"])
    assert client.get("/api/bookings/999999").status_code == 401
    response = client.get(
        "/api/bookings/999999",
        headers=admin_headers,
    )
    assert response.status_code == 404
