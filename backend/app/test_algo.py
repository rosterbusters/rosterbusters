"""
Seed shift requests for a ward so the algorithm can be triggered from the frontend.

Modes:
  - deterministic: uses nurse IDs (no randomness) to create 1-2 requests each
  - hardcoded: seeds the sample request list into a given ward/period
  - anonymized: creates a test ward with "Nurse 1..N" and seeds requests into the upcoming period
  - anonymized-feasible: same as anonymized, but with added EN/SEN manpower sized for MILP feasibility
  - anonymized-apr-2026: seeds the Apr 2026 preview data onto the period that is upcoming from today
  - anonymized-apr-2026-12hr: seeds the Apr 2026 12-hour preview data onto the period that is upcoming from today
  - anonymized-apr-may-2026: seeds the Apr 20 - May 03 2026 preview data onto the period that is upcoming from today

Usage:
    docker compose exec backend python app/test_algo.py --ward-id 1 --mode deterministic
    docker compose exec backend python app/test_algo.py --ward-id 1 --mode hardcoded
    docker compose exec backend python app/test_algo.py --mode anonymized
    docker compose exec backend python app/test_algo.py --mode anonymized-feasible
    docker compose exec backend python app/test_algo.py --mode anonymized-apr-2026
    docker compose exec backend python app/test_algo.py --mode anonymized-apr-2026-12hr
    docker compose exec backend python app/test_algo.py --mode anonymized-apr-may-2026
"""
import argparse
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, inspect
from sqlmodel import Session, select

from app.core.db import engine
from app.core.security import get_password_hash
from app.models import RBACUser, Role, UserRole
from app.models.rbac import Nurse, NurseManager
from app.models.roster import NursePeriodConstraint, Roster, RosterPeriod, Ward
from app.models.leave import LeaveRequest
from app.models.shifts import ShiftCode, ShiftRequest, WardShiftCode
from app.services.roster_period_service import ensure_roster_period_window, get_period_window


@dataclass(frozen=True)
class RequestSeed:
    name: str
    date: date
    code: str
    request_type: str  # "shift_request" | "leave_request"
    status: str = "Pending"


# Hardcoded, anonymized seed list (no real names).
# This is the target output location for future generation functions as well.
HARDCODED_REQUESTS: list[RequestSeed] = [
    # EN (3)
    RequestSeed("Nurse 11", date(2026, 4, 1), "DO", "shift_request"),
    RequestSeed("Nurse 12", date(2026, 3, 29), "P", "shift_request"),
    RequestSeed("Nurse 13", date(2026, 3, 30), "AL", "leave_request"),
    RequestSeed("Nurse 13", date(2026, 3, 31), "AL", "leave_request"),
    RequestSeed("Nurse 13", date(2026, 4, 1), "AL", "leave_request"),
    RequestSeed("Nurse 13", date(2026, 4, 2), "AL", "leave_request"),
    RequestSeed("Nurse 13", date(2026, 4, 3), "AL", "leave_request"),
    # HCA12 (1)
    RequestSeed("Nurse 27", date(2026, 4, 3), "DO", "shift_request"),
    # HCA3 (3)
    RequestSeed("Nurse 21", date(2026, 3, 25), "HOL", "leave_request"),
    RequestSeed("Nurse 22", date(2026, 3, 28), "HOL", "leave_request"),
    RequestSeed("Nurse 23", date(2026, 4, 1), "AL", "leave_request"),
    RequestSeed("Nurse 23", date(2026, 4, 2), "AL", "leave_request"),
    RequestSeed("Nurse 23", date(2026, 4, 3), "AL", "leave_request"),
    RequestSeed("Nurse 23", date(2026, 4, 4), "AL", "leave_request"),
    RequestSeed("Nurse 23", date(2026, 4, 5), "AL", "leave_request"),
    # NA (2)
    RequestSeed("Nurse 16", date(2026, 3, 23), "AL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 3, 24), "AL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 3, 25), "AL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 3, 26), "AL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 3, 27), "AL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 3, 30), "AL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 3, 31), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 3, 25), "A", "shift_request"),
    # RN (8)
    RequestSeed("Mary", date(2026, 3, 30), "AL", "leave_request"),
    RequestSeed("Mary", date(2026, 3, 31), "AL", "leave_request"),
    RequestSeed("Mary", date(2026, 4, 1), "AL", "leave_request"),
    RequestSeed("Mary", date(2026, 4, 2), "AL", "leave_request"),
    RequestSeed("Mary", date(2026, 4, 3), "AL", "leave_request"),
    RequestSeed("Nurse 2", date(2026, 3, 23), "AL", "leave_request"),
    RequestSeed("Nurse 2", date(2026, 3, 24), "AL", "leave_request"),
    RequestSeed("Nurse 3", date(2026, 4, 2), "P", "shift_request"),
    RequestSeed("Nurse 4", date(2026, 3, 25), "AL", "leave_request"),
    RequestSeed("Nurse 4", date(2026, 3, 26), "AL", "leave_request"),
    RequestSeed("Nurse 4", date(2026, 3, 27), "AL", "leave_request"),
    RequestSeed("Nurse 4", date(2026, 3, 30), "AL", "leave_request"),
    RequestSeed("Nurse 4", date(2026, 3, 31), "AL", "leave_request"),
    RequestSeed("Nurse 5", date(2026, 4, 2), "P", "shift_request"),
    RequestSeed("Nurse 6", date(2026, 3, 26), "A", "shift_request"),
    RequestSeed("Nurse 7", date(2026, 3, 27), "A", "shift_request"),
    RequestSeed("Nurse 8", date(2026, 3, 28), "A", "shift_request"),
    RequestSeed("Nurse 9", date(2026, 4, 1), "AL", "leave_request"),
    RequestSeed("Nurse 9", date(2026, 4, 2), "AL", "leave_request"),
    RequestSeed("Nurse 9", date(2026, 4, 3), "HOL", "leave_request"),
]


APR_2026_WARD_6_REQUESTS: list[RequestSeed] = [
    RequestSeed("Nurse 12", date(2026, 4, 11), "A", "shift_request", "Approved"),
    RequestSeed("Nurse 14", date(2026, 4, 18), "N", "shift_request", "Approved"),
    RequestSeed("Nurse 14", date(2026, 4, 19), "N", "shift_request", "Approved"),
    RequestSeed("Nurse 18", date(2026, 4, 14), "P", "shift_request", "Approved"),
    RequestSeed("Nurse 20", date(2026, 4, 17), "A", "shift_request", "Approved"),
    RequestSeed("Nurse 20", date(2026, 4, 18), "N", "shift_request", "Approved"),
    RequestSeed("Nurse 20", date(2026, 4, 19), "N", "shift_request", "Approved"),
    RequestSeed("Nurse 28", date(2026, 4, 15), "A", "shift_request", "Approved"),
    RequestSeed("Nurse 29", date(2026, 4, 6), "P", "shift_request", "Approved"),
    RequestSeed("Nurse 36", date(2026, 4, 12), "N", "shift_request", "Approved"),
    RequestSeed("Nurse 37", date(2026, 4, 16), "N", "shift_request", "Approved"),
    RequestSeed("Nurse 8", date(2026, 4, 13), "P", "shift_request", "Pending"),
    RequestSeed("Nurse 12", date(2026, 4, 12), "A", "shift_request", "Pending"),
    RequestSeed("Nurse 12", date(2026, 4, 13), "A", "shift_request", "Pending"),
    RequestSeed("Nurse 18", date(2026, 4, 10), "A", "shift_request", "Pending"),
    RequestSeed("Nurse 19", date(2026, 4, 10), "A", "shift_request", "Pending"),
    RequestSeed("Nurse 19", date(2026, 4, 12), "N", "shift_request", "Pending"),
    RequestSeed("Nurse 19", date(2026, 4, 13), "N", "shift_request", "Pending"),
    RequestSeed("Nurse 26", date(2026, 4, 6), "P", "shift_request", "Pending"),
    RequestSeed("Nurse 26", date(2026, 4, 10), "N", "shift_request", "Pending"),
    RequestSeed("Nurse 27", date(2026, 4, 8), "N", "shift_request", "Pending"),
    RequestSeed("Nurse 28", date(2026, 4, 12), "A", "shift_request", "Pending"),
    RequestSeed("Nurse 29", date(2026, 4, 7), "P", "shift_request", "Pending"),
    RequestSeed("Nurse 29", date(2026, 4, 8), "A", "shift_request", "Pending"),
    RequestSeed("Nurse 36", date(2026, 4, 11), "N", "shift_request", "Pending"),
    RequestSeed("Nurse 36", date(2026, 4, 14), "P", "shift_request", "Pending"),
    # One Class A nurse on AL for the entire period.
    RequestSeed("Nurse 13", date(2026, 4, 6), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 7), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 8), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 9), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 10), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 11), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 12), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 13), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 14), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 15), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 16), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 17), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 18), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 13", date(2026, 4, 19), "AL", "leave_request", "Approved"),
    # One Class B nurse on AL for the entire period.
    RequestSeed("Nurse 21", date(2026, 4, 6), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 7), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 8), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 9), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 10), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 11), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 12), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 13), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 14), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 15), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 16), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 17), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 18), "AL", "leave_request", "Approved"),
    RequestSeed("Nurse 21", date(2026, 4, 19), "AL", "leave_request", "Approved"),
]


