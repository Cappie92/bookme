"""add_branch_id_to_bookings

Revision ID: 6f87aede3c93
Revises: 9ee705fff115
Create Date: 2025-08-05 19:27:30.749627

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f87aede3c93'
down_revision: Union[str, None] = '9ee705fff115'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('bookings')}
    if 'branch_id' not in cols:
        op.add_column('bookings', sa.Column('branch_id', sa.Integer(), nullable=True))

    insp = sa.inspect(bind)
    fks = insp.get_foreign_keys('bookings')
    has_branch_fk = any(
        fk.get('referred_table') == 'salon_branches'
        and tuple(fk.get('constrained_columns') or ()) == ('branch_id',)
        for fk in fks
    ) or any(fk.get('name') == 'fk_bookings_branch_id' for fk in fks)

    if has_branch_fk:
        return

    # SQLite: batch_alter_table + create_foreign_key пересоздаёт bookings и даёт
    # CircularDependencyError при топологической сортировке колонок. ADD COLUMN без rebuild — безопасно.
    if bind.dialect.name == 'sqlite':
        return

    op.create_foreign_key(
        'fk_bookings_branch_id',
        'bookings',
        'salon_branches',
        ['branch_id'],
        ['id'],
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('bookings')}
    if 'branch_id' not in cols:
        return

    if bind.dialect.name != 'sqlite':
        fks = {fk.get('name') for fk in insp.get_foreign_keys('bookings')}
        if 'fk_bookings_branch_id' in fks:
            op.drop_constraint('fk_bookings_branch_id', 'bookings', type_='foreignkey')

    op.drop_column('bookings', 'branch_id')
