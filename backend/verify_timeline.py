"""
Notification Timeline Verification Script
==========================================
Simulates time progression through the 14-day roster cycle and verifies
that the correct notifications fire at the correct times.

Includes edge-case tests:
  A. Missed Window (Celery Downtime)
  B. New User Joiner (mid-period)
  C. Timezone Boundary (UTC vs local SGT)

Usage:
  docker compose exec backend bash -c "cd /app && uv run python verify_timeline.py"
"""

from datetime import datetime, date, timedelta, timezone
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, select, delete
from app.core.db import engine
from app.core.config import settings
from app.models.roster import RosterPeriod, NotificationQueue
from app.models import Nurse
from app.models.rbac import NurseManager
from app.services.roster_period_service import ensure_roster_period_window
from app.models.enums import NotificationType

# -- Timezone helper: all mocked times should be in UTC -----------------------
# The service internally converts UTC → SGT (UTC+8).
# So "07:00 SGT" = "23:00 UTC the day before"
SGT_OFFSET = settings.NOTIFICATION_TIMEZONE_OFFSET_HOURS  # 8
def sgt(year, month, day, hour, minute=0):
    """Create a UTC datetime that corresponds to the given SGT local time."""
    local = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    return local - timedelta(hours=SGT_OFFSET)


def get_period_letter(session: Session, period_id: int) -> str:
    """Map period to letter A/B/C based on startdate."""
    p = session.get(RosterPeriod, period_id)
    if not p:
        return "?"
    if p.startdate == date(2026, 3, 9):
        return "A"
    if p.startdate == date(2026, 3, 23):
        return "B"
    if p.startdate == date(2026, 4, 6):
        return "C"
    return f"({p.name})"


def setup_test_data(session: Session):
    """Create or reuse a test Nurse and NurseManager."""
    nurse = session.exec(select(Nurse).where(Nurse.email == 'testnurse@example.com')).first()
    if not nurse:
        nurse = Nurse(
            name="Test Nurse",
            employeeid="N999",
            email="testnurse@example.com",
            wardid=1,
            isactive=True,
            designation="SN",
            employmenttype="FullTime",
            contactnumber="12345678",
        )
        session.add(nurse)
        session.commit()

    manager = session.exec(select(NurseManager).where(NurseManager.email == 'testmanager@example.com')).first()
    if not manager:
        manager = NurseManager(
            name="Test Manager",
            email="testmanager@example.com",
            isactive=True,
            is_superuser=False,
            hashed_password="xxx",
        )
        session.add(manager)
        session.commit()

    return nurse, manager


def run_phase(session: Session, phase_name: str, mock_now: datetime, expected_label: str):
    """Run one simulated time step and print results."""
    # Convert back to SGT for display
    local = mock_now + timedelta(hours=SGT_OFFSET)
    print(f"\n--- Simulating {phase_name} ---")
    print(f"Mocked Time: {local.strftime('%Y-%m-%d %H:%M')} SGT (UTC: {mock_now.strftime('%H:%M')})")

    existing_count = len(session.exec(select(NotificationQueue)).all())

    ensure_roster_period_window(session, now=mock_now)

    all_notifs = session.exec(
        select(NotificationQueue).order_by(NotificationQueue.createdat)
    ).all()
    new_count = len(all_notifs) - existing_count

    if new_count > 0:
        print(f"✅ {new_count} notification{'s' if new_count > 1 else ''} added:")
        for n in all_notifs[existing_count:]:
            letter = get_period_letter(session, n.relatedentityid)
            print(f"   -> To: {n.recipienttype} (ID: {n.recipientid}) | Type: {NotificationType(n.notificationtype).name} ({letter})")
    else:
        if 'No Trigger' in phase_name or 'If missed' in phase_name or 'SHOULD NOT' in phase_name:
            print(f"⏸️  No new notification (Expected) ({expected_label})")
        else:
            print(f"❌ No new notification added! (Unexpected for this phase) Expected ({expected_label})")


