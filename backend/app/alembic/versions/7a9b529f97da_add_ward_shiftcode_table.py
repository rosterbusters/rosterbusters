"""add ward_shiftcode table

Revision ID: 7a9b529f97da
Revises: b2c3d4e5f6g7
Create Date: 2026-02-19 09:37:45.382374

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = '7a9b529f97da'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ward_shiftcode',
        sa.Column('wardid', sa.Integer(), nullable=False),
        sa.Column('shiftcode', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
        sa.ForeignKeyConstraint(['shiftcode'], ['shiftcode.shiftcode']),
        sa.ForeignKeyConstraint(['wardid'], ['ward.wardid']),
        sa.PrimaryKeyConstraint('wardid', 'shiftcode'),
    )


def downgrade():
    op.drop_table('ward_shiftcode')
