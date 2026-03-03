"""drop_web_user_and_item_tables

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2025-01-15 00:00:00.000000

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
    # Drop item first (has FK to web_user)
    op.drop_table('item')
    op.drop_index(op.f('ix_web_user_email'), table_name='web_user')
    op.drop_table('web_user')


def downgrade():
    # Recreate web_user
    op.create_table('web_user',
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_superuser', sa.Boolean(), nullable=False),
        sa.Column('full_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('hashed_password', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('nurseid', sa.Integer(), nullable=True),
        sa.Column('managerid', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_web_user_email'), 'web_user', ['email'], unique=True)

    # Recreate item
    op.create_table('item',
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['web_user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
