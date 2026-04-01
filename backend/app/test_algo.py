"""
Seed shift requests for a ward so the algorithm can be triggered from the frontend.

Modes:
  - deterministic: uses nurse IDs (no randomness) to create 1-2 requests each
  - hardcoded: seeds the sample request list into a given ward/period
  - anonymized: creates a test ward with "Nurse 1..N" and seeds requests into the upcoming period

Usage:
    docker compose exec backend python app/test_algo.py --ward-id 1 --mode deterministic
    docker compose exec backend python app/test_algo.py --ward-id 1 --mode hardcoded
    docker compose exec backend python app/test_algo.py --mode anonymized
"""
import argparse
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.core.security import get_password_hash
from app.models import RBACUser, Role, UserRole
from app.models.rbac import Nurse, NurseManager
from app.models.roster import RosterPeriod, Ward
from app.models.leave import LeaveRequest
from app.models.shifts import ShiftCode, ShiftRequest, WardShiftCode
from app.services.roster_period_service import ensure_roster_period_window, get_period_window


@dataclass(frozen=True)
class RequestSeed:
    name: str
    date: date
    code: str
    request_type: str  # "shift_request" | "leave_request"


@dataclass(frozen=True)
class NurseSeed:
    source_id: int
    anonymized_name: str
    designation: str


APRIL_ACTIVE_NURSES: list[NurseSeed] = [
    NurseSeed(7, "Nurse 1", "SNR ENROLLED NURSE I"),
    NurseSeed(8, "Nurse 2", "SNR STAFF NURSE II"),
    NurseSeed(9, "Nurse 3", "SNR STAFF NURSE II"),
    NurseSeed(10, "Nurse 4", "HEALTHCARE ASST III"),
    NurseSeed(11, "Nurse 5", "SNR STAFF NURSE I"),
    NurseSeed(12, "Nurse 6", "SNR STAFF NURSE I"),
    NurseSeed(13, "Nurse 7", "STAFF NURSE II"),
    NurseSeed(14, "Nurse 8", "HEALTHCARE ASST I"),
    NurseSeed(15, "Nurse 9", "HEALTHCARE ASST III"),
    NurseSeed(16, "Nurse 10", "STAFF NURSE I"),
    NurseSeed(17, "Nurse 11", "STAFF NURSE I"),
    NurseSeed(18, "Nurse 12", "ENROLLED NURSE II"),
    NurseSeed(19, "Nurse 13", "HEALTHCARE ASST I"),
    NurseSeed(20, "Nurse 14", "NURSING AIDE I"),
    NurseSeed(21, "Nurse 15", "ENROLLED NURSE I"),
    NurseSeed(22, "Nurse 16", "NURSING AIDE II"),
    NurseSeed(23, "Nurse 17", "NURSING AIDE II"),
    NurseSeed(24, "Nurse 18", "HEALTHCARE ASST III"),
    NurseSeed(25, "Nurse 19", "HEALTHCARE ASST III"),
    NurseSeed(26, "Nurse 20", "STAFF NURSE II"),
    NurseSeed(27, "Nurse 21", "STAFF NURSE II"),
    NurseSeed(28, "Nurse 22", "STAFF NURSE I"),
    NurseSeed(29, "Nurse 23", "ENROLLED NURSE II"),
    NurseSeed(33, "Nurse 24", "NURSING AIDE II"),
    NurseSeed(34, "Nurse 25", "ENROLLED NURSE II"),
    NurseSeed(35, "Nurse 26", "Staff Nurse"),
    NurseSeed(36, "Nurse 27", "Staff Nurse"),
    NurseSeed(37, "Nurse 28", "Staff Nurse"),
    NurseSeed(38, "Nurse 29", "Staff Nurse"),
    NurseSeed(40, "Nurse 30", "Staff Nurse II"),
    NurseSeed(41, "Nurse 31", "Staff Nurse II"),
]

APRIL_ANON_NAME_BY_SOURCE_ID = {
    nurse.source_id: nurse.anonymized_name for nurse in APRIL_ACTIVE_NURSES
}


# Hardcoded, anonymized April seed list based on the provided Ward 6 data.
# Only active nurses are represented; inactive or missing source rows are omitted.
HARDCODED_REQUESTS: list[RequestSeed] = [
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 6), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 7), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 8), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 9), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 10), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 11), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 12), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 13), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 14), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 15), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 16), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 17), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 18), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 19), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[11], date(2026, 4, 20), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 6), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 7), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 8), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 9), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 10), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 11), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 12), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 13), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 14), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 15), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 16), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 17), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 18), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 19), "AL", "leave_request"),
    RequestSeed(APRIL_ANON_NAME_BY_SOURCE_ID[34], date(2026, 4, 20), "AL", "leave_request"),
]