APR_2026_12HR_WARD_REQUESTS: list[RequestSeed] = [
    # Derived from the anonymized Apr 06 - Apr 19 2026 12-hour preview tab.
    RequestSeed("Nurse 1", date(2026, 4, 11), "DO", "shift_request"),
    RequestSeed("Nurse 1", date(2026, 4, 17), "N-12", "shift_request"),
    RequestSeed("Nurse 2", date(2026, 4, 10), "A-12", "shift_request"),
    RequestSeed("Nurse 2", date(2026, 4, 15), "DO", "shift_request"),
    RequestSeed("Nurse 3", date(2026, 4, 10), "DO", "shift_request"),
    RequestSeed("Nurse 3", date(2026, 4, 11), "PH4", "leave_request"),
    RequestSeed("Nurse 3", date(2026, 4, 12), "RD", "shift_request"),
    RequestSeed("Nurse 4", date(2026, 4, 11), "RD", "shift_request"),
    RequestSeed("Nurse 4", date(2026, 4, 12), "A-12", "shift_request"),
    RequestSeed("Nurse 5", date(2026, 4, 12), "N-12", "shift_request"),
    RequestSeed("Nurse 5", date(2026, 4, 19), "RD", "shift_request"),
    RequestSeed("Nurse 6", date(2026, 4, 15), "DO", "shift_request"),
    RequestSeed("Nurse 7", date(2026, 4, 12), "DO", "shift_request"),
    RequestSeed("Nurse 8", date(2026, 4, 9), "DO", "shift_request"),
    RequestSeed("Nurse 8", date(2026, 4, 10), "RD", "shift_request"),
    RequestSeed("Nurse 8", date(2026, 4, 11), "N-12", "shift_request"),
    RequestSeed("Nurse 9", date(2026, 4, 18), "DO", "shift_request"),
    RequestSeed("Nurse 10", date(2026, 4, 14), "DO", "shift_request"),
    RequestSeed("Nurse 10", date(2026, 4, 15), "RD", "shift_request"),
    RequestSeed("Nurse 11", date(2026, 4, 9), "AL", "leave_request"),
    RequestSeed("Nurse 11", date(2026, 4, 10), "DO", "shift_request"),
    RequestSeed("Nurse 11", date(2026, 4, 11), "DO", "shift_request"),
    RequestSeed("Nurse 12", date(2026, 4, 7), "INHT", "leave_request"),
    RequestSeed("Nurse 12", date(2026, 4, 8), "ITE", "leave_request"),
    RequestSeed("Nurse 13", date(2026, 4, 15), "DO", "shift_request"),
    RequestSeed("Nurse 13", date(2026, 4, 14), "A-12", "shift_request"),
    RequestSeed("Nurse 13", date(2026, 4, 16), "RD", "shift_request"),
    RequestSeed("Nurse 14", date(2026, 4, 11), "DO", "shift_request"),
    RequestSeed("Nurse 14", date(2026, 4, 12), "RD", "shift_request"),
    RequestSeed("Nurse 14", date(2026, 4, 17), "N-12", "shift_request"),
    RequestSeed("Nurse 14", date(2026, 4, 18), "N-12", "shift_request"),
    RequestSeed("Nurse 15", date(2026, 4, 8), "HOL", "leave_request"),
    RequestSeed("Nurse 15", date(2026, 4, 9), "BDL", "leave_request"),
    RequestSeed("Nurse 16", date(2026, 4, 10), "DO", "shift_request"),
    RequestSeed("Nurse 17", date(2026, 4, 11), "DO", "shift_request"),
    RequestSeed("Nurse 17", date(2026, 4, 14), "RD", "shift_request"),
    RequestSeed("Nurse 18", date(2026, 4, 15), "DO", "shift_request"),
    RequestSeed("Nurse 18", date(2026, 4, 18), "RD", "shift_request"),
    RequestSeed("Nurse 19", date(2026, 4, 10), "DO", "shift_request"),
    RequestSeed("Nurse 19", date(2026, 4, 15), "RD", "shift_request"),
    RequestSeed("Nurse 20", date(2026, 4, 11), "DO", "shift_request"),
]


APR_MAY_2026_WARD_6_REQUESTS: list[RequestSeed] = [
    RequestSeed("Nurse 17", date(2026, 4, 20), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 21), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 22), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 23), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 24), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 27), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 28), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 29), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 4, 30), "AL", "leave_request"),
    RequestSeed("Nurse 17", date(2026, 5, 1), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 20), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 21), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 22), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 23), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 24), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 27), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 28), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 29), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 30), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 5, 1), "AL", "leave_request"),
    RequestSeed("Nurse 34", date(2026, 4, 25), "OFF", "shift_request", "Approved"),
    RequestSeed("Nurse 34", date(2026, 4, 26), "OFF", "shift_request", "Approved"),
    RequestSeed("Nurse 36", date(2026, 4, 25), "OFF", "shift_request", "Pending"),
]

TEST_MANAGER_USERNAME = "testmanager"
TEST_MANAGER_EMAIL = "testmanager@example.com"
TEST_MANAGER_PASSWORD = "manager123"
TEST_NURSE_USERNAME = "nurse1"
TEST_NURSE_NAME = "Mary"
TEST_NURSE_PASSWORD = "nurse123"


def generate_request_seeds(ward_ids: list[int], strain: str = "baseline") -> list[RequestSeed]:
    """
    Placeholder generator for future use.
    For now, returns the hardcoded sample list above.
    """
    _ = ward_ids, strain
    return HARDCODED_REQUESTS


def _normalize_name(value: str) -> str:
    return " ".join(value.upper().split())


def _nurse_sort_key(value: str) -> tuple[int, str]:
    try:
        return (int(value.split()[-1]), value)
    except (IndexError, ValueError):
        return (10**9, value)


def _normalize_shift_request_code(code: str) -> str:
    upper = code.strip().upper()
    if upper.endswith("_R") or upper.endswith("-R"):
        return upper[:-2]
    return upper


def _normalize_leave_request_code(code: str) -> str | None:
    upper = code.strip().upper()
    if upper.startswith("PH"):
        return "HOL"

    allowed_leave_types = {
        "AL",
        "MC",
        "CCL",
        "ML",
        "EML",
        "MAR",
        "FCL",
        "SPL",
        "CL",
        "BDL",
        "HOL",
        "SD",
        "FD",
    }
    if upper in allowed_leave_types:
        return "Mar" if upper == "MAR" else upper

    return None


