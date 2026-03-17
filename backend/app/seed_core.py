"""
Seed core/reference data required for the app to function.

Run: docker compose exec backend python app/seed_core.py

Seeds:
- role
- shiftcode
- ward
- ward_shiftcode

This script intentionally excludes demo/mock users, roster periods, rosters,
requests, and notifications.
"""
import logging

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Ward
from app.seed_data import (
    WARDS_DATA,
    seed_roles,
    seed_shift_codes,
    seed_ward_shiftcodes,
    seed_wards,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


STAFF_LIST_WARDS = [
    {
        "wardname": "Acacia Ward", "wardtype": "Dementia", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 1, "nd_en_na_min": 1, "nd_en_na_max": 3, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Angsana Ward", "wardtype": "Rehab", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Banyan Ward", "wardtype": "Rehab", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Casuarina Ward", "wardtype": "Rehab", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Cedar Ward", "wardtype": "Subacute", "location": "Simei",
        "am_total": 8, "am_rn": 3, "am_en_na_min": 3, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 3, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 5, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 3, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Dahlia Ward", "wardtype": "Subacute", "location": "Simei",
        "am_total": 8, "am_rn": 3, "am_en_na_min": 3, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 3, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 5, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 3, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Daisy Ward", "wardtype": "Paying Class", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 4, "am_hca_min": 1, "am_hca_max": 1,
        "pm_total": 6, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 1,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 2, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 0,
    },
]

CORE_WARDS_DATA = WARDS_DATA + STAFF_LIST_WARDS


def seed_wards_from_dataset(session: Session, wards_data: list[dict], label: str) -> list[Ward]:
    """Seed a specific ward dataset and return the Ward rows."""
    logger.info("Seeding %s...", label)
    wards: list[Ward] = []

    for ward_data in wards_data:
        existing = session.exec(
            select(Ward).where(Ward.wardname == ward_data["wardname"])
        ).first()

        if existing:
            logger.info("  Ward '%s' already exists, skipping", ward_data["wardname"])
            wards.append(existing)
            continue

        ward = Ward(
            wardname=ward_data["wardname"],
            wardtype=ward_data["wardtype"],
            location=ward_data["location"],
            isactive=True,
            am_total=ward_data["am_total"],
            am_rn=ward_data["am_rn"],
            am_en_na_min=ward_data["am_en_na_min"],
            am_en_na_max=ward_data["am_en_na_max"],
            am_hca_min=ward_data["am_hca_min"],
            am_hca_max=ward_data["am_hca_max"],
            pm_total=ward_data["pm_total"],
            pm_rn=ward_data["pm_rn"],
            pm_en_na_min=ward_data["pm_en_na_min"],
            pm_en_na_max=ward_data["pm_en_na_max"],
            pm_hca_min=ward_data["pm_hca_min"],
            pm_hca_max=ward_data["pm_hca_max"],
            nd_total=ward_data["nd_total"],
            nd_rn=ward_data["nd_rn"],
            nd_en_na_min=ward_data["nd_en_na_min"],
            nd_en_na_max=ward_data["nd_en_na_max"],
            nd_hca_min=ward_data["nd_hca_min"],
            nd_hca_max=ward_data["nd_hca_max"],
        )
        session.add(ward)
        session.commit()
        session.refresh(ward)
        wards.append(ward)
        logger.info("  Created ward: %s (ID: %s)", ward.wardname, ward.wardid)

    return wards


def seed_core_data(session: Session) -> None:
    """Seed all non-mock reference data."""
    seed_roles(session)
    seed_shift_codes(session)
    base_wards = seed_wards(session)
    staff_list_wards = seed_wards_from_dataset(session, STAFF_LIST_WARDS, "staff-list wards")

    all_wards_by_name = {ward.wardname: ward for ward in [*base_wards, *staff_list_wards]}
    seed_ward_shiftcodes(session, list(all_wards_by_name.values()))


def seed_core() -> None:
    logger.info("=" * 60)
    logger.info("Starting core/reference data seeding...")
    logger.info("=" * 60)

    with Session(engine) as session:
        seed_core_data(session)

    logger.info("=" * 60)
    logger.info("Core/reference data seeding completed")
    logger.info("=" * 60)


def main() -> None:
    seed_core()
   


if __name__ == "__main__":
    main()
