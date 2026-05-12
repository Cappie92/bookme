"""backfill pre_visit_confirmations_enabled for extended-stats masters

Выровнять колонку с продуктовой формулой PUT /profile для мастеров с has_extended_stats.

Revision ID: 20260413_pre_visit_bf
Revises: 20260401_booking_pubref
Create Date: 2026-04-13

ВАЖНО (миграция vs ORM):
Раньше вызывался backfill_pre_visit_column_for_extended_stats_masters() из utils, который
тянул has_extended_stats → check_feature_access → db.query(User). На момент этой ревизии
колонки users.phone_verification_* / pending_* ещё НЕ существуют (они добавляются в 838e2b24a042),
поэтому любой SELECT по полной ORM-модели User ломал alembic upgrade head.

Здесь только reflection + text() + json.loads по узким колонкам, без импорта models / utils.

"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "20260413_pre_visit_bf"
down_revision: Union[str, None] = "20260401_booking_pubref"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_columns(conn: Any, table: str) -> set[str]:
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _as_bool(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v).strip().lower()
    if s in ("true", "1", "yes"):
        return True
    if s in ("false", "0", "no", ""):
        return False
    return bool(v)


def _desired_pre_visit(auto_confirm_bookings: Any) -> bool:
    """Совпадает с utils/pre_visit_effective.py: desired = not (m.auto_confirm_bookings is True)."""
    ab = _as_bool(auto_confirm_bookings)
    return not (ab is True)


def _parse_plan_features(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return {}
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return {}
    return {}


def _features_has_extended_stats(features: dict[str, Any]) -> bool:
    sfs = features.get("service_functions") or []
    if not isinstance(sfs, list):
        return False
    return 2 in sfs


def _user_has_extended_stats(
    conn: Any,
    user_id: int,
    now_utc: datetime,
    ucols: set[str],
) -> bool:
    if "is_always_free" in ucols:
        row = conn.execute(
            text("SELECT is_always_free FROM users WHERE id = :uid"),
            {"uid": user_id},
        ).first()
        if row is not None and _as_bool(row[0]):
            return True

    # Активная подписка мастера с максимальным end_date (как get_active_subscription_readonly)
    row = conn.execute(
        text(
            """
            SELECT p.features
            FROM subscriptions s
            JOIN subscription_plans p ON p.id = s.plan_id
            WHERE s.user_id = :uid
              AND s.subscription_type IN ('master', 'MASTER')
              AND s.status IN ('active', 'ACTIVE')
              AND s.is_active
              AND s.end_date > :now
            ORDER BY s.end_date DESC
            LIMIT 1
            """
        ),
        {"uid": user_id, "now": now_utc},
    ).first()
    if row is None:
        return False
    feats = _parse_plan_features(row[0])
    return _features_has_extended_stats(feats)


def upgrade() -> None:
    bind = op.get_bind()
    conn = bind

    mcols = _table_columns(conn, "masters")
    if not {"id", "user_id", "auto_confirm_bookings", "pre_visit_confirmations_enabled"}.issubset(mcols):
        # Нет ожидаемой схемы — не блокируем upgrade
        return

    ucols = _table_columns(conn, "users")
    subs_tables = {"subscriptions", "subscription_plans"}
    if not subs_tables.issubset(set(sa.inspect(conn).get_table_names())):
        return

    now_utc = datetime.utcnow()
    masters = conn.execute(
        text(
            """
            SELECT id, user_id, auto_confirm_bookings, pre_visit_confirmations_enabled
            FROM masters
            """
        )
    ).mappings().all()

    for m in masters:
        uid = int(m["user_id"])
        if not _user_has_extended_stats(conn, uid, now_utc, ucols):
            continue
        desired = _desired_pre_visit(m["auto_confirm_bookings"])
        cur = m["pre_visit_confirmations_enabled"]
        cur_b = True if _as_bool(cur) else False
        if cur_b == desired:
            continue
        conn.execute(
            text(
                """
                UPDATE masters
                SET pre_visit_confirmations_enabled = :pv
                WHERE id = :mid
                """
            ),
            {"pv": desired, "mid": int(m["id"])},
        )


def downgrade() -> None:
    pass
