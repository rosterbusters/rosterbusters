"""Add email_verified column to RBAC User table

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-05-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "t2u3v4w5x6y7"
down_revision: Union[str, None] = "s1t2u3v4w5x6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [c["name"] for c in insp.get_columns("User")]

    if "emailverified" not in columns:
        op.add_column(
            "User",
            sa.Column(
                "emailverified",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
        )

    op.execute(
        sa.text(
            """
            UPDATE "User"
            SET emailverified = true
            WHERE email IS NOT NULL
              AND COALESCE(mustchangepassword, false) = false
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [c["name"] for c in insp.get_columns("User")]

    if "emailverified" in columns:
        op.drop_column("User", "emailverified")
