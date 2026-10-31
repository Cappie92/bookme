import hashlib

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from models import Base, CalendarBlock, IdempotencyReceipt, Master, User, UserRole
from services.calendar_admission import run_sqlite_admission
from services.idempotency_receipts import (
    IdempotencyKeyReused,
    find_receipt,
    hash_idempotency_key,
    record_receipt,
    request_fingerprint,
)


SCOPE = "calendar.block.create"
RAW_KEY = "client-generated-key-0001"


@pytest.fixture
def database(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'receipts.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 5},
        poolclass=NullPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    setup = Session()
    user = User(
        phone="+70000000401",
        full_name="Synthetic",
        role=UserRole.MASTER,
        is_active=True,
    )
    setup.add(user)
    setup.flush()
    master = Master(user_id=user.id, timezone="Europe/Moscow", timezone_confirmed=True)
    setup.add(master)
    other = User(
        phone="+70000000402",
        full_name="Synthetic",
        role=UserRole.MASTER,
        is_active=True,
    )
    setup.add(other)
    setup.commit()
    ids = {"user": user.id, "master": master.id, "other": other.id}
    setup.close()
    yield Session, ids
    engine.dispose()


def _create_block(
    Session, ids, fingerprint, *, raw_key=RAW_KEY, actor=None, fail=False
):
    actor = actor or ids["user"]

    def operation(db):
        existing = find_receipt(
            db,
            actor_user_id=actor,
            scope=SCOPE,
            raw_key=raw_key,
            fingerprint=fingerprint,
        )
        if existing is not None:
            return existing.resource_id
        block = CalendarBlock(
            master_id=ids["master"],
            created_by_user_id=actor,
            start_utc_us=1_000_000,
            end_utc_us=2_000_000,
            time_zone="Europe/Moscow",
        )
        db.add(block)
        db.flush()
        record_receipt(
            db,
            actor_user_id=actor,
            scope=SCOPE,
            raw_key=raw_key,
            fingerprint=fingerprint,
            resource_type="calendar_block",
            resource_id=block.id,
        )
        if fail:
            raise RuntimeError("simulated failure after receipt")
        return block.id

    return run_sqlite_admission(Session, operation)


def _count(Session, model):
    db = Session()
    try:
        return db.query(model).count()
    finally:
        db.close()


def test_key_hash_and_fingerprint_are_stable_digests():
    assert hash_idempotency_key(RAW_KEY) == hashlib.sha256(RAW_KEY.encode()).hexdigest()
    assert request_fingerprint({"b": 1, "a": "x"}) == request_fingerprint(
        {"a": "x", "b": 1}
    )
    assert request_fingerprint({"a": 1}) != request_fingerprint({"a": 2})
    for bad in ("", "x" * 256, None):
        with pytest.raises(ValueError):
            hash_idempotency_key(bad)
    with pytest.raises(TypeError):
        request_fingerprint({"value": object()})


def test_replay_returns_same_resource_across_sessions(database):
    Session, ids = database
    fingerprint = request_fingerprint({"start": 1, "end": 2})

    first = _create_block(Session, ids, fingerprint)
    second = _create_block(Session, ids, fingerprint)

    assert first == second
    assert _count(Session, CalendarBlock) == 1
    assert _count(Session, IdempotencyReceipt) == 1


def test_reused_key_with_different_intent_is_rejected(database):
    Session, ids = database
    _create_block(Session, ids, request_fingerprint({"start": 1}))

    with pytest.raises(IdempotencyKeyReused) as exc:
        _create_block(Session, ids, request_fingerprint({"start": 2}))
    assert exc.value.code == "IDEMPOTENCY_KEY_REUSED"
    assert _count(Session, CalendarBlock) == 1


def test_same_key_is_isolated_per_actor(database):
    Session, ids = database
    fingerprint = request_fingerprint({"start": 1})
    first = _create_block(Session, ids, fingerprint)
    second = _create_block(Session, ids, fingerprint, actor=ids["other"])

    assert first != second
    assert _count(Session, IdempotencyReceipt) == 2


def test_rollback_leaves_neither_resource_nor_receipt(database):
    Session, ids = database
    with pytest.raises(RuntimeError):
        _create_block(Session, ids, request_fingerprint({"start": 1}), fail=True)

    assert _count(Session, CalendarBlock) == 0
    assert _count(Session, IdempotencyReceipt) == 0


def test_raw_key_and_payload_are_not_persisted(database):
    Session, ids = database
    _create_block(Session, ids, request_fingerprint({"title": "Doctor visit"}))
    db = Session()
    try:
        dump = " ".join(
            str(value)
            for row in db.execute(text("SELECT * FROM idempotency_receipts"))
            for value in row
        )
    finally:
        db.close()
    assert RAW_KEY not in dump
    assert "Doctor" not in dump


def test_record_outside_admission_transaction_is_refused(database):
    Session, ids = database
    db = Session()
    try:
        with pytest.raises(RuntimeError):
            record_receipt(
                db,
                actor_user_id=ids["user"],
                scope=SCOPE,
                raw_key=RAW_KEY,
                fingerprint=request_fingerprint({}),
                resource_type="calendar_block",
                resource_id=1,
            )
    finally:
        db.close()
