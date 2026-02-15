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


def upgrade():
    op.add_column('ward', sa.Column('am_total', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('am_rn', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('am_en_na_min', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('am_en_na_max', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('am_hca_min', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('am_hca_max', sa.Integer(), nullable=True))

    op.add_column('ward', sa.Column('pm_total', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('pm_rn', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('pm_en_na_min', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('pm_en_na_max', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('pm_hca_min', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('pm_hca_max', sa.Integer(), nullable=True))

    op.add_column('ward', sa.Column('nd_total', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('nd_rn', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('nd_en_na_min', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('nd_en_na_max', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('nd_hca_min', sa.Integer(), nullable=True))
    op.add_column('ward', sa.Column('nd_hca_max', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('ward', 'nd_hca_max')
    op.drop_column('ward', 'nd_hca_min')
    op.drop_column('ward', 'nd_en_na_max')
    op.drop_column('ward', 'nd_en_na_min')
    op.drop_column('ward', 'nd_rn')
    op.drop_column('ward', 'nd_total')

    op.drop_column('ward', 'pm_hca_max')
    op.drop_column('ward', 'pm_hca_min')
    op.drop_column('ward', 'pm_en_na_max')
    op.drop_column('ward', 'pm_en_na_min')
    op.drop_column('ward', 'pm_rn')
    op.drop_column('ward', 'pm_total')

    op.drop_column('ward', 'am_hca_max')
    op.drop_column('ward', 'am_hca_min')
    op.drop_column('ward', 'am_en_na_max')
    op.drop_column('ward', 'am_en_na_min')
    op.drop_column('ward', 'am_rn')
    op.drop_column('ward', 'am_total')
