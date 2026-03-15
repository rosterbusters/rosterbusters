"""
Database seeding script for RBAC data.
Run: docker compose exec backend python app/seed_data.py

Uses hardcoded mock data for managers and nurses to guarantee consistency
across all tables (nurse, nursemanager, RBACUser, userrole).
"""
import logging
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from faker import Faker
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.core.security import get_password_hash
from app.models import RBACUser, Nurse, NurseManager, Role, UserRole
from app.models import Ward, ShiftCode, WardShiftCode, RosterPeriod, Roster, ShiftRequest, LeaveRequest, NotificationQueue
from app.models.enums import NotificationType
# from app.models.web import User


# ============================================================================
# CONFIGURATION - Adjust these to control seed data volume
# ============================================================================
NUM_NURSE_USERS = 70  # All nurses get login accounts (7 per ward × 10 wards)
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
# Hardcoded manager & nurse data (1 manager per ward, 7 nurses per ward)
# ============================================================================
NUM_WARDS = len(WARDS_DATA)

MANAGERS_DATA = [
    {"name": "Lim Wei Ling",     "email": "lim.weiling@sach.org.sg",      "contactnumber": "91234501", "ward_idx": 0},
    {"name": "Tan Siew Bee",     "email": "tan.siewbee@sach.org.sg",      "contactnumber": "91234502", "ward_idx": 1},
    {"name": "Ng Ai Hua",        "email": "ng.aihua@sach.org.sg",         "contactnumber": "91234503", "ward_idx": 2},
    {"name": "Wong Mei Fong",    "email": "wong.meifong@sach.org.sg",     "contactnumber": "91234504", "ward_idx": 3},
    {"name": "Chua Shu Min",     "email": "chua.shumin@sach.org.sg",      "contactnumber": "91234505", "ward_idx": 4},
    {"name": "Koh Pei Shan",     "email": "koh.peishan@sach.org.sg",      "contactnumber": "91234506", "ward_idx": 5},
    {"name": "Lee Hui Ling",     "email": "lee.huiling@sach.org.sg",      "contactnumber": "91234507", "ward_idx": 6},
    {"name": "Ong Siew Lan",     "email": "ong.siewlan@sach.org.sg",      "contactnumber": "91234508", "ward_idx": 7},
    {"name": "Ahmad Ismail",     "email": "ahmad.ismail@sach.org.sg",     "contactnumber": "91234509", "ward_idx": 8},
    {"name": "Priya Nair",       "email": "priya.nair@sach.org.sg",       "contactnumber": "91234510", "ward_idx": 9},
]

