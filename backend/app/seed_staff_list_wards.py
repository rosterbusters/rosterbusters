import logging

from sqlmodel import Session, select

from app.core.db import engine
from app.models.roster import Ward
from app.seed_data import WARDS_DATA

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


def seed_staff_list_wards() -> None:
    with Session(engine) as session:
        for ward_data in ALL_WARDS:
            existing = session.exec(
                select(Ward).where(Ward.wardname == ward_data["wardname"])
            ).first()
            if existing:
                logger.info("Ward '%s' already exists, skipping", ward_data["wardname"])
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
            logger.info("Created ward '%s' (ID: %s)", ward.wardname, ward.wardid)


if __name__ == "__main__":
    seed_staff_list_wards()
