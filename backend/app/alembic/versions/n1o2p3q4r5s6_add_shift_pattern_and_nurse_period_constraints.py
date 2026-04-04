"""add shift pattern and nurse period constraints

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-04-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    nurse_columns = {column["name"] for column in insp.get_columns("nurse")}
    if "shiftpattern" not in nurse_columns:
        op.add_column("nurse", sa.Column("shiftpattern", sa.String(length=20), nullable=True))

    tables = set(insp.get_table_names())
    if "nurseperiodconstraint" not in tables:
        op.create_table(
            "nurseperiodconstraint",
            sa.Column("constraintid", sa.Integer(), nullable=False),
            sa.Column("nurseid", sa.Integer(), nullable=False),
            sa.Column("periodid", sa.Integer(), nullable=False),
            sa.Column("constrainttype", sa.String(length=30), nullable=False),
            sa.Column("value", sa.String(length=50), nullable=False, server_default="true"),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("createdat", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["nurseid"], ["nurse.nurseid"]),
            sa.ForeignKeyConstraint(["periodid"], ["rosterperiod.periodid"]),
            sa.PrimaryKeyConstraint("constraintid"),
        )
        op.create_index(
            "ix_nurseperiodconstraint_nurse_period_type",
            "nurseperiodconstraint",
            ["nurseid", "periodid", "constrainttype"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    tables = set(insp.get_table_names())

    if "nurseperiodconstraint" in tables:
        indexes = {index["name"] for index in insp.get_indexes("nurseperiodconstraint")}
        if "ix_nurseperiodconstraint_nurse_period_type" in indexes:
            op.drop_index("ix_nurseperiodconstraint_nurse_period_type", table_name="nurseperiodconstraint")
        op.drop_table("nurseperiodconstraint")

    nurse_columns = {column["name"] for column in insp.get_columns("nurse")}
    if "shiftpattern" in nurse_columns:
        op.drop_column("nurse", "shiftpattern")