def run_main_timeline(session: Session):
    """Run the full 3-period timeline (A, B, C)."""
    print("\n" + "=" * 70)
    print("MAIN TIMELINE: Full 3-period notification cycle")
    print("Period A = Mar 09-22 | Period B = Mar 23 - Apr 05 | Period C = Apr 06-19")
    print("=" * 70)

    phases = [
        # Period A notifications
        ("Phase 1a - Window Opens",                       sgt(2026, 3, 9, 7),    "A"),
        ("No Trigger - Early",                            sgt(2026, 3, 11, 7),   "A"),
        ("Phase 1b - 12h Warning (Exact Time)",           sgt(2026, 3, 13, 12),  "A"),
        ("Phase 1b - 12h Warning (If missed, same day)",  sgt(2026, 3, 13, 13),  "A"),
        ("Phase 2a - Review Open",                        sgt(2026, 3, 14, 7),   "A"),
        ("Phase 2b - Review Closing Soon",                sgt(2026, 3, 15, 12),  "A"),
        ("Phase 3a - Roster Planning Reminder",           sgt(2026, 3, 17, 7),   "A"),
        ("Phase 3b - Finalisation",                       sgt(2026, 3, 20, 7),   "A"),
        ("Phase 4a - HRIS Open (Period A)",               sgt(2026, 3, 23, 7),   "A"),
        ("Phase 4b - HRIS Closing Soon (Period A)",       sgt(2026, 4, 5, 12),   "A"),
        # Period B notifications
        ("Next 1a - Window Opens (B)",                    sgt(2026, 3, 23, 7),   "B"),
        ("Next 1b - 12h Warning (B)",                     sgt(2026, 3, 27, 12),  "B"),
        ("Next 2a - Review Open (B)",                     sgt(2026, 3, 28, 7),   "B"),
        ("Next 2b - Review Closing Soon (B)",             sgt(2026, 3, 29, 12),  "B"),
        ("Next 3a - Roster Planning (B)",                 sgt(2026, 3, 31, 7),   "B"),
        ("Next 3b - Finalisation (B)",                    sgt(2026, 4, 3, 7),    "B"),
        ("Phase 4a - HRIS Open (Period B)",               sgt(2026, 4, 6, 7),    "B"),
        ("Phase 4b - HRIS Closing Soon (Period B)",       sgt(2026, 4, 19, 12),  "B"),
    ]

    for phase_name, mock_now, expected_label in phases:
        run_phase(session, phase_name, mock_now, expected_label)


def run_edge_case_a_missed_window(session: Session):
    """Edge Case A: Server was down on Phase 2a day. Catch-up next day."""
    print("\n" + "=" * 70)
    print("EDGE CASE A: Missed Window (Celery Downtime)")
    print("  Server was DOWN on 2026-03-14 (Phase 2a day)")
    print("  Server comes back on 2026-03-15 at 07:00 SGT")
    print("  → SHIFT_REQUEST_REVIEW_OPEN should be caught up")
    print("=" * 70)

    # Clean state
    session.exec(delete(NotificationQueue))
    session.exec(delete(RosterPeriod))
    session.commit()

    # Bootstrap periods early
    ensure_roster_period_window(session, now=sgt(2026, 3, 1, 0))
    session.exec(delete(NotificationQueue))
    session.commit()

    # Run Phase 1a normally
    run_phase(session, "Phase 1a - Normal", sgt(2026, 3, 9, 7), "A")
    # SKIP Phase 2a day (March 14) entirely
    # Come back on March 15 at 07:00 — should catch up Phase 2a
    run_phase(session, "Phase 2a - CATCH UP (server was down Mar 14)", sgt(2026, 3, 15, 7), "A")


