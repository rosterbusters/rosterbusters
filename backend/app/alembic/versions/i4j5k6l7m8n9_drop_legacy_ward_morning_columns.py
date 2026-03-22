"""drop legacy morning staffing columns from ward

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-03-22

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i4j5k6l7m8n9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.scalar() is not None


def upgrade() -> None:
    op.execute("DROP VIEW IF EXISTS wardstaffingstatus")
    columns = [
        "morning_rn_required",
        "morning_staffnurse_required",
        "morning_hca_required",
        "night_rn_required",
        "night_staffnurse_required",
        "night_hca_required",
    ]
    for col in columns:
        if _column_exists("ward", col):
            op.drop_column("ward", col)


def downgrade() -> None:
    columns = [
        "morning_rn_required",
        "morning_staffnurse_required",
        "morning_hca_required",
        "night_rn_required",
        "night_staffnurse_required",
        "night_hca_required",
    ]
    for col in columns:
        if not _column_exists("ward", col):
            op.add_column(
                "ward",
                sa.Column(col, sa.Integer(), nullable=True, server_default=sa.text("0")),
            )
