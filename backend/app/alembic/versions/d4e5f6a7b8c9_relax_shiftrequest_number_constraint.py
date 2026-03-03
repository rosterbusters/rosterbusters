"""relax_shiftrequest_number_constraint

Allows requestnumber to exceed 3 so that leave requests (which are
unlimited) can coexist with the 3 working-shift requests in the same
roster period without hitting the old BETWEEN 1 AND 3 check.

Revision ID: d4e5f6a7b8c9
Revises: 7a9b529f97da
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = '7a9b529f97da'
branch_labels = None
depends_on = None


def _constraint_exists(table: str, constraint_name: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_constraint c "
            "JOIN pg_class t ON c.conrelid = t.oid "
            "WHERE t.relname = :table AND c.conname = :name"
        ),
        {"table": table, "name": constraint_name},
    )
    return result.scalar() is not None


def upgrade():
    if _constraint_exists('shiftrequest', 'chk_shiftreq_request_number'):
        op.drop_constraint('chk_shiftreq_request_number', 'shiftrequest', type_='check')
    op.create_check_constraint(
        'chk_shiftreq_request_number',
        'shiftrequest',
        'requestnumber >= 1',
    )


def downgrade():
    op.drop_constraint('chk_shiftreq_request_number', 'shiftrequest', type_='check')
    op.create_check_constraint(
        'chk_shiftreq_request_number',
        'shiftrequest',
        'requestnumber BETWEEN 1 AND 3',
    )
