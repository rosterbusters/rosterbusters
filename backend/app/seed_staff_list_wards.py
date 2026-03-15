import logging

from sqlmodel import Session, select

from app.core.db import engine
from app.models.roster import Ward, WardShiftCode
from app.seed_data import SHIFT_CODES_DATA, WARDS_DATA

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
ALL_WARDS = WARDS_DATA + STAFF_LIST_WARDS


def seed_ward_shiftcodes(session: Session, wards: list[Ward]) -> None:
    """Seed ward-specific shift code mappings."""
    logger.info("Seeding ward shift code mappings...")
    default_base_working = {"A", "P", "N"}
    special_base_working = {"D", "N-12", "N", "A", "P"}
    special_ward_names = {"CH", "TCF"}
    leave_codes = {
        shift_code["shiftcode"] for shift_code in SHIFT_CODES_DATA if not shift_code["isworking"]
    }

    for ward in wards:
        if ward.wardname in special_ward_names:
            base_working = special_base_working
        else:
            base_working = default_base_working

        ward_codes = base_working | leave_codes
        for shiftcode in sorted(ward_codes):
            existing = session.exec(
                select(WardShiftCode).where(
                    WardShiftCode.wardid == ward.wardid,
                    WardShiftCode.shiftcode == shiftcode,
                )
            ).first()

            if existing:
                logger.info("  Mapping %s -> %s already exists, skipping", ward.wardname, shiftcode)
                continue

            mapping = WardShiftCode(wardid=ward.wardid, shiftcode=shiftcode)
            session.add(mapping)
            logger.info("  Mapped %s -> %s", ward.wardname, shiftcode)

    session.commit()


def seed_staff_list_wards() -> None:
    with Session(engine) as session:
        seeded_wards: list[Ward] = []
        for ward_data in ALL_WARDS:
            existing = session.exec(
                select(Ward).where(Ward.wardname == ward_data["wardname"])
            ).first()
            if existing:
                logger.info("Ward '%s' already exists, skipping", ward_data["wardname"])
                seeded_wards.append(existing)
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
            seeded_wards.append(ward)
            logger.info("Created ward '%s' (ID: %s)", ward.wardname, ward.wardid)

        seed_ward_shiftcodes(session, seeded_wards)


if __name__ == "__main__":
    seed_staff_list_wards()
