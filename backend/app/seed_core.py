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


def infer_ward_hour_type_from_name(ward_name: str) -> str:
    """Infer ward hour type from ward name.

    Rule:
    - Names containing numbers (e.g. "Ward 1") => 8_HOURS
    - Names with no numbers (e.g. "Cedar Ward") => 12_HOURS
    """
    return "8_HOURS" if any(ch.isdigit() for ch in ward_name) else "12_HOURS"


def _get_guidelines(name: str, guidelines: dict) -> dict:
    return {
        "wardtype": guidelines["wardtype"],
        "wardhourtype": infer_ward_hour_type_from_name(name),
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
        inferred_hour_type = infer_ward_hour_type_from_name(ward_data["wardname"])
        existing = session.exec(
            select(Ward).where(Ward.wardname == ward_data["wardname"])
        ).first()

        if existing:
            updated = False
            if existing.wardhourtype != inferred_hour_type:
                existing.wardhourtype = inferred_hour_type
                updated = True
            if updated:
                session.add(existing)
                session.commit()
                session.refresh(existing)
                logger.info(
                    "  Updated ward '%s' hour type to %s",
                    ward_data["wardname"],
                    inferred_hour_type,
                )
            else:
                logger.info("  Ward '%s' already exists, skipping", ward_data["wardname"])
            wards.append(existing)
            continue

        ward = Ward(
            wardname=ward_data["wardname"],
            wardtype=ward_data["wardtype"],
            wardhourtype=inferred_hour_type,
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
    eight_hour_base_working = {"A", "P", "N", "DO"}
    twelve_hour_base_working = {"A-12", "N-12", "DO"}

    for ward in wards:
        ward_codes = (
            twelve_hour_base_working
            if (ward.wardhourtype or "8_HOURS") == "12_HOURS"
            else eight_hour_base_working
        )

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