def _prepare_shift_request_seed_state(
    db: Session, period_id: int, nurse_ids: list[int]
) -> tuple[set[tuple[int, date]], dict[int, set[int]]]:
    if not nurse_ids:
        return set(), {}

    existing_requests = list(
        db.exec(
            select(ShiftRequest).where(
                ShiftRequest.periodid == period_id,
                ShiftRequest.nurseid.in_(nurse_ids),
            )
        ).all()
    )
    existing_dates = {(req.nurseid, req.preferreddate) for req in existing_requests}
    used_numbers_by_nurse: dict[int, set[int]] = {}
    for req in existing_requests:
        used_numbers_by_nurse.setdefault(req.nurseid, set()).add(req.requestnumber)
    return existing_dates, used_numbers_by_nurse


def _claim_shift_request_number(
    used_numbers_by_nurse: dict[int, set[int]], nurse_id: int
) -> int:
    used_numbers = used_numbers_by_nurse.setdefault(nurse_id, set())
    next_number = next(
        number for number in range(1, len(used_numbers) + 2) if number not in used_numbers
    )
    used_numbers.add(next_number)
    return next_number


ANON_DESIGNATIONS: dict[str, str] = {
    # Matches Ward 06 distribution from ward6stafflist.xlsx (omit nurse manager/clinician).
    # Occupation counts mapped to designation codes:
    # SN: 10 (Staff Nurse I/II + CEN Listing Staff Nurse x4),
    # SSN: 4 (Snr Staff Nurse I/II),
    # EN: 4 (Enrolled Nurse I/II), SEN: 1 (Snr Enrolled Nurse I),
    # NA: 4 (Nursing Aide I/II), HCA1: 2 (Healthcare Asst I),
    # HCA3: 6 (Healthcare Asst III). PSA excluded per request.
    "Mary": "SN",
    "Nurse 2": "SN",
    "Nurse 3": "SN",
    "Nurse 4": "SN",
    "Nurse 5": "SN",
    "Nurse 6": "SN",
    "Nurse 7": "SN",
    "Nurse 8": "SN",
    "Nurse 9": "SN",
    "Nurse 10": "SN",
    "Nurse 11": "SSN",
    "Nurse 12": "SSN",
    "Nurse 13": "SSN",
    "Nurse 14": "SSN",
    "Nurse 15": "EN",
    "Nurse 16": "EN",
    "Nurse 17": "EN",
    "Nurse 18": "EN",
    "Nurse 19": "SEN",
    "Nurse 20": "NA",
    "Nurse 21": "NA",
    "Nurse 22": "NA",
    "Nurse 23": "NA",
    "Nurse 24": "HCA1",
    "Nurse 25": "HCA1",
    "Nurse 26": "HCA3",
    "Nurse 27": "HCA3",
    "Nurse 28": "HCA3",
    "Nurse 29": "HCA3",
    "Nurse 30": "HCA3",
    "Nurse 31": "HCA3",
}


FEASIBLE_ANON_DESIGNATIONS: dict[str, str] = {
    **ANON_DESIGNATIONS,
    # The original anonymized seed only provides 5 EN/SEN nurses, while the
    # current Ward 6 minima require 7 B-rank assignments per day. These
    # additional EN/SEN staff lift the ward into MILP-feasible territory while
    # preserving the same hardcoded request mix.
    "Nurse 32": "EN",
    "Nurse 33": "EN",
    "Nurse 34": "EN",
    "Nurse 35": "EN",
    "Nurse 36": "SEN",
    "Nurse 37": "SEN",
}


FEASIBLE_REQUESTS: list[RequestSeed] = [
    # Keep a representative mix of shift preferences.
    RequestSeed("Nurse 11", date(2026, 4, 1), "DO", "shift_request"),
    RequestSeed("Nurse 12", date(2026, 3, 29), "P", "shift_request"),
    RequestSeed("Nurse 27", date(2026, 4, 3), "DO", "shift_request"),
    RequestSeed("Nurse 17", date(2026, 3, 25), "A", "shift_request"),
    RequestSeed("Nurse 3", date(2026, 4, 2), "P", "shift_request"),
    RequestSeed("Nurse 5", date(2026, 4, 2), "P", "shift_request"),
    RequestSeed("Nurse 6", date(2026, 3, 26), "A", "shift_request"),
    RequestSeed("Nurse 7", date(2026, 3, 27), "A", "shift_request"),
    RequestSeed("Nurse 8", date(2026, 3, 28), "A", "shift_request"),
    # Keep a small amount of approved leave so the solver still has real hard constraints.
    RequestSeed("Mary", date(2026, 3, 30), "AL", "leave_request"),
    RequestSeed("Mary", date(2026, 3, 31), "AL", "leave_request"),
    RequestSeed("Nurse 2", date(2026, 3, 23), "AL", "leave_request"),
    RequestSeed("Nurse 4", date(2026, 3, 25), "AL", "leave_request"),
    RequestSeed("Nurse 9", date(2026, 4, 3), "HOL", "leave_request"),
]


APR_2026_WARD_6_ANON_DESIGNATIONS: dict[str, str] = {
    "Mary": "SN",
    "Nurse 2": "SN",
    "Nurse 3": "SN",
    "Nurse 4": "SN",
    "Nurse 5": "SN",
    "Nurse 6": "SN",
    # Mirrors the canonical designation for the corresponding nurse ids in nurse.csv
    # so Apr 2026 request seeds stay attached to the correct staffing role buckets.
    "Nurse 7": "SEN",
    "Nurse 8": "SSN",
    "Nurse 9": "SSN",
    "Nurse 10": "HCA3",
    "Nurse 11": "SSN",
    "Nurse 12": "SSN",
    "Nurse 13": "SN",
    "Nurse 14": "HCA1",
    "Nurse 15": "HCA3",
    "Nurse 16": "SN",
    "Nurse 17": "SN",
    "Nurse 18": "EN",
    "Nurse 19": "HCA1",
    "Nurse 20": "NA",
    "Nurse 21": "EN",
    "Nurse 22": "NA",
    "Nurse 23": "NA",
    "Nurse 24": "HCA3",
    "Nurse 25": "HCA3",
    "Nurse 26": "SN",
    "Nurse 27": "SN",
    "Nurse 28": "SN",
    "Nurse 29": "EN",
    "Nurse 30": "HCA3",
    "Nurse 31": "HCA3",
    "Nurse 36": "SN",
    "Nurse 37": "SN",
}


APR_2026_WARD_6_SHIFT_PATTERNS: dict[str, str] = {
    "Nurse 10": "PM_ONLY",
}


APR_2026_WARD_6_PERIOD_CONSTRAINTS: dict[str, list[tuple[str, str, str]]] = {
    "Nurse 11": [("NO_NIGHT", "true", "Apr 2026 preview no night shift")],
    "Nurse 16": [("NO_NIGHT", "true", "Apr 2026 preview no night shift")],
}


APR_2026_12HR_WARD_ANON_DESIGNATIONS: dict[str, str] = {
    "Nurse 1": "SSN",
    "Nurse 2": "SSN",
    "Nurse 3": "SN",
    "Nurse 4": "SN",
    "Nurse 5": "SN",
    "Nurse 6": "SN",
    "Nurse 7": "EN",
    "Nurse 8": "EN",
    "Nurse 9": "EN",
    "Nurse 10": "EN",
    "Nurse 11": "EN",
    "Nurse 12": "EN",
    "Nurse 13": "EN",
    "Nurse 14": "NA",
    "Nurse 15": "NA",
    "Nurse 16": "HCA1",
    "Nurse 17": "HCA1",
    "Nurse 18": "HCA1",
    "Nurse 19": "HCA1",
    "Nurse 20": "HCA1",
}


