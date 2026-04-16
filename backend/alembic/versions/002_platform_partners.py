"""platform_partners

Add multi-platform user support (platform, wechat_openid columns on users,
telegram_id becomes nullable) and B2B partners table with FK on locations
and orders.

Revision ID: a1b2c3d4e5f6
Revises: e5942734c15b
Create Date: 2026-04-09 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e5942734c15b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- partners table ---
    op.create_table(
        "partners",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("legal_name", sa.String(length=200), nullable=True),
        sa.Column("bin", sa.String(length=20), nullable=True),
        sa.Column("contact_phone", sa.String(length=20), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- users: make telegram_id nullable, add platform + wechat_openid ---
    op.alter_column("users", "telegram_id", existing_type=sa.BigInteger(), nullable=True)
    op.add_column("users", sa.Column("platform", sa.String(length=20), server_default="telegram", nullable=False))
    op.add_column("users", sa.Column("wechat_openid", sa.String(length=100), nullable=True))
    op.create_unique_constraint("uq_users_wechat_openid", "users", ["wechat_openid"])

    # --- locations: partner_id FK ---
    op.add_column("locations", sa.Column("partner_id", sa.Integer(), nullable=True))
    op.create_index("ix_locations_partner_id", "locations", ["partner_id"])
    op.create_foreign_key(
        "fk_locations_partner_id",
        "locations",
        "partners",
        ["partner_id"],
        ["id"],
    )

    # --- orders: partner_id FK ---
    op.add_column("orders", sa.Column("partner_id", sa.Integer(), nullable=True))
    op.create_index("ix_orders_partner_id", "orders", ["partner_id"])
    op.create_foreign_key(
        "fk_orders_partner_id",
        "orders",
        "partners",
        ["partner_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_orders_partner_id", "orders", type_="foreignkey")
    op.drop_index("ix_orders_partner_id", table_name="orders")
    op.drop_column("orders", "partner_id")

    op.drop_constraint("fk_locations_partner_id", "locations", type_="foreignkey")
    op.drop_index("ix_locations_partner_id", table_name="locations")
    op.drop_column("locations", "partner_id")

    op.drop_constraint("uq_users_wechat_openid", "users", type_="unique")
    op.drop_column("users", "wechat_openid")
    op.drop_column("users", "platform")
    op.alter_column("users", "telegram_id", existing_type=sa.BigInteger(), nullable=False)

    op.drop_table("partners")
