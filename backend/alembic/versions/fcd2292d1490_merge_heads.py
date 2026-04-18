"""merge heads

Revision ID: fcd2292d1490
Revises: convert_balance_to_rubles, 20260121_add_master_id_to_loyalty_discounts
Create Date: 2026-01-23 12:18:41.643437

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fcd2292d1490'
down_revision: Union[str, None] = ('convert_balance_to_rubles', '20260121_add_master_id_to_loyalty_discounts')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
