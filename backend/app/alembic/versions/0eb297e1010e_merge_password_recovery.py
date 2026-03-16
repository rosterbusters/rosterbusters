"""merge_password_recovery

Revision ID: 0eb297e1010e
Revises: a3f9d2e1b8c7, f8880bf38a7a
Create Date: 2026-03-16 10:38:24.939015

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '0eb297e1010e'
down_revision = ('a3f9d2e1b8c7', 'f8880bf38a7a')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