TEST_MANAGER_USERNAME = "manager"
TEST_MANAGER_EMAIL = "manager@example.com"
TEST_MANAGER_PASSWORD = "manager123"


def generate_request_seeds(ward_ids: list[int], strain: str = "baseline") -> list[RequestSeed]:
    """
    Placeholder generator for future use.
    For now, returns the hardcoded sample list above.
    """
    _ = ward_ids, strain
    return HARDCODED_REQUESTS


def _normalize_name(value: str) -> str:
    return " ".join(value.upper().split())


def _normalize_shift_request_code(code: str) -> str:
    upper = code.strip().upper()
    if upper.endswith("_R") or upper.endswith("-R"):
        return upper[:-2]
    return upper


ANON_DESIGNATIONS: dict[str, str] = {
    nurse.anonymized_name: nurse.designation for nurse in APRIL_ACTIVE_NURSES
}


def _shift_to_upcoming_period(
    req: RequestSeed, base_start: date, period: RosterPeriod
) -> RequestSeed | None:
    offset = (req.date - base_start).days
    new_date = period.startdate + timedelta(days=offset)
    if new_date < period.startdate or new_date > period.enddate:
        return None
    return RequestSeed(req.name, new_date, req.code, req.request_type)


def _ensure_shift_codes(db: Session, codes: set[str]) -> None:
    existing = {row.shiftcode for row in db.exec(select(ShiftCode)).all()}
    for code in sorted(codes):
        if code in existing:
            continue
        is_working = code in {"A", "P", "N"}
        db.add(
            ShiftCode(
                shiftcode=code,
                description=f"Seeded {code}",
                isworking=is_working,
            )
        )

def _get_or_create_role(db: Session, role_name: str, display_name: str) -> Role:
    role = db.exec(select(Role).where(Role.rolename == role_name)).first()
    if role:
        return role
    role = Role(rolename=role_name, displayname=display_name, isactive=True)
    db.add(role)
    db.flush()
    return role