APR_MAY_2026_WARD_6_ANON_DESIGNATIONS: dict[str, str] = {
    "Nurse 7": "EN",
    "Nurse 8": "SN",
    "Nurse 9": "SN",
    "Nurse 10": "HCA3",
    "Nurse 11": "SSN",
    "Nurse 12": "SSN",
    "Nurse 13": "SN",
    "Nurse 14": "EN",
    "Nurse 15": "HCA3",
    "Nurse 16": "SN",
    "Nurse 17": "SN",
    "Nurse 18": "EN",
    "Nurse 19": "EN",
    "Nurse 20": "EN",
    "Nurse 21": "EN",
    "Nurse 22": "EN",
    "Nurse 23": "EN",
    "Nurse 24": "HCA3",
    "Nurse 25": "HCA3",
    "Nurse 26": "SN",
    "Nurse 27": "SN",
    "Nurse 28": "SN",
    "Nurse 29": "EN",
    "Nurse 33": "EN",
    "Nurse 34": "EN",
    "Nurse 35": "SN",
    "Nurse 36": "SN",
    "Nurse 37": "SN",
    "Nurse 38": "SN",
    "Nurse 40": "SN",
    "Nurse 41": "SN",
}


APR_MAY_2026_WARD_6_SHIFT_PATTERNS: dict[str, str] = {
    "Nurse 15": "PM_ONLY",
}


APR_MAY_2026_WARD_6_PERIOD_CONSTRAINTS: dict[str, list[tuple[str, str, str]]] = {
    "Nurse 40": [("NO_NIGHT", "true", "Temporary special duty")],
    "Nurse 41": [("NO_NIGHT", "true", "Temporary special duty")],
}


def _shift_to_upcoming_period(
    req: RequestSeed, base_start: date, period: RosterPeriod
) -> RequestSeed | None:
    offset = (req.date - base_start).days
    new_date = period.startdate + timedelta(days=offset)
    if new_date < period.startdate or new_date > period.enddate:
        return None
    return RequestSeed(req.name, new_date, req.code, req.request_type, req.status)


def _ensure_shift_codes(db: Session, codes: set[str]) -> None:
    existing = {row.shiftcode for row in db.exec(select(ShiftCode)).all()}
    for code in sorted(codes):
        if code in existing:
            continue
        is_working = code in {"A", "P", "N", "A-12", "N-12"}
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
            must_change_password=False,
            default_password_encrypted=None,
            createdat=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
    else:
        user.passwordhash = get_password_hash(TEST_MANAGER_PASSWORD)
        user.managerid = manager.managerid
        user.isactive = True
        user.must_change_password = False
        user.default_password_encrypted = None
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


