"""backfill pre_visit_confirmations_enabled for extended-stats masters

Выровнять колонку с продуктовой формулой PUT /profile для мастеров с has_extended_stats.

Revision ID: 20260413_pre_visit_bf
Revises: 20260401_booking_pubref
Create Date: 2026-04-13

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.orm import sessionmaker


revision: str = "20260413_pre_visit_bf"
down_revision: Union[str, None] = "20260401_booking_pubref"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Session = sessionmaker(bind=bind)
    session = Session()
    try:
        from utils.pre_visit_effective import backfill_pre_visit_column_for_extended_stats_masters

        backfill_pre_visit_column_for_extended_stats_masters(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def downgrade() -> None:
    pass
