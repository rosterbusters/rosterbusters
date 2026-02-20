"""add ward staffing requirement columns

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-15

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def _column_exists(table, column):
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.scalar() is not None


def upgrade():
    columns = [
        'am_total', 'am_rn', 'am_en_na_min', 'am_en_na_max', 'am_hca_min', 'am_hca_max',
        'pm_total', 'pm_rn', 'pm_en_na_min', 'pm_en_na_max', 'pm_hca_min', 'pm_hca_max',
        'nd_total', 'nd_rn', 'nd_en_na_min', 'nd_en_na_max', 'nd_hca_min', 'nd_hca_max',
    ]
    for col in columns:
        if not _column_exists('ward', col):
            op.add_column('ward', sa.Column(col, sa.Integer(), nullable=True))


def downgrade():
    columns = [
        'nd_hca_max', 'nd_hca_min', 'nd_en_na_max', 'nd_en_na_min', 'nd_rn', 'nd_total',
        'pm_hca_max', 'pm_hca_min', 'pm_en_na_max', 'pm_en_na_min', 'pm_rn', 'pm_total',
        'am_hca_max', 'am_hca_min', 'am_en_na_max', 'am_en_na_min', 'am_rn', 'am_total',
    ]
    for col in columns:
        if _column_exists('ward', col):
            op.drop_column('ward', col)
