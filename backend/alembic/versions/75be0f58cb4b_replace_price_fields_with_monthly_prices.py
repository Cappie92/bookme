"""replace_price_fields_with_monthly_prices

Revision ID: 75be0f58cb4b
Revises: 383f4e3e8235
Create Date: 2025-12-06 20:52:50.409362

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75be0f58cb4b'
down_revision: Union[str, None] = '383f4e3e8235'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('subscription_plans')}
    for name in ('price_1month', 'price_3months', 'price_6months', 'price_12months'):
        if name not in cols:
            op.add_column('subscription_plans', sa.Column(name, sa.Float(), nullable=True))

    connection = op.get_bind()
    insp = sa.inspect(connection)
    cols_after_add = {c['name'] for c in insp.get_columns('subscription_plans')}
    if 'price_monthly' in cols_after_add and 'price_yearly' in cols_after_add:
        connection.execute(sa.text("""
            UPDATE subscription_plans
            SET
                price_1month = price_monthly,
                price_3months = price_monthly,
                price_6months = price_monthly,
                price_12months = price_yearly / 12.0
            WHERE price_1month IS NULL
        """))

    if not is_sqlite:
        with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
            batch_op.alter_column('price_1month', nullable=False)
            batch_op.alter_column('price_3months', nullable=False)
            batch_op.alter_column('price_6months', nullable=False)
            batch_op.alter_column('price_12months', nullable=False)

    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('subscription_plans')}
    if 'price_monthly' in cols:
        op.drop_column('subscription_plans', 'price_monthly')
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('subscription_plans')}
    if 'price_yearly' in cols:
        op.drop_column('subscription_plans', 'price_yearly')


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('subscription_plans')}
    if 'price_monthly' not in cols:
        op.add_column('subscription_plans', sa.Column('price_monthly', sa.Float(), nullable=True))
    if 'price_yearly' not in cols:
        op.add_column('subscription_plans', sa.Column('price_yearly', sa.Float(), nullable=True))

    connection = op.get_bind()
    connection.execute(sa.text("""
        UPDATE subscription_plans
        SET
            price_monthly = price_1month,
            price_yearly = price_12months * 12.0
        WHERE price_monthly IS NULL
    """))

    if not is_sqlite:
        with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
            batch_op.alter_column('price_monthly', nullable=False)
            batch_op.alter_column('price_yearly', nullable=False)

    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('subscription_plans')}
    for name in ('price_1month', 'price_3months', 'price_6months', 'price_12months'):
        if name in cols:
            op.drop_column('subscription_plans', name)
