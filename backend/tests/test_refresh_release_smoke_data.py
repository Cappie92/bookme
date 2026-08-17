"""Safety and idempotency tests for the additive release smoke refresh."""

from __future__ import annotations

import copy
from datetime import date, datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import (
    AvailabilitySlot,
    Booking,
    LoyaltyDiscount,
    LoyaltyDiscountType,
    LoyaltyTransaction,
    Master,
    MasterSchedule,
    MasterService,
    MasterServiceCategory,
    OwnerType,
    PersonalDiscount,
    Service,
    ServiceType,
    User,
    UserRole,
    master_services,
)
from scripts import refresh_release_smoke_data as smoke


def _manifest() -> dict:
    return yaml.safe_load(smoke.DEFAULT_MANIFEST.read_text(encoding="utf-8"))


def _database(tmp_path: Path, name: str = "release-smoke.db"):
    path = (tmp_path / name).resolve()
    engine = create_engine(
        f"sqlite:///{path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return path, engine, factory


def _seed_anchors_and_services(factory) -> dict[str, int]:
    manifest = _manifest()
    db = factory()
    try:
        users: dict[str, User] = {}
        for index, phone in enumerate(manifest["users"]["masters"]):
            user = User(
                email=f"release-master-{index}@example.test",
                phone=phone,
                full_name=f"Release Master {index}",
                hashed_password="test",
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
                is_phone_verified=True,
            )
            db.add(user)
            users[phone] = user
        for index, phone in enumerate(manifest["users"]["clients"]):
            user = User(
                email=f"release-client-{index}@example.test",
                phone=phone,
                full_name=f"Release Client {index}",
                hashed_password="test",
                role=UserRole.CLIENT,
                is_active=True,
                is_verified=True,
                is_phone_verified=True,
                birth_date=date(1990, 1, 1),
            )
            db.add(user)
            users[phone] = user
        db.flush()

        master_ids: dict[str, int] = {}
        service_ids: dict[tuple[str, int], int] = {}
        for phone in manifest["users"]["masters"]:
            master = Master(
                user_id=users[phone].id,
                timezone="Europe/Moscow",
                timezone_confirmed=True,
                is_deleted=False,
            )
            db.add(master)
            db.flush()
            master_ids[phone] = int(master.id)
            category = MasterServiceCategory(
                master_id=master.id, name=f"Canonical {phone}"
            )
            db.add(category)
            db.flush()
            for spec in manifest["services"]:
                duration = int(spec["duration"])
                price = float(spec["fallback_price"])
                service = Service(
                    name=spec["preferred_name"],
                    description="Existing immutable service",
                    duration=duration,
                    price=price,
                    service_type=ServiceType.SUBSCRIPTION,
                )
                db.add(service)
                db.flush()
                db.execute(
                    master_services.insert().values(
                        master_id=master.id, service_id=service.id
                    )
                )
                db.add(
                    MasterService(
                        master_id=master.id,
                        category_id=category.id,
                        name=service.name,
                        description="Existing immutable catalog service",
                        duration=duration,
                        price=price,
                    )
                )
                service_ids[(phone, duration)] = int(service.id)
        db.commit()
        return {
            "primary_master": master_ids[manifest["primary_master_phone"]],
            "secondary_master": master_ids[manifest["users"]["masters"][1]],
            "primary_client": int(users[manifest["primary_client_phone"]].id),
            "service30": service_ids[(manifest["primary_master_phone"], 30)],
        }
    finally:
        db.close()


def _configure_main(monkeypatch, factory, environment: str = "test") -> None:
    monkeypatch.setattr(smoke, "SessionLocal", factory)
    monkeypatch.setattr(
        smoke, "get_settings", lambda: SimpleNamespace(ENVIRONMENT=environment)
    )
    monkeypatch.setenv("ENVIRONMENT", environment)


def _run_apply(monkeypatch, factory, database_path: Path) -> int:
    _configure_main(monkeypatch, factory)
    return smoke.main(["--apply", "--expected-db", str(database_path)])


def _snapshot_rows(db, model) -> dict[int, tuple]:
    return smoke._query_snapshot(db, model)


def test_manifest_uses_only_canonical_exact_ownership():
    manifest = _manifest()
    smoke._validate_manifest(manifest)

    changed = copy.deepcopy(manifest)
    changed["ownership"]["booking_notes"]["UPCOMING_PAID"] += " suffix"
    with pytest.raises(smoke.SmokeRefreshError, match="canonical exact note"):
        smoke._validate_manifest(changed)

    source = Path(smoke.__file__).read_text(encoding="utf-8")
    assert "_contains_marker" not in source
    assert ".contains(" not in source
    assert ".like(" not in source
    assert ".startswith(" not in source


def test_environment_and_database_target_guards(tmp_path, monkeypatch):
    manifest = _manifest()
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.setattr(
        smoke, "get_settings", lambda: SimpleNamespace(ENVIRONMENT="test")
    )
    with pytest.raises(smoke.SmokeRefreshError, match="explicitly set"):
        smoke._guard_environment(manifest, apply=True)

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(
        smoke, "get_settings", lambda: SimpleNamespace(ENVIRONMENT="production")
    )
    with pytest.raises(smoke.SmokeRefreshError, match="always forbidden"):
        smoke._guard_environment(manifest, apply=True)

    path, engine, factory = _database(tmp_path, "target.db")
    db = factory()
    try:
        smoke._configure_connection_safety(db)
        assert smoke._guard_database_target(db, apply=False, expected_db=None) == str(
            path
        )
        with pytest.raises(smoke.SmokeRefreshError, match="requires --expected-db"):
            smoke._guard_database_target(db, apply=True, expected_db=None)
        with pytest.raises(smoke.SmokeRefreshError, match="does not match"):
            smoke._guard_database_target(
                db, apply=True, expected_db=tmp_path / "different.db"
            )
        assert smoke._guard_database_target(db, apply=True, expected_db=path) == str(
            path
        )
    finally:
        db.close()
        engine.dispose()


def test_two_apply_is_exact_and_preserves_non_owned_state(
    tmp_path, monkeypatch, capsys
):
    path, engine, factory = _database(tmp_path)
    ids = _seed_anchors_and_services(factory)
    manifest = _manifest()

    db = factory()
    try:
        lookalike_booking = Booking(
            client_id=ids["primary_client"],
            master_id=ids["primary_master"],
            service_id=ids["service30"],
            start_time=datetime.utcnow() + timedelta(days=20, hours=10),
            end_time=datetime.utcnow() + timedelta(days=20, hours=10, minutes=30),
            status="confirmed",
            notes="[RELEASEXSMOKE:v1][UPCOMING_PAID]",
            is_paid=False,
            payment_amount=1000,
        )
        db.add(lookalike_booking)
        db.flush()
        db.add(
            LoyaltyTransaction(
                master_id=ids["primary_master"],
                client_id=ids["primary_client"],
                booking_id=lookalike_booking.id,
                transaction_type="earned",
                points=10,
                earned_at=datetime.utcnow(),
                source="RELEASEXSMOKE:v1:OPENING_BALANCE_PRIMARY:EARNED",
            )
        )
        db.add(
            LoyaltyDiscount(
                master_id=ids["primary_master"],
                discount_type=LoyaltyDiscountType.QUICK,
                name="First visit [RELEASEXSMOKE:v1]",
                description="lookalike non-owned discount",
                discount_percent=50,
                conditions={"condition_type": "first_visit", "parameters": {}},
                is_active=False,
            )
        )
        db.add(
            PersonalDiscount(
                master_id=ids["primary_master"],
                client_phone=manifest["primary_client_phone"],
                discount_percent=50,
                description="Personal discount [RELEASEXSMOKE:v1]",
                is_active=False,
            )
        )
        db.add(
            MasterSchedule(
                master_id=ids["primary_master"],
                date=date.today() + timedelta(days=20),
                start_time=time(20, 0),
                end_time=time(20, 30),
                is_available=False,
            )
        )
        db.add(
            AvailabilitySlot(
                owner_type=OwnerType.MASTER,
                owner_id=ids["secondary_master"],
                day_of_week=7,
                start_time=time(10, 0),
                end_time=time(12, 0),
            )
        )
        db.commit()
        protected_before = {
            "users": _snapshot_rows(db, User),
            "masters": _snapshot_rows(db, Master),
            "services": _snapshot_rows(db, Service),
            "lookalike_booking": _snapshot_rows(db, Booking)[lookalike_booking.id],
            "lookalike_loyalty": _snapshot_rows(db, LoyaltyTransaction),
            "availability": _snapshot_rows(db, AvailabilitySlot),
        }
    finally:
        db.close()

    assert _run_apply(monkeypatch, factory, path) == 0
    first_output = capsys.readouterr().out
    assert "Users modified: 0" in first_output
    assert "Schedule rows deleted: 0" in first_output
    assert "Loyalty transactions created: 6" in first_output

    db = factory()
    try:
        first_schedule = _snapshot_rows(db, MasterSchedule)
        first_loyalty_ids = {
            source: row_id
            for row_id, row in _snapshot_rows(db, LoyaltyTransaction).items()
            for source in [row[-1]]
            if source in manifest["ownership"]["loyalty_sources"].values()
        }
    finally:
        db.close()

    assert _run_apply(monkeypatch, factory, path) == 0
    second_output = capsys.readouterr().out
    assert "Users modified: 0" in second_output
    assert "Schedule rows created: 0" in second_output
    assert "Schedule rows deleted: 0" in second_output
    assert "Loyalty transactions created: 0" in second_output

    db = factory()
    try:
        assert _snapshot_rows(db, User) == protected_before["users"]
        assert _snapshot_rows(db, Master) == protected_before["masters"]
        assert _snapshot_rows(db, Service) == protected_before["services"]
        assert _snapshot_rows(db, AvailabilitySlot) == protected_before["availability"]
        assert _snapshot_rows(db, MasterSchedule) == first_schedule

        notes = {
            note
            for (note,) in db.query(Booking.notes)
            .filter(
                Booking.notes.in_(
                    tuple(manifest["ownership"]["booking_notes"].values())
                )
            )
            .all()
        }
        assert notes == set(manifest["ownership"]["booking_notes"].values())
        exact_sources = {
            source
            for (source,) in db.query(LoyaltyTransaction.source)
            .filter(
                LoyaltyTransaction.source.in_(
                    tuple(manifest["ownership"]["loyalty_sources"].values())
                )
            )
            .all()
        }
        assert exact_sources == set(manifest["ownership"]["loyalty_sources"].values())
        second_loyalty_ids = {
            row.source: row.id
            for row in db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.source.in_(tuple(exact_sources)))
            .all()
        }
        assert second_loyalty_ids == first_loyalty_ids

        lookalike = (
            db.query(Booking)
            .filter(Booking.notes == "[RELEASEXSMOKE:v1][UPCOMING_PAID]")
            .one()
        )
        assert (
            _snapshot_rows(db, Booking)[lookalike.id]
            == protected_before["lookalike_booking"]
        )
        current_lookalike_ledger = {
            row_id: value
            for row_id, value in _snapshot_rows(db, LoyaltyTransaction).items()
            if row_id in protected_before["lookalike_loyalty"]
        }
        assert current_lookalike_ledger == protected_before["lookalike_loyalty"]
    finally:
        db.close()
        engine.dispose()


