"""
Seed shift requests for a ward so the algorithm can be triggered from the frontend.

Distribution (fully deterministic, based on nurse ID — no randomness):
  - Bottom 10% of nurses by ID get 1 off-day request  (isworking=False shift)
  - Remaining 90% get 2 working shift requests

Day and shift assignment are derived from each nurse's ID so results are
identical on every run regardless of environment.

Usage:
    docker compose exec backend python app/test_algo.py --ward-id 1

Options:
    --ward-id   Ward ID to generate requests for (required)
"""
import argparse
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.rbac import Nurse
from app.models.roster import RosterPeriod, Ward
from app.models.shifts import ShiftCode, ShiftRequest, WardShiftCode
from app.services.roster_period_service import ensure_roster_period_window, get_period_window


def seed_requests(db: Session, ward_id: int) -> None:
    ward = db.get(Ward, ward_id)
    if not ward:
        raise SystemExit(f"Ward {ward_id} not found.")

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
        preferred_date = period.startdate.__class__.fromordinal(period.startdate.toordinal() + day_idx)
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
    parser.add_argument("--ward-id", type=int, required=True)
    args = parser.parse_args()

    with Session(engine) as db:
        seed_requests(db, args.ward_id)


if __name__ == "__main__":
    main()
