"""add wardhourtype column to ward

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-04-13

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "r8s9t0u1v2w3"
down_revision = "q7r8s9t0u1v2"
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
    if not _column_exists("ward", "wardhourtype"):
        op.add_column(
            "ward",
            sa.Column("wardhourtype", sa.String(length=20), nullable=False, server_default="8_HOURS"),
        )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'chk_ward_wardhourtype'
          ) THEN
            ALTER TABLE ward
            ADD CONSTRAINT chk_ward_wardhourtype
            CHECK (wardhourtype IN ('8_HOURS', '12_HOURS'));
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'chk_ward_wardhourtype'
          ) THEN
            ALTER TABLE ward DROP CONSTRAINT chk_ward_wardhourtype;
          END IF;
        END $$;
        """
    )
    if _column_exists("ward", "wardhourtype"):
        op.drop_column("ward", "wardhourtype")
