# -*- coding: utf-8 -*-
"""Тесты smoke-seed: admin не трогается, идемпотентность, cleanup только smoke."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import get_password_hash
from models import Booking, LoyaltyTransaction, Master, User, UserRole
from scripts import seed_loyalty_smoke as smoke


def test_log_admins_does_not_mutate_admin(db):
    admin = User(
        email=f"admin-guard-{smoke.SMOKE_TAG}@example.com",
        phone="+79990000999",
        full_name="Admin Guard",
        hashed_password=get_password_hash("x"),
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    before_email = admin.email

    smoke.log_admins(db)

    db.refresh(admin)
    assert admin.email == before_email
    assert admin.role == UserRole.ADMIN


def test_seed_idempotent_no_duplicate_masters(db):
    smoke.seed_core(db)
    smoke.seed_core(db)
    masters = db.query(Master).filter(Master.domain.in_(smoke.SMOKE_DOMAINS)).all()
    assert len(masters) == 2
    domains = {m.domain for m in masters}
    assert domains == set(smoke.SMOKE_DOMAINS)


def test_verify_public_availability_has_slots(db):
    smoke.seed_core(db)
    avail = smoke.verify_public_availability(db)
    assert avail["any_zero"] is False
    for domain in smoke.SMOKE_DOMAINS:
        info = avail["masters"][domain]
        assert info["slots_count_next_14_days"] > 0
        assert info["first_available_date"] is not None


def test_past_and_reserve_bookings_idempotent(db):
    smoke.seed_core(db)
    p1 = smoke.create_past_booking(db)
    p2 = smoke.create_past_booking(db)
    assert p1["booking_id"] == p2["booking_id"]
    assert p2["created"] is False

    r1 = smoke.create_active_reserve_booking(db)
    r2 = smoke.create_active_reserve_booking(db)
    assert r1["booking_id"] == r2["booking_id"]
    assert r2["created"] is False


def test_cleanup_dry_run_leaves_data(db):
    smoke.seed_core(db)
    smoke.create_active_reserve_booking(db)
    before = db.query(Booking).filter(Booking.notes.contains(smoke.SMOKE_TAG)).count()
    plan = smoke.cleanup_smoke(db, dry_run=True)
    after = db.query(Booking).filter(Booking.notes.contains(smoke.SMOKE_TAG)).count()
    assert plan["dry_run"] is True
    assert before == after
    assert before >= 1


def test_cleanup_deletes_smoke_not_admin(db):
    admin = User(
        email=f"admin-keep-{smoke.SMOKE_TAG}@example.com",
        phone="+79990000998",
        full_name="Admin Keep",
        hashed_password=get_password_hash("x"),
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add(admin)
    db.commit()
    admin_id = admin.id

    smoke.seed_core(db)
    smoke.create_past_booking(db)

    result = smoke.cleanup_smoke(db, dry_run=False)
    assert result["dry_run"] is False

    assert db.query(User).filter(User.id == admin_id).first() is not None
    assert db.query(Master).filter(Master.domain.in_(smoke.SMOKE_DOMAINS)).count() == 0
    assert (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.source == smoke.SMOKE_TAG)
        .count()
        == 0
    )


def test_guard_rejects_admin_delete():
    admin = User(id=1, email="a@b.com", phone="+1", role=UserRole.ADMIN)
    with pytest.raises(smoke.AdminProtectionError):
        smoke._guard_not_admin(admin, "delete")


def test_main_without_flag_exits_zero(capsys):
    with pytest.raises(SystemExit) as exc:
        smoke.main(["--local"])
    assert exc.value.code == 0
    assert "No-op" in capsys.readouterr().out
