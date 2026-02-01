"""
Database seeding script for RBAC data.
Run: docker compose exec backend python app/seed_data.py

Uses Faker to generate realistic test data.
Configure the numbers below to control how much data is generated.
"""
import logging
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from faker import Faker
from sqlmodel import Session, select

from app.core.db import engine
from app.core.security import get_password_hash
from app.models import RBACUser, Nurse, NurseManager, Role, UserRole
from app.models import Ward, ShiftCode, RosterPeriod, Roster, ShiftRequest, LeaveRequest, NotificationQueue


# ============================================================================
# CONFIGURATION - Adjust these to control seed data volume
# ============================================================================
# NUM_WARDS is determined by WARDS_DATA (static list of real wards)
NUM_MANAGERS = 10  # 1 per ward (10 wards total)
NURSES_PER_WARD = 7  # Typical staffing: 2 RN, 3 EN/NA, 2 HCA per ward
NUM_NURSE_USERS = 5  # How many nurses get login accounts (for testing)
SEED = 42  # For reproducible fake data (set to None for random each time)

# ============================================================================
# Initialize Faker
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
    {"rolename": "Admin", "displayname": "Administrator"},
    {"rolename": "NurseManager", "displayname": "Nurse Manager"},
    {"rolename": "Nurse", "displayname": "Ward Staff Nurse"},
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
    {"wardname": "Ward 4", "wardtype": "Dementia", "location": "Simei"},
    {"wardname": "Ward 5", "wardtype": "Rehab", "location": "Simei"},
    {"wardname": "Ward 6", "wardtype": "Rehab", "location": "Simei"},
    {"wardname": "Ward 7", "wardtype": "Rehab", "location": "Simei"},
    {"wardname": "Ward 8", "wardtype": "Subacute", "location": "Simei"},
    {"wardname": "Ward 9", "wardtype": "Subacute", "location": "Simei"},
    {"wardname": "Ward 10", "wardtype": "Paying Class", "location": "Simei"},
    {"wardname": "Ward 11", "wardtype": "Palliative", "location": "Simei"},
    {"wardname": "CH", "wardtype": "Community Hospital", "location": "Bedok"},
    {"wardname": "TCF", "wardtype": "Transitional Care", "location": "Bedok"},
]


# ============================================================================
# Faker-based data generators
# ============================================================================


def generate_managers_data(num_managers: int) -> list[dict]:
    """Generate manager data using Faker."""
    managers = []
    for _ in range(num_managers):
        first = fake.first_name()
        last = fake.last_name()
        managers.append({
            "name": f"{first} {last}",
            "email": f"{first.lower()}.{last.lower()}@sach.com.sg",
            "contactnumber": fake.numerify("9#######"),
        })
    return managers


def generate_nurses_data(num_wards: int, nurses_per_ward: int) -> list[dict]:
    """Generate nurse data using Faker."""
    nurses = []
    for ward_idx in range(num_wards):
        for i in range(nurses_per_ward):
            first = fake.first_name()
            last = fake.last_name()
            designation = DESIGNATIONS[i % len(DESIGNATIONS)]
            nurses.append({
                "name": f"{first} {last}",
                "designation": designation,
                "email": f"{first.lower()}.{last.lower()}@sach.com.sg",
                "contactnumber": fake.numerify("9#######"),
                "ward_idx": ward_idx,
            })
    return nurses


