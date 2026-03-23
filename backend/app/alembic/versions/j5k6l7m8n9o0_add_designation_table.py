"""add designation table

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "designation" not in insp.get_table_names():
        designation_table = op.create_table(
            "designation",
            sa.Column("designation", sa.String(length=50), nullable=False),
            sa.Column("rank", sa.String(length=1), nullable=False),
            sa.PrimaryKeyConstraint("designation"),
        )
    else:
        designation_table = sa.table(
            "designation",
            sa.column("designation", sa.String(length=50)),
            sa.column("rank", sa.String(length=1)),
        )

    existing_rows = bind.execute(sa.text("SELECT designation FROM designation")).fetchall()
    existing_designations = {row[0] for row in existing_rows}
    rows = [
        {"designation": "SN", "rank": "A"},
        {"designation": "SSN", "rank": "A"},
        {"designation": "HCA1", "rank": "B"},
        {"designation": "HCA2", "rank": "B"},
        {"designation": "SEN", "rank": "B"},
        {"designation": "EN", "rank": "B"},
        {"designation": "NA", "rank": "B"},
        {"designation": "HCA3", "rank": "C"},
        {"designation": "PSA", "rank": "C"},
    ]
    missing_rows = [
        row for row in rows if row["designation"] not in existing_designations
    ]
    if missing_rows:
        op.bulk_insert(designation_table, missing_rows)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "designation" in insp.get_table_names():
        op.drop_table("designation")
