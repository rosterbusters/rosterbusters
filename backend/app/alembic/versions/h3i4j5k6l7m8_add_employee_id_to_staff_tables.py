"""Add employeeid to nurse and nursemanager tables

Revision ID: h3i4j5k6l7m8
Revises: f8880bf38a7a
Create Date: 2026-03-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "h3i4j5k6l7m8"
down_revision: Union[str, None] = "f8880bf38a7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    nurse_columns = {column["name"] for column in insp.get_columns("nurse")}
    manager_columns = {column["name"] for column in insp.get_columns("nursemanager")}

    if "employeeid" not in nurse_columns:
        op.add_column("nurse", sa.Column("employeeid", sa.String(length=100), nullable=True))

    if "employeeid" not in manager_columns:
        op.add_column(
            "nursemanager",
            sa.Column("employeeid", sa.String(length=100), nullable=True),
        )

    nurse_indexes = {index["name"] for index in insp.get_indexes("nurse")}
    manager_indexes = {index["name"] for index in insp.get_indexes("nursemanager")}

    if "ix_nurse_employeeid" not in nurse_indexes:
        op.create_index("ix_nurse_employeeid", "nurse", ["employeeid"], unique=True)

    if "ix_nursemanager_employeeid" not in manager_indexes:
        op.create_index(
            "ix_nursemanager_employeeid",
            "nursemanager",
            ["employeeid"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("ix_nursemanager_employeeid", table_name="nursemanager")
    op.drop_index("ix_nurse_employeeid", table_name="nurse")
    op.drop_column("nursemanager", "employeeid")
    op.drop_column("nurse", "employeeid")