def test_additive_schedule_rejects_partial_existing_date(tmp_path):
    _, engine, factory = _database(tmp_path, "schedule-conflict.db")
    ids = _seed_anchors_and_services(factory)
    manifest = _manifest()
    db = factory()
    try:
        anchors = smoke._resolve_anchors(db, manifest)
        primary_master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
        today = datetime.now(smoke.ZoneInfo(primary_master.timezone)).date()
        conflict_day = today + timedelta(
            days=int(manifest["schedule"]["working_day_offsets"][0])
        )
        row = MasterSchedule(
            master_id=ids["primary_master"],
            date=conflict_day,
            start_time=time(9, 0),
            end_time=time(9, 30),
            is_available=False,
        )
        db.add(row)
        db.commit()
        before = _snapshot_rows(db, MasterSchedule)

        with pytest.raises(smoke.SmokeRefreshError, match="non-canonical"):
            smoke._refresh_schedule(
                db,
                manifest,
                anchors,
                today,
                today - timedelta(days=7),
                today + timedelta(days=35),
                smoke.RefreshCounters(),
                smoke.CreatedIds.empty(),
            )
        db.rollback()
        assert _snapshot_rows(db, MasterSchedule) == before
    finally:
        db.close()
        engine.dispose()


def test_service_and_master_service_ambiguity_fail_closed(tmp_path):
    _, engine, factory = _database(tmp_path, "service-ambiguity.db")
    _seed_anchors_and_services(factory)
    manifest = _manifest()
    db = factory()
    try:
        anchors = smoke._resolve_anchors(db, manifest)
        master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
        spec = manifest["services"][0]
        duplicate = Service(
            name="Duplicate",
            duration=30,
            price=999,
            service_type=ServiceType.SUBSCRIPTION,
        )
        db.add(duplicate)
        db.flush()
        db.execute(
            master_services.insert().values(
                master_id=master.id, service_id=duplicate.id
            )
        )
        db.flush()
        with pytest.raises(smoke.SmokeRefreshError, match="ambiguous 30-minute"):
            smoke._find_service(
                db,
                master,
                spec,
                manifest["marker"],
                smoke.RefreshCounters(),
                smoke.CreatedIds.empty(),
            )
        db.rollback()

        existing_catalog = (
            db.query(MasterService)
            .filter(MasterService.master_id == master.id, MasterService.duration == 30)
            .one()
        )
        db.add(
            MasterService(
                master_id=master.id,
                category_id=existing_catalog.category_id,
                name="Duplicate catalog",
                duration=30,
                price=999,
            )
        )
        db.flush()
        with pytest.raises(smoke.SmokeRefreshError, match="ambiguous catalog"):
            smoke._ensure_master_catalog_service(
                db,
                master,
                spec,
                manifest["marker"],
                smoke.RefreshCounters(),
                smoke.CreatedIds.empty(),
            )
    finally:
        db.rollback()
        db.close()
        engine.dispose()
