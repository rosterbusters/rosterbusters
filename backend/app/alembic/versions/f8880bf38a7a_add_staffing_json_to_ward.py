"""add staffing_json to ward

Revision ID: f8880bf38a7a
Revises: 25d7001141de
Create Date: 2026-03-05 16:30:38.324497

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = 'f8880bf38a7a'
down_revision = '25d7001141de'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    ward_columns = {column["name"] for column in insp.get_columns("ward")}
    if 'staffing_json' not in ward_columns:
        op.add_column('ward', sa.Column('staffing_json', sa.Text(), nullable=True))


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    ward_columns = {column["name"] for column in insp.get_columns("ward")}
    if 'staffing_json' in ward_columns:
        op.drop_column('ward', 'staffing_json')
