"""add promo engine foundation

Revision ID: 20260620_add_promo_engine_foundation
Revises: 20260515_readd_salon_addr
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20260620_add_promo_engine_foundation"
down_revision = "20260515_readd_salon_addr"
branch_labels = None
depends_on = None


promo_category = sa.Enum(
    "ACQUISITION",
    "RETENTION",
    "UPGRADE",
    "WINBACK",
    "COMPENSATION",
    "OTHER",
    name="promocategory",
)
promo_campaign_type = sa.Enum(
    "MASTER_REFERRAL",
    "ADMIN_CAMPAIGN",
    "PARTNER_CAMPAIGN",
    "MANUAL",
    name="promocampaigntype",
)
promo_campaign_status = sa.Enum("ACTIVE", "PAUSED", "ARCHIVED", name="promocampaignstatus")
promo_code_status = sa.Enum("ACTIVE", "DISABLED", name="promocodestatus")
promo_redemption_status = sa.Enum(
    "PENDING_FIRST_PAYMENT",
    "REDEEMED",
    "CANCELLED",
    "EXPIRED",
    name="promoredemptionstatus",
)
promo_reward_type = sa.Enum(
    "SUBSCRIPTION_POINTS",
    "DISCOUNT_PERCENT",
    "DISCOUNT_AMOUNT",
    "BONUS_TIME",
    name="promorewardtype",
)
promo_referrer_type = sa.Enum(
    "MASTER",
    "ADMIN_CAMPAIGN",
    "PARTNER",
    "SYSTEM",
    "MANUAL",
    name="promoreferrertype",
)
promo_reward_recipient_role = sa.Enum("BENEFICIARY", "REFERRER", name="promorewardrecipientrole")
promo_reward_grant_status = sa.Enum("PENDING", "APPLIED", "CANCELLED", "FAILED", name="promorewardgrantstatus")
subscription_points_direction = sa.Enum("CREDIT", "DEBIT", "REVERSAL", name="subscriptionpointsdirection")
subscription_points_status = sa.Enum("ACTIVE", "CONSUMED", "EXPIRED", "CANCELLED", name="subscriptionpointsstatus")
subscription_points_source_type = sa.Enum(
    "PROMO_REWARD_GRANT",
    "MANUAL_ADJUSTMENT",
    "SUBSCRIPTION_PAYMENT",
    "FUTURE_SOURCE",
    name="subscriptionpointssourcetype",
)
subscription_type = sa.Enum("SALON", "MASTER", name="subscriptiontype")


def upgrade() -> None:
    bind = op.get_bind()
    existing_tables = set(sa.inspect(bind).get_table_names())

    if "promo_campaigns" not in existing_tables:
        op.create_table(
            "promo_campaigns",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("promo_category", promo_category, nullable=False),
            sa.Column("type", promo_campaign_type, nullable=False),
            sa.Column("status", promo_campaign_status, nullable=False),
            sa.Column("owner_master_id", sa.Integer(), sa.ForeignKey("masters.id"), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("starts_at", sa.DateTime(), nullable=True),
            sa.Column("ends_at", sa.DateTime(), nullable=True),
            sa.Column("max_total_redemptions", sa.Integer(), nullable=True),
            sa.Column("max_redemptions_per_user", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("eligible_subscription_type", subscription_type, nullable=False),
            sa.Column("eligible_plan_ids", sa.JSON(), nullable=True),
            sa.Column("eligible_period_months", sa.JSON(), nullable=True),
            sa.Column("first_payment_only", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("beneficiary_reward_type", promo_reward_type, nullable=False),
            sa.Column("beneficiary_reward_config", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("referrer_reward_type", promo_reward_type, nullable=True),
            sa.Column("referrer_reward_config", sa.JSON(), nullable=True),
            sa.Column("referrer_type", promo_referrer_type, nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_promo_campaigns_category", "promo_campaigns", ["promo_category"])
        op.create_index("idx_promo_campaigns_type", "promo_campaigns", ["type"])
        op.create_index("idx_promo_campaigns_status", "promo_campaigns", ["status"])
        op.create_index("idx_promo_campaigns_owner_master", "promo_campaigns", ["owner_master_id"])

    if "promo_engine_codes" not in existing_tables:
        op.create_table(
            "promo_engine_codes",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("promo_campaigns.id"), nullable=False),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("status", promo_code_status, nullable=False),
            sa.Column("max_redemptions", sa.Integer(), nullable=True),
            sa.Column("current_redemptions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("assigned_to_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("code", name="uq_promo_engine_codes_code"),
        )
        op.create_index("idx_promo_engine_codes_code", "promo_engine_codes", ["code"])
        op.create_index("idx_promo_engine_codes_campaign", "promo_engine_codes", ["campaign_id"])
        op.create_index("idx_promo_engine_codes_status", "promo_engine_codes", ["status"])

    if "promo_redemptions" not in existing_tables:
        op.create_table(
            "promo_redemptions",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("promo_campaigns.id"), nullable=False),
            sa.Column("code_id", sa.Integer(), sa.ForeignKey("promo_engine_codes.id"), nullable=False),
            sa.Column("redeemer_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("redeemer_master_id", sa.Integer(), sa.ForeignKey("masters.id"), nullable=False),
            sa.Column("promo_category_snapshot", promo_category, nullable=False),
            sa.Column("campaign_type_snapshot", promo_campaign_type, nullable=False),
            sa.Column("referrer_type_snapshot", promo_referrer_type, nullable=True),
            sa.Column("referrer_master_id", sa.Integer(), sa.ForeignKey("masters.id"), nullable=True),
            sa.Column("referrer_campaign_id", sa.Integer(), sa.ForeignKey("promo_campaigns.id"), nullable=True),
            sa.Column("status", promo_redemption_status, nullable=False),
            sa.Column("first_payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=True),
            sa.Column("first_payment_amount", sa.Float(), nullable=True),
            sa.Column("first_payment_period_months", sa.Integer(), nullable=True),
            sa.Column("applied_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("redeemed_at", sa.DateTime(), nullable=True),
            sa.Column("beneficiary_reward_type_snapshot", promo_reward_type, nullable=False),
            sa.Column("beneficiary_reward_value_snapshot", sa.JSON(), nullable=True),
            sa.Column("referrer_reward_type_snapshot", promo_reward_type, nullable=True),
            sa.Column("referrer_reward_value_snapshot", sa.JSON(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
        )
        op.create_index("idx_promo_redemptions_redeemer_master", "promo_redemptions", ["redeemer_master_id"])
        op.create_index("idx_promo_redemptions_status", "promo_redemptions", ["status"])
        op.create_index("idx_promo_redemptions_code", "promo_redemptions", ["code_id"])
        op.create_index("idx_promo_redemptions_campaign", "promo_redemptions", ["campaign_id"])
        op.create_index(
            "idx_promo_redemptions_category_status",
            "promo_redemptions",
            ["promo_category_snapshot", "status"],
        )

    if "subscription_points_ledger" not in existing_tables:
        op.create_table(
            "subscription_points_ledger",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("master_id", sa.Integer(), sa.ForeignKey("masters.id"), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column("remaining_amount", sa.Integer(), nullable=False),
            sa.Column("direction", subscription_points_direction, nullable=False),
            sa.Column("source_type", subscription_points_source_type, nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("status", subscription_points_status, nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
        )
        op.create_index("idx_subscription_points_master", "subscription_points_ledger", ["master_id"])
        op.create_index("idx_subscription_points_source", "subscription_points_ledger", ["source_type", "source_id"])
        op.create_index("idx_subscription_points_status", "subscription_points_ledger", ["status"])

    if "promo_reward_grants" not in existing_tables:
        op.create_table(
            "promo_reward_grants",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("redemption_id", sa.Integer(), sa.ForeignKey("promo_redemptions.id"), nullable=False),
            sa.Column("recipient_master_id", sa.Integer(), sa.ForeignKey("masters.id"), nullable=False),
            sa.Column("recipient_role", promo_reward_recipient_role, nullable=False),
            sa.Column("reward_type", promo_reward_type, nullable=False),
            sa.Column("reward_percent", sa.Float(), nullable=True),
            sa.Column("base_amount", sa.Float(), nullable=True),
            sa.Column("points_amount", sa.Integer(), nullable=True),
            sa.Column("status", promo_reward_grant_status, nullable=False),
            sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=True),
            sa.Column("subscription_points_ledger_id", sa.Integer(), sa.ForeignKey("subscription_points_ledger.id"), nullable=True),
            sa.Column("applied_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("source_label", sa.String(length=255), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.UniqueConstraint("redemption_id", "recipient_role", name="uq_promo_reward_grants_redemption_role"),
        )
        op.create_index("idx_promo_reward_grants_recipient_master", "promo_reward_grants", ["recipient_master_id"])
        op.create_index("idx_promo_reward_grants_payment", "promo_reward_grants", ["payment_id"])
        op.create_index("idx_promo_reward_grants_status", "promo_reward_grants", ["status"])

    if bind.dialect.name != "sqlite":
        op.alter_column("promo_campaigns", "max_redemptions_per_user", server_default=None)
        op.alter_column("promo_campaigns", "first_payment_only", server_default=None)
        op.alter_column("promo_campaigns", "beneficiary_reward_config", server_default=None)
        op.alter_column("promo_engine_codes", "current_redemptions", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    existing_tables = set(sa.inspect(bind).get_table_names())

    if "promo_reward_grants" in existing_tables:
        op.drop_index("idx_promo_reward_grants_status", table_name="promo_reward_grants")
        op.drop_index("idx_promo_reward_grants_payment", table_name="promo_reward_grants")
        op.drop_index("idx_promo_reward_grants_recipient_master", table_name="promo_reward_grants")
        op.drop_table("promo_reward_grants")
    if "subscription_points_ledger" in existing_tables:
        op.drop_index("idx_subscription_points_status", table_name="subscription_points_ledger")
        op.drop_index("idx_subscription_points_source", table_name="subscription_points_ledger")
        op.drop_index("idx_subscription_points_master", table_name="subscription_points_ledger")
        op.drop_table("subscription_points_ledger")
    if "promo_redemptions" in existing_tables:
        op.drop_index("idx_promo_redemptions_category_status", table_name="promo_redemptions")
        op.drop_index("idx_promo_redemptions_campaign", table_name="promo_redemptions")
        op.drop_index("idx_promo_redemptions_code", table_name="promo_redemptions")
        op.drop_index("idx_promo_redemptions_status", table_name="promo_redemptions")
        op.drop_index("idx_promo_redemptions_redeemer_master", table_name="promo_redemptions")
        op.drop_table("promo_redemptions")
    if "promo_engine_codes" in existing_tables:
        op.drop_index("idx_promo_engine_codes_status", table_name="promo_engine_codes")
        op.drop_index("idx_promo_engine_codes_campaign", table_name="promo_engine_codes")
        op.drop_index("idx_promo_engine_codes_code", table_name="promo_engine_codes")
        op.drop_table("promo_engine_codes")
    if "promo_campaigns" in existing_tables:
        op.drop_index("idx_promo_campaigns_owner_master", table_name="promo_campaigns")
        op.drop_index("idx_promo_campaigns_status", table_name="promo_campaigns")
        op.drop_index("idx_promo_campaigns_type", table_name="promo_campaigns")
        op.drop_index("idx_promo_campaigns_category", table_name="promo_campaigns")
        op.drop_table("promo_campaigns")

    for enum_type in (
        subscription_points_source_type,
        subscription_points_status,
        subscription_points_direction,
        promo_reward_grant_status,
        promo_reward_recipient_role,
        promo_referrer_type,
        promo_reward_type,
        promo_redemption_status,
        promo_code_status,
        promo_campaign_status,
        promo_campaign_type,
        promo_category,
    ):
        enum_type.drop(bind, checkfirst=True)
