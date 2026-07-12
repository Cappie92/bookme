"""Case-insensitive lookup Master by public domain/slug (masters.domain)."""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Master

logger = logging.getLogger(__name__)


def get_master_by_domain_slug(db: Session, slug: str) -> Optional[Master]:
    """
    Найти мастера по masters.domain без учёта регистра.
    None — не найден или неоднозначное совпадение (два domain, отличающихся только регистром).
    """
    needle = (slug or "").strip()
    if not needle:
        return None

    lowered = needle.lower()
    matches = (
        db.query(Master)
        .filter(Master.domain.isnot(None))
        .filter(func.lower(Master.domain) == lowered)
        .order_by(Master.id.asc())
        .all()
    )
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        logger.warning(
            "Ambiguous master domain slug %r: %d case-insensitive matches ids=%s domains=%s",
            slug,
            len(matches),
            [m.id for m in matches],
            [m.domain for m in matches],
        )
        return None
    return None