def _ensure_test_nurse_user(db: Session, nurse: Nurse) -> RBACUser:
    if nurse.nurseid is None:
        raise ValueError("Nurse must be persisted before creating a login user.")

    user = db.exec(select(RBACUser).where(RBACUser.nurseid == nurse.nurseid)).first()
    if not user:
        user = db.exec(
            select(RBACUser).where(RBACUser.username == TEST_NURSE_USERNAME)
        ).first()
    if not user:
        user = db.exec(select(RBACUser).where(RBACUser.email == nurse.email)).first()

    if not user:
        user = RBACUser(
            username=TEST_NURSE_USERNAME,
            email=nurse.email,
            passwordhash=get_password_hash(TEST_NURSE_PASSWORD),
            nurseid=nurse.nurseid,
            isactive=True,
            must_change_password=False,
            default_password_encrypted=None,
            createdat=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
    else:
        user.username = TEST_NURSE_USERNAME
        user.email = nurse.email
        user.passwordhash = get_password_hash(TEST_NURSE_PASSWORD)
        user.nurseid = nurse.nurseid
        user.isactive = True
        user.must_change_password = False
        user.default_password_encrypted = None
        db.add(user)

    role = _get_or_create_role(db, "Nurse", "Nurse")
    existing_role = db.exec(
        select(UserRole).where(
            UserRole.userid == user.userid,
            UserRole.roleid == role.roleid,
            UserRole.wardid == nurse.wardid,
        )
    ).first()
    if not existing_role:
        db.add(
            UserRole(
                userid=user.userid,
                roleid=role.roleid,
                wardid=nurse.wardid,
                isactive=True,
            )
        )

    db.flush()
    return user


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


FEASIBLE_WARD_6_REQUIREMENTS = dict(WARD_6_REQUIREMENTS)


APR_2026_WARD_6_REQUIREMENTS = {
    "am_total": 8,
    "am_rn": 3,
    "am_en_na_min": 3,
    "am_en_na_max": 3,
    "am_hca_min": 2,
    "am_hca_max": 2,
    "pm_total": 9,
    "pm_rn": 3,
    "pm_en_na_min": 4,
    "pm_en_na_max": 4,
    "pm_hca_min": 2,
    "pm_hca_max": 2,
    "nd_total": 4,
    "nd_rn": 2,
    "nd_en_na_min": 1,
    "nd_en_na_max": 1,
    "nd_hca_min": 1,
    "nd_hca_max": 1,
}


APR_2026_12HR_WARD_REQUIREMENTS = {
    # 12-hour wards map day coverage into AM and night coverage into ND.
    "am_total": 7,
    "am_rn": 2,
    "am_en_na_min": 2,
    "am_en_na_max": 5,
    "am_hca_min": 0,
    "am_hca_max": 2,
    "pm_total": None,
    "pm_rn": None,
    "pm_en_na_min": None,
    "pm_en_na_max": None,
    "pm_hca_min": None,
    "pm_hca_max": None,
    "nd_total": 7,
    "nd_rn": 2,
    "nd_en_na_min": 1,
    "nd_en_na_max": 5,
    "nd_hca_min": 0,
    "nd_hca_max": 2,
}


APR_MAY_2026_WARD_6_REQUIREMENTS = {
    "am_total": 7,
    "am_rn": 2,
    "am_en_na_min": 4,
    "am_en_na_max": 4,
    "am_hca_min": 1,
    "am_hca_max": 1,
    "pm_total": 4,
    "pm_rn": 2,
    "pm_en_na_min": 2,
    "pm_en_na_max": 2,
    "pm_hca_min": 0,
    "pm_hca_max": 0,
    "nd_total": 4,
    "nd_rn": 2,
    "nd_en_na_min": 2,
    "nd_en_na_max": 2,
    "nd_hca_min": 0,
    "nd_hca_max": 0,
}


def _apply_ward_requirements(ward: Ward, requirements: dict[str, int | None]) -> None:
    for field_name, value in requirements.items():
        setattr(ward, field_name, value)


def _table_exists(db: Session, table_name: str) -> bool:
    inspector = inspect(db.connection())
    return table_name in inspector.get_table_names()


def _column_exists(db: Session, table_name: str, column_name: str) -> bool:
    inspector = inspect(db.connection())
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    return column_name in columns


def _get_previous_period(db: Session, period: RosterPeriod) -> RosterPeriod | None:
    return db.exec(
        select(RosterPeriod)
        .where(RosterPeriod.enddate < period.startdate)
        .order_by(RosterPeriod.enddate.desc())
    ).first()


def _seed_roster_for_period(
    db: Session,
    ward_id: int,
    roster_period: RosterPeriod | None,
    nurses: list[Nurse],
) -> int:
    if not roster_period or not nurses:
        return 0

    nurse_ids = [n.nurseid for n in nurses if n.nurseid is not None]
    if not nurse_ids:
        return 0

    existing_entries = {
        (row.nurseid, row.shiftdate)
        for row in db.exec(
            select(Roster).where(
                Roster.wardid == ward_id,
                Roster.periodid == roster_period.periodid,
                Roster.nurseid.in_(nurse_ids),  # type: ignore[attr-defined]
            )
        ).all()
        if row.nurseid is not None
    }

    shift_cycle = ("A", "P", "N", "DO")
    num_days = (roster_period.enddate - roster_period.startdate).days + 1
    created = 0

    for nurse_index, nurse in enumerate(sorted(nurses, key=lambda n: n.nurseid or 0)):
        if nurse.nurseid is None:
            continue
        for day_idx in range(num_days):
            shift_date = roster_period.startdate + timedelta(days=day_idx)
            key = (nurse.nurseid, shift_date)
            if key in existing_entries:
                continue
            db.add(
                Roster(
                    nurseid=nurse.nurseid,
                    wardid=ward_id,
                    periodid=roster_period.periodid,
                    shiftdate=shift_date,
                    shiftcode=shift_cycle[(nurse_index + day_idx) % len(shift_cycle)],
                    status="Confirmed",
                    assignmentmethod="Auto",
                )
            )
            created += 1

    return created


def _seed_previous_period_roster(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    nurses: list[Nurse],
) -> int:
    previous_period = _get_previous_period(db, period)
    return _seed_roster_for_period(db, ward_id, previous_period, nurses)


def _delete_seeded_confirmed_roster(
    db: Session,
    ward_id: int,
    period: RosterPeriod | None,
) -> int:
    """
    Remove the bootstrap roster rows created by this seed script.

    These rows are inserted as Auto + Confirmed so the app treats them as
    published and refuses to clear them. Limit cleanup to the exact signature
    used by the seed helper so we do not wipe manual edits or algorithm output.
    """
    if not period:
        return 0

    deleted = db.exec(
        delete(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == period.periodid,
            Roster.assignmentmethod == "Auto",
            Roster.status == "Confirmed",
        )
    ).rowcount or 0
    return deleted


def _clear_previous_period_last_day_nights(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    nurses: list[Nurse],
) -> int:
    """
    MILP treats a previous-period NIGHT on the last day as a carry-over
    obligation into day 1 of the new period. For the MILP-feasible seed mode,
    rewrite those last-day historical rows to DO so re-runs can repair an
    already-seeded ward instead of preserving infeasible carry-over.
    """
    previous_period = _get_previous_period(db, period)
    if not previous_period:
        return 0

    nurse_ids = [n.nurseid for n in nurses if n.nurseid is not None]
    if not nurse_ids:
        return 0

    updated = 0
    rows = db.exec(
        select(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == previous_period.periodid,
            Roster.shiftdate == previous_period.enddate,
            Roster.nurseid.in_(nurse_ids),  # type: ignore[attr-defined]
        )
    ).all()
    for row in rows:
        if str(row.shiftcode).upper() == "N":
            row.shiftcode = "DO"
            row.assignmentmethod = "Auto"
            row.status = "Confirmed"
            db.add(row)
            updated += 1

    return updated


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
        designation = ANON_DESIGNATIONS.get(anonymized, "SN")
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
    nurse_by_name = {n.name: n for n in db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()}
    test_nurse = nurse_by_name.get(TEST_NURSE_NAME)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)

    # Ensure shift codes and ward shift codes exist for shift_request entries.
    # Leave types (AL, MC, HOL, …) are not shift codes. Modifier suffixes (-R/_R) are
    # normalized away so the base code (A, P, DO, …) is what gets seeded.
    # If a request uses a non-leave code, seed it as a shift code.
    codes = {
        _normalize_shift_request_code(req.code)
        for req in HARDCODED_REQUESTS
        if req.request_type == "shift_request"
        or _normalize_leave_request_code(req.code) is None
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
    test_nurse = min((n for n in nurses if n.nurseid is not None), key=lambda n: n.nurseid, default=None)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)
    current_roster_created = _seed_roster_for_period(db, ward.wardid, current_period, nurses)
    previous_roster_created = _seed_previous_period_roster(db, ward.wardid, period, nurses)
    nurse_by_name = {n.name: n for n in nurses}
    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, [n.nurseid for n in nurses]
    )

    created = 0
    for req in HARDCODED_REQUESTS:
        shifted = _shift_to_upcoming_period(req, base_start, period)
        if not shifted:
            continue
        nurse = nurse_by_name.get(req.name)
        if not nurse:
            continue

        normalized_leave_code = _normalize_leave_request_code(shifted.code)
        if shifted.request_type == "leave_request" and normalized_leave_code:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == shifted.date,
                    LeaveRequest.enddate == shifted.date,
                    LeaveRequest.leavetype == normalized_leave_code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=shifted.date,
                    enddate=shifted.date,
                    leavetype=normalized_leave_code,
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
            key = (nurse.nurseid, shifted.date)
            if key in existing_dates:
                continue
            db.add(
                ShiftRequest(
                    nurseid=nurse.nurseid,
                    periodid=period.periodid,
                    preferreddate=shifted.date,
                    preferredshifttype=normalized_code,
                    requestnumber=_claim_shift_request_number(
                        used_numbers_by_nurse, nurse.nurseid
                    ),
                    status="Pending",
                    timestamp=datetime.now(timezone.utc),
                )
            )
            existing_dates.add(key)
            created += 1

    db.commit()
    if test_nurse:
        print(f"  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    if current_roster_created:
        print(f"  Seeded {current_roster_created} current-period roster entries.")
    if previous_roster_created:
        print(f"  Seeded {previous_roster_created} previous-period roster entries.")
    print(f"\n✓ Seeded ward '{ward.wardname}' (id={ward.wardid}) with anonymized requests.")
    return created


def seed_test_ward_with_feasible_anonymized_requests(
    db: Session,
    ward_name: str = "Test Ward Requests MILP Feasible",
) -> int:
    """
    Seed the same anonymized request scenario as `seed_test_ward_with_anonymized_requests`,
    but with enough EN/SEN manpower for the MILP solver to satisfy the ward's
    strict B-rank minima.
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
    _apply_ward_requirements(ward, FEASIBLE_WARD_6_REQUIREMENTS)
    db.add(ward)
    _ensure_test_manager(db, ward)

    unique_names = sorted(FEASIBLE_ANON_DESIGNATIONS.keys(), key=_nurse_sort_key)

    existing_nurses = db.exec(
        select(Nurse).where(Nurse.wardid == ward.wardid)
    ).all()
    existing_by_name = {n.name: n for n in existing_nurses}

    for anonymized in unique_names:
        if anonymized in existing_by_name:
            continue
        designation = FEASIBLE_ANON_DESIGNATIONS.get(anonymized, "SN")
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
    nurse_by_name = {n.name: n for n in db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()}
    test_nurse = nurse_by_name.get(TEST_NURSE_NAME)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)

    codes = {
        _normalize_shift_request_code(req.code)
        for req in FEASIBLE_REQUESTS
        if req.request_type == "shift_request"
        or _normalize_leave_request_code(req.code) is None
    } | {"A", "P", "N"}
    _ensure_shift_codes(db, codes)

    existing_wsc = {
        row.shiftcode
        for row in db.exec(select(WardShiftCode).where(WardShiftCode.wardid == ward.wardid)).all()
    }
    for code in sorted(codes - existing_wsc):
        db.add(WardShiftCode(wardid=ward.wardid, shiftcode=code))

    base_start = min(req.date for req in FEASIBLE_REQUESTS)
    nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    test_nurse = min((n for n in nurses if n.nurseid is not None), key=lambda n: n.nurseid, default=None)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)
    current_roster_created = _seed_roster_for_period(db, ward.wardid, current_period, nurses)
    previous_roster_created = _seed_previous_period_roster(db, ward.wardid, period, nurses)
    previous_night_tail_cleared = _clear_previous_period_last_day_nights(
        db, ward.wardid, period, nurses
    )
    nurse_by_name = {n.name: n for n in nurses}
    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, [n.nurseid for n in nurses]
    )

    created = 0
    for req in FEASIBLE_REQUESTS:
        shifted = _shift_to_upcoming_period(req, base_start, period)
        if not shifted:
            continue
        nurse = nurse_by_name.get(req.name)
        if not nurse:
            continue

        normalized_leave_code = _normalize_leave_request_code(shifted.code)
        if shifted.request_type == "leave_request" and normalized_leave_code:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == shifted.date,
                    LeaveRequest.enddate == shifted.date,
                    LeaveRequest.leavetype == normalized_leave_code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=shifted.date,
                    enddate=shifted.date,
                    leavetype=normalized_leave_code,
                    leavecategory="PreApproved",
                    submittedduringperiod="BeforeRoster",
                    status="Approved",
                    impactsroster=True,
                )
            )
            created += 1
        else:
            normalized_code = _normalize_shift_request_code(shifted.code)
            key = (nurse.nurseid, shifted.date)
            if key in existing_dates:
                continue
            db.add(
                ShiftRequest(
                    nurseid=nurse.nurseid,
                    periodid=period.periodid,
                    preferreddate=shifted.date,
                    preferredshifttype=normalized_code,
                    requestnumber=_claim_shift_request_number(
                        used_numbers_by_nurse, nurse.nurseid
                    ),
                    status="Pending",
                    timestamp=datetime.now(timezone.utc),
                )
            )
            existing_dates.add(key)
            created += 1

    db.commit()
    if test_nurse:
        print(f"  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    if current_roster_created:
        print(f"  Seeded {current_roster_created} current-period roster entries.")
    if previous_roster_created:
        print(f"  Seeded {previous_roster_created} previous-period roster entries.")
    if previous_night_tail_cleared:
        print(
            "  Rewrote "
            f"{previous_night_tail_cleared} previous-period last-day NIGHT entries to DO."
        )
    print(
        f"\nSeeded ward '{ward.wardname}' (id={ward.wardid}) "
        "with MILP-feasible anonymized requests."
    )
    return created


def seed_requests_from_list(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    request_seeds: list[RequestSeed],
    current_period: RosterPeriod | None = None,
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
    test_nurse = min((n for n in nurses if n.nurseid is not None), key=lambda n: n.nurseid, default=None)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)
    current_roster_created = _seed_roster_for_period(db, ward_id, current_period, nurses)
    previous_roster_created = _seed_previous_period_roster(db, ward_id, period, nurses)

    nurse_by_name = {_normalize_name(n.name): n for n in nurses}
    ward_shift_code_strs = {
        wsc.shiftcode
        for wsc in db.exec(
            select(WardShiftCode).where(WardShiftCode.wardid == ward_id)
        ).all()
    }

    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, [n.nurseid for n in nurses]
    )

    created = 0
    for req in request_seeds:
        nurse = nurse_by_name.get(_normalize_name(req.name))
        if not nurse:
            print(f"  ! Skip: nurse not found in ward {ward_id}: {req.name}")
            continue
        if not (period.startdate <= req.date <= period.enddate):
            print(f"  ! Skip: date out of period: {req.date} ({req.name})")
            continue

        normalized_leave_code = _normalize_leave_request_code(req.code)
        if req.request_type == "leave_request" and normalized_leave_code:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == req.date,
                    LeaveRequest.enddate == req.date,
                    LeaveRequest.leavetype == normalized_leave_code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=req.date,
                    enddate=req.date,
                    leavetype=normalized_leave_code,
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
            key = (nurse.nurseid, req.date)
            if key in existing_dates:
                continue
            db.add(
                ShiftRequest(
                    nurseid=nurse.nurseid,
                    periodid=period.periodid,
                    preferreddate=req.date,
                    preferredshifttype=normalized_code,
                    requestnumber=_claim_shift_request_number(
                        used_numbers_by_nurse, nurse.nurseid
                    ),
                    status="Pending",
                    timestamp=datetime.now(timezone.utc),
                )
            )
            existing_dates.add(key)
        created += 1
    if test_nurse:
        print(f"  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    if current_roster_created:
        print(f"  Seeded {current_roster_created} current-period roster entries.")
    if previous_roster_created:
        print(f"  Seeded {previous_roster_created} previous-period roster entries.")
    return created


def seed_apr_2026_ward_6_preview(
    db: Session,
    ward_name: str = "Test Ward Requests Apr 2026",
) -> int:
    """
    Seed the Apr 06 - Apr 19 2026 Ward 6 preview onto the period that is upcoming
    from today. This keeps the legacy Apr dataset usable without depending on the
    original 2026-04-06 roster period still being upcoming.

    This preview seeds requests only. Older versions of this helper also created
    Auto + Confirmed roster rows, which the clear-roster API treats as already
    published. We now scrub those bootstrap rows on rerun.
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
    _apply_ward_requirements(ward, APR_2026_WARD_6_REQUIREMENTS)
    db.add(ward)
    _ensure_test_manager(db, ward)

    unique_names = sorted(APR_2026_WARD_6_ANON_DESIGNATIONS.keys(), key=_nurse_sort_key)

    existing_nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    existing_by_name = {n.name: n for n in existing_nurses}
    shiftpattern_supported = _column_exists(db, "nurse", "shiftpattern")

    for anonymized in unique_names:
        designation = APR_2026_WARD_6_ANON_DESIGNATIONS.get(anonymized, "SN")
        shift_pattern = APR_2026_WARD_6_SHIFT_PATTERNS.get(anonymized)
        existing = existing_by_name.get(anonymized)
        if existing:
            existing.designation = designation
            if shiftpattern_supported:
                existing.shiftpattern = shift_pattern
            existing.isactive = True
            db.add(existing)
            continue
        nurse = Nurse(
            name=anonymized,
            employeeid=f"APR26-{anonymized.split()[-1]}",
            designation=designation,
            email=f"{anonymized.replace(' ', '').lower()}.apr2026@example.com",
            contactnumber="00000000",
            wardid=ward.wardid,
            employmenttype="FullTime",
            isactive=True,
        )
        if shiftpattern_supported:
            nurse.shiftpattern = shift_pattern
        db.add(nurse)

    db.flush()
    nurse_by_name = {n.name: n for n in db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()}
    test_nurse = nurse_by_name.get(TEST_NURSE_NAME)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)

    if _table_exists(db, "nurseperiodconstraint"):
        for nurse_name, constraints in APR_2026_WARD_6_PERIOD_CONSTRAINTS.items():
            nurse = nurse_by_name.get(nurse_name)
            if not nurse:
                continue
            existing_constraints = db.exec(
                select(NursePeriodConstraint).where(
                    NursePeriodConstraint.nurseid == nurse.nurseid,
                    NursePeriodConstraint.periodid == period.periodid,
                )
            ).all()
            existing_keys = {
                (row.constrainttype, row.value, row.reason or "")
                for row in existing_constraints
            }
            for constraint_type, value, reason in constraints:
                key = (constraint_type, value, reason)
                if key in existing_keys:
                    continue
                db.add(
                    NursePeriodConstraint(
                        nurseid=nurse.nurseid,
                        periodid=period.periodid,
                        constrainttype=constraint_type,
                        value=value,
                        reason=reason,
                    )
                )

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
        for req in APR_2026_WARD_6_REQUESTS
        if req.request_type == "shift_request" or req.code not in allowed_leave_types
    } | {"A", "P", "N"}
    _ensure_shift_codes(db, codes)

    existing_wsc = {
        row.shiftcode
        for row in db.exec(select(WardShiftCode).where(WardShiftCode.wardid == ward.wardid)).all()
    }
    for code in sorted(codes - existing_wsc):
        db.add(WardShiftCode(wardid=ward.wardid, shiftcode=code))

    nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    test_nurse = min((n for n in nurses if n.nurseid is not None), key=lambda n: n.nurseid, default=None)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)
    current_roster_deleted = _delete_seeded_confirmed_roster(db, ward.wardid, period)
    previous_roster_deleted = _delete_seeded_confirmed_roster(
        db, ward.wardid, _get_previous_period(db, period)
    )
    nurse_by_name = {n.name: n for n in nurses}
    nurse_ids = [n.nurseid for n in nurses]
    # Replace any prior preview seed for this ward/period so reruns correct stale dates.
    existing_requests = list(
        db.exec(
            select(ShiftRequest).where(
                ShiftRequest.periodid == period.periodid,
                ShiftRequest.nurseid.in_(nurse_ids),
            )
        ).all()
    )
    for existing in existing_requests:
        db.delete(existing)
    existing_leave_requests = list(
        db.exec(
            select(LeaveRequest).where(
                LeaveRequest.nurseid.in_(nurse_ids),
                LeaveRequest.startdate >= period.startdate,
                LeaveRequest.enddate <= period.enddate,
            )
        ).all()
    )
    for existing in existing_leave_requests:
        db.delete(existing)
    db.flush()
    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, nurse_ids
    )
    base_start = min(req.date for req in APR_2026_WARD_6_REQUESTS)

    created = 0
    for req in APR_2026_WARD_6_REQUESTS:
        shifted = _shift_to_upcoming_period(req, base_start, period)
        if not shifted:
            continue
        nurse = nurse_by_name.get(shifted.name)
        if not nurse:
            continue

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
            continue

        key = (nurse.nurseid, shifted.date)
        if key in existing_dates:
            continue

        db.add(
            ShiftRequest(
                nurseid=nurse.nurseid,
                periodid=period.periodid,
                preferreddate=shifted.date,
                preferredshifttype=_normalize_shift_request_code(shifted.code),
                requestnumber=_claim_shift_request_number(
                    used_numbers_by_nurse, nurse.nurseid
                ),
                status=shifted.status,
                timestamp=datetime.now(timezone.utc),
            )
        )
        existing_dates.add(key)
        created += 1

    db.commit()
    if test_nurse:
        print(f"  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    if current_roster_deleted:
        print(f"  Cleared {current_roster_deleted} legacy current-period seeded roster entries.")
    if previous_roster_deleted:
        print(f"  Cleared {previous_roster_deleted} legacy previous-period seeded roster entries.")
    print(
        f"\n✓ Seeded ward '{ward.wardname}' (id={ward.wardid}) "
        f"for Apr 06 - Apr 19 2026 preview on roster period "
        f"({period.startdate} - {period.enddate})."
    )
    return created


def seed_apr_2026_12hr_ward_preview(
    db: Session,
    ward_name: str = "Test Ward Requests Apr 2026 12HR",
) -> int:
    """
    Seed the anonymized Apr 06 - Apr 19 2026 12-hour preview onto the period
    that is upcoming from today.

    This preview seeds a dedicated 12-hour test ward with anonymized nurses,
    12-hour ward requirements, and request/leave data only.
    """
    periods = ensure_roster_period_window(db)
    current_period, upcoming_period, _ = get_period_window(periods)
    period = upcoming_period or current_period
    if not period:
        raise SystemExit("No current or upcoming roster period found.")

    ward = db.exec(select(Ward).where(Ward.wardname == ward_name)).first()
    if not ward:
        ward = Ward(
            wardname=ward_name,
            wardtype="Test",
            wardhourtype="12_HOURS",
            location="Seeded",
        )
        db.add(ward)
        db.flush()
    ward.wardhourtype = "12_HOURS"
    _apply_ward_requirements(ward, APR_2026_12HR_WARD_REQUIREMENTS)
    db.add(ward)
    _ensure_test_manager(db, ward)

    unique_names = sorted(APR_2026_12HR_WARD_ANON_DESIGNATIONS.keys(), key=_nurse_sort_key)
    existing_nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    existing_by_name = {n.name: n for n in existing_nurses}

    for anonymized in unique_names:
        designation = APR_2026_12HR_WARD_ANON_DESIGNATIONS[anonymized]
        existing = existing_by_name.get(anonymized)
        if existing:
            existing.designation = designation
            existing.isactive = True
            db.add(existing)
            continue
        db.add(
            Nurse(
                name=anonymized,
                employeeid=f"APR26-12H-{anonymized.split()[-1]}",
                designation=designation,
                email=f"{anonymized.replace(' ', '').lower()}.apr202612hr@example.com",
                contactnumber="00000000",
                wardid=ward.wardid,
                employmenttype="FullTime",
                isactive=True,
            )
        )

    db.flush()
    nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    nurse_by_name = {n.name: n for n in nurses}
    test_nurse = min(
        (n for n in nurses if n.nurseid is not None),
        key=lambda n: n.nurseid,
        default=None,
    )
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)

    shift_codes_needed = {
        _normalize_shift_request_code(req.code)
        for req in APR_2026_12HR_WARD_REQUESTS
        if req.request_type == "shift_request"
        or _normalize_leave_request_code(req.code) is None
    } | {"A-12", "N-12", "DO"}
    _ensure_shift_codes(db, shift_codes_needed)

    existing_wsc = {
        row.shiftcode
        for row in db.exec(
            select(WardShiftCode).where(WardShiftCode.wardid == ward.wardid)
        ).all()
    }
    for code in sorted(shift_codes_needed - existing_wsc):
        db.add(WardShiftCode(wardid=ward.wardid, shiftcode=code))

    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, [n.nurseid for n in nurses]
    )
    base_start = min(req.date for req in APR_2026_12HR_WARD_REQUESTS)

    created = 0
    for req in APR_2026_12HR_WARD_REQUESTS:
        shifted = _shift_to_upcoming_period(req, base_start, period)
        if not shifted:
            continue
        nurse = nurse_by_name.get(shifted.name)
        if not nurse:
            continue

        normalized_leave_code = _normalize_leave_request_code(shifted.code)
        if shifted.request_type == "leave_request" and normalized_leave_code:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == shifted.date,
                    LeaveRequest.enddate == shifted.date,
                    LeaveRequest.leavetype == normalized_leave_code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=shifted.date,
                    enddate=shifted.date,
                    leavetype=normalized_leave_code,
                    leavecategory="PreApproved",
                    submittedduringperiod="BeforeRoster",
                    status="Approved",
                    impactsroster=True,
                )
            )
            created += 1
            continue

        key = (nurse.nurseid, shifted.date)
        if key in existing_dates:
            continue
        db.add(
            ShiftRequest(
                nurseid=nurse.nurseid,
                periodid=period.periodid,
                preferreddate=shifted.date,
                preferredshifttype=_normalize_shift_request_code(shifted.code),
                requestnumber=_claim_shift_request_number(
                    used_numbers_by_nurse, nurse.nurseid
                ),
                status=shifted.status,
                timestamp=datetime.now(timezone.utc),
            )
        )
        existing_dates.add(key)
        created += 1

    db.commit()
    if test_nurse:
        print(f"  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    print(
        f"\n✓ Seeded ward '{ward.wardname}' (id={ward.wardid}) "
        f"for Apr 06 - Apr 19 2026 12HR preview on roster period "
        f"({period.startdate} - {period.enddate})."
    )
    return created


