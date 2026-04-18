"""add master_id to loyalty discounts

Revision ID: 20260121_add_master_id_to_loyalty_discounts
Revises: 20260119_add_snapshot_credit_and_apply_fields
Create Date: 2026-01-21

Используется batch_alter_table для SQLite (ALTER CONSTRAINT не поддерживается).
Data migration не выполняется: master_id остаётся NULL для legacy-записей.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260121_add_master_id_to_loyalty_discounts"
down_revision = "20260119_add_snapshot_credit_and_apply_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # loyalty_discounts: master_id, salon_id nullable, индекс, FK (CASCADE)
    with op.batch_alter_table("loyalty_discounts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("master_id", sa.Integer(), nullable=True))
        batch_op.alter_column(
            "salon_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
        batch_op.create_index("idx_loyalty_discount_master", ["master_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_loyalty_discount_master",
            "masters",
            ["master_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # personal_discounts: то же
    with op.batch_alter_table("personal_discounts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("master_id", sa.Integer(), nullable=True))
        batch_op.alter_column(
            "salon_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
        batch_op.create_index("idx_personal_discount_master", ["master_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_personal_discount_master",
            "masters",
            ["master_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("personal_discounts", schema=None) as batch_op:
        batch_op.drop_constraint("fk_personal_discount_master", type_="foreignkey")
        batch_op.drop_index("idx_personal_discount_master")
        batch_op.drop_column("master_id")
        batch_op.alter_column(
            "salon_id",
            existing_type=sa.Integer(),
            nullable=False,
        )

    with op.batch_alter_table("loyalty_discounts", schema=None) as batch_op:
        batch_op.drop_constraint("fk_loyalty_discount_master", type_="foreignkey")
        batch_op.drop_index("idx_loyalty_discount_master")
        batch_op.drop_column("master_id")
        batch_op.alter_column(
            "salon_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
