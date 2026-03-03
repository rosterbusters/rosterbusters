"""Add must_change_password column to User table

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [c["name"] for c in insp.get_columns("User")]

    if "mustchangepassword" not in columns:
        op.add_column(
            "User",
            sa.Column(
                "mustchangepassword",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
        )

    # Make email column nullable (optional for admin-created users)
    op.alter_column(
        "User",
        "email",
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "User",
        "email",
        existing_type=sa.String(),
        nullable=False,
    )
    op.drop_column("User", "mustchangepassword")
