"""add_branch_id_to_masters

Revision ID: add_branch_id_to_masters
Revises: 4c65d5480ce3
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_branch_id_to_masters'
down_revision = '6f87aede3c93'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('masters')}
    if 'branch_id' not in cols:
        op.add_column('masters', sa.Column('branch_id', sa.Integer(), nullable=True))

    insp = sa.inspect(bind)
    fks = insp.get_foreign_keys('masters')
    has_branch_fk = any(
        fk.get('referred_table') == 'salon_branches'
        and tuple(fk.get('constrained_columns') or ()) == ('branch_id',)
        for fk in fks
    ) or any(fk.get('name') == 'fk_masters_branch_id' for fk in fks)

    if has_branch_fk:
        return

    # SQLite: batch_alter_table + create_foreign_key пересоздаёт masters и даёт
    # CircularDependencyError при топологической сортировке колонок (аналогично bookings.branch_id).
    if bind.dialect.name == 'sqlite':
        return

    op.create_foreign_key(
        'fk_masters_branch_id',
        'masters',
        'salon_branches',
        ['branch_id'],
        ['id'],
    )


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('masters')}
    if 'branch_id' not in cols:
        return

    if bind.dialect.name != 'sqlite':
        fks = {fk.get('name') for fk in insp.get_foreign_keys('masters')}
        if 'fk_masters_branch_id' in fks:
            op.drop_constraint('fk_masters_branch_id', 'masters', type_='foreignkey')

    op.drop_column('masters', 'branch_id')
