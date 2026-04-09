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
from app.models.shifts import WardShiftCode
from app.seed_data import (
    SHIFT_CODES_DATA,
    WARDS_DATA,
    STAFF_LIST_WARDS,
    seed_roles,
    seed_shift_codes,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _get_guidelines(name: str, guidelines: dict) -> dict:
    return {
        "wardtype": guidelines["wardtype"],
        "am_total": guidelines["am_total"],
        "am_rn": guidelines["am_rn"],
        "am_en_na_min": guidelines["am_en_na_min"],
        "am_en_na_max": guidelines["am_en_na_max"],
        "am_hca_min": guidelines["am_hca_min"],
        "am_hca_max": guidelines["am_hca_max"],
        "pm_total": guidelines["pm_total"],
        "pm_rn": guidelines["pm_rn"],
        "pm_en_na_min": guidelines["pm_en_na_min"],
        "pm_en_na_max": guidelines["pm_en_na_max"],
        "pm_hca_min": guidelines["pm_hca_min"],
        "pm_hca_max": guidelines["pm_hca_max"],
        "nd_total": guidelines["nd_total"],
        "nd_rn": guidelines["nd_rn"],
        "nd_en_na_min": guidelines["nd_en_na_min"],
        "nd_en_na_max": guidelines["nd_en_na_max"],
        "nd_hca_min": guidelines["nd_hca_min"],
        "nd_hca_max": guidelines["nd_hca_max"],
    }


def _resolve_ward_guidelines(wardname: str, ch_guidelines: dict, tcf_guidelines: dict) -> dict:
    first_char = wardname.strip().lower()[:1]
    if first_char in {"c", "d"}:
        return _get_guidelines(wardname, tcf_guidelines) | {"wardtype": "TCF"}
    return _get_guidelines(wardname, ch_guidelines) | {"wardtype": "CH"}


def _build_staff_list_wards() -> list[dict]:
    ch_guidelines = next((w for w in WARDS_DATA if w["wardname"] == "CH"), None)
    tcf_guidelines = next((w for w in WARDS_DATA if w["wardname"] == "TCF"), None)
    if not ch_guidelines or not tcf_guidelines:
        raise RuntimeError("Missing CH/TCF guidelines in WARDS_DATA")

    result: list[dict] = []
    for ward in STAFF_LIST_WARDS:
        wardname = ward["wardname"]
        resolved = _resolve_ward_guidelines(wardname, ch_guidelines, tcf_guidelines)
        result.append({**ward, **resolved})
    return result


CORE_WARDS_DATA = [
    ward for ward in WARDS_DATA if ward["wardname"] not in {"CH", "TCF"}
] + _build_staff_list_wards()


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


def seed_ward_shiftcodes(session: Session, wards: list[Ward]) -> None:
    """Seed ward-specific shift code mappings for core seed data."""
    logger.info("Seeding ward shift code mappings (core)...")
    default_base_working = {"A", "P", "N"}
    special_base_working = {"D", "N-12", "N", "A", "P"}
    special_ward_types = {"CH", "TCF"}
    leave_codes = {sc["shiftcode"] for sc in SHIFT_CODES_DATA if not sc["isworking"]}

    for ward in wards:
        base_working = special_base_working if ward.wardtype in special_ward_types else default_base_working
        ward_codes = base_working | leave_codes | {"DO"}

        for shiftcode in sorted(ward_codes):
            existing = session.exec(
                select(WardShiftCode).where(
                    WardShiftCode.wardid == ward.wardid,
                    WardShiftCode.shiftcode == shiftcode,
                )
            ).first()
            if existing:
                logger.info("  Mapping %s -> %s already exists, skipping", ward.wardname, shiftcode)
            else:
                session.add(WardShiftCode(wardid=ward.wardid, shiftcode=shiftcode))
                logger.info("  Mapped %s -> %s", ward.wardname, shiftcode)

    session.commit()


def seed_core_data(session: Session) -> None:
    """Seed all non-mock reference data."""
    seed_roles(session)
    seed_shift_codes(session)
    base_wards = seed_wards_from_dataset(session, CORE_WARDS_DATA, "core wards")
    staff_list_wards = []

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
