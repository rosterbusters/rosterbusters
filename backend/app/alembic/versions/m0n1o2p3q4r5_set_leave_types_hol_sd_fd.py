"""set_leave_types_hol_sd_fd

Revision ID: m0n1o2p3q4r5
Revises: l7m8n9o0p1q2
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "m0n1o2p3q4r5"
down_revision = "l7m8n9o0p1q2"
branch_labels = None
depends_on = None

NEW_VALUES = (
    "leavetype IN ('HOL', 'SD', 'FD', 'AL', 'MC', 'CCL', 'ML', 'EML', "
    "'Mar', 'FCL', 'SPL', 'CL', 'BDL')"
)
OLD_VALUES = (
    "leavetype IN ('AL', 'MC', 'URG', 'UPL', 'CL', 'PH', 'HOL', "
    "'CCL', 'FCL', 'BDL', 'ML', 'EML', 'Mar', 'SPL')"
)


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
    # Only update if SD is not already allowed
    if not _constraint_contains("leaverequest", "chk_leavereq_type", "SD"):
        op.drop_constraint("chk_leavereq_type", "leaverequest", type_="check")
        op.create_check_constraint(
            "chk_leavereq_type",
            "leaverequest",
            NEW_VALUES,
        )


def downgrade():
    op.drop_constraint("chk_leavereq_type", "leaverequest", type_="check")
    op.create_check_constraint(
        "chk_leavereq_type",
        "leaverequest",
        OLD_VALUES,
    )