# Generate the data (WARDS_DATA is static, defined above)
NUM_WARDS = len(WARDS_DATA)  # Override with actual ward count
MANAGERS_DATA = generate_managers_data(NUM_MANAGERS)
NURSES_DATA = generate_nurses_data(NUM_WARDS, NURSES_PER_WARD)


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

    for i, mgr_data in enumerate(MANAGERS_DATA):
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
            ward = wards[nurse_data["ward_idx"]]
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
        select(RBACUser).where(RBACUser.email == "admin@sach.com.sg")
    ).first()

    if existing:
        logger.info("  Admin user already exists, skipping")
        return existing

    admin = RBACUser(
        username="admin",
        email="admin@sach.com.sg",
        passwordhash=get_password_hash("admin123"),
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

    logger.info("  Created admin user: admin@sach.com.sg / admin123")
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

        # Assign Nurse role
        nurse_role = roles.get("Nurse")
        if nurse_role:
            user_role = UserRole(
                userid=user.userid,
                roleid=nurse_role.roleid,
                isactive=True,
                assignedat=datetime.now(timezone.utc),
            )
            session.add(user_role)
            session.commit()

        users.append(user)
        logger.info(f"  Created nurse user: {nurse.email} / nurse123")

    return users


def seed_roster_periods(session: Session) -> list[RosterPeriod]:
    """Seed roster periods (current and next 2-week periods).

    Period: Monday to Sunday (2 weeks = 14 days)
    Request open: Friday, 2 weeks before roster starts (start - 10 days)
    Request close: Friday, 1 week before roster starts (start - 3 days)
    """
    logger.info("Seeding roster periods...")
    periods = []

    today = date.today()
    # Start from Monday of current week
    current_monday = today - timedelta(days=today.weekday())

    for i, period_label in enumerate(["Current", "Next"]):
        # Period runs Monday to Sunday (14 days)
        start_date = current_monday + timedelta(weeks=i * 2)
        end_date = start_date + timedelta(days=13)  # Sunday of second week

        # Request open: Friday 2 weeks before (start - 10 days = Friday of that week)
        request_open = start_date - timedelta(days=10)
        # Request close: Friday 1 week before (start - 3 days = Friday before Monday)
        request_close = start_date - timedelta(days=3)

        period_name = f"{period_label} Period {start_date.strftime('%b %d')}-{end_date.strftime('%b %d %Y')}"

        existing = session.exec(
            select(RosterPeriod).where(RosterPeriod.startdate == start_date)
        ).first()

        if existing:
            logger.info(f"  Roster period {start_date} already exists, skipping")
            periods.append(existing)
            continue

        period = RosterPeriod(
            name=period_name,
            startdate=start_date,
            enddate=end_date,
            requestopendate=request_open,
            requestclosedate=request_close,
            status="RequestOpen" if i == 0 else "RequestOpen",
        )
        session.add(period)
        session.commit()
        session.refresh(period)
        periods.append(period)
        logger.info(f"  Created roster period: {period_name} (ID: {period.periodid})")

    return periods


def seed_roster_entries(
    session: Session,
    nurses: list[Nurse],
    wards: list[Ward],
    periods: list[RosterPeriod],
    managers: list[NurseManager],
) -> int:
    """Seed roster entries for all nurses in the current period.

    - Populates starttime/endtime from shift code defaults
    - Mix of Auto and Manual assignments
    - assignedby is set for Manual assignments (manager ID)
    """
    logger.info("Seeding roster entries...")

    if not periods:
        logger.warning("  No periods available, skipping roster entries")
        return 0

    current_period = periods[0]
    count = 0

    # Build shift code lookup for start/end times
    shift_codes_db = session.exec(select(ShiftCode)).all()
    shift_lookup = {sc.shiftcode: sc for sc in shift_codes_db}

    for nurse in nurses:
        ward = next((w for w in wards if w.wardid == nurse.wardid), None)
        if not ward:
            continue

        # Find manager for this ward (if any)
        ward_manager = managers[wards.index(ward)] if ward in wards and wards.index(ward) < len(managers) else None

        # Generate 14 days of shifts
        start_date = current_period.startdate

        for day_offset in range(14):
            shift_date = start_date + timedelta(days=day_offset)

            # Check if roster entry exists
            existing = session.exec(
                select(Roster).where(
                    Roster.nurseid == nurse.nurseid,
                    Roster.periodid == current_period.periodid,
                    Roster.shiftdate == shift_date,
                )
            ).first()

            if existing:
                continue

            # Simple rotation: D, D, N, N, DO, DO, D pattern
            shift_idx = day_offset % 7
            if shift_idx < 2:
                shift_code = "D"
            elif shift_idx < 4:
                shift_code = "N"
            elif shift_idx < 6:
                shift_code = "DO"
            else:
                shift_code = "D"

            # Get start/end times from shift code
            sc = shift_lookup.get(shift_code)
            start_time = sc.defaultstart if sc else None
            end_time = sc.defaultend if sc else None

            # Mix of Auto (70%) and Manual (30%) assignments
            is_manual = fake.random_int(min=1, max=10) <= 3
            assignment_method = "Manual" if is_manual else "Auto"
            assigned_by = ward_manager.managerid if is_manual and ward_manager else None

            roster = Roster(
                nurseid=nurse.nurseid,
                wardid=ward.wardid,
                periodid=current_period.periodid,
                shiftdate=shift_date,
                shiftcode=shift_code,
                starttime=start_time,
                endtime=end_time,
                status="Confirmed",
                assignmentmethod=assignment_method,
                assignedby=assigned_by,
            )
            session.add(roster)
            count += 1

        session.commit()

    logger.info(f"  Created {count} roster entries")
    return count


def seed_shift_requests(
    session: Session,
    nurses: list[Nurse],
    periods: list[RosterPeriod],
    managers: list[NurseManager],
) -> int:
    """Seed shift requests for nurses.

    - ~20% of nurses submit shift requests
    - Each nurse can submit up to 3 requests per period
    - Mixed statuses: Pending, Approved, Rejected
    - Working shifts only: D, N, A, P
    """
    logger.info("Seeding shift requests...")

    if not periods or not nurses:
        logger.warning("  No periods or nurses available, skipping shift requests")
        return 0

    current_period = periods[0]
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

    # Select ~20% of nurses to have shift requests
    num_nurses_with_requests = max(1, len(nurses) // 5)
    selected_nurses = fake.random_elements(nurses, length=num_nurses_with_requests, unique=True)

    for nurse in selected_nurses:
        # Check if requests already exist for this nurse/period
        existing = session.exec(
            select(ShiftRequest).where(
                ShiftRequest.nurseid == nurse.nurseid,
                ShiftRequest.periodid == current_period.periodid,
            )
        ).first()

        if existing:
            logger.info(f"  Shift requests for nurse {nurse.name} already exist, skipping")
            continue

        # Generate 1-3 requests per nurse
        num_requests = fake.random_int(min=1, max=3)

        for request_num in range(1, num_requests + 1):
            # Random date within the roster period
            days_in_period = (current_period.enddate - current_period.startdate).days
            random_day = fake.random_int(min=0, max=days_in_period)
            preferred_date = current_period.startdate + timedelta(days=random_day)

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
                periodid=current_period.periodid,
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
            count += 1

        session.commit()

    logger.info(f"  Created {count} shift requests for {len(selected_nurses)} nurses")
    return count


def seed_leave_requests(
    session: Session,
    nurses: list[Nurse],
    periods: list[RosterPeriod],
) -> int:
    """Seed leave requests for nurses using LeaveRequest model.

    Uses leave type codes (AL, MC, etc.).
    Only fills required columns.
    """
    logger.info("Seeding leave requests...")

    if not periods or not nurses:
        logger.warning("  No periods or nurses available, skipping leave requests")
        return 0

    current_period = periods[0]
    count = 0

    # Common leave types
    common_leaves = ["AL", "MC"]
    # All leave types (per updated chk_leavereq_type constraint)
    all_leaves = ["AL", "MC", "URG", "UPL", "CL", "CCL", "FCL", "BDL"]

    # Select ~15% of nurses to have leave requests
    num_nurses_with_leaves = max(1, len(nurses) * 15 // 100)
    selected_nurses = fake.random_elements(nurses, length=num_nurses_with_leaves, unique=True)

    for nurse in selected_nurses:
        # Check if leave requests already exist for this nurse
        existing = session.exec(
            select(LeaveRequest).where(
                LeaveRequest.nurseid == nurse.nurseid,
            )
        ).first()

        if existing:
            logger.info(f"  Leave requests for nurse {nurse.name} already exist, skipping")
            continue

        # Generate 1-2 leave requests per nurse
        num_requests = fake.random_int(min=1, max=2)

        for _ in range(num_requests):
            # Random start date within the roster period
            days_in_period = (current_period.enddate - current_period.startdate).days
            random_day = fake.random_int(min=0, max=days_in_period - 1)
            start_date = current_period.startdate + timedelta(days=random_day)
            # Leave duration: 1-3 days
            leave_duration = fake.random_int(min=1, max=3)
            end_date = min(start_date + timedelta(days=leave_duration - 1), current_period.enddate)

            # Weight towards common leave types (70% common, 30% any)
            if fake.random_int(min=1, max=10) <= 7:
                leave_type = fake.random_element(common_leaves)
            else:
                leave_type = fake.random_element(all_leaves)

            # Only required fields
            leave_request = LeaveRequest(
                nurseid=nurse.nurseid,
                startdate=start_date,
                enddate=end_date,
                leavetype=leave_type,
            )
            session.add(leave_request)
            count += 1

        session.commit()

    logger.info(f"  Created {count} leave requests for {len(selected_nurses)} nurses")
    return count


def seed_notifications(
    session: Session,
    nurses: list[Nurse],
    periods: list[RosterPeriod],
) -> int:
    """Seed notifications for ward staff using NotificationQueue.

    Notification types:
    - ShiftUpdate: Roster released, roster changes
    - SwapRequest: Shift swap notifications
    - LeaveApproval: Request approved/rejected
    - LeaveReminder: Request period reminders
    """
    logger.info("Seeding notifications...")

    if not periods or not nurses:
        logger.warning("  No periods or nurses available, skipping notifications")
        return 0

    current_period = periods[0]
    count = 0

    # Notification templates with subjects and message bodies
    notification_templates = [
        {
            "type": "ShiftUpdate",
            "subject": "Roster Released",
            "body": f"{current_period.startdate.strftime('%d %b')} - {current_period.enddate.strftime('%d %b')} Roster released.",
            "priority": "Normal",
        },
        {
            "type": "ShiftUpdate",
            "subject": "Roster Updated",
            "body": "Your roster has been updated. Please check your schedule.",
            "priority": "Normal",
        },
        {
            "type": "SwapRequest",
            "subject": "Shift Swap Approved",
            "body": "Your shift swap request has been approved.",
            "priority": "Normal",
        },
        {
            "type": "ShiftUpdate",
            "subject": "Roster Finalized",
            "body": "Roster finalized for the upcoming period.",
            "priority": "Normal",
        },
        {
            "type": "LeaveReminder",
            "subject": "Shift Request Period Open",
            "body": "Shift Request Period is Now Open. Submit your preferences.",
            "priority": "Normal",
        },
        {
            "type": "LeaveApproval",
            "subject": "Shift Request Approved",
            "body": "Your shift request has been approved.",
            "priority": "Normal",
        },
        {
            "type": "LeaveApproval",
            "subject": "Shift Request Rejected",
            "body": "Your shift request has been rejected. Please contact your manager.",
            "priority": "Normal",
        },
        {
            "type": "LeaveReminder",
            "subject": "Request Period Closing Soon",
            "body": f"Reminder: Request window closes on {current_period.requestclosedate.strftime('%d %b %Y')}.",
            "priority": "Urgent",
        },
    ]

    channels = ["WhatsApp", "Email", "Both"]

    # Create notifications for ~50% of ward staff (nurses)
    num_nurses_with_notifications = max(1, len(nurses) // 2)
    selected_nurses = fake.random_elements(nurses, length=num_nurses_with_notifications, unique=True)

    for nurse in selected_nurses:
        # Check if notifications already exist for this nurse
        existing = session.exec(
            select(NotificationQueue).where(
                NotificationQueue.recipientid == nurse.nurseid,
                NotificationQueue.recipienttype == "Nurse",
            )
        ).first()

        if existing:
            continue

        # Generate 1-3 notifications per nurse
        num_notifications = fake.random_int(min=1, max=3)

        for _ in range(num_notifications):
            template = fake.random_element(notification_templates)

            # Random date within last 7 days
            days_ago = fake.random_int(min=0, max=7)
            created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)

            # Determine status: ~33% Read, ~50% Sent, ~17% Pending
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

            notification = NotificationQueue(
                recipienttype="Nurse",
                recipientid=nurse.nurseid,
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
            session.add(notification)
            count += 1

    session.commit()
    logger.info(f"  Created {count} notifications for {len(selected_nurses)} ward staff")
    return count


def seed_all():
    """Run all seed functions."""
    logger.info("=" * 60)
    logger.info("Starting database seeding...")
    logger.info("=" * 60)

    with Session(engine) as session:
        # Seed in dependency order
        roles = seed_roles(session)
        seed_shift_codes(session)
        wards = seed_wards(session)
        managers = seed_managers(session, wards)
        nurses = seed_nurses(session, wards)

        # Create users
        seed_admin_user(session, roles)
        seed_manager_users(session, managers, wards, roles)
        seed_nurse_users(session, nurses, roles)

        # Seed roster data
        periods = seed_roster_periods(session)
        seed_roster_entries(session, nurses, wards, periods, managers)

        # Seed shift requests (~20% of nurses, mixed statuses)
        seed_shift_requests(session, nurses, periods, managers)

        # Seed leave requests (~15% of nurses, leave-type shift codes)
        seed_leave_requests(session, nurses, periods)

        # Seed notifications for ward staff (~50% of nurses)
        seed_notifications(session, nurses, periods)

    logger.info("=" * 60)
    logger.info("Database seeding completed!")
    logger.info("=" * 60)
    logger.info("")
    logger.info("Test Credentials:")
    logger.info("  admin@sach.com.sg / admin123 (Admin)")
    for mgr in MANAGERS_DATA:
        logger.info(f"  {mgr['email']} / manager123 (NurseManager)")
    for nurse in NURSES_DATA[:NUM_NURSE_USERS]:
        logger.info(f"  {nurse['email']} / nurse123 (Nurse)")
    logger.info("")


def main():
    seed_all()


if __name__ == "__main__":
    main()
