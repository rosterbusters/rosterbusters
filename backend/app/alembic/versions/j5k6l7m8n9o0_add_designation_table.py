"""add designation table

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    designation_table = op.create_table(
        "designation",
        sa.Column("designation", sa.String(length=50), nullable=False),
        sa.Column("rank", sa.String(length=1), nullable=False),
        sa.PrimaryKeyConstraint("designation"),
    )

    op.bulk_insert(
        designation_table,
        [
            {"designation": "SN", "rank": "A"},
            {"designation": "SSN", "rank": "A"},
            {"designation": "HCA1", "rank": "B"},
            {"designation": "HCA2", "rank": "B"},
            {"designation": "SEN", "rank": "B"},
            {"designation": "EN", "rank": "B"},
            {"designation": "NA", "rank": "B"},
            {"designation": "HCA3", "rank": "C"},
            {"designation": "PSA", "rank": "C"},
        ],
    )


def downgrade() -> None:
    op.drop_table("designation")
