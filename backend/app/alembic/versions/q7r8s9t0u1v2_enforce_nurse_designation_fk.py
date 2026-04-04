"""enforce nurse designation fk

Revision ID: q7r8s9t0u1v2
Revises: p1q2r3s4t5u6
Create Date: 2026-03-24

"""
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "q7r8s9t0u1v2"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None

_ALIASES: dict[str, str] = {
    "RN": "SN",
    "REGISTEREDNURSE": "SN",
    "STAFFNURSE": "SN",
    "STAFFNURSEI": "SN",
    "STAFFNURSEII": "SN",
    "SNRSTAFFNURSEI": "SSN",
    "SNRSTAFFNURSEII": "SSN",
    "SENIORSTAFFNURSE": "SSN",
    "SENIORSTAFFNURSEI": "SSN",
    "SENIORSTAFFNURSEII": "SSN",
    "ENROLLEDNURSE": "EN",
    "ENROLLEDNURSEI": "EN",
    "ENROLLEDNURSEII": "EN",
    "SENIORENROLLEDNURSE": "SEN",
    "SENIORENROLLEDNURSEI": "SEN",
    "SENIORENROLLEDNURSEII": "SEN",
    "SNRENROLLEDNURSE": "SEN",
    "SNRENROLLEDNURSEI": "SEN",
    "SNRENROLLEDNURSEII": "SEN",
    "NURSINGAIDE": "NA",
    "NURSINGAIDEI": "NA",
    "NURSINGAIDEII": "NA",
    "SENIORNURSINGAIDEI": "NA",
    "SENIORNURSINGAIDEII": "NA",
    "HCA": "HCA1",
    "HCA1": "HCA1",
    "HCA2": "HCA2",
    "HCA3": "HCA3",
    "HEALTHCAREASSISTANT": "HCA1",
    "HEALTHCAREASSISTANTI": "HCA1",
    "HEALTHCAREASSISTANTII": "HCA2",
    "HEALTHCAREASSISTANTIII": "HCA3",
    "HEALTHCAREASST": "HCA1",
    "HEALTHCAREASSTI": "HCA1",
    "HEALTHCAREASSTII": "HCA2",
    "HEALTHCAREASSTIII": "HCA3",
    "SENIORHEALTHCAREASSISTANTI": "HCA1",
    "SENIORHEALTHCAREASSISTANTII": "HCA2",
}


def _canonicalize(value: str | None) -> str | None:
    compact = re.sub(r"[^A-Za-z0-9]+", "", value or "").upper()
    if not compact:
        return None
    return _ALIASES.get(compact, compact)


def upgrade() -> None:
    bind = op.get_bind()

    valid_designations = {
        row[0].upper()
        for row in bind.execute(sa.text("SELECT designation FROM designation")).fetchall()
    }
    existing_designations = [
        row[0]
        for row in bind.execute(sa.text("SELECT DISTINCT designation FROM nurse")).fetchall()
        if row[0] is not None
    ]

    for original in existing_designations:
        canonical = _canonicalize(original)
        if canonical and canonical.upper() in valid_designations and canonical != original:
            bind.execute(
                sa.text(
                    """
                    UPDATE nurse
                    SET designation = :canonical
                    WHERE designation = :original
                    """
                ),
                {"canonical": canonical, "original": original},
            )

    invalid_designations = [
        row[0]
        for row in bind.execute(
            sa.text(
                """
                SELECT DISTINCT n.designation
                FROM nurse n
                LEFT JOIN designation d
                  ON UPPER(d.designation) = UPPER(n.designation)
                WHERE d.designation IS NULL
                """
            )
        ).fetchall()
    ]
    if invalid_designations:
        raise ValueError(
            "Cannot enforce nurse designation FK; unmapped designations remain: "
            + ", ".join(sorted(str(value) for value in invalid_designations))
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
