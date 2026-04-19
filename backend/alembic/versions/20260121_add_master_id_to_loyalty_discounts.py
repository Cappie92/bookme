"""add master_id to loyalty discounts

Revision ID: 20260121_add_master_id_to_loyalty_discounts
Revises: 20260119_add_snapshot_credit_and_apply_fields
Create Date: 2026-01-21

На SQLite: ADD COLUMN + индекс; FK через batch даёт CircularDependency — опускаем.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260121_add_master_id_to_loyalty_discounts"
down_revision = "20260119_add_snapshot_credit_and_apply_fields"
branch_labels = None
depends_on = None


def _idx_names(bind, table: str) -> set:
    return {ix["name"] for ix in sa.inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    for table, idx_name, fk_name in (
        ("loyalty_discounts", "idx_loyalty_discount_master", "fk_loyalty_discount_master"),
        ("personal_discounts", "idx_personal_discount_master", "fk_personal_discount_master"),
    ):
        insp = sa.inspect(bind)
        cols = {c["name"] for c in insp.get_columns(table)}
        if "master_id" not in cols:
            op.add_column(table, sa.Column("master_id", sa.Integer(), nullable=True))

        bind = op.get_bind()
        if idx_name not in _idx_names(bind, table):
            op.create_index(idx_name, table, ["master_id"], unique=False)

        if not is_sqlite:
            op.create_foreign_key(
                fk_name,
                table,
                "masters",
                ["master_id"],
                ["id"],
                ondelete="CASCADE",
            )

        bind = op.get_bind()
        insp = sa.inspect(bind)
        salon = next(c for c in insp.get_columns(table) if c["name"] == "salon_id")
        if not is_sqlite:
            op.alter_column(
                table,
                "salon_id",
                existing_type=sa.Integer(),
                nullable=True,
            )
        elif salon.get("nullable") is False:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    for table, idx_name, fk_name in (
        ("personal_discounts", "idx_personal_discount_master", "fk_personal_discount_master"),
        ("loyalty_discounts", "idx_loyalty_discount_master", "fk_loyalty_discount_master"),
    ):
        if not is_sqlite:
            op.drop_constraint(fk_name, table, type_="foreignkey")

        bind = op.get_bind()
        if idx_name in _idx_names(bind, table):
            op.drop_index(idx_name, table_name=table)

        bind = op.get_bind()
        cols = {c["name"] for c in sa.inspect(bind).get_columns(table)}
        if "master_id" in cols:
            op.drop_column(table, "master_id")

        if not is_sqlite:
            op.alter_column(
                table,
                "salon_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
