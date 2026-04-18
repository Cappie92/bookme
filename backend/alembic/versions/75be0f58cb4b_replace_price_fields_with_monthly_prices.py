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
    # Добавляем новые поля
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('price_1month', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('price_3months', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('price_6months', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('price_12months', sa.Float(), nullable=True))
    
    # Заполняем новые поля значениями из старых
    connection = op.get_bind()
    connection.execute(sa.text("""
        UPDATE subscription_plans 
        SET 
            price_1month = price_monthly,
            price_3months = price_monthly,
            price_6months = price_monthly,
            price_12months = price_yearly / 12.0
        WHERE price_1month IS NULL
    """))
    
    # Делаем новые поля обязательными
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.alter_column('price_1month', nullable=False)
        batch_op.alter_column('price_3months', nullable=False)
        batch_op.alter_column('price_6months', nullable=False)
        batch_op.alter_column('price_12months', nullable=False)
    
    # Удаляем старые поля
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.drop_column('price_monthly')
        batch_op.drop_column('price_yearly')


def downgrade() -> None:
    # Добавляем обратно старые поля
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('price_monthly', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('price_yearly', sa.Float(), nullable=True))
    
    # Заполняем старые поля значениями из новых
    connection = op.get_bind()
    connection.execute(sa.text("""
        UPDATE subscription_plans 
        SET 
            price_monthly = price_1month,
            price_yearly = price_12months * 12.0
        WHERE price_monthly IS NULL
    """))
    
    # Делаем старые поля обязательными
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.alter_column('price_monthly', nullable=False)
        batch_op.alter_column('price_yearly', nullable=False)
    
    # Удаляем новые поля
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.drop_column('price_1month')
        batch_op.drop_column('price_3months')
        batch_op.drop_column('price_6months')
        batch_op.drop_column('price_12months')
