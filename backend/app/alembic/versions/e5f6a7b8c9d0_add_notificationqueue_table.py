"""add notificationqueue table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-02

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    import sqlalchemy as _sa
    conn = op.get_bind()
    if _sa.inspect(conn).has_table('notificationqueue'):
        return
    op.create_table(
        'notificationqueue',
        sa.Column('notificationid', sa.Integer(), nullable=False),
        sa.Column('recipienttype', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('recipientid', sa.Integer(), nullable=False),
        sa.Column('notificationtype', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('channel', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('priority', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('subject', sqlmodel.sql.sqltypes.AutoString(length=200), nullable=True),
        sa.Column('messagebody', sa.Text(), nullable=False),
        sa.Column('relatedentitytype', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('relatedentityid', sa.Integer(), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('scheduledat', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sentat', sa.DateTime(timezone=True), nullable=True),
        sa.Column('readat', sa.DateTime(timezone=True), nullable=True),
        sa.Column('failurereason', sa.Text(), nullable=True),
        sa.Column('retrycount', sa.Integer(), nullable=False),
        sa.Column('createdat', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('notificationid'),
    )


def downgrade():
    op.drop_table('notificationqueue')