def seed_apr_may_2026_ward_6_preview(
    db: Session,
    ward_name: str = "Test Ward Requests Apr-May 2026",
) -> int:
    """
    Seed the Apr 20 - May 03 2026 anonymized Ward 6 preview onto the upcoming
    roster period. This seeds ward requirements, anonymized nurses, period
    constraints, and requests only (no roster rows).
    """
    periods = ensure_roster_period_window(db)
    _, upcoming_period, _ = get_period_window(periods)
    period = upcoming_period
    if not period:
        raise SystemExit("No upcoming roster period found.")

    ward = db.exec(select(Ward).where(Ward.wardname == ward_name)).first()
    if not ward:
        ward = Ward(wardname=ward_name, wardtype="Test", location="Seeded")
        db.add(ward)
        db.flush()
    _apply_ward_requirements(ward, APR_MAY_2026_WARD_6_REQUIREMENTS)
    db.add(ward)
    _ensure_test_manager(db, ward)

    unique_names = sorted(APR_MAY_2026_WARD_6_ANON_DESIGNATIONS.keys(), key=_nurse_sort_key)

    existing_nurses = db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()
    existing_by_name = {n.name: n for n in existing_nurses}
    shiftpattern_supported = _column_exists(db, "nurse", "shiftpattern")

    for anonymized in unique_names:
        designation = APR_MAY_2026_WARD_6_ANON_DESIGNATIONS.get(anonymized, "SN")
        shift_pattern = APR_MAY_2026_WARD_6_SHIFT_PATTERNS.get(anonymized)
        existing = existing_by_name.get(anonymized)
        if existing:
            existing.designation = designation
            if shiftpattern_supported:
                existing.shiftpattern = shift_pattern
            existing.isactive = True
            db.add(existing)
            continue
        nurse = Nurse(
            name=anonymized,
            employeeid=f"APR26B-{anonymized.split()[-1]}",
            designation=designation,
            email=f"{anonymized.replace(' ', '').lower()}.aprmay2026@example.com",
            contactnumber="00000000",
            wardid=ward.wardid,
            employmenttype="FullTime",
            isactive=True,
        )
        if shiftpattern_supported:
            nurse.shiftpattern = shift_pattern
        db.add(nurse)

    db.flush()
    nurse_by_name = {n.name: n for n in db.exec(select(Nurse).where(Nurse.wardid == ward.wardid)).all()}
    test_nurse = nurse_by_name.get(TEST_NURSE_NAME)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)

    if _table_exists(db, "nurseperiodconstraint"):
        for nurse_name, constraints in APR_MAY_2026_WARD_6_PERIOD_CONSTRAINTS.items():
            nurse = nurse_by_name.get(nurse_name)
            if not nurse:
                continue
            existing_constraints = db.exec(
                select(NursePeriodConstraint).where(
                    NursePeriodConstraint.nurseid == nurse.nurseid,
                    NursePeriodConstraint.periodid == period.periodid,
                )
            ).all()
            existing_keys = {
                (row.constrainttype, row.value, row.reason or "") for row in existing_constraints
            }
            for constraint_type, value, reason in constraints:
                key = (constraint_type, value, reason)
                if key in existing_keys:
                    continue
                db.add(
                    NursePeriodConstraint(
                        nurseid=nurse.nurseid,
                        periodid=period.periodid,
                        constrainttype=constraint_type,
                        value=value,
                        reason=reason,
                    )
                )

    codes = {
        _normalize_shift_request_code(req.code)
        for req in APR_MAY_2026_WARD_6_REQUESTS
        if req.request_type == "shift_request"
    } | {"A", "P", "N"}
    _ensure_shift_codes(db, codes)

    existing_wsc = {
        row.shiftcode
        for row in db.exec(select(WardShiftCode).where(WardShiftCode.wardid == ward.wardid)).all()
    }
    for code in sorted(codes - existing_wsc):
        db.add(WardShiftCode(wardid=ward.wardid, shiftcode=code))

    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, [n.nurseid for n in nurse_by_name.values()]
    )
    base_start = min(req.date for req in APR_MAY_2026_WARD_6_REQUESTS)

    created = 0
    for req in APR_MAY_2026_WARD_6_REQUESTS:
        shifted = _shift_to_upcoming_period(req, base_start, period)
        if not shifted:
            continue
        nurse = nurse_by_name.get(shifted.name)
        if not nurse:
            continue

        normalized_leave_code = _normalize_leave_request_code(shifted.code)
        if shifted.request_type == "leave_request" and normalized_leave_code:
            existing = db.exec(
                select(LeaveRequest).where(
                    LeaveRequest.nurseid == nurse.nurseid,
                    LeaveRequest.startdate == shifted.date,
                    LeaveRequest.enddate == shifted.date,
                    LeaveRequest.leavetype == normalized_leave_code,
                )
            ).first()
            if existing:
                continue
            db.add(
                LeaveRequest(
                    nurseid=nurse.nurseid,
                    startdate=shifted.date,
                    enddate=shifted.date,
                    leavetype=normalized_leave_code,
                    leavecategory="PreApproved",
                    submittedduringperiod="BeforeRoster",
                    status="Approved",
                    impactsroster=True,
                )
            )
            created += 1
            continue

        key = (nurse.nurseid, shifted.date)
        if key in existing_dates:
            continue
        db.add(
            ShiftRequest(
                nurseid=nurse.nurseid,
                periodid=period.periodid,
                preferreddate=shifted.date,
                preferredshifttype=_normalize_shift_request_code(shifted.code),
                requestnumber=_claim_shift_request_number(
                    used_numbers_by_nurse, nurse.nurseid
                ),
                status=shifted.status,
                timestamp=datetime.now(timezone.utc),
            )
        )
        existing_dates.add(key)
        created += 1

    db.commit()
    if test_nurse:
        print(f"  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    print(
        f"\nSeeded ward '{ward.wardname}' (id={ward.wardid}) "
        f"for upcoming roster preview ({period.startdate} - {period.enddate})."
    )
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
    test_nurse = min((n for n in nurses if n.nurseid is not None), key=lambda n: n.nurseid, default=None)
    if test_nurse:
        _ensure_test_nurse_user(db, test_nurse)
    current_roster_created = _seed_roster_for_period(db, ward_id, current_period, nurses)
    previous_roster_created = _seed_previous_period_roster(db, ward_id, period, nurses)

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

    existing_dates, used_numbers_by_nurse = _prepare_shift_request_seed_state(
        db, period.periodid, [n.nurseid for n in nurses]
    )

    def add_request(nurse_id: int, day_idx: int, shift: str) -> bool:
        preferred_date = period.startdate + timedelta(days=day_idx)
        key = (nurse_id, preferred_date)
        if key in existing_dates:
            return False
        db.add(ShiftRequest(
            nurseid=nurse_id,
            periodid=period.periodid,
            preferreddate=preferred_date,
            preferredshifttype=shift,
            requestnumber=_claim_shift_request_number(used_numbers_by_nurse, nurse_id),
            status="Pending",
            timestamp=datetime.now(timezone.utc),
        ))
        existing_dates.add(key)
        return True

    created = 0
    for nurse in nurses:
        nid = nurse.nurseid
        nurse_created = 0

        if nid in off_nurse_ids:
            # Day and shift derived from nurse ID — fully deterministic
            day_idx = nid % num_days
            shift = off_shifts[nid % len(off_shifts)]
            if add_request(nid, day_idx, shift):
                nurse_created += 1
        else:
            # Two distinct days spaced apart, shift derived from nurse ID
            day1 = nid % num_days
            day2 = (nid + num_days // 2) % num_days
            if day1 == day2:
                day2 = (day1 + 1) % num_days
            for req_num, day_idx in enumerate(sorted([day1, day2]), start=1):
                shift = working_shifts[(nid + req_num) % len(working_shifts)]
                if add_request(nid, day_idx, shift):
                    nurse_created += 1

        created += nurse_created
        label = "off" if nid in off_nurse_ids else "working"
        print(f"  {nurse.name:<30} [{label}]  {nurse_created} request(s)")

    db.commit()
    if test_nurse:
        print(f"\n  Nurse login: {test_nurse.email} / {TEST_NURSE_PASSWORD}")
    if current_roster_created:
        print(f"\n  Seeded {current_roster_created} current-period roster entries.")
    if previous_roster_created:
        print(f"\n  Seeded {previous_roster_created} previous-period roster entries.")
    print(f"\n✓ {created} requests saved — go trigger the algorithm from the frontend.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed shift requests for a ward.")
    parser.add_argument("--ward-id", type=int)
    parser.add_argument(
        "--mode",
        type=str,
        default="deterministic",
        choices=[
            "deterministic",
            "hardcoded",
            "anonymized",
            "anonymized-feasible",
            "anonymized-apr-2026",
            "anonymized-apr-2026-12hr",
            "anonymized-apr-may-2026",
        ],
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
            created = seed_requests_from_list(
                db,
                args.ward_id,
                period,
                requests,
                current_period=current_period,
            )
            db.commit()
            print(f"\n✓ {created} hardcoded requests saved — go trigger the algorithm from the frontend.")
        elif args.mode == "anonymized":
            created = seed_test_ward_with_anonymized_requests(db)
            print(f"✓ {created} anonymized requests saved.")
        elif args.mode == "anonymized-feasible":
            created = seed_test_ward_with_feasible_anonymized_requests(db)
            print(f"âœ“ {created} anonymized MILP-feasible requests saved.")
        elif args.mode == "anonymized-apr-2026":
            created = seed_apr_2026_ward_6_preview(db)
            print(f"✓ {created} Apr 2026 preview requests saved.")
        elif args.mode == "anonymized-apr-2026-12hr":
            created = seed_apr_2026_12hr_ward_preview(db)
            print(f"✓ {created} Apr 2026 12HR preview requests saved.")
        elif args.mode == "anonymized-apr-may-2026":
            created = seed_apr_may_2026_ward_6_preview(db)
            print(f"✓ {created} Apr-May 2026 preview requests saved.")
        else:
            if args.ward_id is None:
                raise SystemExit("--ward-id is required for mode=deterministic.")
            seed_requests(db, args.ward_id)


if __name__ == "__main__":
    main()
