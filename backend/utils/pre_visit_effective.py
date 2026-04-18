"""
Единая продуктовая логика pre-visit подтверждения (согласована с PUT /api/master/profile).

Колонка masters.pre_visit_confirmations_enabled остаётся в БД; effective-правило допускает
ручной режим при has_extended_stats даже при устаревшем значении колонки; True в колонке
сохраняется как legacy override (например авто-подтверждение + явно включённый pre-visit).
"""

from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from utils.subscription_features import has_extended_stats


def effective_pre_visit_confirmations_allowed(db: Session, user_id: int, master: Any) -> bool:
    if master is None:
        return False
    if not has_extended_stats(db, user_id):
        return False
    manual_mode = master.auto_confirm_bookings is not True
    legacy_on = bool(getattr(master, "pre_visit_confirmations_enabled", False))
    return manual_mode or legacy_on


def backfill_pre_visit_column_for_extended_stats_masters(db: Session) -> Dict[str, Any]:
    """
    Выровнять колонку pre_visit_confirmations_enabled с PUT /profile:
    для мастеров с has_extended_stats выставить not auto_confirm_bookings
    (в Python: auto_confirm_bookings is not True → колонка True).
    """
    from models import Master

    masters = db.query(Master).all()
    updated = 0
    with_extended = 0
    samples: list[tuple[int, bool, bool]] = []

    for m in masters:
        if not has_extended_stats(db, m.user_id):
            continue
        with_extended += 1
        desired = not (m.auto_confirm_bookings is True)
        current = m.pre_visit_confirmations_enabled
        current_bool = True if current is True else False
        if current_bool == desired:
            continue
        updated += 1
        if len(samples) < 25:
            samples.append((m.user_id, current_bool, desired))
        m.pre_visit_confirmations_enabled = desired

    return {
        "masters_with_extended_stats": with_extended,
        "rows_updated": updated,
        "sample_user_id_old_new": samples,
    }
