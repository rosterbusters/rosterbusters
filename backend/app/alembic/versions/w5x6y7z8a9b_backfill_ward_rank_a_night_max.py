"""backfill ward rank a night max

Revision ID: w5x6y7z8a9b
Revises: v4w5x6y7z8a9
Create Date: 2026-05-05

"""
from typing import Sequence, Union

from alembic import op


revision: str = "w5x6y7z8a9b"
down_revision: Union[str, None] = "v4w5x6y7z8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE ward
        SET nd_rn_max = COALESCE(
            CASE
                WHEN staffing_json IS NULL OR btrim(staffing_json) = '' THEN NULL
                ELSE NULLIF(staffing_json::jsonb -> 'RN' -> 'N' ->> 'maximum', '')::integer
            END,
            nd_rn
        )
        WHERE nd_rn_max IS NULL
        """
    )


def downgrade() -> None:
    # Data backfill only; leave populated values in place.
    return None