def _ensure_test_manager(db: Session, ward: Ward | None = None) -> NurseManager:
    manager = db.exec(
        select(NurseManager).where(NurseManager.email == TEST_MANAGER_EMAIL)
    ).first()
    if not manager:
        manager = NurseManager(
            name=TEST_MANAGER_USERNAME,
            employeeid="TEST-MANAGER",
            email=TEST_MANAGER_EMAIL,
            contactnumber="00000000",
            isactive=True,
            createdat=datetime.now(timezone.utc),
        )
        db.add(manager)
        db.flush()

    user = db.exec(select(RBACUser).where(RBACUser.email == TEST_MANAGER_EMAIL)).first()
    if not user:
        user = RBACUser(
            username=TEST_MANAGER_USERNAME,
            email=TEST_MANAGER_EMAIL,
            passwordhash=get_password_hash(TEST_MANAGER_PASSWORD),
            managerid=manager.managerid,
            isactive=True,
            createdat=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
    else:
        user.passwordhash = get_password_hash(TEST_MANAGER_PASSWORD)
        user.managerid = manager.managerid
        user.isactive = True
        db.add(user)

    role = _get_or_create_role(db, "NurseManager", "Nurse Manager")
    ward_id = ward.wardid if ward else None
    existing_role = db.exec(
        select(UserRole).where(
            UserRole.userid == user.userid,
            UserRole.roleid == role.roleid,
            UserRole.wardid == ward_id,
        )
    ).first()
    if not existing_role:
        db.add(
            UserRole(
                userid=user.userid,
                roleid=role.roleid,
                wardid=ward_id,
                isactive=True,
            )
        )

    if ward and ward.managerid is None:
        ward.managerid = manager.managerid
        db.add(ward)

    db.flush()
    return manager


WARD_6_REQUIREMENTS = {
    "am_total": 7,
    "am_rn": 2,
    "am_en_na_min": 4,
    "am_en_na_max": 5,
    "am_hca_min": 1,
    "am_hca_max": 2,
    "pm_total": 7,
    "pm_rn": 2,
    "pm_en_na_min": 2,
    "pm_en_na_max": 5,
    "pm_hca_min": 0,
    "pm_hca_max": 2,
    "nd_total": 4,
    "nd_rn": 2,
    "nd_en_na_min": 1,
    "nd_en_na_max": 2,
    "nd_hca_min": 0,
    "nd_hca_max": 1,
}


def _apply_ward_requirements(ward: Ward, requirements: dict[str, int]) -> None:
    for field_name, value in requirements.items():
        setattr(ward, field_name, value)


def seed_test_ward_with_anonymized_requests(
    db: Session,
    ward_name: str = "Test Ward Requests",
) -> int:
    """
    Seed a test ward with anonymized nurses (Nurse 1, Nurse 2, ...)
    matching the designation counts implied by the hardcoded requests list,
    then seed leave/shift requests into the upcoming roster period.
    """
    periods = ensure_roster_period_window(db)
    current_period, upcoming_period, _ = get_period_window(periods)
    period = upcoming_period or current_period
    if not period:
        raise SystemExit("No current or upcoming roster period found.")

    ward = db.exec(select(Ward).where(Ward.wardname == ward_name)).first()
    if not ward:
        ward = Ward(wardname=ward_name, wardtype="Test", location="Seeded")
        db.add(ward)
        db.flush()
    _apply_ward_requirements(ward, WARD_6_REQUIREMENTS)
    db.add(ward)
    _ensure_test_manager(db, ward)

    unique_names = sorted(ANON_DESIGNATIONS.keys())

    existing_nurses = db.exec(
        select(Nurse).where(Nurse.wardid == ward.wardid)
    ).all()
    existing_by_name = {n.name: n for n in existing_nurses}

    for anonymized in unique_names:
        if anonymized in existing_by_name:
            continue
        designation = ANON_DESIGNATIONS.get(anonymized, "STAFF NURSE")
        db.add(
            Nurse(
                name=anonymized,
                employeeid=f"TEST-{anonymized.split()[-1]}",
                designation=designation,
                email=f"{anonymized.replace(' ', '').lower()}@example.com",
                contactnumber="00000000",
                wardid=ward.wardid,
                employmenttype="FullTime",
                isactive=True,
            )
        )

    db.flush()

    # Ensure shift codes and ward shift codes exist for shift_request entries.
    # Leave types (AL, MC, HOL, …) are not shift codes. Modifier suffixes (-R/_R) are
    # normalized away so the base code (A, P, DO, …) is what gets seeded.
    # If a request uses a non-leave code, seed it as a shift code.
    allowed_leave_types = {
        "AL",
        "MC",
        "CCL",
        "ML",
        "EML",
        "Mar",
        "FCL",
        "SPL",
        "CL",
        "BDL",
        "HOL",
        "SD",
        "FD",
    }
    codes = {
        _normalize_shift_request_code(req.code)
        for req in HARDCODED_REQUESTS
        if req.request_type == "shift_request" or req.code not in allowed_leave_types
    } | {"A", "P", "N"}
    _ensure_shift_codes(db, codes)

    existing_wsc = {
        row.shiftcode
        for row in db.exec(select(WardShiftCode).where(WardShiftCode.wardid == ward.wardid)).all()
    }
    for code in sorted(codes - existing_wsc):
        db.add(WardShiftCode(wardid=ward.wardid, shiftcode=code))

    # Seed requests mapped to upcoming period dates
    base_start = min(req.date for req in HARDCODED_REQUESTS)
    nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    nurse_by_name = {n.name: n for n in nurses}

    created = 0
    for req in HARDCODED_REQUESTS:
        shifted = _shift_to_upcoming_period(req, base_start, period)
        if not shifted:
            continue
        nurse = nurse_by_name.get(req.name)
        if not nurse:
            continue

        allowed_leave_types = {
            "AL",
            "MC",
            "CCL",
            "ML",
            "EML",
            "Mar",
            "FCL",
            "SPL",
            "CL",
            "BDL",
            "HOL",
            "SD",
            "FD",
        }
        if shifted.request_type == "leave_request" and shifted.code in allowed_leave_types:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == shifted.date,
                    LeaveRequest.enddate == shifted.date,
                    LeaveRequest.leavetype == shifted.code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=shifted.date,
                    enddate=shifted.date,
                    leavetype=shifted.code,
                    leavecategory="PreApproved",
                    submittedduringperiod="BeforeRoster",
                    status="Approved",
                    impactsroster=True,
                )
            )
            created += 1
        else:
            # Treat PH/other non-leave codes as shift requests (non-working codes map to OFF).
            normalized_code = _normalize_shift_request_code(shifted.code)
            existing = db.exec(
                select(ShiftRequest).where(
                    ShiftRequest.nurseid == nurse.nurseid,
                    ShiftRequest.periodid == period.periodid,
                    ShiftRequest.preferreddate == shifted.date,
                )
            ).first()
            if existing:
                continue
            db.add(
                ShiftRequest(
                    nurseid=nurse.nurseid,
                    periodid=period.periodid,
                    preferreddate=shifted.date,
                    preferredshifttype=normalized_code,
                    requestnumber=1,
                    status="Pending",
                    timestamp=datetime.now(timezone.utc),
                )
            )
            created += 1

    db.commit()
    print(f"\n✓ Seeded ward '{ward.wardname}' (id={ward.wardid}) with anonymized requests.")
    return created


