"""Tests for prod grid repair apply (disposable SQLite)."""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.prod_calendar_grid_apply_repairs import apply_repairs, run_alembic
from scripts.prod_calendar_grid_repair_lib import (
    proposed_update_columns,
    register_sqlite_calendar_guard_udfs,
    verify_decision_lock,
)

ROOT = Path(__file__).resolve().parents[1]


def _minimal_booking_db(path: Path, *, end: str = "2026-11-11 10:45:00") -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE masters (id INTEGER PRIMARY KEY, domain TEXT, timezone TEXT)
        """
    )
    conn.execute("INSERT INTO masters VALUES (1, 'm', 'Europe/Moscow')")
    conn.execute(
        """
        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY,
            status TEXT,
            master_id INTEGER,
            client_id INTEGER,
            start_time TEXT,
            end_time TEXT,
            payment_amount REAL,
            version INTEGER DEFAULT 1,
            notes TEXT,
            start_utc_us INTEGER,
            end_utc_us INTEGER,
            time_zone TEXT,
            service_id INTEGER,
            master_service_id INTEGER,
            created_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE services (id INTEGER PRIMARY KEY, duration INTEGER)
        """
    )
    conn.execute("INSERT INTO services VALUES (1, 30)")
    conn.execute(
        """
        CREATE TABLE master_services_list (
            id INTEGER PRIMARY KEY, duration INTEGER, name TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO bookings VALUES (1,'completed',1,2,'2026-11-11 10:00:00',?,100.0,1,NULL,NULL,NULL,NULL,1,NULL,'2026-01-01')",
        (end,),
    )
    conn.execute("CREATE TABLE incomes (id INTEGER PRIMARY KEY, booking_id INTEGER, total_amount REAL)")
    conn.execute("INSERT INTO incomes VALUES (1,1,100.0)")
    conn.execute(
        "CREATE TABLE booking_confirmations (id INTEGER PRIMARY KEY, booking_id INTEGER)"
    )
    conn.execute("CREATE TABLE loyalty_transactions (id INTEGER PRIMARY KEY, booking_id INTEGER)")
    conn.commit()
    conn.close()


def _plan_one(end_after: str) -> dict:
    return {
        "decisions": [
            {
                "id": 1,
                "status": "completed",
                "interval": {
                    "start_time": "2026-11-11 10:00:00",
                    "end_time": "2026-11-11 10:45:00",
                },
                "approval_lock": {
                    "status": "completed",
                    "version": 1,
                    "start_time": "2026-11-11 10:00:00",
                    "end_time": "2026-11-11 10:45:00",
                    "payment_amount": 100.0,
                },
                "recommended": {
                    "start_time": "2026-11-11 10:00:00",
                    "end_time": end_after,
                },
            }
        ]
    }


def test_apply_rollback_reports_not_applied(tmp_path):
    db = tmp_path / "t.db"
    _minimal_booking_db(db)
    plan = _plan_one("2026-11-11 10:30:00")
    # First row ok; second id missing triggers error before commit — use two ids where second fails lock
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO bookings VALUES (2,'completed',1,2,'2026-11-11 11:00:00','2026-11-11 11:45:00',100.0,1,NULL,NULL,NULL,NULL,1,NULL,'2026-01-01')"
    )
    conn.commit()
    conn.close()
    plan["decisions"].append(
        {
            **plan["decisions"][0],
            "id": 2,
            "interval": {
                "start_time": "2026-11-11 11:00:00",
                "end_time": "2026-11-11 11:45:00",
            },
            "approval_lock": {
                "status": "completed",
                "version": 99,
                "start_time": "2026-11-11 11:00:00",
                "end_time": "2026-11-11 11:45:00",
                "payment_amount": 100.0,
            },
        }
    )
    result = apply_repairs(db, plan, dry_run=False, booking_ids=[1, 2], option_overrides={})
    assert result["outcome"] == "repair_failed"
    assert result["applied"] == []
    conn = sqlite3.connect(db)
    row = conn.execute("SELECT end_time FROM bookings WHERE id=1").fetchone()
    conn.close()
    assert row[0] == "2026-11-11 10:45:00"


def test_approval_lock_status_drift(tmp_path):
    db = tmp_path / "t.db"
    _minimal_booking_db(db)
    plan = _plan_one("2026-11-11 10:30:00")
    plan["decisions"][0]["approval_lock"]["status"] = "cancelled"
    result = apply_repairs(db, plan, dry_run=False, booking_ids=[1], option_overrides={})
    assert result["errors"]
    assert "approval_lock" in result["errors"][0]["error"]


def test_canonical_update_uses_row_time_zone_not_master_tz(tmp_path):
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE masters (id INTEGER PRIMARY KEY, domain TEXT, timezone TEXT)")
    conn.execute("INSERT INTO masters VALUES (1,'m','America/New_York')")
    conn.execute(
        """
        CREATE TABLE master_services_list (
            id INTEGER PRIMARY KEY, duration INTEGER, name TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY, status TEXT, master_id INT, client_id INT,
            start_time TEXT, end_time TEXT, payment_amount REAL, version INT,
            notes TEXT, start_utc_us INT, end_utc_us INT, time_zone TEXT,
            service_id INT, master_service_id INT, created_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO bookings VALUES (
            1,'completed',1,2,'2026-11-11 10:00:00','2026-11-11 10:30:00',1.0,1,
            NULL,1,2,'Europe/Moscow',1,NULL,'x')
        """
    )
    conn.row_factory = sqlite3.Row
    register_sqlite_calendar_guard_udfs(conn)
    row = conn.execute("SELECT * FROM bookings WHERE id=1").fetchone()
    conn.close()
    cols = proposed_update_columns(row, "2026-11-11 10:00:00", "2026-11-11 11:00:00")
    assert cols["time_zone"] == "Europe/Moscow"


def test_main_migration_failure_nonzero_exit_inprocess(tmp_path, monkeypatch, capsys):
    import scripts.prod_calendar_grid_apply_repairs as apply_mod

    db = tmp_path / "t.db"
    _minimal_booking_db(db)
    plan = _plan_one("2026-11-11 10:30:00")
    plan_path = tmp_path / "plan.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    def _fail(_path):
        return {"exit_code": 1, "alembic_version": "old", "stderr_tail": "boom"}

    monkeypatch.setattr(apply_mod, "run_alembic", _fail)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prod_calendar_grid_apply_repairs",
            "--db",
            str(db),
            "--plan",
            str(plan_path),
            "--booking-ids",
            "1",
            "--run-migration-after",
        ],
    )
    exit_code = apply_mod.main()
    assert exit_code == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["outcome"] == "repair_committed_migration_failed"
    assert len(payload.get("applied", [])) == 1
    conn = sqlite3.connect(db)
    end = conn.execute("SELECT end_time FROM bookings WHERE id=1").fetchone()[0]
    conn.close()
    assert end == "2026-11-11 10:30:00"


def test_run_alembic_uses_sys_executable(monkeypatch, tmp_path):
    import scripts.prod_calendar_grid_apply_repairs as apply_mod

    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd

        class _Proc:
            returncode = 0
            stderr = ""
            stdout = ""

        return _Proc()

    db = tmp_path / "m.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32))")
    conn.execute("INSERT INTO alembic_version VALUES ('20261114_calendar_grid_guard')")
    conn.commit()
    conn.close()

    monkeypatch.setattr(apply_mod.subprocess, "run", fake_run)
    apply_mod.run_alembic(db)
    assert captured["cmd"][0] == sys.executable
    assert captured["cmd"][1:] == ["-m", "alembic", "upgrade", "head"]