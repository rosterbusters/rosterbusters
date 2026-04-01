"""add_default_password_column

Revision ID: n1o2p3q4r5s6
Revises: m0n1o2p3q4r5
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "n1o2p3q4r5s6"
down_revision = "m0n1o2p3q4r5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "User",
        sa.Column("defaultpassword", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("User", "defaultpassword")