# 70 nurses: 7 per ward × 10 wards
# Designations cycle: RN, EN, NA, HCA, SSN, RN, EN
NURSES_DATA = [
    # Ward 0 — Ward 4 (Dementia, Simei)
    {"name": "Chan Mei Yin",      "designation": "RN",  "email": "chan.meiyin@sach.org.sg",       "contactnumber": "98001001", "ward_idx": 0},
    {"name": "Teo Boon Kiat",     "designation": "EN",  "email": "teo.boonkiat@sach.org.sg",      "contactnumber": "98001002", "ward_idx": 0},
    {"name": "Siti Aminah",       "designation": "NA",  "email": "siti.aminah@sach.org.sg",       "contactnumber": "98001003", "ward_idx": 0},
    {"name": "Raj Kumar",         "designation": "HCA", "email": "raj.kumar@sach.org.sg",         "contactnumber": "98001004", "ward_idx": 0},
    {"name": "Loh Yee Mun",      "designation": "SSN", "email": "loh.yeemun@sach.org.sg",        "contactnumber": "98001005", "ward_idx": 0},
    {"name": "Goh Sze Wei",      "designation": "RN",  "email": "goh.szewei@sach.org.sg",        "contactnumber": "98001006", "ward_idx": 0},
    {"name": "Nurul Huda",       "designation": "EN",  "email": "nurul.huda@sach.org.sg",        "contactnumber": "98001007", "ward_idx": 0},
    # Ward 1 — Ward 5 (Rehab, Simei)
    {"name": "Yeo Jia Hui",      "designation": "RN",  "email": "yeo.jiahui@sach.org.sg",        "contactnumber": "98002001", "ward_idx": 1},
    {"name": "Lim Chee Keong",   "designation": "EN",  "email": "lim.cheekeong@sach.org.sg",     "contactnumber": "98002002", "ward_idx": 1},
    {"name": "Fatimah Zahra",    "designation": "NA",  "email": "fatimah.zahra@sach.org.sg",     "contactnumber": "98002003", "ward_idx": 1},
    {"name": "Deepa Pillai",     "designation": "HCA", "email": "deepa.pillai@sach.org.sg",      "contactnumber": "98002004", "ward_idx": 1},
    {"name": "Ho Kok Wai",       "designation": "SSN", "email": "ho.kokwai@sach.org.sg",         "contactnumber": "98002005", "ward_idx": 1},
    {"name": "Tan Li Wen",       "designation": "RN",  "email": "tan.liwen@sach.org.sg",         "contactnumber": "98002006", "ward_idx": 1},
    {"name": "Aisha Begum",      "designation": "EN",  "email": "aisha.begum@sach.org.sg",       "contactnumber": "98002007", "ward_idx": 1},
    # Ward 2 — Ward 6 (Rehab, Simei)
    {"name": "Pang Swee Lian",   "designation": "RN",  "email": "pang.sweelian@sach.org.sg",     "contactnumber": "98003001", "ward_idx": 2},
    {"name": "Chia Beng Hock",   "designation": "EN",  "email": "chia.benghock@sach.org.sg",     "contactnumber": "98003002", "ward_idx": 2},
    {"name": "Noor Aisyah",      "designation": "NA",  "email": "noor.aisyah@sach.org.sg",       "contactnumber": "98003003", "ward_idx": 2},
    {"name": "Suresh Menon",     "designation": "HCA", "email": "suresh.menon@sach.org.sg",      "contactnumber": "98003004", "ward_idx": 2},
    {"name": "Sim Bee Hoon",     "designation": "SSN", "email": "sim.beehoon@sach.org.sg",       "contactnumber": "98003005", "ward_idx": 2},
    {"name": "Wee Cheng Yang",   "designation": "RN",  "email": "wee.chengyang@sach.org.sg",     "contactnumber": "98003006", "ward_idx": 2},
    {"name": "Zurina Mohd",      "designation": "EN",  "email": "zurina.mohd@sach.org.sg",       "contactnumber": "98003007", "ward_idx": 2},
    # Ward 3 — Ward 7 (Rehab, Simei)
    {"name": "Tay Sock Hwa",     "designation": "RN",  "email": "tay.sockhwa@sach.org.sg",       "contactnumber": "98004001", "ward_idx": 3},
    {"name": "Kang Wei Ming",    "designation": "EN",  "email": "kang.weiming@sach.org.sg",      "contactnumber": "98004002", "ward_idx": 3},
    {"name": "Haslinda Yusof",   "designation": "NA",  "email": "haslinda.yusof@sach.org.sg",    "contactnumber": "98004003", "ward_idx": 3},
    {"name": "Anand Rajan",      "designation": "HCA", "email": "anand.rajan@sach.org.sg",       "contactnumber": "98004004", "ward_idx": 3},
    {"name": "Foo Siew Peng",    "designation": "SSN", "email": "foo.siewpeng@sach.org.sg",      "contactnumber": "98004005", "ward_idx": 3},
    {"name": "Cheng Xiu Ying",   "designation": "RN",  "email": "cheng.xiuying@sach.org.sg",     "contactnumber": "98004006", "ward_idx": 3},
    {"name": "Rozita Ibrahim",   "designation": "EN",  "email": "rozita.ibrahim@sach.org.sg",    "contactnumber": "98004007", "ward_idx": 3},
    # Ward 4 — Ward 8 (Subacute, Simei)
    {"name": "Yap Mei Lin",      "designation": "RN",  "email": "yap.meilin@sach.org.sg",        "contactnumber": "98005001", "ward_idx": 4},
    {"name": "Seah Kok Leong",   "designation": "EN",  "email": "seah.kokleong@sach.org.sg",     "contactnumber": "98005002", "ward_idx": 4},
    {"name": "Norhayati Ali",    "designation": "NA",  "email": "norhayati.ali@sach.org.sg",     "contactnumber": "98005003", "ward_idx": 4},
    {"name": "Ganesh Sundaram",  "designation": "HCA", "email": "ganesh.sundaram@sach.org.sg",   "contactnumber": "98005004", "ward_idx": 4},
    {"name": "Quek Hwee Ling",   "designation": "SSN", "email": "quek.hweeling@sach.org.sg",     "contactnumber": "98005005", "ward_idx": 4},
    {"name": "Lau Chun Wai",     "designation": "RN",  "email": "lau.chunwai@sach.org.sg",       "contactnumber": "98005006", "ward_idx": 4},
    {"name": "Mariam Hassan",    "designation": "EN",  "email": "mariam.hassan@sach.org.sg",     "contactnumber": "98005007", "ward_idx": 4},
    # Ward 5 — Ward 9 (Subacute, Simei)
    {"name": "Phang Sok Yee",    "designation": "RN",  "email": "phang.sokyee@sach.org.sg",      "contactnumber": "98006001", "ward_idx": 5},
    {"name": "Ong Boon Huat",    "designation": "EN",  "email": "ong.boonhuat@sach.org.sg",      "contactnumber": "98006002", "ward_idx": 5},
    {"name": "Rohani Wahab",     "designation": "NA",  "email": "rohani.wahab@sach.org.sg",      "contactnumber": "98006003", "ward_idx": 5},
    {"name": "Vivek Sharma",     "designation": "HCA", "email": "vivek.sharma@sach.org.sg",      "contactnumber": "98006004", "ward_idx": 5},
    {"name": "Soh Bee Kee",      "designation": "SSN", "email": "soh.beekee@sach.org.sg",        "contactnumber": "98006005", "ward_idx": 5},
    {"name": "Chin Yen Nee",     "designation": "RN",  "email": "chin.yennee@sach.org.sg",       "contactnumber": "98006006", "ward_idx": 5},
    {"name": "Salma Osman",      "designation": "EN",  "email": "salma.osman@sach.org.sg",       "contactnumber": "98006007", "ward_idx": 5},
    # Ward 6 — Ward 10 (Paying Class, Simei)
    {"name": "Khoo Mei Fen",     "designation": "RN",  "email": "khoo.meifen@sach.org.sg",       "contactnumber": "98007001", "ward_idx": 6},
    {"name": "Heng Chee Seng",   "designation": "EN",  "email": "heng.cheeseng@sach.org.sg",     "contactnumber": "98007002", "ward_idx": 6},
    {"name": "Zainab Kadir",     "designation": "NA",  "email": "zainab.kadir@sach.org.sg",      "contactnumber": "98007003", "ward_idx": 6},
    {"name": "Lakshmi Devi",     "designation": "HCA", "email": "lakshmi.devi@sach.org.sg",      "contactnumber": "98007004", "ward_idx": 6},
    {"name": "Neo Kim Huat",     "designation": "SSN", "email": "neo.kimhuat@sach.org.sg",       "contactnumber": "98007005", "ward_idx": 6},
    {"name": "Fong Yoke Leng",   "designation": "RN",  "email": "fong.yokeleng@sach.org.sg",     "contactnumber": "98007006", "ward_idx": 6},
    {"name": "Kartini Razak",    "designation": "EN",  "email": "kartini.razak@sach.org.sg",     "contactnumber": "98007007", "ward_idx": 6},
    # Ward 7 — Ward 11 (Palliative, Simei)
    {"name": "Chew Soo Khim",    "designation": "RN",  "email": "chew.sookhim@sach.org.sg",      "contactnumber": "98008001", "ward_idx": 7},
    {"name": "Leong Wai Kuan",   "designation": "EN",  "email": "leong.waikuan@sach.org.sg",     "contactnumber": "98008002", "ward_idx": 7},
    {"name": "Rahmah Yusoff",    "designation": "NA",  "email": "rahmah.yusoff@sach.org.sg",     "contactnumber": "98008003", "ward_idx": 7},
    {"name": "Mohan Das",        "designation": "HCA", "email": "mohan.das@sach.org.sg",         "contactnumber": "98008004", "ward_idx": 7},
    {"name": "Ang Bee Lian",     "designation": "SSN", "email": "ang.beelian@sach.org.sg",       "contactnumber": "98008005", "ward_idx": 7},
    {"name": "Kwek Siew Hong",   "designation": "RN",  "email": "kwek.siewhong@sach.org.sg",     "contactnumber": "98008006", "ward_idx": 7},
    {"name": "Hafizah Latif",    "designation": "EN",  "email": "hafizah.latif@sach.org.sg",     "contactnumber": "98008007", "ward_idx": 7},
    # Ward 8 — CH (Community Hospital, Bedok)
    {"name": "Png Geok Tin",     "designation": "RN",  "email": "png.geoktin@sach.org.sg",       "contactnumber": "98009001", "ward_idx": 8},
    {"name": "Toh Choon Heng",   "designation": "EN",  "email": "toh.choonheng@sach.org.sg",     "contactnumber": "98009002", "ward_idx": 8},
    {"name": "Salmah Johari",    "designation": "NA",  "email": "salmah.johari@sach.org.sg",     "contactnumber": "98009003", "ward_idx": 8},
    {"name": "Kavitha Raju",     "designation": "HCA", "email": "kavitha.raju@sach.org.sg",      "contactnumber": "98009004", "ward_idx": 8},
    {"name": "Low Kah Seng",     "designation": "SSN", "email": "low.kahseng@sach.org.sg",       "contactnumber": "98009005", "ward_idx": 8},
    {"name": "Yeoh Li Ping",     "designation": "RN",  "email": "yeoh.liping@sach.org.sg",       "contactnumber": "98009006", "ward_idx": 8},
    {"name": "Faridah Omar",     "designation": "EN",  "email": "faridah.omar@sach.org.sg",      "contactnumber": "98009007", "ward_idx": 8},
    # Ward 9 — TCF (Transitional Care, Bedok)
    {"name": "Sia Geok Choo",    "designation": "RN",  "email": "sia.geokchoo@sach.org.sg",      "contactnumber": "98010001", "ward_idx": 9},
    {"name": "Beh Teck Soon",    "designation": "EN",  "email": "beh.tecksoon@sach.org.sg",      "contactnumber": "98010002", "ward_idx": 9},
    {"name": "Norma Samad",      "designation": "NA",  "email": "norma.samad@sach.org.sg",       "contactnumber": "98010003", "ward_idx": 9},
    {"name": "Srinivas Rao",     "designation": "HCA", "email": "srinivas.rao@sach.org.sg",      "contactnumber": "98010004", "ward_idx": 9},
    {"name": "Tan Geok Bee",     "designation": "SSN", "email": "tan.geokbee@sach.org.sg",       "contactnumber": "98010005", "ward_idx": 9},
    {"name": "Koh Li Hua",       "designation": "RN",  "email": "koh.lihua@sach.org.sg",         "contactnumber": "98010006", "ward_idx": 9},
    {"name": "Azizah Hamid",     "designation": "EN",  "email": "azizah.hamid@sach.org.sg",      "contactnumber": "98010007", "ward_idx": 9},
]


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


