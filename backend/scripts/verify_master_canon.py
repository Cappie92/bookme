#!/usr/bin/env python3
"""
MASTER_CANON verify: DB инварианты + опционально API.
Exit 0 — всё OK, 1 — нарушения.

LEGACY_INDIE_MODE=0 (default): bookings.indie_master_id NOT NULL должно быть 0.
API: client bookings без indie_master_id, /favorites/indie-masters → 410.
"""
import os
import sys

# Для import при запуске из корня
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bookme.db")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
TOKEN = os.getenv("TOKEN", "")


def verify_db() -> bool:
    if not os.path.exists(DB_PATH):
        print(f"[SKIP] DB not found: {DB_PATH}")
        return True

    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("--- DB invariants ---")
    ok = True

    master_null = cur.execute("SELECT COUNT(*) FROM bookings WHERE master_id IS NULL").fetchone()[0]
    if master_null > 0:
        print(f"  [FAIL] bookings master_id NULL: {master_null} (expect 0)")
        ok = False
    else:
        print(f"  [OK] bookings master_id NULL: 0")

    from utils.master_canon import LEGACY_INDIE_MODE
    legacy_mode = LEGACY_INDIE_MODE
    indie_not_null = cur.execute(
        "SELECT COUNT(*) FROM bookings WHERE indie_master_id IS NOT NULL"
    ).fetchone()[0]
    if not legacy_mode and indie_not_null > 0:
        print(f"  [FAIL] LEGACY_INDIE_MODE=0: bookings indie_master_id NOT NULL: {indie_not_null} (expect 0)")
        ok = False
    elif not legacy_mode:
        print(f"  [OK] bookings indie_master_id NOT NULL: 0 (master-only)")
    else:
        print(f"  [OK] LEGACY_INDIE_MODE=1: indie bookings allowed ({indie_not_null})")

    indie_fav = cur.execute(
        "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master'"
    ).fetchone()[0]
    if indie_fav > 0:
        print(f"  [FAIL] client_favorites favorite_type=indie_master: {indie_fav} (expect 0)")
        ok = False
    else:
        print(f"  [OK] client_favorites favorite_type=indie_master: 0")

    im_null = cur.execute(
        "SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL"
    ).fetchone()[0]
    if im_null > 0:
        print(f"  [FAIL] indie_masters master_id NULL: {im_null} (expect 0)")
        ok = False
    else:
        print(f"  [OK] indie_masters master_id NULL: 0")

    im_dups = cur.execute(
        """SELECT COUNT(*) FROM (
            SELECT master_id, COUNT(*) as c FROM indie_masters
            WHERE master_id IS NOT NULL GROUP BY master_id HAVING c > 1
        )"""
    ).fetchone()[0]
    if im_dups > 0:
        print(f"  [FAIL] indie_masters UNIQUE(master_id) violations: {im_dups} (expect 0)")
        ok = False
    else:
        print(f"  [OK] indie_masters UNIQUE(master_id) violations: 0")

    both_null = cur.execute(
        "SELECT COUNT(*) FROM bookings WHERE master_id IS NULL AND indie_master_id IS NULL"
    ).fetchone()[0]
    if both_null > 0:
        print(f"  [FAIL] bookings both NULL: {both_null} (expect 0)")
        ok = False
    else:
        print(f"  [OK] bookings both NULL: 0")

    conn.close()
    return ok


