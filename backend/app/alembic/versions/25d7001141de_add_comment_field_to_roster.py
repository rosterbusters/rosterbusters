"""Add comment field to roster

Revision ID: 25d7001141de
Revises: g2h3i4j5k6l7
Create Date: 2026-03-05 16:26:21.027923

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = '25d7001141de'
down_revision = 'g2h3i4j5k6l7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('roster', sa.Column('comment', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    op.drop_column('roster', 'comment')
