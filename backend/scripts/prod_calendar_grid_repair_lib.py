"""Shared prod grid repair analysis (read-only helpers)."""

from __future__ import annotations

import re
import shutil
import sqlite3
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from utils.calendar_interval_grid import CALENDAR_GRID_STEP_MINUTES
from utils.sqlite_calendar_grid_guard import (
    _canonical_triple_complete,
    _naive_wall_duration_minutes,
    _parse_wall_naive,
    _wall_on_grid,
    iter_invalid_booking_rows,
    iter_invalid_calendar_block_rows,
    register_sqlite_calendar_guard_udfs,
    sqlite_validate_booking_row,
)
from services.calendar_time import resolve_wall_datetime

STATS_SMOKE_TAG = "STATS_SMOKE_2026_05"
RESEED_SMOKE_SERVICE_DURATION = 45  # CONFIRMED reseed_prod_stats_smoke.py SERVICES_SPEC «Укладка»
RESEED_SMOKE_PAYMENT = 1500.0
DEMO_MASTER_DOMAIN = "demo-master-2"
DEMO_BATCH_CREATED_PREFIX = "2026-04-23 18:34:07"
DEMO_SEED_SCRIPT = "services/demo_master_seed.py"
SMOKE_SEED_SCRIPT = "scripts/reseed_prod_stats_smoke.py"


