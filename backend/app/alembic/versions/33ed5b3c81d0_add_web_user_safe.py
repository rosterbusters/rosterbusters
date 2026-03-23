"""add_web_user_safe

Revision ID: 33ed5b3c81d0
Revises: 
Create Date: 2025-12-12 03:49:44.717274

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '33ed5b3c81d0'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Create the web_user table
    if 'web_user' not in existing_tables:
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

    web_user_indexes = {index["name"] for index in insp.get_indexes('web_user')} if 'web_user' in set(inspect(bind).get_table_names()) else set()
    if op.f('ix_web_user_email') not in web_user_indexes:
        op.create_index(op.f('ix_web_user_email'), 'web_user', ['email'], unique=True)

    # 2. Create the item table
    if 'item' not in set(inspect(bind).get_table_names()):
        op.create_table('item',
            sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
            sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('owner_id', sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(['owner_id'], ['web_user.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'item' in existing_tables:
        op.drop_table('item')

    if 'web_user' in existing_tables:
        web_user_indexes = {index["name"] for index in insp.get_indexes('web_user')}
        if op.f('ix_web_user_email') in web_user_indexes:
            op.drop_index(op.f('ix_web_user_email'), table_name='web_user')
        op.drop_table('web_user')
