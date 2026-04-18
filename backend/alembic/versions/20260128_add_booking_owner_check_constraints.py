"""add booking owner check constraints

A) exactly one owner: (master_id IS NULL) != (indie_master_id IS NULL)
B) if indie => salon_id/branch_id NULL
C) if salon => salon_id NOT NULL

SQLite: ADD CONSTRAINT not supported on existing table; runtime validation in booking_factory.
PostgreSQL: constraints added.
"""
from alembic import op


revision = "20260128_booking_owner_ck"
down_revision = "20260128_master_client_meta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        op.execute("""
            ALTER TABLE bookings ADD CONSTRAINT chk_booking_one_owner
            CHECK ((master_id IS NULL) <> (indie_master_id IS NULL))
        """)
        op.execute("""
            ALTER TABLE bookings ADD CONSTRAINT chk_booking_indie_no_salon
            CHECK (indie_master_id IS NULL OR (salon_id IS NULL AND branch_id IS NULL))
        """)
        op.execute("""
            ALTER TABLE bookings ADD CONSTRAINT chk_booking_salon_has_salon_id
            CHECK (master_id IS NULL OR salon_id IS NOT NULL)
        """)
    # SQLite: rely on runtime validation in utils/booking_factory.validate_booking_invariants


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_one_owner")
        op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_indie_no_salon")
        op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_salon_has_salon_id")