def seed_requests_from_list(
    db: Session, ward_id: int, period: RosterPeriod, request_seeds: list[RequestSeed]
) -> int:
    ward = db.get(Ward, ward_id)
    if not ward:
        raise SystemExit(f"Ward {ward_id} not found.")
    _ensure_test_manager(db, ward)

    nurses = db.exec(
        select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
    ).all()
    if not nurses:
        raise SystemExit(f"No active nurses in ward {ward_id}.")

    nurse_by_name = {_normalize_name(n.name): n for n in nurses}
    ward_shift_code_strs = {
        wsc.shiftcode
        for wsc in db.exec(
            select(WardShiftCode).where(WardShiftCode.wardid == ward_id)
        ).all()
    }

    allowed_leave_types = {
        "AL",
        "MC",
        "CCL",
        "ML",
        "EML",
        "Mar",
        "FCL",
        "SPL",
        "CL",
        "BDL",
        "HOL",
        "SD",
        "FD",
    }

    created = 0
    for req in request_seeds:
        nurse = nurse_by_name.get(_normalize_name(req.name))
        if not nurse:
            print(f"  ! Skip: nurse not found in ward {ward_id}: {req.name}")
            continue
        if not (period.startdate <= req.date <= period.enddate):
            print(f"  ! Skip: date out of period: {req.date} ({req.name})")
            continue

        if req.request_type == "leave_request" and req.code in allowed_leave_types:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == req.date,
                    LeaveRequest.enddate == req.date,
                    LeaveRequest.leavetype == req.code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=req.date,
                    enddate=req.date,
                    leavetype=req.code,
                    leavecategory="PreApproved",
                    submittedduringperiod="BeforeRoster",
                    status="Approved",
                    impactsroster=True,
                )
            )
        else:
            normalized_code = _normalize_shift_request_code(req.code)
            if normalized_code not in ward_shift_code_strs:
                print(f"  ! Skip: shift code not in ward {ward_id}: {req.code} ({req.name})")
                continue
            existing = db.exec(
                select(ShiftRequest).where(
                    ShiftRequest.nurseid == nurse.nurseid,
                    ShiftRequest.periodid == period.periodid,
                    ShiftRequest.preferreddate == req.date,
                )
            ).first()
            if existing:
                continue
            db.add(
                ShiftRequest(
                    nurseid=nurse.nurseid,
                    periodid=period.periodid,
                    preferreddate=req.date,
                    preferredshifttype=normalized_code,
                    requestnumber=1,
                    status="Pending",
                    timestamp=datetime.now(timezone.utc),
                )
            )
        created += 1
    return created


