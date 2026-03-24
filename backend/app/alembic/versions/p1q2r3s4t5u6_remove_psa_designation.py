"""remove PSA designation

Revision ID: p1q2r3s4t5u6
Revises: n1o2p3q4r5s6
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "p1q2r3s4t5u6"
down_revision = "n1o2p3q4r5s6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "designation" not in insp.get_table_names():
        return
    bind.execute(sa.text("DELETE FROM designation WHERE designation = 'PSA'"))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "designation" not in insp.get_table_names():
        return
    bind.execute(
        sa.text(
            "INSERT INTO designation (designation, rank) "
            "SELECT 'PSA', 'C' "
            "WHERE NOT EXISTS (SELECT 1 FROM designation WHERE designation = 'PSA')"
        )
    )
