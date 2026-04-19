"""add_website_management_fields_to_salon_branches

Revision ID: 19b2bb2ced93
Revises: f1035797e640
Create Date: 2025-08-16 15:13:30.213160

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19b2bb2ced93'
down_revision: Union[str, None] = 'f1035797e640'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    sb = {c['name'] for c in insp.get_columns('salon_branches')}
    for name, col in (
        ('url_slug', sa.Column('url_slug', sa.String(), nullable=True)),
        ('yandex_map_embed', sa.Column('yandex_map_embed', sa.Text(), nullable=True)),
        ('background_color', sa.Column('background_color', sa.String(), nullable=True)),
        ('logo_path', sa.Column('logo_path', sa.String(), nullable=True)),
        ('use_salon_logo', sa.Column('use_salon_logo', sa.Boolean(), nullable=True)),
    ):
        if name not in sb:
            op.add_column('salon_branches', col)

    insp = sa.inspect(bind)
    salon_cols = {c['name'] for c in insp.get_columns('salons')}
    if 'background_color' in salon_cols:
        op.drop_column('salons', 'background_color')


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    salon_cols = {c['name'] for c in insp.get_columns('salons')}
    if 'background_color' not in salon_cols:
        op.add_column('salons', sa.Column('background_color', sa.TEXT(), server_default=sa.text("'#ffffff'"), nullable=True))

    sb = {c['name'] for c in insp.get_columns('salon_branches')}
    for name in ('use_salon_logo', 'logo_path', 'background_color', 'yandex_map_embed', 'url_slug'):
        if name in sb:
            op.drop_column('salon_branches', name)