def seed_requests(db: Session, ward_id: int) -> None:
    ward = db.get(Ward, ward_id)
    if not ward:
        raise SystemExit(f"Ward {ward_id} not found.")
    _ensure_test_manager(db, ward)

    periods = ensure_roster_period_window(db)
    current_period, upcoming_period, _ = get_period_window(periods)
    period = upcoming_period or current_period
    if not period:
        raise SystemExit("No current or upcoming roster period found.")

    nurses = sorted(
        db.exec(
            select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
        ).all(),
        key=lambda n: n.nurseid,
    )
    if not nurses:
        raise SystemExit(f"No active nurses in ward {ward_id}.")

    ward_shift_code_strs = [
        wsc.shiftcode
        for wsc in db.exec(
            select(WardShiftCode).where(WardShiftCode.wardid == ward_id)
        ).all()
    ]
    if not ward_shift_code_strs:
        raise SystemExit(f"No shift codes configured for ward {ward_id} in ward_shiftcode.")

    # Only A/P/N map to algo working shifts — all other isworking codes collapse to OFF
    ALGO_WORKING = {"A", "P", "N"}
    working_shifts = sorted(ALGO_WORKING & set(ward_shift_code_strs))
    shift_codes = db.exec(
        select(ShiftCode).where(ShiftCode.shiftcode.in_(ward_shift_code_strs))
    ).all()
    off_shifts = sorted([sc.shiftcode for sc in shift_codes if not sc.isworking])

    if not working_shifts:
        raise SystemExit(f"No algo-compatible shift codes (A/P/N) configured for ward {ward_id}.")
    if not off_shifts:
        raise SystemExit(f"No off/non-working shift codes configured for ward {ward_id}.")

    num_days = (period.enddate - period.startdate).days + 1
    n_off = max(1, round(len(nurses) * 0.1))
    # Nurses with the lowest IDs are the "off" group — fixed, not random
    off_nurse_ids = {n.nurseid for n in nurses[:n_off]}

    print(f"\nWard:    {ward.wardname} (id={ward_id})")
    print(f"Period:  {period.startdate} → {period.enddate}  ({num_days} days, id={period.periodid})")
    print(f"Nurses:  {len(nurses)}  ({n_off} off, {len(nurses) - n_off} working)")
    print()

    def add_request(nurse_id: int, req_num: int, day_idx: int, shift: str) -> bool:
        preferred_date = period.startdate + timedelta(days=day_idx)
        existing = db.exec(
            select(ShiftRequest).where(
                ShiftRequest.nurseid == nurse_id,
                ShiftRequest.periodid == period.periodid,
                ShiftRequest.preferreddate == preferred_date,
            )
        ).first()
        if existing:
            return False
        db.add(ShiftRequest(
            nurseid=nurse_id,
            periodid=period.periodid,
            preferreddate=preferred_date,
            preferredshifttype=shift,
            requestnumber=req_num,
            status="Pending",
            timestamp=datetime.now(timezone.utc),
        ))
        return True

    created = 0
    for nurse in nurses:
        nid = nurse.nurseid
        nurse_created = 0

        if nid in off_nurse_ids:
            # Day and shift derived from nurse ID — fully deterministic
            day_idx = nid % num_days
            shift = off_shifts[nid % len(off_shifts)]
            if add_request(nid, 1, day_idx, shift):
                nurse_created += 1
        else:
            # Two distinct days spaced apart, shift derived from nurse ID
            day1 = nid % num_days
            day2 = (nid + num_days // 2) % num_days
            if day1 == day2:
                day2 = (day1 + 1) % num_days
            for req_num, day_idx in enumerate(sorted([day1, day2]), start=1):
                shift = working_shifts[(nid + req_num) % len(working_shifts)]
                if add_request(nid, req_num, day_idx, shift):
                    nurse_created += 1

        created += nurse_created
        label = "off" if nid in off_nurse_ids else "working"
        print(f"  {nurse.name:<30} [{label}]  {nurse_created} request(s)")

    db.commit()
    print(f"\n✓ {created} requests saved — go trigger the algorithm from the frontend.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed shift requests for a ward.")
    parser.add_argument("--ward-id", type=int)
    parser.add_argument(
        "--mode",
        type=str,
        default="deterministic",
        choices=["deterministic", "hardcoded", "anonymized"],
        help="Use deterministic seed logic, hardcoded sample requests, or anonymized test ward seeding.",
    )
    args = parser.parse_args()

    with Session(engine) as db:
        if args.mode == "hardcoded":
            if args.ward_id is None:
                raise SystemExit("--ward-id is required for mode=hardcoded.")
            periods = ensure_roster_period_window(db)
            current_period, upcoming_period, _ = get_period_window(periods)
            period = upcoming_period or current_period
            if not period:
                raise SystemExit("No current or upcoming roster period found.")
            requests = generate_request_seeds([args.ward_id])
            created = seed_requests_from_list(db, args.ward_id, period, requests)
            db.commit()
            print(f"\n✓ {created} hardcoded requests saved — go trigger the algorithm from the frontend.")
        elif args.mode == "anonymized":
            created = seed_test_ward_with_anonymized_requests(db)
            print(f"✓ {created} anonymized requests saved.")
        else:
            if args.ward_id is None:
                raise SystemExit("--ward-id is required for mode=deterministic.")
            seed_requests(db, args.ward_id)


if __name__ == "__main__":
    main()
