"""add notificationpreference table

Revision ID: s1t2u3v4w5x6
Revises: s9t0u1v2w3x4
Create Date: 2026-04-15

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "s1t2u3v4w5x6"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(table)


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns(table)}
    return column in cols


def _constraint_exists(constraint_name: str, table: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name = :name AND table_name = :table"
        ),
        {"name": constraint_name, "table": table},
    )
    return result.scalar() is not None


def upgrade() -> None:
    # If the table exists with the old schema (has 'nurseid' instead of
    # 'recipienttype'/'recipientid'), drop it so we can recreate with the
    # new schema. Old data is discarded (there is no meaningful data to keep
    # since the column semantics changed entirely).
    if _table_exists("notificationpreference"):
        if _column_exists("notificationpreference", "nurseid"):
            # Old legacy schema — drop and recreate below
            op.drop_table("notificationpreference")
        else:
            # Already on the new schema — nothing to do
            return

    op.create_table(
        "notificationpreference",
        sa.Column("preferenceid", sa.Integer(), nullable=False),
        sa.Column("recipienttype", sa.String(length=20), nullable=False),
        sa.Column("recipientid", sa.Integer(), nullable=False),
        sa.Column("notificationtype", sa.String(length=50), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "updatedat",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("preferenceid"),
    )

    # Unique constraint to allow safe upserts
    if not _constraint_exists("uq_notifpref_recipient_type", "notificationpreference"):
        op.create_unique_constraint(
            "uq_notifpref_recipient_type",
            "notificationpreference",
            ["recipienttype", "recipientid", "notificationtype"],
        )


def downgrade() -> None:
    op.drop_table("notificationpreference")