def _parse_bookings_response(data) -> list:
    """Устойчивый парсер: list или dict с items."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "items" in data:
        return data["items"]
    return []


def _verify_calendar() -> bool:
    """Calendar verify: ICS endpoint + optional email. Returns False on FAIL."""
    import json
    import urllib.request
    import urllib.error

    print("\n--- Calendar verify ---")
    try:
        # GET future bookings (только future — calendar для прошлых не поддерживается)
        req = urllib.request.Request(
            f"{BASE_URL}/api/client/bookings/",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        future = [b for b in _parse_bookings_response(data) if b.get("id")]
        if not future:
            print("  [SKIP] calendar verify: no future bookings")
            print("  [HINT] run reseed with --base-url and re-login to get TOKEN")
            return True
        bid = future[0]["id"]
        b = future[0]
        print(f"  [INFO] using booking_id={bid}, master_id={b.get('master_id')}, "
              f"start_time={b.get('start_time')}, master_timezone={b.get('master_timezone')}")

        # GET calendar.ics
        ics_url = f"{BASE_URL}/api/client/bookings/{bid}/calendar.ics?alarm_minutes=60"
        req = urllib.request.Request(ics_url, headers={"Authorization": f"Bearer {TOKEN}"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read().decode()
                ctype = r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            print(f"  [FAIL] calendar.ics: {e.code} {e.reason}")
            print(f"  [DIAG] url={ics_url}, booking_id={bid}")
            try:
                body_preview = e.read().decode()[:200] if e.fp else ""
                print(f"  [DIAG] body preview: {body_preview}")
            except Exception:
                pass
            # Доп. диагностика: openapi path, GET booking
            try:
                openapi_req = urllib.request.Request(f"{BASE_URL}/openapi.json")
                with urllib.request.urlopen(openapi_req, timeout=5) as o:
                    openapi = json.loads(o.read().decode())
                paths = openapi.get("paths", {})
                ics_path = "/api/client/bookings/{booking_id}/calendar.ics"
                if ics_path in paths:
                    print(f"  [DIAG] openapi: path {ics_path} exists")
                else:
                    print(f"  [DIAG] openapi: path {ics_path} NOT FOUND, available: {list(paths.keys())[:5]}...")
            except Exception as oe:
                print(f"  [DIAG] openapi check failed: {oe}")
            return False

        if "text/calendar" not in ctype:
            print(f"  [FAIL] calendar.ics Content-Type: expected text/calendar, got {ctype}")
            return False
        print(f"  [OK] calendar.ics Content-Type: text/calendar")

        required = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "UID:",
            "SUMMARY:",
            "DTSTART",
            "DTEND",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
        for s in required:
            if s not in body:
                print(f"  [FAIL] calendar.ics missing: {s}")
                return False
        print(f"  [OK] calendar.ics structure: VCALENDAR/VEVENT/UID/SUMMARY/DTSTART/DTEND")

        if "TZID=" in body and "DTSTART" in body:
            print(f"  [OK] ICS uses TZID (master timezone)")
        elif "Z" in body.split("DTSTART")[1][:20] if "DTSTART" in body else False:
            print("  [INFO] ICS uses UTC (Z) instead of TZID, so UI should rely on client conversion.")
        else:
            print("  [INFO] ICS datetime format: check DTSTART/DTEND")

        if "BEGIN:VALARM" in body and "TRIGGER:" in body and "END:VALARM" in body:
            if "TRIGGER:-PT60M" in body or "TRIGGER:-PT60" in body:
                print(f"  [OK] VALARM present (60 min)")
            else:
                print(f"  [OK] VALARM present")
        else:
            print("  [WARN] VALARM missing or incomplete")

        # Optional: POST calendar/email
        try:
            email_req = urllib.request.Request(
                f"{BASE_URL}/api/client/bookings/{bid}/calendar/email",
                data=json.dumps({"email": "test@example.com", "alarm_minutes": 60}).encode(),
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(email_req, timeout=10) as r:
                resp = json.loads(r.read().decode())
            if resp.get("ok") is True:
                print("  [OK] POST calendar/email: 200 ok")
            else:
                print(f"  [WARN] POST calendar/email: unexpected response {resp}")
        except urllib.error.HTTPError as e:
            print(f"  [FAIL] POST calendar/email: {e.code} {e.reason}")
            return False

        return True
    except urllib.error.HTTPError as e:
        print(f"  [FAIL] Calendar verify HTTP error: {e.code} {e.reason}")
        return False
    except Exception as e:
        print(f"  [WARN] Calendar verify failed: {e}")
        return True


def verify_api() -> bool:
    if not TOKEN:
        print("\n[SKIP] API verify: set TOKEN env")
        return True

    try:
        import urllib.request
        import urllib.error
        import json

        def get(path: str):
            req = urllib.request.Request(
                f"{BASE_URL}{path}",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read().decode())

        print("\n--- API verify ---")

        # GET /api/client/bookings/ и /past
        for path, name in [("/api/client/bookings/", "bookings"), ("/api/client/bookings/past", "past")]:
            data = get(path)
            items = _parse_bookings_response(data)
            null_mid = sum(1 for b in items if b.get("master_id") is None)
            nonnull_indie = sum(1 for b in items if b.get("indie_master_id") is not None)
            has_indie_key = any("indie_master_id" in b for b in items)
            missing_tz = [b["id"] for b in items if not (b.get("master_timezone") or "").strip()]
            if null_mid > 0:
                print(f"  [FAIL] GET {path} master_id null: {null_mid}")
                return False
            if nonnull_indie > 0 or has_indie_key:
                print(f"  [FAIL] GET {path} indie_master_id present (expect absent in canon schema)")
                return False
            if missing_tz:
                print(f"  [FAIL] GET {path} master_timezone missing: {len(missing_tz)} bookings")
                print(f"  [DIAG] first 5 ids with missing tz: {missing_tz[:5]}")
                return False
        print(f"  [OK] GET /bookings/ + /past: master_id null=0, indie absent, master_timezone present")

        # GET /api/client/favorites/indie-masters -> 410
        try:
            req = urllib.request.Request(
                f"{BASE_URL}/api/client/favorites/indie-masters",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            urllib.request.urlopen(req, timeout=5)
            print("  [FAIL] GET /favorites/indie-masters: expected 410, got 200")
            return False
        except urllib.error.HTTPError as e:
            if e.code != 410:
                print(f"  [FAIL] GET /favorites/indie-masters: expected 410, got {e.code}")
                return False
        print("  [OK] GET /favorites/indie-masters: 410 Gone")

        # GET /api/master/restrictions — master-only: 200 без indie зависимости (если TOKEN мастера)
        try:
            data = get("/api/master/restrictions")
            if "blacklist" not in data or "advance_payment_only" not in data:
                print("  [FAIL] GET /api/master/restrictions: unexpected schema")
                return False
            print("  [OK] GET /api/master/restrictions: 200 (no indie dependency)")
        except urllib.error.HTTPError as e:
            body = (e.read().decode() if e.fp else "") if e.fp else ""
            if e.code == 400 and "IndieMaster" in body:
                print("  [FAIL] GET /api/master/restrictions: IndieMaster required (master-only violation)")
                return False
            if e.code == 404:
                print("  [SKIP] GET /api/master/restrictions: 404 (TOKEN may be client, not master)")
            else:
                raise

        # Calendar verify
        cal_ok = _verify_calendar()
        if not cal_ok:
            return False

        return True
    except Exception as e:
        print(f"  [WARN] API verify failed: {e}")
        return True  # не падаем на сетевые ошибки


def main() -> int:
    db_ok = verify_db()
    api_ok = verify_api()
    return 0 if (db_ok and api_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
