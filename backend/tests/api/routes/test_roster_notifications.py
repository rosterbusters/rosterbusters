"""
Tests for the 8-phase roster notification timeline.

Covers:
  1. Date math correctness
  2. Phase-by-phase triggering
  3. Idempotency (no duplicate notifications)
  4. Bounded-window catch-up (missed day recovery)
  5. Nurse eligibility (inactive, no ward)
  6. Cross-period isolation
  7. Multiple recipients
  8. Timezone boundary (local hour gate)

Calendar reference (Period B: roster 23 Mar – 03 Apr 2026):
  requestopendate  = 9 Mar  (startdate - 14)
  requestclosedate = 13 Mar (startdate - 10)
  startdate        = 23 Mar
  enddate          = 03 Apr (startdate + 11)
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Nurse, RosterPeriod
from app.models.designation import Designation
from app.models.enums import NotificationType
from app.models.rbac import NurseManager
from app.models.roster import NotificationQueue, RosterChangeLog, Roster
from app.models.shifts import ShiftRequest
from app.models.leave import LeaveRequest
from app.services.roster_period_service import (
    build_roster_period_definitions,
    ensure_roster_period_window,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

START = date(2026, 3, 23)
END = date(2026, 4, 3)
REQUEST_OPEN = date(2026, 3, 9)
REQUEST_CLOSE = date(2026, 3, 13)

SGT_OFFSET = settings.NOTIFICATION_TIMEZONE_OFFSET_HOURS  # 8

_DESIGNATION_RANKS = {
    "SN": "A", "SSN": "A",
    "EN": "B", "SEN": "B", "NA": "B", "HCA1": "B", "HCA2": "B",
    "HCA3": "C",
}


def _sgt(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    """Create a UTC datetime that corresponds to the given SGT local time."""
    local = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    return local - timedelta(hours=SGT_OFFSET)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_designation(db: Session, designation: str, rank: str = "A") -> None:
    from app.models.designation import Designation
    if db.get(Designation, designation) is None:
        db.add(Designation(designation=designation, rank=rank))
        db.commit()


def _clear(db: Session) -> None:
    """Wipe test rows in FK-safe order."""
    try:
        db.rollback()
    except Exception:
        pass
    try:
        for row in db.exec(select(RosterChangeLog)).all():
            db.delete(row)
        for row in db.exec(select(NotificationQueue)).all():
            db.delete(row)
        for row in db.exec(select(LeaveRequest)).all():
            db.delete(row)
        for row in db.exec(select(ShiftRequest)).all():
            db.delete(row)
        for row in db.exec(select(Roster)).all():
            db.delete(row)
        for row in db.exec(select(Nurse).where(Nurse.email.like("%@test.com"))).all():
            db.delete(row)
        for row in db.exec(select(NurseManager).where(NurseManager.email.like("%@test.com"))).all():
            db.delete(row)
        for row in db.exec(select(RosterPeriod)).all():
            db.delete(row)
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def _make_nurse(
    db: Session,
    *,
    email: str,
    wardid: int | None = 1,
    isactive: bool = True,
    designation: str = "SN",
) -> Nurse:
    """Create or reuse a nurse by email."""
    _ensure_designation(db, designation, _DESIGNATION_RANKS.get(designation, "A"))
    existing = db.exec(select(Nurse).where(Nurse.email == email)).first()
    if existing:
        existing.wardid = wardid
        existing.isactive = isactive
        existing.designation = designation
        db.commit()
        db.refresh(existing)
        return existing
    nurse = Nurse(
        name=f"Test {email[:20]}",
        employeeid=f"T{uuid.uuid4().hex[:11].upper()}",
        designation=designation,
        email=email,
        contactnumber="90000000",
        wardid=wardid,
        employmenttype="FullTime",
        isactive=isactive,
    )
    db.add(nurse)
    db.commit()
    db.refresh(nurse)
    return nurse


def _make_manager(
    db: Session,
    *,
    email: str,
    isactive: bool = True,
) -> NurseManager:
    """Create or reuse a NurseManager by email."""
    existing = db.exec(select(NurseManager).where(NurseManager.email == email)).first()
    if existing:
        existing.isactive = isactive
        db.commit()
        db.refresh(existing)
        return existing
    manager = NurseManager(
        name=f"Mgr {email[:20]}",
        email=email,
        isactive=isactive,
        is_superuser=False,
        hashed_password="xxx",
    )
    db.add(manager)
    db.commit()
    db.refresh(manager)
    return manager


def _get_target_period(db: Session, startdate: date = START) -> RosterPeriod | None:
    return db.exec(select(RosterPeriod).where(RosterPeriod.startdate == startdate)).first()


def _notifs(
    db: Session,
    recipient_id: int,
    recipient_type: str,
    ntype: NotificationType,
    period: RosterPeriod,
) -> list[NotificationQueue]:
    return list(
        db.exec(
            select(NotificationQueue).where(
                NotificationQueue.recipientid == recipient_id,
                NotificationQueue.recipienttype == recipient_type,
                NotificationQueue.notificationtype == ntype.value,
                NotificationQueue.relatedentityid == period.periodid,
            )
        ).all()
    )


def _setup(db: Session, email_prefix: str = "rn"):
    """Clean DB, create 1 nurse + 1 manager, bootstrap periods."""
    _clear(db)
    nurse = _make_nurse(db, email=f"{email_prefix}.nurse@test.com")
    manager = _make_manager(db, email=f"{email_prefix}.mgr@test.com")
    # Pre-populate periods with no notifications
    ensure_roster_period_window(db, now=_sgt(2026, 3, 1, 0))
    # Clear any notifications generated during bootstrap
    for row in db.exec(select(NotificationQueue)).all():
        db.delete(row)
    db.commit()
    return nurse, manager


# ===========================================================================
# 1. Date math
# ===========================================================================

def test_requestopendate_is_startdate_minus_14() -> None:
    defs = build_roster_period_definitions(today=REQUEST_OPEN)
    t = next(d for d in defs if d.startdate == START)
    assert t.requestopendate == REQUEST_OPEN
    assert t.requestopendate == START - timedelta(days=14)


def test_requestclosedate_is_startdate_minus_10() -> None:
    defs = build_roster_period_definitions(today=REQUEST_OPEN)
    t = next(d for d in defs if d.startdate == START)
    assert t.requestclosedate == REQUEST_CLOSE
    assert t.requestclosedate == START - timedelta(days=10)


def test_enddate_is_startdate_plus_11() -> None:
    defs = build_roster_period_definitions(today=REQUEST_OPEN)
    t = next(d for d in defs if d.startdate == START)
    assert t.enddate == END
    assert t.enddate == START + timedelta(days=11)


# ===========================================================================
# 2. Phase-by-phase triggering
# ===========================================================================

def test_phase_1a_fires_on_requestopendate(db: Session) -> None:
    nurse, _ = _setup(db, "p1a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1


def test_phase_1b_fires_at_noon_on_requestclosedate(db: Session) -> None:
    nurse, _ = _setup(db, "p1b")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 13, 12))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_CLOSING_SOON, p)) == 1


def test_phase_2a_fires_day_after_close(db: Session) -> None:
    _, manager = _setup(db, "p2a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 14, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_OPEN, p)) == 1


def test_phase_2b_fires_two_days_after_close_at_noon(db: Session) -> None:
    _, manager = _setup(db, "p2b")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 15, 12))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_CLOSING_SOON, p)) == 1


def test_phase_3a_fires_7_days_before_start(db: Session) -> None:
    _, manager = _setup(db, "p3a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 16, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.ROSTER_PLANNING, p)) == 1


def test_phase_3b_fires_3_days_before_start(db: Session) -> None:
    _, manager = _setup(db, "p3b")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 20, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.ROSTER_FINALISATION, p)) == 1


def test_phase_4a_fires_on_enddate(db: Session) -> None:
    _, manager = _setup(db, "p4a")
    # HRIS_PORTAL_OPEN fires on Period A's enddate (Mar 20)
    p_a = db.exec(select(RosterPeriod).where(RosterPeriod.startdate == date(2026, 3, 9))).first()
    assert p_a is not None
    ensure_roster_period_window(db, now=_sgt(2026, 3, 20, 7))
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.HRIS_PORTAL_OPEN, p_a)) == 1


def test_phase_4b_fires_2_days_after_enddate_at_noon(db: Session) -> None:
    _, manager = _setup(db, "p4b")
    # HRIS closes for Period A (enddate=Mar 20) → triggers Mar 22 at 12:00
    p_a = db.exec(select(RosterPeriod).where(RosterPeriod.startdate == date(2026, 3, 9))).first()
    assert p_a is not None
    ensure_roster_period_window(db, now=_sgt(2026, 3, 22, 12))
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.HRIS_PORTAL_CLOSING_SOON, p_a)) == 1


# ===========================================================================
# 3. Negative tests — phases must NOT fire before their trigger time
# ===========================================================================

def test_phase_1a_does_not_fire_before_opendate(db: Session) -> None:
    nurse, _ = _setup(db, "neg1a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 8, 23))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 0


def test_phase_1b_does_not_fire_before_noon(db: Session) -> None:
    nurse, _ = _setup(db, "neg1b")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 13, 11))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_CLOSING_SOON, p)) == 0


# ===========================================================================
# 4. Idempotency
# ===========================================================================

def test_phase_1a_is_idempotent(db: Session) -> None:
    nurse, _ = _setup(db, "idem1a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 8))
    ensure_roster_period_window(db, now=_sgt(2026, 3, 10, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1


def test_phase_2a_is_idempotent(db: Session) -> None:
    _, manager = _setup(db, "idem2a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 14, 7))
    ensure_roster_period_window(db, now=_sgt(2026, 3, 14, 18))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_OPEN, p)) == 1


def test_roster_period_duplicates_are_self_healed(db: Session) -> None:
    _, manager = _setup(db, "heal2a")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 14, 7))
    p = _get_target_period(db)
    assert p is not None

    db.add(
        NotificationQueue(
            recipienttype="NurseManager",
            recipientid=manager.managerid,
            notificationtype=NotificationType.SHIFT_REQUEST_REVIEW_OPEN.value,
            channel="Email",
            priority="Normal",
            subject=NotificationType.SHIFT_REQUEST_REVIEW_OPEN.value,
            messagebody=NotificationType.SHIFT_REQUEST_REVIEW_OPEN.template.format(
                roster_period=p.name,
            ),
            relatedentitytype="RosterPeriod",
            relatedentityid=p.periodid,
            status="Pending",
        )
    )
    db.commit()
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_OPEN, p)) == 2

    ensure_roster_period_window(db, now=_sgt(2026, 3, 14, 18))

    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_OPEN, p)) == 1


# ===========================================================================
# 5. Bounded-window catch-up (missed day recovery)
# ===========================================================================

def test_phase_1a_catchup_after_missed_day(db: Session) -> None:
    """If server was down on requestopendate, Phase 1a fires the next day."""
    nurse, _ = _setup(db, "catch1a")
    # Skip March 9, run on March 10
    ensure_roster_period_window(db, now=_sgt(2026, 3, 10, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1


def test_phase_2a_catchup_after_missed_day(db: Session) -> None:
    """If server was down on requestclosedate+1, Phase 2a fires the next day."""
    _, manager = _setup(db, "catch2a")
    # Skip March 14, run on March 15
    ensure_roster_period_window(db, now=_sgt(2026, 3, 15, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_OPEN, p)) == 1


def test_phase_3a_catchup_after_missed_day(db: Session) -> None:
    """If server was down on startdate-7, Phase 3a fires the next day."""
    _, manager = _setup(db, "catch3a")
    # Skip March 16, run on March 17
    ensure_roster_period_window(db, now=_sgt(2026, 3, 17, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.ROSTER_PLANNING, p)) == 1


def test_phase_4a_catchup_after_missed_day(db: Session) -> None:
    """If server was down on enddate, Phase 4a fires the next day."""
    _, manager = _setup(db, "catch4a")
    p_a = db.exec(select(RosterPeriod).where(RosterPeriod.startdate == date(2026, 3, 9))).first()
    assert p_a is not None
    # Skip March 20, run on March 21
    ensure_roster_period_window(db, now=_sgt(2026, 3, 21, 7))
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.HRIS_PORTAL_OPEN, p_a)) == 1


# ===========================================================================
# 6. Nurse eligibility
# ===========================================================================

def test_nurse_without_ward_skipped(db: Session) -> None:
    _clear(db)
    nurse = _make_nurse(db, email="elig.noward@test.com", wardid=None)
    _make_manager(db, email="elig.noward.mgr@test.com")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 1, 0))
    for row in db.exec(select(NotificationQueue)).all():
        db.delete(row)
    db.commit()
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 0


def test_inactive_nurse_skipped(db: Session) -> None:
    _clear(db)
    nurse = _make_nurse(db, email="elig.inactive@test.com", isactive=False)
    _make_manager(db, email="elig.inactive.mgr@test.com")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 1, 0))
    for row in db.exec(select(NotificationQueue)).all():
        db.delete(row)
    db.commit()
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 0


def test_inactive_manager_skipped(db: Session) -> None:
    _clear(db)
    _make_nurse(db, email="elig.inactivemgr.nurse@test.com")
    manager = _make_manager(db, email="elig.inactivemgr@test.com", isactive=False)
    ensure_roster_period_window(db, now=_sgt(2026, 3, 1, 0))
    for row in db.exec(select(NotificationQueue)).all():
        db.delete(row)
    db.commit()
    ensure_roster_period_window(db, now=_sgt(2026, 3, 14, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, manager.managerid, "NurseManager", NotificationType.SHIFT_REQUEST_REVIEW_OPEN, p)) == 0


# ===========================================================================
# 7. Multiple recipients
# ===========================================================================

def test_multiple_nurses_all_notified(db: Session) -> None:
    _clear(db)
    nurses = [_make_nurse(db, email=f"multi.{i}@test.com") for i in range(3)]
    _make_manager(db, email="multi.mgr@test.com")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 1, 0))
    for row in db.exec(select(NotificationQueue)).all():
        db.delete(row)
    db.commit()
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    p = _get_target_period(db)
    assert p is not None
    for nurse in nurses:
        assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1


# ===========================================================================
# 8. Timezone boundary
# ===========================================================================

def test_phase_1a_does_not_fire_at_0659_sgt(db: Session) -> None:
    """22:59 UTC = 06:59 SGT — too early for 07:00 gate."""
    nurse, _ = _setup(db, "tz1a")
    ensure_roster_period_window(db, now=datetime(2026, 3, 8, 22, 59, tzinfo=timezone.utc))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 0


def test_phase_1a_fires_at_0700_sgt(db: Session) -> None:
    """23:00 UTC = 07:00 SGT — should fire."""
    nurse, _ = _setup(db, "tz1a2")
    ensure_roster_period_window(db, now=datetime(2026, 3, 8, 23, 0, tzinfo=timezone.utc))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1


def test_phase_1b_does_not_fire_at_1159_sgt(db: Session) -> None:
    """03:59 UTC = 11:59 SGT — too early for 12:00 gate."""
    nurse, _ = _setup(db, "tz1b")
    ensure_roster_period_window(db, now=datetime(2026, 3, 13, 3, 59, tzinfo=timezone.utc))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_CLOSING_SOON, p)) == 0


def test_phase_1b_fires_at_1200_sgt(db: Session) -> None:
    """04:00 UTC = 12:00 SGT — should fire."""
    nurse, _ = _setup(db, "tz1b2")
    ensure_roster_period_window(db, now=datetime(2026, 3, 13, 4, 0, tzinfo=timezone.utc))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_CLOSING_SOON, p)) == 1


# ===========================================================================
# 9. Cross-period isolation
# ===========================================================================

def test_notifications_scoped_to_correct_period(db: Session) -> None:
    nurse, _ = _setup(db, "scope")
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    p = _get_target_period(db)
    assert p is not None
    notifs = _notifs(db, nurse.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)
    assert len(notifs) == 1
    assert notifs[0].relatedentityid == p.periodid


# ===========================================================================
# 10. New user joiner (mid-period catch-up)
# ===========================================================================

def test_new_nurse_gets_open_notification_mid_period(db: Session) -> None:
    """A nurse added after requestopendate still gets Phase 1a via catch-up window."""
    nurse1, _ = _setup(db, "joiner")
    # Phase 1a fires for nurse1 on day 1
    ensure_roster_period_window(db, now=_sgt(2026, 3, 9, 7))
    p = _get_target_period(db)
    assert p is not None
    assert len(_notifs(db, nurse1.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1
    # New nurse joins on day 3
    nurse2 = _make_nurse(db, email="joiner.late@test.com")
    # Run again — nurse2 should get the catch-up notification
    ensure_roster_period_window(db, now=_sgt(2026, 3, 11, 7))
    assert len(_notifs(db, nurse2.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1
    # nurse1 should still have exactly 1 (not 2)
    assert len(_notifs(db, nurse1.nurseid, "Nurse", NotificationType.SHIFT_REQUEST_PERIOD_OPEN, p)) == 1