def seed_managers(session: Session, wards: list[Ward]) -> list[NurseManager]:
    """Seed nurse managers and return list of created NurseManager objects."""
    logger.info("Seeding nurse managers...")
    managers = []

    for mgr_data in MANAGERS_DATA:
        existing = session.exec(
            select(NurseManager).where(NurseManager.email == mgr_data["email"])
        ).first()

        if existing:
            logger.info(f"  Manager '{mgr_data['name']}' already exists, skipping")
            manager = existing
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
            logger.info(f"  Created manager: {mgr_data['name']} (ID: {manager.managerid})")

        ward_idx = int(mgr_data["ward_idx"])
        if ward_idx < len(wards):
            ward = wards[ward_idx]
            if ward.managerid != manager.managerid:
                ward.managerid = manager.managerid
                session.add(ward)
                session.commit()
                session.refresh(ward)
                logger.info(
                    f"  Assigned manager {mgr_data['name']} to ward {ward.wardname} (ID: {ward.wardid})"
                )

        managers.append(manager)

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
        select(RBACUser).where(
            (RBACUser.email == settings.FIRST_SUPERUSER)
            | (RBACUser.username == settings.FIRST_SUPERUSER.split("@")[0])
        )
    ).first()

    if existing:
        logger.info("  Admin user already exists, updating credentials to seed values")
        existing.username = settings.FIRST_SUPERUSER.split("@")[0]
        existing.email = settings.FIRST_SUPERUSER
        existing.passwordhash = get_password_hash(settings.FIRST_SUPERUSER_PASSWORD)
        existing.isactive = True
        session.commit()
        session.refresh(existing)
        return existing

    admin = RBACUser(
        username=settings.FIRST_SUPERUSER.split("@")[0],
        email=settings.FIRST_SUPERUSER,
        passwordhash=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
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

    logger.info(
        f"  Created admin user: {settings.FIRST_SUPERUSER} / "
        f"{settings.FIRST_SUPERUSER_PASSWORD}"
    )
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

    manager_seed_by_email = {mgr["email"]: mgr for mgr in MANAGERS_DATA}

    for manager in managers:
        existing = session.exec(
            select(RBACUser).where(RBACUser.email == manager.email)
        ).first()

        if existing:
            user = existing
            logger.info(f"  Manager user '{manager.email}' already exists, syncing assignment")
        else:
            username = manager.email.split("@")[0]

            existing_by_username = session.exec(
                select(RBACUser).where(RBACUser.username == username)
            ).first()

            if existing_by_username:
                user = existing_by_username
                logger.info(f"  Manager username '{username}' already exists, syncing assignment")
            else:
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
                logger.info(f"  Created manager user: {manager.email} / manager123")

        user.username = manager.email.split("@")[0]
        user.email = manager.email
        user.managerid = manager.managerid
        user.isactive = True
        session.add(user)
        session.commit()
        session.refresh(user)

        # Assign NurseManager role with ward assignment
        manager_role = roles.get("NurseManager")
        manager_seed = manager_seed_by_email.get(manager.email)
        ward_idx = int(manager_seed["ward_idx"]) if manager_seed else None
        if manager_role and ward_idx is not None and ward_idx < len(wards):
            existing_user_role = session.exec(
                select(UserRole).where(
                    UserRole.userid == user.userid,
                    UserRole.roleid == manager_role.roleid,
                    UserRole.wardid == wards[ward_idx].wardid,
                )
            ).first()
            if not existing_user_role:
                user_role = UserRole(
                    userid=user.userid,
                    roleid=manager_role.roleid,
                    wardid=wards[ward_idx].wardid,
                    isactive=True,
                    assignedat=datetime.now(timezone.utc),
                )
                session.add(user_role)
                session.commit()
            else:
                existing_user_role.isactive = True
                session.add(existing_user_role)
                session.commit()

        users.append(user)

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

    # 14-day realistic patterns derived from ga_ward6.json mock data.
    # Each pattern tiles across the full date range per nurse.
    ROSTER_PATTERNS = [
        ["A","P","DO","N","N","DO","A","N","N","DO","A","DO","P","P"],
        ["A","N","N","DO","DO","A","P","P","DO","N","N","DO","P","P"],
        ["DO","N","DO","P","P","A","P","N","DO","N","DO","A","A","P"],
        ["DO","N","DO","P","P","A","N","DO","N","DO","P","A","A","A"],
        ["P","A","DO","A","DO","A","N","N","DO","A","A","P","DO","P"],
        ["N","DO","A","A","A","P","DO","A","A","A","DO","N","DO","N"],
        ["N","DO","P","P","A","P","DO","DO","P","P","N","DO","A","A"],
        ["DO","A","A","A","DO","N","N","DO","A","P","A","A","A","DO"],
        ["A","P","A","N","N","DO","DO","DO","N","DO","A","P","A","A"],
        ["A","A","N","DO","N","DO","P","DO","P","A","N","N","DO","A"],
        ["P","A","DO","P","N","N","DO","A","A","A","DO","P","N","DO"],
        ["P","P","A","P","DO","N","DO","P","DO","DO","P","P","A","N"],
        ["N","DO","P","A","A","DO","A","DO","P","P","A","P","N","DO"],
        ["N","N","DO","A","A","P","DO","P","N","DO","DO","A","P","A"],
        ["P","P","N","DO","P","DO","P","A","A","P","A","DO","N","DO"],
        ["A","N","DO","P","DO","A","A","P","A","P","DO","DO","A","N"],
        ["A","A","N","DO","P","P","DO","A","P","DO","P","N","DO","P"],
        ["N","DO","P","A","A","DO","A","P","A","N","DO","P","P","DO"],
        ["DO","N","N","DO","A","A","A","N","DO","A","P","N","DO","P"],
        ["N","DO","P","A","A","DO","A","P","N","N","DO","A","DO","A"],
        ["DO","A","P","P","N","N","DO","A","P","P","P","DO","N","DO"],
        ["P","A","DO","N","DO","P","N","N","DO","A","DO","P","A","A"],
        ["P","DO","A","N","DO","A","A","N","DO","DO","P","P","P","A"],
        ["DO","A","P","N","N","DO","P","A","N","DO","P","N","DO","A"],
        ["A","DO","A","N","DO","A","P","P","DO","N","DO","A","A","P"],
        ["P","DO","A","A","N","DO","P","N","N","DO","P","DO","P","A"],
        ["DO","A","A","A","P","DO","N","DO","P","A","P","A","N","DO"],
        ["DO","A","N","DO","P","P","N","DO","A","A","P","N","DO","N"],
        ["A","N","N","DO","A","A","DO","N","DO","N","DO","A","P","A"],
        ["DO","N","DO","A","A","A","P","A","A","P","N","DO","DO","A"],
        ["P","A","DO","P","N","DO","N","DO","A","P","A","N","N","DO"],
    ]

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

            pattern = ROSTER_PATTERNS[nurse_idx % len(ROSTER_PATTERNS)]
            shift_code = pattern[day_offset % len(pattern)]
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
    return count  # Changed from: return roster


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

    Uses NotificationType enum values so every seeded row has a valid type.
    Every nurse and nurse manager receives at least 3 notifications.
    """
    logger.info("Seeding notifications...")

    if not periods or not nurses:
        logger.warning("  No periods or nurses available, skipping notifications")
        return 0

    current_period = periods[0]
    count = 0

    channels = ["WhatsApp", "Email", "Both"]

    period_name = current_period.name
    close_date = str(current_period.requestclosedate)
    end_date = str(current_period.enddate)

    # Get a random recent shift to use for SHIFT_UPDATED template
    recent_rosters = session.exec(
        select(Roster).where(
            Roster.periodid == current_period.periodid
        ).limit(10)
    ).all()
    
    # Format the shift date properly - use strftime for consistent date format
    if recent_rosters:
        recent_shift_date = recent_rosters[0].shiftdate.strftime("%Y-%m-%d")
    else:
        recent_shift_date = date.today().strftime("%Y-%m-%d")

    # Each entry: (NotificationType, template_vars_dict, priority)
    nurse_templates: list[tuple[NotificationType, dict, str]] = [
        (NotificationType.ROSTER_RELEASE,              {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_REQUEST_PERIOD_OPEN,   {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_REQUEST_APPROVED,      {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_REQUEST_REJECTED,      {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_REQUEST_PERIOD_CLOSED, {"roster_period": period_name},          "Urgent"),
        (NotificationType.ROSTER_RELEASE,              {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_REQUEST_APPROVED,      {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_REQUEST_PERIOD_OPEN,   {"roster_period": period_name},          "Normal"),
        (NotificationType.SHIFT_UPDATED,               {"start_date": recent_shift_date},       "Normal"),
    ]
    
    manager_templates: list[tuple[NotificationType, dict, str]] = [
        (NotificationType.ROSTER_PLANNING,         {"roster_period": period_name},                                              "Normal"),
        (NotificationType.SHIFT_REQUEST_REVIEW_OPEN, {"roster_period": period_name},                                           "Normal"),
        (NotificationType.ROSTER_FINALISATION,     {"roster_planning_end_date": close_date},                                   "Normal"),
        (NotificationType.LEAVE_REQUEST,           {"nurse_name": "Ward Staff", "leave_code": "AL", "request_date": close_date}, "Urgent"),
        (NotificationType.ROSTER_FINALISATION,     {"roster_planning_end_date": close_date},                                   "Urgent"),
        (NotificationType.HRIS_REMINDER,           {"roster_end_date": end_date},                                              "Normal"),
    ]

    def _make_notification(recipient_type: str, recipient_id: int, template: tuple) -> NotificationQueue:
        ntype, tvars, priority = template
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
            notificationtype=ntype.value,
            channel=fake.random_element(channels),
            priority=priority,
            subject=ntype.value,
            messagebody=ntype.template.format(**tvars),
            relatedentitytype="RosterPeriod",
            relatedentityid=current_period.periodid,
            status=status,
            scheduledat=created_at,
            sentat=sent_at,
            readat=read_at,
            retrycount=0,
            createdat=created_at,
        )

    # Create one notification per template for every nurse
    for nurse in nurses:
        existing_count = session.exec(
            select(NotificationQueue).where(
                NotificationQueue.recipientid == nurse.nurseid,
                NotificationQueue.recipienttype == "Nurse",
            )
        ).all()

        if len(existing_count) >= len(nurse_templates):
            continue

        for i in range(len(existing_count), len(nurse_templates)):
            template = nurse_templates[i]
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


def seed_ward_shiftcodes(session: Session, wards: list[Ward]) -> None:
    """Seed ward-specific shift code mappings.

    All wards are mapped to: D, N, A, P plus all leave codes (isworking=False).
    """
    logger.info("Seeding ward shift code mappings...")
    DEFAULT_BASE_WORKING = {"A", "P", "N"}
    SPECIAL_BASE_WORKING = {"D", "N-12", "N", "A", "P"}
    SPECIAL_WARD_IDS = {16, 17} #CH and TCF
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
        # Admin bootstrap is handled separately by app/seed_admin.py or app/initial_data.py
        seed_manager_users(session, managers, wards, roles)
        seed_nurse_users(session, nurses, roles)

        # Seed roster data
        periods = seed_roster_periods(session)
        rosters=seed_roster_entries(session, nurses, wards, periods, managers)

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
