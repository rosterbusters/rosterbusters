"""
Database seeding script for RBAC data.
Run: docker compose exec backend python app/seed_data.py

Uses hardcoded mock data for managers and nurses to guarantee consistency
across all tables (nurse, nursemanager, RBACUser, web_user, userrole).
"""
import logging
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from faker import Faker
from sqlmodel import Session, select

from app.core.db import engine
from app.core.security import get_password_hash
from app.models import RBACUser, Nurse, NurseManager, Role, UserRole
from app.models import Ward, ShiftCode, WardShiftCode, RosterPeriod, Roster, ShiftRequest, LeaveRequest, NotificationQueue
from app.models.web import User


# ============================================================================
# CONFIGURATION - Adjust these to control seed data volume
# ============================================================================
NUM_NURSE_USERS = 70
SEED = 42  # For reproducible fake data (set to None for random each time)

# ============================================================================
# Initialize Faker (still used for roster/shift/leave/notification seeding)
# ============================================================================
fake = Faker()
if SEED is not None:
    Faker.seed(SEED)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Static data (doesn't need Faker)
# ============================================================================
ROLES_DATA = [
    {"rolename": "Nurse", "displayname": "Ward Staff Nurse"},           # roleid=1
    {"rolename": "NurseManager", "displayname": "Nurse Manager"},       # roleid=2
    {"rolename": "Admin", "displayname": "Administrator"},              # roleid=3
]

SHIFT_CODES_DATA = [
    # Working shifts - AM
    {"shiftcode": "A", "description": "0700-1530 (AM SHIFT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(15, 30), "shiftdurationhours": Decimal("8.50")},
    {"shiftcode": "A-ADD", "description": "0700-1630 (AM SHIFT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(16, 30), "shiftdurationhours": Decimal("9.50")},
    {"shiftcode": "A-O", "description": "0700-1530 (AM SHIFT) W OT", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(15, 30), "shiftdurationhours": Decimal("8.50")},
    # Working shifts - Day
    {"shiftcode": "D", "description": "0700-1900 (DAY SHIFT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(19, 0), "shiftdurationhours": Decimal("12.00")},
    # Working shifts - PM
    {"shiftcode": "P", "description": "1300-2130 (PM SHIFT)", "isworking": True,
     "defaultstart": time(13, 0), "defaultend": time(21, 30), "shiftdurationhours": Decimal("8.50")},
    {"shiftcode": "P-ADD", "description": "1200-2130 (PM SHIFT)", "isworking": True,
     "defaultstart": time(12, 0), "defaultend": time(21, 30), "shiftdurationhours": Decimal("9.50")},
    # Working shifts - Night
    {"shiftcode": "N", "description": "2030-0730 (NIGHT SHIFT)", "isworking": True,
     "defaultstart": time(20, 30), "defaultend": time(7, 30), "shiftdurationhours": Decimal("11.00")},
    {"shiftcode": "N-12", "description": "1900-0700 (NIGHT SHIFT)", "isworking": True,
     "defaultstart": time(19, 0), "defaultend": time(7, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "N-OT", "description": "2030-0530 (NIGHT W/2 HRS OT)", "isworking": True,
     "defaultstart": time(20, 30), "defaultend": time(5, 30), "shiftdurationhours": Decimal("9.00")},
    {"shiftcode": "N-PH", "description": "2030-0730 (NIGHT) PH RATE", "isworking": True,
     "defaultstart": time(20, 30), "defaultend": time(7, 30), "shiftdurationhours": Decimal("11.00")},
    # Working shifts - Office Hours
    {"shiftcode": "OH", "description": "0800-1730 (Office Hours)", "isworking": True,
     "defaultstart": time(8, 0), "defaultend": time(17, 30), "shiftdurationhours": Decimal("9.50")},
    # Non-working - Day Off
    {"shiftcode": "DO", "description": "DAY OFF", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
    {"shiftcode": "DO-A", "description": "DAY OFF - AM SHIFT (OT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(15, 30), "shiftdurationhours": Decimal("8.50")},
    {"shiftcode": "DO-D", "description": "DAY OFF - DAY SHIFT (OT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(19, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "DO-N", "description": "DAY OFF - NIGHT SHIFT (OT)", "isworking": True,
     "defaultstart": time(19, 0), "defaultend": time(7, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "DO-P", "description": "DAY OFF - PM SHIFT (OT)", "isworking": True,
     "defaultstart": time(13, 0), "defaultend": time(21, 30), "shiftdurationhours": Decimal("8.50")},
    # Non-working - Rest Day
    {"shiftcode": "RD", "description": "REST DAY", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
    {"shiftcode": "RD-A", "description": "REST DAY - AM SHIFT (OT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(15, 30), "shiftdurationhours": Decimal("8.50")},
    {"shiftcode": "RD-D", "description": "REST DAY - DAY SHIFT (OT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(19, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "RD-N", "description": "REST DAY - NIGHT SHIFT (OT)", "isworking": True,
     "defaultstart": time(19, 0), "defaultend": time(7, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "RD-P", "description": "REST DAY - PM SHIFT (OT)", "isworking": True,
     "defaultstart": time(13, 0), "defaultend": time(21, 30), "shiftdurationhours": Decimal("8.50")},
    # Non-working - Holiday
    {"shiftcode": "HOL", "description": "PUBLIC HOLIDAY", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
    {"shiftcode": "HOL-A", "description": "PUBLIC HOLIDAY - AM (OT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(15, 30), "shiftdurationhours": Decimal("8.50")},
    {"shiftcode": "HOL-D", "description": "PUBLIC HOLIDAY - DAY (OT)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(19, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "HOL-N", "description": "PUBLIC HOLIDAY - NIGHT (OT)", "isworking": True,
     "defaultstart": time(19, 0), "defaultend": time(7, 0), "shiftdurationhours": Decimal("12.00")},
    {"shiftcode": "HOL-P", "description": "PUBLIC HOLIDAY - PM (OT)", "isworking": True,
     "defaultstart": time(13, 0), "defaultend": time(21, 30), "shiftdurationhours": Decimal("8.50")},
    # Special
    {"shiftcode": "FD", "description": "FAMILY DAY", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
    {"shiftcode": "SD", "description": "SLEEPING DAY", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
    {"shiftcode": "INHT", "description": "IN HOUSE TRAINING", "isworking": True,
     "defaultstart": time(8, 0), "defaultend": time(17, 0), "shiftdurationhours": Decimal("9.00")},
    {"shiftcode": "RTN-3", "description": "RETURN HOURS (3 HOURS)", "isworking": True,
     "defaultstart": time(7, 0), "defaultend": time(11, 0), "shiftdurationhours": Decimal("4.00")},
    # Leave types
    {"shiftcode": "AL", "description": "Annual Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "MC", "description": "Medical Certificate", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "CCL", "description": "Child Care Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "ML", "description": "Maternity Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "EML", "description": "Extended Maternity Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "Mar", "description": "Marriage Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "FCL", "description": "Family Care Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "SPL", "description": "Shared Parental Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "CL", "description": "Compassionate Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    {"shiftcode": "BDL", "description": "Birthday Leave", "isworking": False,
     "defaultstart": time(0, 0), "defaultend": time(23, 59), "shiftdurationhours": None},
    # PSA Shifts
    {"shiftcode": "PSA-0813", "description": "0800-1300 (PSA)", "isworking": True,
     "defaultstart": time(8, 0), "defaultend": time(13, 0), "shiftdurationhours": Decimal("5.00")},
    {"shiftcode": "PSA-1630", "description": "0815-1630 (PSA)", "isworking": True,
     "defaultstart": time(8, 15), "defaultend": time(16, 30), "shiftdurationhours": Decimal("8.25")},
    {"shiftcode": "PSA-1730", "description": "0815-1730 (PSA)", "isworking": True,
     "defaultstart": time(8, 15), "defaultend": time(17, 30), "shiftdurationhours": Decimal("9.25")},
    {"shiftcode": "PSA-1715", "description": "0900-1715 (PSA)", "isworking": True,
     "defaultstart": time(9, 0), "defaultend": time(17, 15), "shiftdurationhours": Decimal("8.25")},
    {"shiftcode": "PSA-1800", "description": "0945-1800 (PSA)", "isworking": True,
     "defaultstart": time(9, 45), "defaultend": time(18, 0), "shiftdurationhours": Decimal("8.25")},
    {"shiftcode": "OFF", "description": "OFF (PSA)", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
    {"shiftcode": "REST", "description": "REST (PSA)", "isworking": False,
     "defaultstart": None, "defaultend": None, "shiftdurationhours": None},
]

LOCATIONS = ["Simei", "Bedok"]
DESIGNATIONS = ["RN", "EN", "NA", "HCA", "SSN"]

# ============================================================================
# Static ward data (real wards)
# ============================================================================
WARDS_DATA = [
    # SACH Simei wards
    {
        "wardname": "Ward 4", "wardtype": "Dementia", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 1, "nd_en_na_min": 1, "nd_en_na_max": 3, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Ward 5", "wardtype": "Rehab", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Ward 6", "wardtype": "Rehab", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Ward 7", "wardtype": "Rehab", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 5, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Ward 8", "wardtype": "Subacute", "location": "Simei",
        "am_total": 8, "am_rn": 3, "am_en_na_min": 3, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 3, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 5, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 3, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Ward 9", "wardtype": "Subacute", "location": "Simei",
        "am_total": 8, "am_rn": 3, "am_en_na_min": 3, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 3, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 5, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 3, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        "wardname": "Ward 10", "wardtype": "Paying Class", "location": "Simei",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 4, "am_en_na_max": 4, "am_hca_min": 1, "am_hca_max": 1,
        "pm_total": 6, "pm_rn": 2, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 1,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 2, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 0,
    },
    {
        "wardname": "Ward 11", "wardtype": "Palliative", "location": "Simei",
        "am_total": 8, "am_rn": 3, "am_en_na_min": 3, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 7, "pm_rn": 3, "pm_en_na_min": 2, "pm_en_na_max": 4, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    # SACH Bedok wards
    {
        "wardname": "CH", "wardtype": "Community Hospital", "location": "Bedok",
        "am_total": 5, "am_rn": 2, "am_en_na_min": 1, "am_en_na_max": 3, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": 5, "pm_rn": 2, "pm_en_na_min": 1, "pm_en_na_max": 3, "pm_hca_min": 0, "pm_hca_max": 2,
        "nd_total": 4, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 2, "nd_hca_min": 0, "nd_hca_max": 1,
    },
    {
        # TCF uses 12hr shifts: Day (mapped to AM) and Night (ND). No separate PM shift.
        "wardname": "TCF", "wardtype": "Transitional Care", "location": "Bedok",
        "am_total": 7, "am_rn": 2, "am_en_na_min": 2, "am_en_na_max": 5, "am_hca_min": 0, "am_hca_max": 2,
        "pm_total": None, "pm_rn": None, "pm_en_na_min": None, "pm_en_na_max": None, "pm_hca_min": None, "pm_hca_max": None,
        "nd_total": 7, "nd_rn": 2, "nd_en_na_min": 1, "nd_en_na_max": 5, "nd_hca_min": 0, "nd_hca_max": 2,
    },
]


# ============================================================================
# Manager & nurse data
# ============================================================================
NUM_WARDS = len(WARDS_DATA)

MANAGERS_DATA = [
    {"name": "Lim Wei Ling",     "email": "lim.weiling@sach.org.sg",      "contactnumber": "91234501"},
    {"name": "Tan Siew Bee",     "email": "tan.siewbee@sach.org.sg",      "contactnumber": "91234502"},
    {"name": "Ng Ai Hua",        "email": "ng.aihua@sach.org.sg",         "contactnumber": "91234503"},
    {"name": "Wong Mei Fong",    "email": "wong.meifong@sach.org.sg",     "contactnumber": "91234504"},
    {"name": "Chua Shu Min",     "email": "chua.shumin@sach.org.sg",      "contactnumber": "91234505"},
    {"name": "Koh Pei Shan",     "email": "koh.peishan@sach.org.sg",      "contactnumber": "91234506"},
    {"name": "Lee Hui Ling",     "email": "lee.huiling@sach.org.sg",      "contactnumber": "91234507"},
    {"name": "Ong Siew Lan",     "email": "ong.siewlan@sach.org.sg",      "contactnumber": "91234508"},
    {"name": "Ahmad Ismail",     "email": "ahmad.ismail@sach.org.sg",     "contactnumber": "91234509"},
    {"name": "Priya Nair",       "email": "priya.nair@sach.org.sg",       "contactnumber": "91234510"},
]

NURSES_DATA = build_nurses_data()
NUM_NURSE_USERS = len(NURSES_DATA)  # ~251 total across 8 wards


def seed_roles(session: Session) -> dict[str, Role]:
    """Seed roles and return mapping of rolename to Role object."""
    logger.info("Seeding roles...")
    roles = {}

    for role_data in ROLES_DATA:
        existing = session.exec(
            select(Role).where(Role.rolename == role_data["rolename"])
        ).first()

        if existing:
            logger.info(f"  Role '{role_data['rolename']}' already exists, skipping")
            roles[role_data["rolename"]] = existing
        else:
            role = Role(
                rolename=role_data["rolename"],
                displayname=role_data["displayname"],
                isactive=True,
                createdat=datetime.now(timezone.utc),
            )
            session.add(role)
            session.commit()
            session.refresh(role)
            roles[role_data["rolename"]] = role
            logger.info(f"  Created role: {role_data['rolename']}")

    return roles


def seed_shift_codes(session: Session) -> None:
    """Seed shift codes."""
    logger.info("Seeding shift codes...")

    for sc_data in SHIFT_CODES_DATA:
        existing = session.exec(
            select(ShiftCode).where(ShiftCode.shiftcode == sc_data["shiftcode"])
        ).first()

        if existing:
            logger.info(f"  ShiftCode '{sc_data['shiftcode']}' already exists, skipping")
        else:
            shift_code = ShiftCode(
                shiftcode=sc_data["shiftcode"],
                description=sc_data["description"],
                isworking=sc_data["isworking"],
                defaultstart=sc_data["defaultstart"],
                defaultend=sc_data["defaultend"],
                shiftdurationhours=sc_data["shiftdurationhours"],
            )
            session.add(shift_code)
            session.commit()
            logger.info(f"  Created shift code: {sc_data['shiftcode']} ({sc_data['description']})")


def seed_wards(session: Session) -> list[Ward]:
    """Seed wards and return list of created Ward objects."""
    logger.info("Seeding wards...")
    wards = []

    for ward_data in WARDS_DATA:
        existing = session.exec(
            select(Ward).where(Ward.wardname == ward_data["wardname"])
        ).first()

        if existing:
            logger.info(f"  Ward '{ward_data['wardname']}' already exists, skipping")
            wards.append(existing)
        else:
            ward = Ward(
                wardname=ward_data["wardname"],
                wardtype=ward_data["wardtype"],
                location=ward_data["location"],
                isactive=True,
                # AM shift staffing requirements
                am_total=ward_data["am_total"],
                am_rn=ward_data["am_rn"],
                am_en_na_min=ward_data["am_en_na_min"],
                am_en_na_max=ward_data["am_en_na_max"],
                am_hca_min=ward_data["am_hca_min"],
                am_hca_max=ward_data["am_hca_max"],
                # PM shift staffing requirements
                pm_total=ward_data["pm_total"],
                pm_rn=ward_data["pm_rn"],
                pm_en_na_min=ward_data["pm_en_na_min"],
                pm_en_na_max=ward_data["pm_en_na_max"],
                pm_hca_min=ward_data["pm_hca_min"],
                pm_hca_max=ward_data["pm_hca_max"],
                # ND shift staffing requirements
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
            logger.info(f"  Created ward: {ward_data['wardname']} (ID: {ward.wardid})")

    return wards


def seed_managers(session: Session, _wards: list[Ward]) -> list[NurseManager]:
    """Seed nurse managers and return list of created NurseManager objects."""
    logger.info("Seeding nurse managers...")
    managers = []

    for _i, mgr_data in enumerate(MANAGERS_DATA):
        existing = session.exec(
            select(NurseManager).where(NurseManager.email == mgr_data["email"])
        ).first()

        if existing:
            logger.info(f"  Manager '{mgr_data['name']}' already exists, skipping")
            managers.append(existing)
        else:
            manager = NurseManager(
                name=mgr_data["name"],
                email=mgr_data["email"],
                contactnumber=mgr_data["contactnumber"],
                isactive=True,
                createdat=datetime.now(timezone.utc),
            )
            session.add(manager)
            session.commit()
            session.refresh(manager)
            managers.append(manager)
            logger.info(f"  Created manager: {mgr_data['name']} (ID: {manager.managerid})")

    return managers


def seed_nurses(session: Session, wards: list[Ward]) -> list[Nurse]:
    """Seed nurses and return list of created Nurse objects."""
    logger.info("Seeding nurses...")
    nurses = []

    for nurse_data in NURSES_DATA:
        existing = session.exec(
            select(Nurse).where(Nurse.email == nurse_data["email"])
        ).first()

        if existing:
            logger.info(f"  Nurse '{nurse_data['name']}' already exists, skipping")
            nurses.append(existing)
        else:
            ward = wards[int(nurse_data["ward_idx"])]
            nurse = Nurse(
                name=nurse_data["name"],
                designation=nurse_data["designation"],
                email=nurse_data["email"],
                contactnumber=nurse_data["contactnumber"],
                wardid=ward.wardid,
                employmenttype="FullTime",
                isactive=True,
            )
            session.add(nurse)
            session.commit()
            session.refresh(nurse)
            nurses.append(nurse)
            logger.info(f"  Created nurse: {nurse_data['name']} ({nurse_data['designation']}) -> {ward.wardname}")

    return nurses


def seed_admin_user(session: Session, roles: dict[str, Role]) -> RBACUser:
    """Seed admin user."""
    logger.info("Seeding admin user...")

    existing = session.exec(
        select(RBACUser).where(RBACUser.email == "admin@sach.org.sg")
    ).first()

    if existing:
        logger.info("  Admin user already exists, skipping")
        return existing

    admin = RBACUser(
        username="admin",
        email="admin@sach.org.sg",
        passwordhash=get_password_hash("changethis"),
        isactive=True,
        createdat=datetime.now(timezone.utc),
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)

    # Assign admin role
    admin_role = roles.get("Admin")
    if admin_role:
        user_role = UserRole(
            userid=admin.userid,
            roleid=admin_role.roleid,
            isactive=True,
            assignedat=datetime.now(timezone.utc),
        )
        session.add(user_role)
        session.commit()

    logger.info("  Created admin user: admin@sach.org.sg / changethis")
    return admin


def seed_manager_users(
    session: Session,
    managers: list[NurseManager],
    wards: list[Ward],
    roles: dict[str, Role],
) -> list[RBACUser]:
    """Seed manager users."""
    logger.info("Seeding manager users...")
    users = []

    for i, manager in enumerate(managers):
        existing = session.exec(
            select(RBACUser).where(RBACUser.email == manager.email)
        ).first()

        if existing:
            logger.info(f"  Manager user '{manager.email}' already exists, skipping")
            users.append(existing)
            continue

        username = manager.email.split("@")[0]

        existing_by_username = session.exec(
            select(RBACUser).where(RBACUser.username == username)
        ).first()

        if existing_by_username:
            logger.info(f"  Manager username '{username}' already exists, skipping")
            users.append(existing_by_username)
            continue

        user = RBACUser(
            username=username,
            email=manager.email,
            passwordhash=get_password_hash("manager123"),
            managerid=manager.managerid,
            isactive=True,
            createdat=datetime.now(timezone.utc),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Assign NurseManager role with ward assignment
        manager_role = roles.get("NurseManager")
        if manager_role and i < len(wards):
            user_role = UserRole(
                userid=user.userid,
                roleid=manager_role.roleid,
                wardid=wards[i].wardid,
                isactive=True,
                assignedat=datetime.now(timezone.utc),
            )
            session.add(user_role)
            session.commit()

        users.append(user)
        logger.info(f"  Created manager user: {manager.email} / manager123")

    return users


def seed_nurse_users(
    session: Session,
    nurses: list[Nurse],
    roles: dict[str, Role],
) -> list[RBACUser]:
    """Seed nurse users (configurable number for testing)."""
    logger.info("Seeding nurse users...")
    users = []

    # Only create users for first N nurses for testing
    test_nurses = nurses[:NUM_NURSE_USERS]

    for nurse in test_nurses:
        existing = session.exec(
            select(RBACUser).where(RBACUser.email == nurse.email)
        ).first()

        if existing:
            logger.info(f"  Nurse user '{nurse.email}' already exists, skipping")
            users.append(existing)
            continue

        username = nurse.email.split("@")[0]

        existing_by_username = session.exec(
            select(RBACUser).where(RBACUser.username == username)
        ).first()

        if existing_by_username:
            logger.info(f"  Nurse username '{username}' already exists, skipping")
            users.append(existing_by_username)
            continue

        user = RBACUser(
            username=username,
            email=nurse.email,
            passwordhash=get_password_hash("nurse123"),
            nurseid=nurse.nurseid,
            isactive=True,
            createdat=datetime.now(timezone.utc),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Assign Nurse role with ward assignment
        nurse_role = roles.get("Nurse")
        if nurse_role:
            user_role = UserRole(
                userid=user.userid,
                roleid=nurse_role.roleid,
                wardid=nurse.wardid,
                isactive=True,
                assignedat=datetime.now(timezone.utc),
            )
            session.add(user_role)
            session.commit()

        users.append(user)
        logger.info(f"  Created nurse user: {nurse.email} / nurse123")

    return users


def seed_roster_periods(session: Session) -> list[RosterPeriod]:
    """Seed roster periods covering the previous calendar month and upcoming 2 weeks.

    Periods are 2-week Mon–Sun blocks aligned to the current week's Monday.
    Blocks step backward until the previous calendar month is fully covered,
    then forward for the next 2-week block.

    Returns the list with the current period at index 0 and the next period at
    index 1 (preserving backward-compat for callers that use periods[0/1]),
    followed by past periods in reverse-chronological order.
    """
    logger.info("Seeding roster periods...")

    today = date.today()
    current_monday = today - timedelta(days=today.weekday())
    first_of_prev_month = (today.replace(day=1) - timedelta(days=1)).replace(day=1)

    # Collect all period start dates needed
    period_starts: set[date] = set()

    # Current + next
    period_starts.add(current_monday)
    period_starts.add(current_monday + timedelta(weeks=2))

    # Step backward in 2-week blocks until the block's end date reaches
    # before the first day of the previous month
    p = current_monday - timedelta(weeks=2)
    while True:
        period_starts.add(p)
        if p <= first_of_prev_month:
            break
        p -= timedelta(weeks=2)

    all_periods: dict[date, RosterPeriod] = {}
    for start in sorted(period_starts):
        end = start + timedelta(days=13)
        request_open = start - timedelta(days=10)
        request_close = start - timedelta(days=3)

        if start == current_monday:
            label, status = "Current", "RequestOpen"
        elif start > current_monday:
            label, status = "Next", "RequestOpen"
        else:
            label, status = "Past", "Published"

        period_name = f"{label} Period {start.strftime('%b %d')}-{end.strftime('%b %d %Y')}"

        existing = session.exec(
            select(RosterPeriod).where(RosterPeriod.startdate == start)
        ).first()

        if existing:
            logger.info(f"  Roster period {start} already exists, skipping")
            all_periods[start] = existing
        else:
            period = RosterPeriod(
                name=period_name,
                startdate=start,
                enddate=end,
                requestopendate=request_open,
                requestclosedate=request_close,
                status=status,
            )
            session.add(period)
            session.commit()
            session.refresh(period)
            all_periods[start] = period
            logger.info(f"  Created roster period: {period_name} (ID: {period.periodid})")

    sorted_starts = sorted(all_periods.keys())
    # current + future first (index 0 = current), then past in reverse-chron order
    current_and_future = [all_periods[s] for s in sorted_starts if s >= current_monday]
    past = [all_periods[s] for s in reversed(sorted_starts) if s < current_monday]
    return current_and_future + past


def seed_roster_entries(
    session: Session,
    nurses: list[Nurse],
    wards: list[Ward],
    periods: list[RosterPeriod],
    managers: list[NurseManager],
) -> int:
    """Seed roster entries for all nurses from the previous calendar month
    through today + 14 days (upcoming 2 weeks).

    - One entry per nurse per day over the full range
    - starttime/endtime populated from shift code defaults
    - Mix of Auto (70%) and Manual (30%) assignments
    - Past dates are always Confirmed; future dates are Confirmed or Pending
    - Shift pattern offset by nurse index for realistic variety across a ward
    """
    logger.info("Seeding roster entries...")

    if not periods:
        logger.warning("  No periods available, skipping roster entries")
        return 0

    today = date.today()
    first_of_prev_month = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    range_end = today + timedelta(days=14)

    # Build date → period mapping from all seeded periods
    date_to_period: dict[date, RosterPeriod] = {}
    for period in periods:
        current = period.startdate
        while current <= period.enddate:
            date_to_period[current] = period
            current += timedelta(days=1)

    # Build shift code lookup
    shift_codes_db = session.exec(select(ShiftCode)).all()
    shift_lookup = {sc.shiftcode: sc for sc in shift_codes_db}

    # 7-day rotating pattern; offset per nurse for variety
    shift_pattern = ["D", "D", "N", "N", "DO", "DO", "D"]

    count = 0
    for nurse_idx, nurse in enumerate(nurses):
        ward = next((w for w in wards if w.wardid == nurse.wardid), None)
        if not ward:
            continue

        ward_idx = wards.index(ward) if ward in wards else 0
        ward_manager = managers[ward_idx] if ward_idx < len(managers) else None

        current_date = first_of_prev_month
        day_offset = 0
        nurse_count = 0

        while current_date <= range_end:
            period = date_to_period.get(current_date)
            if period is None:
                current_date += timedelta(days=1)
                day_offset += 1
                continue

            existing = session.exec(
                select(Roster).where(
                    Roster.nurseid == nurse.nurseid,
                    Roster.shiftdate == current_date,
                )
            ).first()

            if existing:
                current_date += timedelta(days=1)
                day_offset += 1
                continue

            shift_code = shift_pattern[(day_offset + nurse_idx * 3) % len(shift_pattern)]
            sc = shift_lookup.get(shift_code)
            start_time = sc.defaultstart if sc else None
            end_time = sc.defaultend if sc else None

            is_manual = fake.random_int(min=1, max=10) <= 3
            assignment_method = "Manual" if is_manual else "Auto"
            assigned_by = ward_manager.managerid if is_manual and ward_manager else None

            # Past/today: always Confirmed; future: mostly Confirmed, some Pending
            if current_date <= today:
                status = "Confirmed"
            else:
                status = fake.random_element(["Confirmed", "Confirmed", "Confirmed", "Pending"])

            roster = Roster(
                nurseid=nurse.nurseid,
                wardid=ward.wardid,
                periodid=period.periodid,
                shiftdate=current_date,
                shiftcode=shift_code,
                starttime=start_time,
                endtime=end_time,
                status=status,
                assignmentmethod=assignment_method,
                assignedby=assigned_by,
            )
            session.add(roster)
            count += 1
            nurse_count += 1

            current_date += timedelta(days=1)
            day_offset += 1

        session.commit()
        logger.info(f"  {nurse.name}: {nurse_count} entries ({first_of_prev_month} → {range_end})")

    logger.info(f"  Total: {count} roster entries")
    return count


def seed_shift_requests(
    session: Session,
    nurses: list[Nurse],
    periods: list[RosterPeriod],
    managers: list[NurseManager],
) -> int:
    """Seed shift requests for nurses.

    - Current period: ~30% of nurses submit shift requests (densest)
    - Next period: ~10% of nurses submit shift requests
    - Each nurse can submit up to 3 requests per period
    - Dates spread evenly across days via round-robin
    - Mixed statuses: Pending, Approved, Rejected
    - Working shifts only: D, N, A, P
    """
    logger.info("Seeding shift requests...")

    if not periods or not nurses:
        logger.warning("  No periods or nurses available, skipping shift requests")
        return 0

    count = 0

    # Working shift codes only
    working_shifts = ["D", "N", "A", "P"]
    statuses = ["Pending", "Pending", "Approved", "Approved", "Rejected"]  # Weighted mix
    reasons = [
        "Family commitment",
        "Medical appointment",
        "Personal preference",
        "Childcare arrangement",
        "Transport convenience",
        "Study commitment",
        None,  # No reason given
    ]

    # Current period: ALL nurses get at least 1 request; next period: ~10%
    for period_idx, period in enumerate(periods):
        # Build list of all dates in this period for round-robin distribution
        days_in_period = (period.enddate - period.startdate).days
        period_dates = [period.startdate + timedelta(days=d) for d in range(days_in_period + 1)]
        day_cursor = 0

        # Current period: every nurse; next period: 10% sample
        if period_idx == 0:
            selected_nurses = list(nurses)
        else:
            num_nurses_with_requests = max(1, int(len(nurses) * 0.10))
            selected_nurses = fake.random_elements(nurses, length=num_nurses_with_requests, unique=True)

        period_count = 0
        for nurse in selected_nurses:
            # Check if requests already exist for this nurse/period
            existing = session.exec(
                select(ShiftRequest).where(
                    ShiftRequest.nurseid == nurse.nurseid,
                    ShiftRequest.periodid == period.periodid,
                )
            ).first()

            if existing:
                logger.info(f"  Shift requests for nurse {nurse.name} in period {period.periodid} already exist, skipping")
                continue

            # Generate 1-3 requests per nurse
            num_requests = fake.random_int(min=1, max=3)

            for request_num in range(1, num_requests + 1):
                # Round-robin date assignment for even spread across days
                preferred_date = period_dates[day_cursor % len(period_dates)]
                day_cursor += 1

                # Check if this specific request already exists
                existing_req = session.exec(
                    select(ShiftRequest).where(
                        ShiftRequest.nurseid == nurse.nurseid,
                        ShiftRequest.periodid == period.periodid,
                        ShiftRequest.requestnumber == request_num,
                    )
                ).first()
                if existing_req:
                    continue

                # Current and future periods: always Pending; past periods: random mix
                if period_idx <= 1:
                    status = "Pending"
                else:
                    status = fake.random_element(statuses)

                # If approved/rejected, set reviewer (manager or algorithm)
                reviewed_by = None
                reviewed_at = None
                rejection_reason = None

                if status in ["Approved", "Rejected"]:
                    # 70% reviewed by manager, 30% by algorithm (reviewedby = None for algorithm)
                    if fake.random_int(min=1, max=10) <= 7 and managers:
                        reviewed_by = fake.random_element(managers).managerid
                    reviewed_at = datetime.now(timezone.utc) - timedelta(days=fake.random_int(min=1, max=5))

                    if status == "Rejected":
                        rejection_reason = fake.random_element([
                            "Staffing requirements not met",
                            "Too many requests for this date",
                            "Conflicts with another approved request",
                            "Insufficient notice period",
                        ])

                shift_request = ShiftRequest(
                    nurseid=nurse.nurseid,
                    periodid=period.periodid,
                    preferreddate=preferred_date,
                    preferredshifttype=fake.random_element(working_shifts),
                    requestnumber=request_num,
                    reason=fake.random_element(reasons),
                    priority=1,  # Default priority (not used per requirements)
                    status=status,
                    reviewedby=reviewed_by,
                    reviewedat=reviewed_at,
                    rejectionreason=rejection_reason,
                    notificationsent=status != "Pending",
                )
                session.add(shift_request)
                period_count += 1

            session.commit()

        logger.info(f"  Period {period.periodid}: created {period_count} shift requests for {len(selected_nurses)} nurses")
        count += period_count

    logger.info(f"  Total: {count} shift requests across {len(periods)} periods")
    return count


def seed_leave_requests(
    session: Session,
    nurses: list[Nurse],
    periods: list[RosterPeriod],
    managers: list[NurseManager],
) -> int:
    """Seed leave requests spread across the current and next calendar month.

    - Each ward is guaranteed at least one leave request
    - ~50% of nurses receive 1-3 leave requests
    - Past-dated leaves are mostly Approved; future-dated are mostly Pending
    - Full LeaveRequest fields are populated (status, approvedby, category, etc.)
    """
    logger.info("Seeding leave requests...")

    if not nurses:
        logger.warning("  No nurses available, skipping leave requests")
        return 0

    today = date.today()
    # Range: first of current month → last of next month
    range_start = today.replace(day=1)
    next_month_first = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    range_end = (next_month_first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    total_days = (range_end - range_start).days + 1

    # leave type → (leavecategory, weight)
    leave_type_meta = {
        "AL":  ("PreApproved",          4),
        "MC":  ("MedicalCertificate",   4),
        "CL":  ("Urgent",               2),
        "CCL": ("PreApproved",          2),
        "FCL": ("PreApproved",          1),
        "BDL": ("PreApproved",          1),
        "URG": ("Urgent",               1),
        "UPL": ("PreApproved",          1),
    }
    leave_types_weighted = [lt for lt, (_, w) in leave_type_meta.items() for _ in range(w)]

    reasons_by_type = {
        "AL":  ["Family holiday", "Personal rest", "Annual vacation", None],
        "MC":  ["Fever and flu", "Medical appointment", "Doctor's visit", None],
        "CL":  ["Bereavement", "Family emergency", None],
        "CCL": ["Child's school event", "Childcare arrangement", None],
        "FCL": ["Caring for elderly parent", "Family care needed", None],
        "BDL": ["Birthday leave", None],
        "URG": ["Family emergency", "Urgent personal matter", None],
        "UPL": ["Personal matter", None],
    }

    rejection_reasons = [
        "Staffing requirements not met",
        "Insufficient notice period",
        "Conflicts with another approved leave",
        "Ward coverage cannot be maintained",
    ]

    manager_ids = [m.managerid for m in managers if m.managerid]

    # Group nurses by ward
    ward_to_nurses: dict[int, list[Nurse]] = {}
    for nurse in nurses:
        if nurse.wardid:
            ward_to_nurses.setdefault(nurse.wardid, []).append(nurse)

    count = 0
    nurses_with_requests: set[int] = set()

    def _add_leave(nurse: Nurse, start: date, leave_type: str) -> bool:
        """Create one leave request. Returns False if an overlapping request exists."""
        category, _ = leave_type_meta[leave_type]
        duration = fake.random_int(min=1, max=3)
        end = min(start + timedelta(days=duration - 1), range_end)

        # Skip if this nurse already has an overlapping request
        overlap = session.exec(
            select(LeaveRequest).where(
                LeaveRequest.nurseid == nurse.nurseid,
                LeaveRequest.startdate <= end,
                LeaveRequest.enddate >= start,
            )
        ).first()
        if overlap:
            return False

        # Status: past → mostly Approved; today → Pending/Approved; future → mostly Pending
        if start < today:
            status = fake.random_element(["Approved", "Approved", "Approved", "Rejected", "Cancelled"])
        elif start == today:
            status = fake.random_element(["Pending", "Approved"])
        else:
            status = fake.random_element(["Pending", "Pending", "Approved"])

        approved_by = None
        approved_at = None
        rejection_reason = None

        if status == "Approved" and manager_ids:
            approved_by = fake.random_element(manager_ids)
            approved_at = datetime.now(timezone.utc) - timedelta(days=fake.random_int(min=1, max=14))
        elif status == "Rejected":
            rejection_reason = fake.random_element(rejection_reasons)

        submitted_period = "AfterFinalization" if start <= today else "BeforeRoster"

        leave_req = LeaveRequest(
            nurseid=nurse.nurseid,
            startdate=start,
            enddate=end,
            leavetype=leave_type,
            leavecategory=category,
            submittedduringperiod=submitted_period,
            requiresreplacement=fake.boolean(chance_of_getting_true=25),
            reason=fake.random_element(reasons_by_type.get(leave_type, [None])),
            requestedat=datetime.now(timezone.utc) - timedelta(days=fake.random_int(min=0, max=21)),
            status=status,
            approvedby=approved_by,
            approvedat=approved_at,
            rejectionreason=rejection_reason,
            notificationsent=status != "Pending",
            impactsroster=status == "Approved",
        )
        session.add(leave_req)
        return True

    # Pass 1: guarantee at least one leave request per ward
    for ward_id, ward_nurses in ward_to_nurses.items():
        nurse = fake.random_element(ward_nurses)
        day_offset = fake.random_int(min=0, max=total_days - 1)
        start = range_start + timedelta(days=day_offset)
        leave_type = fake.random_element(["AL", "MC", "CL"])
        if _add_leave(nurse, start, leave_type):
            nurses_with_requests.add(nurse.nurseid)
            count += 1
            logger.info(f"  Ward {ward_id}: guaranteed leave → {nurse.name} ({leave_type}, {start})")

    session.commit()

    # Pass 2: ~50% of nurses get 1–3 additional leave requests
    num_selected = max(1, len(nurses) // 2)
    selected = fake.random_elements(nurses, length=min(num_selected, len(nurses)), unique=True)

    for nurse in selected:
        num_requests = fake.random_int(min=1, max=3)
        for _ in range(num_requests):
            day_offset = fake.random_int(min=0, max=total_days - 1)
            start = range_start + timedelta(days=day_offset)
            leave_type = fake.random_element(leave_types_weighted)
            if _add_leave(nurse, start, leave_type):
                nurses_with_requests.add(nurse.nurseid)
                count += 1
        session.commit()

    logger.info(
        f"  Created {count} leave requests across {len(ward_to_nurses)} wards "
        f"({len(nurses_with_requests)} nurses, {range_start} – {range_end})"
    )
    return count


def seed_notifications(
    session: Session,
    nurses: list[Nurse],
    periods: list[RosterPeriod],
    managers: list[NurseManager],
) -> int:
    """Seed notifications for ward staff and managers using NotificationQueue.

    Notification types:
    - ShiftUpdate: Roster released, roster changes
    - SwapRequest: Shift swap notifications
    - LeaveApproval: Request approved/rejected
    - LeaveReminder: Request period reminders

    Every nurse and nurse manager receives at least 3 notifications.
    """
    logger.info("Seeding notifications...")

    if not periods or not nurses:
        logger.warning("  No periods or nurses available, skipping notifications")
        return 0

    current_period = periods[0]
    count = 0

    channels = ["WhatsApp", "Email", "Both"]

    # Notification templates for nurses
    period_range = f"{current_period.startdate.strftime('%d %b')} - {current_period.enddate.strftime('%d %b')}"
    nurse_templates = [
        {
            "type": "ShiftRequest",
            "subject": "Shift Request Period Open",
            "body": f"Shift Request Period ({period_range}) is Now Open. Submit your preferences.",
            "priority": "Normal",
        },
        {
            "type": "RosterRelease",
            "subject": "Roster Released",
            "body": f"{period_range} Roster Released.",
            "priority": "Normal",
        },
        {
            "type": "ShiftRequest",
            "subject": "Shift Request Period Closed",
            "body": f"Shift Request Period ({period_range}) is Now Closed.",
            "priority": "Normal",
        },
        {
            "type": "ShiftRequest",
            "subject": "Shift Request Period Open",
            "body": f"Shift Request Period ({period_range}) is Now Open.",
            "priority": "Normal",
        },
    ]

    # Notification templates for managers
    leave_date = current_period.startdate + timedelta(days=fake.random_int(min=1, max=12))
    manager_templates = [
        {
            "type": "Roster",
            "subject": "Roster Planning",
            "body": f"Start Planning Roster for {period_range}",
            "priority": "Normal",
        },
        {
            "type": "RosterRelease",
            "subject": "Roster Finalisation",
            "body": f"Reminder: Publish Roster due {current_period.requestclosedate.strftime('%d %b %Y')}",
            "priority": "Urgent",
        },
        {
            "type": "HRISReminder",
            "subject": "HRIS Reminder",
            "body": f"Reminder: Export Roster to HRIS system by {current_period.enddate.strftime('%d %b %Y')}",
            "priority": "Normal",
        },
        {
            "type": "LeaveRequest",
            "subject": "Leave Request",
            "body": f"{fake.name()} applied for {fake.random_element(['AL', 'MC', 'CL', 'CCL'])} for {leave_date.strftime('%d %b %Y')}",
            "priority": "Normal",
        },
        {
            "type": "ShiftRequest",
            "subject": "Shift Request Review Open",
            "body": f"Shift Requests Review for {period_range} is open",
            "priority": "Normal",
        },
        {
            "type": "ShiftRequest",
            "subject": "Shift Request Review Closed",
            "body": f"Shift Requests Review for {period_range} is closed",
            "priority": "Normal",
        },
    ]

    def _make_notification(recipient_type: str, recipient_id: int, template: dict) -> NotificationQueue:
        days_ago = fake.random_int(min=0, max=7)
        created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)

        status_choice = fake.random_int(min=1, max=6)
        if status_choice <= 2:
            status = "Read"
            sent_at = created_at + timedelta(minutes=1)
            read_at = created_at + timedelta(hours=fake.random_int(min=1, max=24))
        elif status_choice <= 5:
            status = "Sent"
            sent_at = created_at + timedelta(minutes=1)
            read_at = None
        else:
            status = "Pending"
            sent_at = None
            read_at = None

        return NotificationQueue(
            recipienttype=recipient_type,
            recipientid=recipient_id,
            notificationtype=template["type"],
            channel=fake.random_element(channels),
            priority=template["priority"],
            subject=template["subject"],
            messagebody=template["body"],
            relatedentitytype="RosterPeriod",
            relatedentityid=current_period.periodid,
            status=status,
            scheduledat=created_at,
            sentat=sent_at,
            readat=read_at,
            retrycount=0,
            createdat=created_at,
        )

    # Create at least 3 notifications for every nurse
    for nurse in nurses:
        existing_count = session.exec(
            select(NotificationQueue).where(
                NotificationQueue.recipientid == nurse.nurseid,
                NotificationQueue.recipienttype == "Nurse",
            )
        ).all()

        if len(existing_count) >= 3:
            continue

        num_notifications = fake.random_int(min=3, max=5)
        for i in range(num_notifications - len(existing_count)):
            template = nurse_templates[i % len(nurse_templates)]
            session.add(_make_notification("Nurse", nurse.nurseid, template))
            count += 1

    session.commit()
    logger.info(f"  Created {count} notifications for {len(nurses)} nurses")

    # Create at least 3 notifications for every manager
    manager_count = 0
    for manager in managers:
        existing_count = session.exec(
            select(NotificationQueue).where(
                NotificationQueue.recipientid == manager.managerid,
                NotificationQueue.recipienttype == "NurseManager",
            )
        ).all()

        if len(existing_count) >= 3:
            continue

        num_notifications = fake.random_int(min=3, max=5)
        for i in range(num_notifications - len(existing_count)):
            template = manager_templates[i % len(manager_templates)]
            session.add(_make_notification("NurseManager", manager.managerid, template))
            manager_count += 1

    session.commit()
    logger.info(f"  Created {manager_count} notifications for {len(managers)} managers")

    total = count + manager_count
    logger.info(f"  Total: {total} notifications created")
    return total


def seed_web_users(session: Session) -> int:
    """Create web_user entries for all RBAC users so they can login.

    This syncs RBACUser table with web_user table used for authentication.
    Uses the same email and password hash from RBAC users.
    """
    logger.info("Seeding web users (for login)...")
    count = 0

    # Get all RBAC users
    rbac_users = session.exec(select(RBACUser)).all()

    for rbac_user in rbac_users:
        # Check if web_user already exists with this email
        existing = session.exec(
            select(User).where(User.email == rbac_user.email)
        ).first()

        if existing:
            logger.info(f"  Web user '{rbac_user.email}' already exists, skipping")
            continue

        # Determine if user should be superuser (Admin role)
        is_superuser = rbac_user.email == "admin@sach.org.sg"

        web_user = User(
            email=rbac_user.email,
            hashed_password=rbac_user.passwordhash,
            is_active=rbac_user.isactive,
            is_superuser=is_superuser,
            full_name=rbac_user.username,
        )
        session.add(web_user)
        count += 1
        logger.info(f"  Created web user: {rbac_user.email}")

    session.commit()
    logger.info(f"  Created {count} web users")
    return count


def seed_ward_shiftcodes(session: Session, wards: list[Ward]) -> None:
    """Seed ward-specific shift code mappings.

    All wards are mapped to: D, N, A, P plus all leave codes (isworking=False).
    """
    logger.info("Seeding ward shift code mappings...")
    DEFAULT_BASE_WORKING = {"A", "P", "N"}
    SPECIAL_BASE_WORKING = {"D", "N-12", "N", "A", "P"}
    SPECIAL_WARD_IDS = {9, 10} #CH and TCF
    leave_codes = {
        sc["shiftcode"] for sc in SHIFT_CODES_DATA if not sc["isworking"]
    }

    for ward in wards:
        if ward.wardid in SPECIAL_WARD_IDS:
            base_working=SPECIAL_BASE_WORKING
        else:
            base_working=DEFAULT_BASE_WORKING
        
        ward_codes=base_working | leave_codes
        for shiftcode in sorted(ward_codes):
            existing = session.exec(
                select(WardShiftCode).where(
                    WardShiftCode.wardid == ward.wardid,
                    WardShiftCode.shiftcode == shiftcode,
                )
            ).first()

            if existing:
                logger.info(f"  Mapping {ward.wardname} -> {shiftcode} already exists, skipping")
            else:
                mapping = WardShiftCode(wardid=ward.wardid, shiftcode=shiftcode)
                session.add(mapping)
                logger.info(f"  Mapped {ward.wardname} -> {shiftcode}")

    session.commit()


def seed_all() -> None:
    """Run all seed functions."""
    logger.info("=" * 60)
    logger.info("Starting database seeding...")
    logger.info("=" * 60)

    with Session(engine) as session:
        # Seed in dependency order
        roles = seed_roles(session)
        seed_shift_codes(session)
        wards = seed_wards(session)
        seed_ward_shiftcodes(session, wards)
        managers = seed_managers(session, wards)
        nurses = seed_nurses(session, wards)

        # Create RBAC users
        seed_admin_user(session, roles)
        seed_manager_users(session, managers, wards, roles)
        seed_nurse_users(session, nurses, roles)

        # Create web_user entries for login
        seed_web_users(session)

        # Seed roster data
        periods = seed_roster_periods(session)
        seed_roster_entries(session, nurses, wards, periods, managers)

        # Seed shift requests (~20% of nurses, mixed statuses)
        seed_shift_requests(session, nurses, periods, managers)

        # Seed leave requests (~15% of nurses, leave-type shift codes)
        seed_leave_requests(session, nurses, periods, managers)

        # Seed notifications for all nurses and managers (at least 3 each)
        seed_notifications(session, nurses, periods, managers)

    logger.info("=" * 60)
    logger.info("Database seeding completed!")
    logger.info("=" * 60)
    logger.info("")
    logger.info("Test Credentials:")
    logger.info("  admin@sach.org.sg / changethis (Admin)")
    for mgr in MANAGERS_DATA:
        logger.info(f"  {mgr['email']} / manager123 (NurseManager)")
    for nurse in NURSES_DATA[:NUM_NURSE_USERS]:
        logger.info(f"  {nurse['email']} / nurse123 (Nurse)")
    logger.info("")


def main() -> None:
    seed_all()


if __name__ == "__main__":
    main()
