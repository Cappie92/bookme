"""
MASTER_CANON — утилиты для каноничной сущности master.
Резолв indie_master_id -> master_id через indie_masters.master_id.

Флаги:
- LEGACY_INDIE_MODE (bool, default 0) — единственный источник истины при обычном запуске (get_settings()).
- MASTER_CANON_MODE — deprecated: в runtime приложения НЕ читается из os.environ; допускается только
  чтение из переданного dict env в тестах/скриптах. В шаблонах не указывать.
  MASTER_CANON_MODE=1/true/yes => master-only; MASTER_CANON_MODE=0 => legacy.
"""
import logging
from typing import Optional, Tuple, Any

logger = logging.getLogger(__name__)


def _parse_bool_env(val: str) -> bool:
    """1/true/yes => True, 0/false/no/'' => False."""
    v = (val or "").strip().lower()
    if v in ("1", "true", "yes"):
        return True
    return False


def resolve_legacy_indie_mode_from_env(env: Optional[dict] = None) -> bool:
    """
    LEGACY_INDIE_MODE — единственный источник истины.
    MASTER_CANON_MODE (deprecated) читается только если LEGACY_INDIE_MODE не задан и env передан.
    env: для тестов; по умолчанию — из settings.
    """
    if env is not None:
        e = env
        has_legacy = "LEGACY_INDIE_MODE" in e
        has_master_canon = "MASTER_CANON_MODE" in e
        if has_legacy and has_master_canon:
            logger.warning(
                "LEGACY_INDIE_MODE and MASTER_CANON_MODE both set. LEGACY_INDIE_MODE wins."
            )
            return _parse_bool_env(e.get("LEGACY_INDIE_MODE", "0"))
        if has_legacy:
            return _parse_bool_env(e.get("LEGACY_INDIE_MODE", "0"))
        if has_master_canon:
            logger.warning(
                "MASTER_CANON_MODE deprecated. Use LEGACY_INDIE_MODE (0=master-only, 1=legacy)."
            )
            mc = _parse_bool_env(e.get("MASTER_CANON_MODE", "1"))
            return not mc
        return False
    from settings import get_settings
    return _parse_bool_env(get_settings().LEGACY_INDIE_MODE)


LEGACY_INDIE_MODE = resolve_legacy_indie_mode_from_env()


def _get_master_canon_debug() -> bool:
    from settings import get_settings
    return _parse_bool_env(get_settings().MASTER_CANON_DEBUG)


MASTER_CANON_DEBUG = _get_master_canon_debug()


def resolve_master_for_booking(booking: Any) -> Tuple[Optional[int], str]:
    """
    Резолв каноничного master_id и master_name для booking.
    Использует только indie_masters.master_id (никаких матчей по имени).

    Returns:
        (master_id, master_name)
    """
    # Прямая привязка к master
    if booking.master_id and booking.master:
        name = "-"
        if booking.master.user:
            name = booking.master.user.full_name or "-"
        return (booking.master_id, name)

    # Привязка к indie_master — резолв через indie_masters.master_id
    if booking.indie_master_id and booking.indie_master:
        im = booking.indie_master
        master_id = getattr(im, "master_id", None)
        if master_id is not None:
            # master_name из indie_master.user (display)
            name = "-"
            if im.user:
                name = im.user.full_name or "-"
            return (master_id, name)
        # indie_master без master_id — невозможный кейс после Этапа 1
        raise ValueError(
            f"Booking {booking.id}: indie_master_id={booking.indie_master_id} "
            "but indie_master.master_id is NULL. Run Stage 1 migration."
        )

    return (booking.master_id, "-")
