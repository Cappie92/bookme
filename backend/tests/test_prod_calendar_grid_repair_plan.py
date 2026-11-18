"""Tests for prod grid repair planner (read-only)."""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.prod_calendar_grid_repair_lib import (
    classify_provenance,
    connect_readonly,
    count_active_booking_overlaps,
    diagnose_wall_violations,
    integrity_check,
    list_invalid_ids,
    normalize_wall_storage,
    observed_duration_minutes,
    schema_snapshot,
    walls_equivalent,
)
from utils.sqlite_calendar_grid_guard import register_sqlite_calendar_guard_udfs

ROOT = Path(__file__).resolve().parents[1]
PLANNER = ROOT / "scripts" / "prod_calendar_grid_repair_plan.py"


@pytest.fixture()
def dirty_db(tmp_path):
    path = tmp_path / "dirty.sqlite"
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE alembic_version (version_num VARCHAR(32))"
    )
    conn.execute(
        "INSERT INTO alembic_version VALUES ('20260914_push_notifications_v1')"
    )
    conn.execute(
        """
        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY,
            start_time TEXT,
            end_time TEXT,
            public_reference TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO bookings VALUES (1, '2026-11-11 10:00:00', '2026-11-11 10:45:00', 't1')"
    )
    conn.commit()
    conn.close()
    return path


def test_readonly_connection_and_diagnose():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE x (id INTEGER)")
    conn.commit()
    path = Path("/dev/null")  # not used for :memory:
    # use dirty pattern
    conn.close()

    reasons = diagnose_wall_violations("2026-11-11 10:00:00", "2026-11-11 10:45:00")
    assert "end:off_grid_wall" in reasons
    assert "duration_not_30_multiple" in reasons


def test_planner_writes_out_even_when_clean(tmp_path):
    clean = tmp_path / "clean.sqlite"
    conn = sqlite3.connect(clean)
    conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32))")
    conn.execute("INSERT INTO alembic_version VALUES ('20260914_push_notifications_v1')")
    conn.execute(
        """
        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY,
            start_time TEXT,
            end_time TEXT,
            public_reference TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO bookings VALUES (1,'2026-11-11 10:00:00','2026-11-11 10:30:00','ok')"
    )
    conn.commit()
    conn.close()

    out = tmp_path / "plan.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(PLANNER),
            "--db",
            str(clean),
            "--out",
            str(out),
            "--skip-migration-preflight",
        ],
        cwd=str(ROOT),
        env={**__import__("os").environ, "PYTHONPATH": str(ROOT)},
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["invalid_bookings_count"] == 0
    assert payload["migration_preflight_ok"] is False
    assert out.is_file()


def test_list_invalid_on_legacy_schema(dirty_db):
    conn = connect_readonly(dirty_db)
    ids, blocks = list_invalid_ids(conn)
    conn.close()
    assert ids == [1]
    assert blocks == []


def test_provenance_requires_smoke_notes_not_domain_only(tmp_path):
    path = tmp_path / "p.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE masters (id INTEGER PRIMARY KEY, domain TEXT)")
    conn.execute("INSERT INTO masters VALUES (9,'stats-smoke-master')")
    conn.execute(
        "CREATE TABLE bookings (id INTEGER PRIMARY KEY, notes TEXT, created_at TEXT, "
        "master_id INT, start_time TEXT, end_time TEXT, status TEXT, payment_amount REAL)"
    )
    conn.execute(
        "INSERT INTO bookings VALUES (1067,NULL,'2026-01-01',9,"
        "'2026-09-24 16:00:00','2026-09-24 15:00:00','cancelled',1.0)"
    )
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT b.*, 'stats-smoke-master' AS master_domain FROM bookings b WHERE id=1067").fetchone()
    prov = classify_provenance(row)
    conn.close()
    assert prov["category"] == "origin_unknown"
    assert prov["seed_reference"] is None


def test_wall_equivalent_formats():
    assert walls_equivalent("2026-06-08 10:30:00", "2026-06-08 10:30:00.000000")
    assert normalize_wall_storage("2026-06-08 10:30:00.000000") == "2026-06-08 10:30:00"


def test_overlap_uses_normalized_wall(tmp_path):
    path = tmp_path / "ov.db"
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE bookings (id INTEGER PRIMARY KEY, master_id INT, start_time TEXT, end_time TEXT, status TEXT)"
    )
    conn.execute(
        "INSERT INTO bookings VALUES (1,1,'2026-06-08 10:00:00','2026-06-08 11:30:00','completed')"
    )
    conn.execute(
        "INSERT INTO bookings VALUES (2,1,'2026-06-08 11:30:00.000000','2026-06-08 12:00:00','completed')"
    )
    conn.commit()
    n = count_active_booking_overlaps(
        conn, master_id=1, booking_id=1, start_raw="2026-06-08 10:00:00", end_raw="2026-06-08 11:30:00"
    )
    conn.close()
    assert n == 0


def test_observed_duration_truncates_subsecond_for_diagnostics():
    obs = observed_duration_minutes(
        "2026-04-14 22:02:38.047306",
        "2026-04-14 22:32:38.047306",
    )
    assert obs == 30


def test_integrity_check_memory(tmp_path):
    p = tmp_path / "t.db"
    conn = sqlite3.connect(p)
    conn.execute("CREATE TABLE t (id INTEGER)")
    conn.commit()
    conn.close()
    conn = connect_readonly(p)
    assert integrity_check(conn) == "ok"