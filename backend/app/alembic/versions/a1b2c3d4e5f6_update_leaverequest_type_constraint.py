"""update_leaverequest_type_constraint

Revision ID: a1b2c3d4e5f6
Revises: 33ed5b3c81d0
Create Date: 2026-02-01

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '33ed5b3c81d0'
branch_labels = None
depends_on = None

NEW_VALUES = "leavetype IN ('AL', 'MC', 'URG', 'UPL', 'CL', 'CCL', 'FCL', 'BDL', 'ML', 'EML', 'Mar', 'SPL')"
OLD_VALUES = "leavetype IN ('AL', 'MC', 'URG', 'UPL', 'CL')"


def _constraint_contains(table, constraint_name, substring):
    """Check if a constraint's definition contains a substring."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT pg_get_constraintdef(c.oid) "
            "FROM pg_constraint c "
            "JOIN pg_class t ON c.conrelid = t.oid "
            "WHERE t.relname = :table AND c.conname = :name"
        ),
        {"table": table, "name": constraint_name},
    )
    row = result.scalar()
    if row is None:
        return False
    return substring in row


def upgrade():
    # Only update if the constraint still has the old values
    if not _constraint_contains('leaverequest', 'chk_leavereq_type', 'CCL'):
        op.drop_constraint('chk_leavereq_type', 'leaverequest', type_='check')
        op.create_check_constraint(
            'chk_leavereq_type',
            'leaverequest',
            NEW_VALUES,
        )


def downgrade():
    op.drop_constraint('chk_leavereq_type', 'leaverequest', type_='check')
    op.create_check_constraint(
        'chk_leavereq_type',
        'leaverequest',
        OLD_VALUES,
    )