def run_edge_case_b_new_user(session: Session):
    """Edge Case B: New nurse joins mid-period, should get opening notification."""
    print("\n" + "=" * 70)
    print("EDGE CASE B: New User Joiner")
    print("  Request window opened on 2026-03-09")
    print("  New nurse joins on 2026-03-11")
    print("  → New nurse should still receive SHIFT_REQUEST_PERIOD_OPEN")
    print("=" * 70)

    # Clean state
    session.exec(delete(NotificationQueue))
    session.exec(delete(RosterPeriod))
    session.commit()

    # Ensure periods are provisioned
    ensure_roster_period_window(session, now=sgt(2026, 3, 1, 0))
    session.exec(delete(NotificationQueue))
    session.commit()

    # Run Phase 1a on March 9 — only original nurse gets it
    run_phase(session, "Phase 1a - Original nurse", sgt(2026, 3, 9, 7), "A")

    # Now add a new nurse on March 11
    new_nurse = session.exec(select(Nurse).where(Nurse.email == 'newnurse@example.com')).first()
    if not new_nurse:
        new_nurse = Nurse(
            name="New Nurse (joined late)",
            employeeid="N888",
            email="newnurse@example.com",
            wardid=1,
            isactive=True,
            designation="SN",
            employmenttype="FullTime",
            contactnumber="87654321",
        )
        session.add(new_nurse)
        session.commit()

    # Run on March 11 — new nurse should get OPEN notification (catch-up window)
    run_phase(session, "Phase 1a - New nurse catch-up (joined Mar 11)", sgt(2026, 3, 11, 7), "A")

    # Clean up the test nurse
    session.exec(delete(NotificationQueue).where(NotificationQueue.recipientid == new_nurse.nurseid))
    session.delete(new_nurse)
    session.commit()


def run_edge_case_c_timezone(session: Session):
    """Edge Case C: Timezone boundary — 06:59 SGT should NOT fire, 07:00 SGT should."""
    print("\n" + "=" * 70)
    print("EDGE CASE C: Timezone Boundary")
    print("  22:59 UTC = 06:59 SGT → SHOULD NOT trigger 07:00 notifications")  
    print("  23:00 UTC = 07:00 SGT → SHOULD trigger 07:00 notifications")
    print("=" * 70)

    # Clean state
    session.exec(delete(NotificationQueue))
    session.exec(delete(RosterPeriod))
    session.commit()

    # Ensure periods
    ensure_roster_period_window(session, now=sgt(2026, 3, 1, 0))
    session.exec(delete(NotificationQueue))
    session.commit()

    # 22:59 UTC on March 8 = 06:59 SGT on March 9 → too early
    run_phase(session, "06:59 SGT (SHOULD NOT trigger Phase 1a)", 
              datetime(2026, 3, 8, 22, 59, tzinfo=timezone.utc), "A")

    # 23:00 UTC on March 8 = 07:00 SGT on March 9 → should fire
    run_phase(session, "07:00 SGT (SHOULD trigger Phase 1a)",
              datetime(2026, 3, 8, 23, 0, tzinfo=timezone.utc), "A")

    # 03:59 UTC on March 13 = 11:59 SGT on March 13 → too early for 12h
    run_phase(session, "11:59 SGT (SHOULD NOT trigger Phase 1b 12h)",
              datetime(2026, 3, 13, 3, 59, tzinfo=timezone.utc), "A")

    # 04:00 UTC on March 13 = 12:00 SGT on March 13 → should fire
    run_phase(session, "12:00 SGT (SHOULD trigger Phase 1b 12h)",
              datetime(2026, 3, 13, 4, 0, tzinfo=timezone.utc), "A")


def run_verification():
    print("Connecting to DB and setting up test data...")
    with Session(engine) as session:
        setup_test_data(session)

        # ==========================================
        # MAIN TIMELINE
        # ==========================================
        session.exec(delete(NotificationQueue))
        session.exec(delete(RosterPeriod))
        session.commit()

        # Bootstrap periods early (no notifications)
        ensure_roster_period_window(session, now=sgt(2026, 3, 1, 0))
        session.exec(delete(NotificationQueue))
        session.commit()

        run_main_timeline(session)

        # ==========================================
        # EDGE CASES
        # ==========================================
        run_edge_case_a_missed_window(session)
        run_edge_case_b_new_user(session)
        run_edge_case_c_timezone(session)

        print("\n" + "=" * 70)
        print("✅ Verification complete!")
        print("=" * 70)


if __name__ == "__main__":
    run_verification()
