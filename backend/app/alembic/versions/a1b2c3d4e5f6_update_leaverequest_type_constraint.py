"""update_leaverequest_type_constraint

Revision ID: a1b2c3d4e5f6
Revises: 33ed5b3c81d0
Create Date: 2026-02-01

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '33ed5b3c81d0'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the old constraint
    op.drop_constraint('chk_leavereq_type', 'leaverequest', type_='check')

    # Add new constraint with expanded leave types
    op.create_check_constraint(
        'chk_leavereq_type',
        'leaverequest',
        "leavetype IN ('AL', 'MC', 'URG', 'UPL', 'CL', 'CCL', 'FCL', 'BDL', 'ML', 'EML', 'Mar', 'SPL')"
    )


def downgrade():
    # Drop the new constraint
    op.drop_constraint('chk_leavereq_type', 'leaverequest', type_='check')

    # Restore original constraint
    op.create_check_constraint(
        'chk_leavereq_type',
        'leaverequest',
        "leavetype IN ('AL', 'MC', 'URG', 'UPL', 'CL')"
    )