def connect_readonly(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.resolve()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    register_sqlite_calendar_guard_udfs(conn)
    return conn


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _col_or_null(table_cols: set[str], name: str, *, qualified: str) -> str:
    return qualified if name in table_cols else f"NULL AS {name}"


def schema_snapshot(conn: sqlite3.Connection) -> Dict[str, Any]:
    tables = {
        r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    if "alembic_version" not in tables:
        version = None
    else:
        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    bcols = table_columns(conn, "bookings")
    return {
        "alembic_version": version[0] if version else None,
        "bookings_has_canonical": {"start_utc_us", "end_utc_us", "time_zone"}.issubset(bcols),
        "has_calendar_blocks": "calendar_blocks" in {
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        },
    }


def integrity_check(conn: sqlite3.Connection) -> str:
    row = conn.execute("PRAGMA integrity_check").fetchone()
    return row[0] if row else "unknown"


_SUBSECOND_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$"
)


def diagnose_wall_violations(start_raw: Any, end_raw: Any) -> List[str]:
    reasons: List[str] = []
    if start_raw is None or end_raw is None:
        if start_raw != end_raw:
            reasons.append("partial_interval")
        return reasons or ["missing_wall"]

    start_s = str(start_raw).strip()
    end_s = str(end_raw).strip()

    for label, raw in (("start", start_s), ("end", end_s)):
        m = _SUBSECOND_RE.match(raw.replace("T", " "))
        if not m:
            reasons.append(f"{label}:unparseable_wall")
            continue
        frac = m.group(5)
        if frac is not None and frac.rstrip("0"):
            reasons.append(f"{label}:subsecond")
        minute = int(m.group(3))
        sec = int(m.group(4))
        if minute not in (0, 30) or sec != 0:
            reasons.append(f"{label}:off_grid_wall")

    start = _parse_wall_naive(start_raw)
    end = _parse_wall_naive(end_raw)
    if start is not None and end is not None:
        if end <= start:
            reasons.append("inverted_interval")
        else:
            mins = _naive_wall_duration_minutes(start, end)
            if mins > 0 and mins % CALENDAR_GRID_STEP_MINUTES != 0:
                reasons.append("duration_not_30_multiple")

    code = sqlite_validate_booking_row(start_raw, end_raw, None, None, None)
    if code != 0 and "sqlite_guard" not in reasons:
        reasons.append(f"sqlite_guard_code_{code}")
    return reasons


def _parse_wall_naive_observed(start_raw: Any, end_raw: Any) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Truncate subseconds for observed span only (does not claim grid validity)."""

    def one(raw: Any) -> Optional[datetime]:
        if raw is None:
            return None
        text = str(raw).strip().replace("T", " ")
        m = _SUBSECOND_RE.match(text)
        if not m:
            return _parse_wall_naive(raw)
        y, mo, d = int(m.group(1)[:4]), int(m.group(1)[5:7]), int(m.group(1)[8:10])
        h, mi, sec = int(m.group(2)), int(m.group(3)), int(m.group(4))
        try:
            return datetime(y, mo, d, h, mi, sec, 0)
        except ValueError:
            return None

    return one(start_raw), one(end_raw)


def observed_duration_minutes(start_raw: Any, end_raw: Any) -> Optional[int]:
    start, end = _parse_wall_naive_observed(start_raw, end_raw)
    if start is None or end is None:
        return None
    mins = _naive_wall_duration_minutes(start, end)
    if mins <= 0:
        return mins if mins != 0 else None
    return mins


def _floor_grid(dt: datetime) -> datetime:
    minute = 0 if dt.minute < 30 else 30
    return dt.replace(minute=minute, second=0, microsecond=0)


def grid_options_from_start(
    start: datetime, *, prefer_minutes: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Grid-compliant intervals sharing on-grid start; durations are 30-min multiples."""
    if not _wall_on_grid(start):
        start = _floor_grid(start.replace(microsecond=0))

    options: List[Dict[str, Any]] = []
    for mult in (1, 2, 3, 4):
        dur = mult * CALENDAR_GRID_STEP_MINUTES
        end = start + timedelta(minutes=dur)
        if not _wall_on_grid(end):
            continue
        options.append(
            {
                "duration_minutes": dur,
                "start_time": start.isoformat(sep=" "),
                "end_time": end.isoformat(sep=" "),
                "delta_from_prefer_min": abs(dur - prefer_minutes)
                if prefer_minutes is not None
                else None,
            }
        )
    if prefer_minutes is not None:
        options.sort(key=lambda o: (o["delta_from_prefer_min"], o["duration_minutes"]))
    return options


def validate_full_row(
    row: sqlite3.Row,
    start_raw: str,
    end_raw: str,
) -> Dict[str, Any]:
    wall_only = sqlite_validate_booking_row(start_raw, end_raw, None, None, None) == 0
    full = sqlite_validate_booking_row(
        start_raw,
        end_raw,
        row["start_utc_us"] if "start_utc_us" in row.keys() else None,
        row["end_utc_us"] if "end_utc_us" in row.keys() else None,
        row["time_zone"] if "time_zone" in row.keys() else None,
    ) == 0
    return {
        "wall_only_valid": wall_only,
        "full_row_valid": full,
        "canonical_present": _canonical_triple_complete(
            row["start_utc_us"] if "start_utc_us" in row.keys() else None,
            row["end_utc_us"] if "end_utc_us" in row.keys() else None,
            row["time_zone"] if "time_zone" in row.keys() else None,
        ),
    }


def _row_version(row: sqlite3.Row) -> Optional[int]:
    if "version" not in row.keys():
        return None
    val = row["version"]
    return int(val) if val is not None else None


def decision_lock_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    lock: Dict[str, Any] = {
        "status": row["status"],
        "version": _row_version(row),
        "start_time": str(row["start_time"]),
        "end_time": str(row["end_time"]),
    }
    if "start_utc_us" in row.keys():
        lock["start_utc_us"] = row["start_utc_us"]
        lock["end_utc_us"] = row["end_utc_us"]
        lock["time_zone"] = row["time_zone"]
    if "payment_amount" in row.keys():
        lock["payment_amount"] = row["payment_amount"]
    return lock


def verify_decision_lock(row: sqlite3.Row, lock: Dict[str, Any]) -> Optional[str]:
    if row["status"] != lock["status"]:
        return "status drift"
    if lock.get("version") is not None:
        if _row_version(row) != lock["version"]:
            return "version drift"
    if str(row["start_time"]) != str(lock["start_time"]):
        return "start_time drift"
    if str(row["end_time"]) != str(lock["end_time"]):
        return "end_time drift"
    if "start_utc_us" in lock:
        for key in ("start_utc_us", "end_utc_us", "time_zone"):
            if key in row.keys() and row[key] != lock.get(key):
                return f"{key} drift"
    if lock.get("payment_amount") is not None and "payment_amount" in row.keys():
        if float(row["payment_amount"] or 0) != float(lock["payment_amount"]):
            return "payment_amount drift"
    return None


def classify_provenance(row: sqlite3.Row) -> Dict[str, Any]:
    notes = (row["notes"] or "") if row["notes"] is not None else ""
    domain = (row["master_domain"] or "") if "master_domain" in row.keys() else ""
    created = str(row["created_at"] or "")
    evidence: List[str] = []
    seed_reference: Optional[Dict[str, Any]] = None
    provenance_group: Optional[str] = None
    category = "origin_unknown"
    missing: List[str] = [
        "retained audit/history tying row to a known seed script or generation log",
    ]

    smoke_notes = STATS_SMOKE_TAG in notes
    if smoke_notes:
        pay_ok = float(row["payment_amount"] or 0) == RESEED_SMOKE_PAYMENT
        category = "confirmed_synthetic"
        provenance_group = "stats_smoke_reseed_2026_05"
        evidence.append(f"booking.notes contains `{STATS_SMOKE_TAG}`")
        evidence.append(f"generator `{SMOKE_SEED_SCRIPT}` writes notes=`{STATS_SMOKE_TAG} <bucket> #<seq>`")
        if pay_ok:
            evidence.append(f"payment_amount={RESEED_SMOKE_PAYMENT} matches SERVICES_SPEC «Укладка»")
        else:
            evidence.append(
                f"payment_amount={row['payment_amount']} (smoke tag present; amount not 1500)"
            )
        if domain.startswith("stats-smoke-master"):
            evidence.append(f"master.domain `{domain}` is smoke master from same reseed")
        seed_reference = {
            "generator": SMOKE_SEED_SCRIPT,
            "marker": f"Booking.notes contains {STATS_SMOKE_TAG}",
        }
        missing = []

    elif domain == DEMO_MASTER_DOMAIN and created.startswith(DEMO_BATCH_CREATED_PREFIX):
        category = "confirmed_synthetic"
        provenance_group = "demo_master_seed_batch"
        evidence.append(f"master.domain={DEMO_MASTER_DOMAIN}")
        evidence.append(f"bookings.created_at batch `{DEMO_BATCH_CREATED_PREFIX}`")
        evidence.append(f"generator `{DEMO_SEED_SCRIPT}` seeds demo master demo bookings")
        if notes:
            evidence.append(f"booking.notes={notes!r} matches demo seed labels")
        seed_reference = {
            "generator": DEMO_SEED_SCRIPT,
            "marker": f"created_at prefix {DEMO_BATCH_CREATED_PREFIX}",
        }
        missing = []

    elif category == "origin_unknown" and "inverted_interval" in diagnose_wall_violations(
        row["start_time"], row["end_time"]
    ):
        missing.extend(
            [
                "seed marker in booking.notes (no STATS_SMOKE tag)",
                "demo batch created_at or other generator log for master domain",
            ]
        )
        evidence.append(f"inverted wall interval; master.domain={domain!r}; status={row['status']}")

    if category == "origin_unknown" and not evidence:
        if diagnose_wall_violations(row["start_time"], row["end_time"]):
            evidence.append(f"off-grid wall; master.domain={domain!r}; notes empty or without seed tag")

    return {
        "category": category,
        "provenance_group": provenance_group,
        "evidence": evidence,
        "seed_reference": seed_reference,
        "missing_to_prove_synthetic": missing if category != "confirmed_synthetic" else [],
    }


def catalog_duration_hints(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "service_duration_current": row["service_duration"],
        "master_service_duration_current": row["master_service_duration"],
        "payment_amount": row["payment_amount"],
        "disclaimer": (
            "Current catalog duration is not proof of wall interval at booking time; "
            "see observed_duration_minutes and seed scripts for smoke rows."
        ),
    }


def build_recommendation(row: sqlite3.Row) -> Dict[str, Any]:
    violations = diagnose_wall_violations(row["start_time"], row["end_time"])
    obs = observed_duration_minutes(row["start_time"], row["end_time"])
    start = _parse_wall_naive(row["start_time"])
    end = _parse_wall_naive(row["end_time"])
    prov = classify_provenance(row)
    hints = catalog_duration_hints(row)

    options: List[Dict[str, Any]] = []
    rationale: List[str] = []

    if (start is None or end is None) and row["start_time"]:
        # subsecond row (#145)
        st_obs, _ = _parse_wall_naive_observed(row["start_time"], row["end_time"])
        if st_obs is None:
            st_obs = _parse_wall_naive(row["start_time"])
        st = _floor_grid(st_obs) if st_obs else None
        if st is None:
            rationale.append(f"booking {row['id']}: cannot derive on-grid start from wall")
        else:
            pref = obs or hints.get("service_duration_current") or RESEED_SMOKE_SERVICE_DURATION
            for opt in grid_options_from_start(st, prefer_minutes=pref):
                opt["strategy"] = "truncate_subsecond_snap_start"
                options.append(opt)
            rationale.append(
                "Subsecond wall timestamps are invalid for grid guard; "
                "truncate to whole seconds and align to :00/:30."
            )
            if obs is not None:
                rationale.append(
                    f"Observed wall span (subseconds truncated, not valid grid): {obs} min."
                )
    elif "inverted_interval" in violations and start and _wall_on_grid(start):
        opt_end = start + timedelta(minutes=30)
        options.append(
            {
                "strategy": "fix_inverted_minimal_30m",
                "start_time": start.isoformat(sep=" "),
                "end_time": opt_end.isoformat(sep=" "),
                "duration_minutes": 30,
            }
        )
        rationale.append(
            "Inverted interval is non-persistent; minimal on-grid forward span, status unchanged."
        )
    elif start and _wall_on_grid(start):
        pref = obs if obs and obs > 0 else None
        if prov["category"] == "confirmed_synthetic" and pref == RESEED_SMOKE_SERVICE_DURATION:
            rationale.append(
                "CONFIRMED: reseed_prod_stats_smoke.py sets end=start+45 for «Укладка»; "
                "grid allows 30/60 only — owner picks nearest compliant duration."
            )
        for opt in grid_options_from_start(start, prefer_minutes=pref):
            opt["strategy"] = "preserve_start_adjust_end"
            options.append(opt)

    for opt in options:
        opt.update(validate_full_row(row, opt["start_time"], opt["end_time"]))

    recommended = None
    owner_proposal_under_review: Optional[Dict[str, Any]] = None
    if options:
        if prov["category"] == "confirmed_synthetic" and obs == 45:
            recommended = next(
                (o for o in options if o["duration_minutes"] == 60),
                options[0],
            )
            if prov.get("provenance_group") == "demo_master_seed_batch":
                rationale.append(
                    "Preliminary recommendation: extend end to 60 min on-grid "
                    "(stored wall is 45 min; demo_master_seed uses duration_min=60 for these rows)."
                )
            else:
                rationale.append(
                    "Preliminary recommendation: +60 min (extends 15 min) for smoke rows "
                    "so completed/confirmed windows are not shortened vs 45-min seed intent."
                )
        elif prov["category"] == "confirmed_synthetic":
            recommended = options[0]
        else:
            recommended = None
            rationale.append("No automatic recommendation — owner must choose interval.")
            if (start is None or end is None) and obs == 30:
                opt30 = next((o for o in options if o["duration_minutes"] == 30), None)
                if opt30:
                    owner_proposal_under_review = {
                        "option_index": options.index(opt30),
                        "interval": {
                            "start_time": opt30["start_time"],
                            "end_time": opt30["end_time"],
                        },
                        "observed_duration_minutes": obs,
                        "wall_shift": (
                            "start and end each move earlier by 2 min 38.047306 sec "
                            "(22:02:38.047306→22:00:00, 22:32:38.047306→22:30:00)"
                        ),
                        "production_apply": False,
                        "note": "Under owner review only; not an approval to change production.",
                    }

    impact = []
    if row["income_count"]:
        impact.append(f"incomes={row['income_count']} total={row['income_total']}")
    if row["confirmation_count"]:
        impact.append(f"booking_confirmations={row['confirmation_count']}")
    if row["loyalty_count"]:
        impact.append(f"loyalty_transactions={row['loyalty_count']}")

    return {
        "violations": violations,
        "observed_duration_minutes": obs,
        "provenance": prov,
        "catalog_hints": hints,
        "options": options,
        "recommended": recommended,
        "owner_proposal_under_review": owner_proposal_under_review,
        "recommendation_rationale": rationale,
        "impact_if_time_changes": impact,
        "fields_to_update": ["start_time", "end_time"]
        + (
            ["start_utc_us", "end_utc_us", "time_zone"]
            if validate_full_row(row, str(row["start_time"]), str(row["end_time"]))[
                "canonical_present"
            ]
            else []
        ),
    }


def list_invalid_ids(conn: sqlite3.Connection) -> Tuple[List[int], List[int]]:
    schema = schema_snapshot(conn)
    if schema["bookings_has_canonical"]:
        booking_ids = [rid for rid, _ in iter_invalid_booking_rows(conn)]
    else:
        booking_ids = []
        for row in conn.execute("SELECT id, start_time, end_time FROM bookings"):
            if diagnose_wall_violations(row["start_time"], row["end_time"]):
                booking_ids.append(int(row["id"]))
    block_ids = (
        [rid for rid, _ in iter_invalid_calendar_block_rows(conn)]
        if schema["has_calendar_blocks"]
        else []
    )
    return booking_ids, block_ids


def booking_row_select_clause(conn: sqlite3.Connection) -> str:
    bcols = table_columns(conn, "bookings")
    canonical = {"start_utc_us", "end_utc_us", "time_zone"}.issubset(bcols)
    if canonical:
        canon = "b.start_utc_us, b.end_utc_us, b.time_zone,"
    else:
        canon = "NULL AS start_utc_us, NULL AS end_utc_us, NULL AS time_zone,"
    return f"""
       b.id, b.status, b.master_id, b.client_id, b.notes,
       {_col_or_null(bcols, 'source', qualified='b.source')},
       b.start_time, b.end_time, {canon}
       b.service_id, {_col_or_null(bcols, 'master_service_id', qualified='b.master_service_id')},
       b.payment_amount, b.created_at, {_col_or_null(bcols, 'version', qualified='b.version')},
"""


def _master_service_join(conn: sqlite3.Connection) -> str:
    bcols = table_columns(conn, "bookings")
    if "master_service_id" in bcols:
        return "LEFT JOIN master_services_list ms ON ms.id = b.master_service_id"
    return "LEFT JOIN master_services_list ms ON 0"


def _booking_detail_sql(conn: sqlite3.Connection) -> str:
    return f"""
SELECT {booking_row_select_clause(conn).strip().rstrip(',')},
       s.duration AS service_duration,
       ms.duration AS master_service_duration,
       ms.name AS master_service_name,
       m.domain AS master_domain, m.timezone AS master_timezone,
       (SELECT COUNT(*) FROM incomes WHERE booking_id=b.id) AS income_count,
       (SELECT COALESCE(SUM(total_amount),0) FROM incomes WHERE booking_id=b.id) AS income_total,
       (SELECT COUNT(*) FROM booking_confirmations WHERE booking_id=b.id) AS confirmation_count,
       (SELECT COUNT(*) FROM loyalty_transactions WHERE booking_id=b.id) AS loyalty_count
FROM bookings b
LEFT JOIN services s ON s.id = b.service_id
{_master_service_join(conn)}
LEFT JOIN masters m ON m.id = b.master_id
WHERE b.id = ?
"""


def fetch_booking(conn: sqlite3.Connection, booking_id: int) -> sqlite3.Row:
    return conn.execute(_booking_detail_sql(conn), (booking_id,)).fetchone()


def run_migration_preflight(
    backend_root: Path, source_db: Path
) -> Dict[str, Any]:
    tmp = Path(tempfile.mkdtemp(prefix="prod-grid-mig-"))
    db_copy = tmp / "preflight.db"
    shutil.copy2(source_db, db_copy)
    env = {**dict(**{k: v for k, v in __import__("os").environ.items()}), "DATABASE_URL": f"sqlite:///{db_copy}"}
    proc = subprocess.run(
        [str(backend_root / ".venv/bin/python"), "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_root),
        env={**env, "PYTHONPATH": str(backend_root)},
        capture_output=True,
        text=True,
    )
    after = sqlite3.connect(str(db_copy))
    ver = after.execute("SELECT version_num FROM alembic_version").fetchone()
    after.close()
    blocked = proc.returncode != 0
    return {
        "copy_path": str(db_copy),
        "exit_code": proc.returncode,
        "status": "blocked" if blocked else "passed",
        "alembic_version_after": ver[0] if ver else None,
        "stderr_tail": (proc.stderr or "")[-2000:],
        "stdout_tail": (proc.stdout or "")[-1000:],
        "grid_guard_passed": not blocked and ver and ver[0] == "20261114_calendar_grid_guard",
    }


def recompute_canonical_columns(
    start_wall: datetime,
    end_wall: datetime,
    zone_name: str,
) -> Dict[str, Any]:
    interval = resolve_wall_datetime(start_wall, zone_name)
    # end
    end_ci = resolve_wall_datetime(end_wall, zone_name)
    return {
        "start_utc_us": interval.epoch_microseconds,
        "end_utc_us": end_ci.epoch_microseconds,
        "time_zone": zone_name,
    }


def proposed_update_columns(
    row: sqlite3.Row,
    start_str: str,
    end_str: str,
) -> Dict[str, Any]:
    start = _parse_wall_naive(start_str)
    end = _parse_wall_naive(end_str)
    out = {"start_time": start_str, "end_time": end_str}
    if _canonical_triple_complete(row["start_utc_us"], row["end_utc_us"], row["time_zone"]):
        zone = row["time_zone"]
        if not zone:
            raise ValueError(f"booking {row['id']}: canonical present but booking.time_zone missing")
        out.update(recompute_canonical_columns(start, end, zone))
    return out


def normalize_wall_storage(value: Any) -> Optional[str]:
    """Single wall instant as comparable naive string (strips subseconds / .000000)."""
    start, _ = _parse_wall_naive_observed(value, value)
    if start is None:
        return None
    return start.strftime("%Y-%m-%d %H:%M:%S")


def walls_equivalent(left: Any, right: Any) -> bool:
    a, b = normalize_wall_storage(left), normalize_wall_storage(right)
    if a is None or b is None:
        return str(left) == str(right)
    return a == b


def count_active_booking_overlaps(
    conn: sqlite3.Connection,
    *,
    master_id: int,
    booking_id: int,
    start_raw: Any,
    end_raw: Any,
) -> int:
    start, end = _parse_wall_naive_observed(start_raw, end_raw)
    if start is None or end is None or end <= start:
        return 0
    count = 0
    for row in conn.execute(
        """
        SELECT id, start_time, end_time, status FROM bookings
        WHERE master_id=? AND id<>?
        """,
        (master_id, booking_id),
    ):
        if (row[3] or "") == "cancelled":
            continue
        other_start, other_end = _parse_wall_naive_observed(row[1], row[2])
        if other_start is None or other_end is None or other_end <= other_start:
            continue
        if other_start < end and other_end > start:
            count += 1
    return count


def foreign_key_violation_inventory(conn: sqlite3.Connection) -> Dict[str, Any]:
    """PRAGMA foreign_key_check inventory; not a cleanliness gate."""
    conn.execute("PRAGMA foreign_keys=ON")
    rows = conn.execute("PRAGMA foreign_key_check").fetchall()
    sample = [
        {"table": r[0], "rowid": r[1], "parent": r[2], "fk_index": r[3]}
        for r in rows[:10]
    ]
    return {
        "foreign_key_violations_count": len(rows),
        "fk_check_clean": len(rows) == 0,
        "sample": sample,
        "disclaimer": (
            "Known legacy violations may persist; this is diagnostic only, "
            "not repaired by grid remediation."
        ),
    }


def _related_counts(conn: sqlite3.Connection, booking_id: int) -> Dict[str, Any]:
    row = conn.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM incomes WHERE booking_id=?) AS income_count,
          (SELECT COALESCE(SUM(total_amount),0) FROM incomes WHERE booking_id=?) AS income_total,
          (SELECT COUNT(*) FROM booking_confirmations WHERE booking_id=?) AS confirmation_count,
          (SELECT COUNT(*) FROM loyalty_transactions WHERE booking_id=?) AS loyalty_count
        """,
        (booking_id, booking_id, booking_id, booking_id),
    ).fetchone()
    return dict(row) if row else {}


def snapshot_booking_consequences(
    conn: sqlite3.Connection, booking_ids: Sequence[int]
) -> Dict[str, Any]:
    register_sqlite_calendar_guard_udfs(conn)
    conn.row_factory = sqlite3.Row
    out: Dict[str, Any] = {
        "bookings": {},
        "integrity": integrity_check(conn),
        **foreign_key_violation_inventory(conn),
    }
    for bid in booking_ids:
        row = conn.execute(
            "SELECT id, status, version, start_time, end_time, payment_amount, master_id "
            "FROM bookings WHERE id=?",
            (bid,),
        ).fetchone()
        if not row:
            out["bookings"][str(bid)] = {"missing": True}
            continue
        overlaps = count_active_booking_overlaps(
            conn,
            master_id=int(row["master_id"]),
            booking_id=bid,
            start_raw=row["start_time"],
            end_raw=row["end_time"],
        )
        out["bookings"][str(bid)] = {
            "status": row["status"],
            "version": row["version"],
            "start_time": str(row["start_time"]),
            "end_time": str(row["end_time"]),
            "start_time_norm": normalize_wall_storage(row["start_time"]),
            "end_time_norm": normalize_wall_storage(row["end_time"]),
            "payment_amount": row["payment_amount"],
            "overlap_active_count": overlaps,
            **_related_counts(conn, bid),
        }
    return out


def compare_repair_consequences(
    before: Dict[str, Any],
    after: Dict[str, Any],
    *,
    repaired_ids: Sequence[int],
) -> Dict[str, Any]:
    expected: List[Dict[str, Any]] = []
    unexpected: List[Dict[str, Any]] = []
    unchanged_ok: List[str] = []
    time_fields = {"start_time", "end_time", "version"}

    for bid in repaired_ids:
        key = str(bid)
        b = before["bookings"].get(key, {})
        a = after["bookings"].get(key, {})
        if b.get("missing") or a.get("missing"):
            unexpected.append({"id": bid, "issue": "row missing in before/after"})
            continue
        for field in (
            "status",
            "payment_amount",
            "income_count",
            "income_total",
            "confirmation_count",
            "loyalty_count",
        ):
            if b.get(field) != a.get(field):
                unexpected.append(
                    {"id": bid, "field": field, "before": b.get(field), "after": a.get(field)}
                )
        wall_changed = not (
            walls_equivalent(b.get("start_time"), a.get("start_time"))
            and walls_equivalent(b.get("end_time"), a.get("end_time"))
        )
        if wall_changed:
            expected.append(
                {
                    "id": bid,
                    "wall_before": (b["start_time"], b["end_time"]),
                    "wall_after": (a["start_time"], a["end_time"]),
                    "wall_norm_before": (b.get("start_time_norm"), b.get("end_time_norm")),
                    "wall_norm_after": (a.get("start_time_norm"), a.get("end_time_norm")),
                }
            )
        elif (
            b.get("start_time") != a.get("start_time") or b.get("end_time") != a.get("end_time")
        ):
            expected.append(
                {
                    "id": bid,
                    "storage_format_only": True,
                    "wall_before": (b["start_time"], b["end_time"]),
                    "wall_after": (a["start_time"], a["end_time"]),
                }
            )
        if b.get("version") is not None and a.get("version") == b.get("version") + 1:
            expected.append({"id": bid, "version_delta": "+1"})
        elif b.get("version") != a.get("version"):
            unexpected.append(
                {
                    "id": bid,
                    "field": "version",
                    "before": b.get("version"),
                    "after": a.get("version"),
                }
            )
        overlap_delta = (a.get("overlap_active_count", 0) - b.get("overlap_active_count", 0))
        if overlap_delta != 0:
            expected.append(
                {"id": bid, "overlap_active_delta": overlap_delta, "note": "may change when window widens"}
            )

    integ_before = before.get("integrity")
    integ_after = after.get("integrity")
    if integ_after != "ok":
        unexpected.append({"issue": "integrity_check", "after": integ_after})

    fk_before = before.get("foreign_key_violations_count")
    fk_after = after.get("foreign_key_violations_count")
    if fk_before is not None and fk_after is not None and fk_before != fk_after:
        unexpected.append(
            {
                "issue": "foreign_key_violations_count_changed",
                "before": fk_before,
                "after": fk_after,
            }
        )

    return {
        "expected_changes": expected,
        "unexpected_changes": unexpected,
        "integrity_before": integ_before,
        "integrity_after": integ_after,
        "foreign_key_violations_before": fk_before,
        "foreign_key_violations_after": fk_after,
        "fk_check_clean": False,
        "passed": not unexpected and integ_after == "ok",
    }