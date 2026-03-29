"""enforce nurse designation fk

Revision ID: q7r8s9t0u1v2
Revises: p1q2r3s4t5u6
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "q7r8s9t0u1v2"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Normalize legacy shortforms before enforcing FK.
    bind.execute(
        sa.text(
            """
            UPDATE nurse
            SET designation = CASE
                WHEN designation = 'RN' THEN 'SN'
                WHEN designation = 'HCA' THEN 'HCA1'
                ELSE designation
            END
            """
        )
    )

    constraint_exists = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_nurse_designation'
            """
        )
    ).fetchone()
    if not constraint_exists:
        op.create_foreign_key(
            "fk_nurse_designation",
            "nurse",
            "designation",
            ["designation"],
            ["designation"],
            onupdate="CASCADE",
            ondelete="RESTRICT",
        )


def downgrade() -> None:
    bind = op.get_bind()
    constraint_exists = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_nurse_designation'
            """
        )
    ).fetchone()
    if constraint_exists:
        op.drop_constraint("fk_nurse_designation", "nurse", type_="foreignkey")
