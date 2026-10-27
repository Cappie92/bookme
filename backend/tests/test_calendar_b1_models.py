from datetime import datetime

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from models import (
    Base,
    Booking,
    CalendarBlock,
    IdempotencyReceipt,
    Master,
    MasterClientMetadata,
    User,
    UserRole,
)
from schemas import (
    BookingCreate,
    BookingEditRequestCreate,
    BookingUpdate,
    TemporaryBookingCreate,
)
from services.account_deletion import (
    _delete_client_phone_keyed,
    _delete_master_crm_and_loyalty,
)


NEW_BOOKING_FIELDS = {
    "master_client_metadata_id",
    "source",
    "created_by_user_id",
    "start_utc_us",
    "end_utc_us",
    "time_zone",
    "version",
}
HEX64 = "a" * 64


@pytest.fixture
def session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'b1.sqlite'}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def _user(db, phone, role=UserRole.MASTER):
    user = User(phone=phone, full_name="Synthetic", role=role, is_active=True)
    db.add(user)
    db.flush()
    return user


def _master(db, phone):
    user = _user(db, phone)
    master = Master(user_id=user.id, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.flush()
    return user, master


def _contact(db, master, phone="+70000000101"):
    contact = MasterClientMetadata(
        master_id=master.id, client_phone=phone, alias_name="Local"
    )
    db.add(contact)
    db.flush()
    return contact


def _booking(db, master, **values):
    booking = Booking(
        master_id=master.id,
        start_time=datetime(2026, 11, 2, 10, 0),
        end_time=datetime(2026, 11, 2, 11, 0),
        status="created",
        **values,
    )
    db.add(booking)
    db.flush()
    return booking


def _block(db, master, user, **values):
    fields = {
        "master_id": master.id,
        "created_by_user_id": user.id,
        "start_utc_us": 1_000_000,
        "end_utc_us": 2_000_000,
        "time_zone": "Europe/Moscow",
    }
    fields.update(values)
    block = CalendarBlock(**fields)
    db.add(block)
    db.flush()
    return block


def test_legacy_style_booking_keeps_new_metadata_empty(session):
    _, master = _master(session, "+70000000001")
    booking = _booking(session, master)
    session.commit()
    session.refresh(booking)

    assert booking.version == 1
    assert booking.source is None
    assert booking.created_by_user_id is None
    assert booking.master_client_metadata_id is None
    assert (booking.start_utc_us, booking.end_utc_us, booking.time_zone) == (
        None,
        None,
        None,
    )


def test_raw_insert_without_new_columns_gets_server_version(session):
    _, master = _master(session, "+70000000002")
    session.commit()
    session.execute(
        text(
            "INSERT INTO bookings "
            "(master_id, start_time, end_time, status, public_reference) "
            "VALUES (:master_id, :start, :end, 'created', 'RAWREF1')"
        ),
        {
            "master_id": master.id,
            "start": "2026-11-02 10:00:00",
            "end": "2026-11-02 11:00:00",
        },
    )
    session.commit()
    row = session.execute(
        text("SELECT version, source, start_utc_us FROM bookings WHERE id IS NOT NULL")
    ).one()
    assert tuple(row) == (1, None, None)


def test_booking_links_local_contact_and_creator_without_client_user(session):
    user, master = _master(session, "+70000000003")
    contact = _contact(session, master)
    users_before = session.query(User).count()
    booking = _booking(
        session,
        master,
        client_id=None,
        master_client_metadata_id=contact.id,
        source="manual",
        created_by_user_id=user.id,
    )
    session.commit()
    session.refresh(booking)

    assert booking.client is None
    assert booking.local_contact.client_phone == contact.client_phone
    assert booking.created_by.id == user.id
    assert session.query(User).count() == users_before


def test_calendar_block_constraints(session):
    user, master = _master(session, "+70000000004")
    session.commit()
    for bad in (
        {"start_utc_us": 2_000_000, "end_utc_us": 2_000_000},
        {"start_utc_us": 3_000_000, "end_utc_us": 2_000_000},
        {"category": "client_visit"},
        {"version": 0},
        {"time_zone": None},
    ):
        with pytest.raises(IntegrityError):
            _block(session, master, user, **bad)
        session.rollback()


def test_calendar_block_defaults_and_relationships(session):
    user, master = _master(session, "+70000000005")
    block = _block(session, master, user, title="Doctor", description="Private")
    session.commit()
    session.refresh(block)

    assert block.category == "personal"
    assert block.version == 1
    assert block.deleted_at is None
    assert block.master.id == master.id
    assert block.created_by.id == user.id
    assert block.created_at is not None and block.updated_at is not None


def test_calendar_block_has_no_client_or_booking_links():
    columns = {column.name for column in CalendarBlock.__table__.columns}
    assert not columns & {
        "client_id",
        "client_phone",
        "service_id",
        "booking_id",
        "payment_amount",
    }


def test_calendar_block_range_index_exists(session):
    indexes = {
        index["name"]: index["column_names"]
        for index in inspect(session.get_bind()).get_indexes("calendar_blocks")
    }
    assert indexes["idx_calendar_blocks_master_range"] == [
        "master_id",
        "start_utc_us",
        "end_utc_us",
    ]


def test_idempotency_receipt_constraints(session):
    user = _user(session, "+70000000006")
    receipt = dict(
        actor_user_id=user.id,
        scope="calendar.block.create",
        key_hash=HEX64,
        request_hash="b" * 64,
        resource_type="calendar_block",
        resource_id=1,
    )
    session.add(IdempotencyReceipt(**receipt))
    session.commit()

    session.add(IdempotencyReceipt(**receipt))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    for bad in ({"key_hash": "short"}, {"request_hash": "short"}):
        session.add(IdempotencyReceipt(**{**receipt, "scope": "other", **bad}))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_idempotency_receipt_is_scoped_by_actor_and_scope(session):
    first = _user(session, "+70000000007")
    second = _user(session, "+70000000008")
    base = dict(
        key_hash=HEX64, request_hash=HEX64, resource_type="booking", resource_id=1
    )
    session.add_all(
        [
            IdempotencyReceipt(actor_user_id=first.id, scope="a", **base),
            IdempotencyReceipt(actor_user_id=second.id, scope="a", **base),
            IdempotencyReceipt(actor_user_id=first.id, scope="b", **base),
        ]
    )
    session.commit()
    assert session.query(IdempotencyReceipt).count() == 3


@pytest.mark.parametrize(
    "schema",
    [BookingCreate, BookingUpdate, TemporaryBookingCreate, BookingEditRequestCreate],
)
def test_existing_write_schemas_do_not_accept_calendar_metadata(schema):
    assert not set(schema.model_fields) & NEW_BOOKING_FIELDS
    assert schema.model_config.get("extra") != "allow"


def test_client_deletion_detaches_bookings_before_deleting_local_contacts(session):
    _, master = _master(session, "+70000000009")
    contact = _contact(session, master, phone="+70000000999")
    contact_id = contact.id
    booking_id = _booking(session, master, master_client_metadata_id=contact_id).id
    session.commit()

    _delete_client_phone_keyed(session, "+70000000999")
    session.commit()
    session.expunge_all()
    booking = session.get(Booking, booking_id)

    assert booking is not None
    assert booking.master_client_metadata_id is None
    assert session.get(MasterClientMetadata, contact_id) is None


def test_master_deletion_detaches_contacts_and_removes_private_blocks(session):
    user, master = _master(session, "+70000000010")
    other_user, other_master = _master(session, "+70000000011")
    contact = _contact(session, master)
    other_contact = _contact(session, other_master)
    booking = _booking(session, master, master_client_metadata_id=contact.id)
    other_booking = _booking(
        session, other_master, master_client_metadata_id=other_contact.id
    )
    _block(session, master, user, title="Private")
    other_block = _block(session, other_master, other_user)
    session.commit()

    _delete_master_crm_and_loyalty(session, master.id)
    session.commit()
    session.refresh(booking)
    session.refresh(other_booking)

    assert booking.master_client_metadata_id is None
    assert session.query(CalendarBlock).filter_by(master_id=master.id).count() == 0
    assert other_booking.master_client_metadata_id == other_contact.id
    assert session.get(CalendarBlock, other_block.id) is not None
