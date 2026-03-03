"""Add rosterchangelog table

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-03-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "g2h3i4j5k6l7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "rosterchangelog" in insp.get_table_names():
        return  # table already exists (created via raw SQL)

    op.create_table(
        "rosterchangelog",
        sa.Column("changeid", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("rosterid", sa.Integer(), nullable=True),
        sa.Column("changedbymanagerid", sa.Integer(), nullable=True),
        sa.Column("changedat", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("changetype", sa.String(20), nullable=False),
        # Before values
        sa.Column("oldnurseid", sa.Integer(), nullable=True),
        sa.Column("oldshiftcode", sa.String(10), nullable=True),
        sa.Column("oldstarttime", sa.Time(), nullable=True),
        sa.Column("oldendtime", sa.Time(), nullable=True),
        sa.Column("oldstatus", sa.String(20), nullable=True),
        # After values
        sa.Column("newnurseid", sa.Integer(), nullable=True),
        sa.Column("newshiftcode", sa.String(10), nullable=True),
        sa.Column("newstarttime", sa.Time(), nullable=True),
        sa.Column("newendtime", sa.Time(), nullable=True),
        sa.Column("newstatus", sa.String(20), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changesource", sa.String(20), nullable=False, server_default="Manual"),
        sa.Column("notificationtriggered", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("isreplacementchange", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("replacementreason", sa.String(20), nullable=True),
        sa.Column("replacednurseid", sa.Integer(), nullable=True),
        sa.Column("replacementnurseid", sa.Integer(), nullable=True),
        sa.Column("isexternalreplacement", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["rosterid"], ["roster.rosterid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changedbymanagerid"], ["nursemanager.managerid"],
                                ondelete="SET NULL"),
    )
    op.create_index("idx_changelog_roster", "rosterchangelog", ["rosterid"])
    op.create_index("idx_changelog_timestamp", "rosterchangelog", ["changedat"])
    op.create_index("idx_changelog_type", "rosterchangelog", ["changetype"])


def downgrade() -> None:
    op.drop_index("idx_changelog_type", table_name="rosterchangelog")
    op.drop_index("idx_changelog_timestamp", table_name="rosterchangelog")
    op.drop_index("idx_changelog_roster", table_name="rosterchangelog")
    op.drop_table("rosterchangelog")
