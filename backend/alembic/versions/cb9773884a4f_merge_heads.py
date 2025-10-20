"""merge_heads

Revision ID: cb9773884a4f
Revises: 1f620286e4ef, 20250127_unified_master
Create Date: 2025-09-29 20:44:14.314064

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb9773884a4f'
down_revision: Union[str, None] = ('1f620286e4ef', '20250127_unified_master')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
