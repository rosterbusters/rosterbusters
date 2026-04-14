from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Nurse
from app.models.enums import NotificationType
from app.models.roster import NotificationQueue
from app.models.rbac import NurseManager
from app.utils import (
    generate_shift_request_period_open_email,
    generate_shift_request_period_closing_soon_email,
    generate_shift_request_review_open_email,
    generate_shift_request_review_closing_soon_email,
    generate_hris_portal_open_email,
    generate_hris_portal_closing_soon_email,
    generate_algorithm_notification_email,
    send_email,
)

from app.models import RosterPeriod

ROSTER_CYCLE_ANCHOR = date(2026, 3, 9)
PERIOD_LENGTH_DAYS = 14
PERIODS_PER_ROSTER_YEAR = 26
ROSTER_YEAR_LENGTH_DAYS = PERIOD_LENGTH_DAYS * PERIODS_PER_ROSTER_YEAR
ROSTER_YEARS_TO_KEEP = 2
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RosterPeriodDefinition:
    roster_year: int
    period_number: int
    startdate: date
    enddate: date
    requestopendate: date
    requestclosedate: date
    name: str
    status: str


def get_roster_year_start(for_date: date) -> date:
    year_offset = (for_date - ROSTER_CYCLE_ANCHOR).days // ROSTER_YEAR_LENGTH_DAYS
    return ROSTER_CYCLE_ANCHOR + timedelta(days=year_offset * ROSTER_YEAR_LENGTH_DAYS)


def get_planning_lock_date(startdate: date) -> date | None:
    return None


def build_roster_period_definitions(today: date | None = None) -> list[RosterPeriodDefinition]:
    today = today or date.today()
    current_year_start = get_roster_year_start(today)
    definitions: list[RosterPeriodDefinition] = []

    for roster_year_offset in range(ROSTER_YEARS_TO_KEEP):
        roster_year_start = current_year_start + timedelta(
            days=roster_year_offset * ROSTER_YEAR_LENGTH_DAYS
        )
        roster_year_label = roster_year_start.year

        for period_index in range(PERIODS_PER_ROSTER_YEAR):
            startdate = roster_year_start + timedelta(days=period_index * PERIOD_LENGTH_DAYS)
            enddate = startdate + timedelta(days=11)
            requestopendate = startdate - timedelta(days=14)
            requestclosedate = startdate - timedelta(days=10)

            if today > enddate:
                status = "Published"
            elif requestopendate <= today <= requestclosedate:
                status = "RequestOpen"
            else:
                status = "Pending"

            definitions.append(
                RosterPeriodDefinition(
                    roster_year=roster_year_label,
                    period_number=period_index + 1,
                    startdate=startdate,
                    enddate=enddate,
                    requestopendate=requestopendate,
                    requestclosedate=requestclosedate,
                    name=f"{startdate.strftime('%b %d')} - {enddate.strftime('%b %d %Y')}",
                    status=status,
                )
            )

    return definitions


def ensure_roster_period_window(
    session: Session, today: date | datetime | None = None, now: datetime | None = None
) -> list[RosterPeriod]:
    if now is not None:
        actual_now = now
    elif today is not None:
        if isinstance(today, datetime):
            actual_now = today
        else:
            actual_now = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    else:
        actual_now = datetime.now(timezone.utc)
        
    actual_today = actual_now.date()
    definitions = build_roster_period_definitions(today=actual_today)
    target_by_start = {definition.startdate: definition for definition in definitions}

    existing_periods = list(session.exec(select(RosterPeriod)).all())
    existing_by_start = {period.startdate: period for period in existing_periods}

    for startdate, definition in target_by_start.items():
        existing = existing_by_start.get(startdate)
        if existing is None:
            session.add(
                RosterPeriod(
                    name=definition.name,
                    startdate=definition.startdate,
                    enddate=definition.enddate,
                    requestopendate=definition.requestopendate,
                    requestclosedate=definition.requestclosedate,
                    status=definition.status,
                )
            )
            continue

        existing.name = definition.name
        existing.enddate = definition.enddate
        existing.requestopendate = definition.requestopendate
        existing.requestclosedate = definition.requestclosedate
        existing.status = definition.status

    for period in existing_periods:
        if period.startdate not in target_by_start:
            session.delete(period)

    session.commit()

    periods = list(
        session.exec(select(RosterPeriod).order_by(RosterPeriod.startdate.desc())).all()
    )
    try:
        _queue_roster_period_notifications(session, periods, now=actual_now)
    except Exception:
        logger.exception("Failed to queue roster period notifications")
    session.commit()

    return periods


def _queue_roster_period_notifications(
    session: Session,
    periods: list[RosterPeriod],
    now: datetime,
) -> int:
    # ------------------------------------------------------------------ #
    # Convert UTC → local time so h >= 7 means 07:00 local, not UTC     #
    # ------------------------------------------------------------------ #
    tz_offset = timedelta(hours=settings.NOTIFICATION_TIMEZONE_OFFSET_HOURS)
    local_now = now + tz_offset
    d = local_now.date()
    h = local_now.hour

    nurses = list(
        session.exec(
            select(Nurse).where(
                Nurse.isactive == True,
                Nurse.wardid.is_not(None),
            )
        ).all()
    )
    managers = list(
        session.exec(
            select(NurseManager).where(
                NurseManager.isactive == True,
            )
        ).all()
    )

    created = 0

    for period in periods:
        if period.periodid is None:
            continue

        # ------------------------------------------------------------------ #
        # Bounded-window conditions.                                         #
        #                                                                    #
        # Each window starts at the ideal trigger date and extends a few     #
        # days forward to allow "catch-up" if the server was down.           #
        # Duplicate prevention is handled by the NotificationQueue check     #
        # below, so wider windows are safe.                                  #
        # ------------------------------------------------------------------ #
        phases = [
            # Phase 1a — Shift request window opens (WS)
            {
                "type": NotificationType.SHIFT_REQUEST_PERIOD_OPEN,
                "recipient_type": "Nurse",
                "recipients": nurses,
                "condition": (
                    period.requestopendate <= d <= period.requestclosedate
                    and not (d == period.requestopendate and h < 7)
                ),
                "email_func": generate_shift_request_period_open_email,
            },
            # Phase 1b — Shift request closing in 12h (WS)
            {
                "type": NotificationType.SHIFT_REQUEST_PERIOD_CLOSING_SOON,
                "recipient_type": "Nurse",
                "recipients": nurses,
                "condition": (
                    period.requestclosedate <= d <= period.requestclosedate + timedelta(days=1)
                    and not (d == period.requestclosedate and h < 12)
                ),
                "email_func": generate_shift_request_period_closing_soon_email,
            },
            # Phase 2a — Shift request review opens (NM)
            {
                "type": NotificationType.SHIFT_REQUEST_REVIEW_OPEN,
                "recipient_type": "NurseManager",
                "recipients": managers,
                "condition": (
                    period.requestclosedate + timedelta(days=1) <= d <= period.requestclosedate + timedelta(days=2)
                    and not (d == period.requestclosedate + timedelta(days=1) and h < 7)
                ),
                "email_func": generate_shift_request_review_open_email,
            },
            # Phase 2b — Shift request review closing in 12h (NM)
            {
                "type": NotificationType.SHIFT_REQUEST_REVIEW_CLOSING_SOON,
                "recipient_type": "NurseManager",
                "recipients": managers,
                "condition": (
                    period.requestclosedate + timedelta(days=2) <= d < period.startdate - timedelta(days=7)
                    and not (d == period.requestclosedate + timedelta(days=2) and h < 12)
                ),
                "email_func": generate_shift_request_review_closing_soon_email,
            },
            # Phase 3a — Roster planning reminder (NM)
            {
                "type": NotificationType.ROSTER_PLANNING,
                "recipient_type": "NurseManager",
                "recipients": managers,
                "condition": (
                    period.startdate - timedelta(days=7) <= d <= period.startdate - timedelta(days=3)
                    and not (d == period.startdate - timedelta(days=7) and h < 7)
                ),
                "email_func": None,
            },
            # Phase 3b — Roster finalisation deadline (NM)
            {
                "type": NotificationType.ROSTER_FINALISATION,
                "recipient_type": "NurseManager",
                "recipients": managers,
                "condition": (
                    period.startdate - timedelta(days=3) <= d <= period.enddate
                    and not (d == period.startdate - timedelta(days=3) and h < 7)
                ),
                "email_func": None,
            },
            # Phase 4a — HRIS export portal opens (NM)
            {
                "type": NotificationType.HRIS_PORTAL_OPEN,
                "recipient_type": "NurseManager",
                "recipients": managers,
                "condition": (
                    period.enddate <= d <= period.enddate + timedelta(days=2)
                    and not (d == period.enddate and h < 7)
                ),
                "email_func": generate_hris_portal_open_email,
            },
            # Phase 4b — HRIS portal closing in 12h (NM)
            {
                "type": NotificationType.HRIS_PORTAL_CLOSING_SOON,
                "recipient_type": "NurseManager",
                "recipients": managers,
                "condition": (
                    period.enddate + timedelta(days=2) <= d <= period.enddate + timedelta(days=4)
                    and not (d == period.enddate + timedelta(days=2) and h < 12)
                ),
                "email_func": generate_hris_portal_closing_soon_email,
            },
        ]

        for phase in phases:
            if not phase["condition"]:
                continue

            targets = phase["recipients"]
            if not targets:
                continue

            target_ids = [t.nurseid if phase["recipient_type"] == "Nurse" else t.managerid for t in targets]

            existing_pairs = set(
                session.exec(
                    select(NotificationQueue.recipientid).where(
                        NotificationQueue.recipienttype == phase["recipient_type"],
                        NotificationQueue.notificationtype == phase["type"].value,
                        NotificationQueue.relatedentitytype == "RosterPeriod",
                        NotificationQueue.relatedentityid == period.periodid,
                        NotificationQueue.recipientid.in_(target_ids),
                    )
                ).all()
            )

            for target in targets:
                tid = target.nurseid if phase["recipient_type"] == "Nurse" else target.managerid
                if tid in existing_pairs:
                    continue

                crud.create_notification(
                    session,
                    recipient_type=phase["recipient_type"],
                    recipient_id=tid,
                    notification_type=phase["type"],
                    related_entity_type="RosterPeriod",
                    related_entity_id=period.periodid,
                    roster_period=period.name,
                    roster_planning_end_date=(period.startdate - timedelta(days=3)).strftime("%d %b %Y"),
                    roster_end_date=period.enddate.strftime("%d %b %Y"),
                )

                if settings.emails_enabled and target.email:
                    try:
                        email_func = phase["email_func"]
                        if email_func:
                            email_data = email_func(
                                email_to=target.email,
                                roster_period=period.name,
                            )
                            send_email(
                                email_to=target.email,
                                subject=email_data.subject,
                                html_content=email_data.html_content,
                            )
                        elif phase["type"] in (NotificationType.ROSTER_PLANNING, NotificationType.ROSTER_FINALISATION):
                            email_data = generate_algorithm_notification_email(
                                email_to=target.email,
                                roster_period=period.name,
                                message=phase["type"].template.format(
                                    roster_period=period.name,
                                    roster_planning_end_date=(period.startdate - timedelta(days=3)).strftime("%d %b %Y"),
                                ),
                                manager_name=getattr(target, "name", "Nurse Manager"),
                            )
                            send_email(
                                email_to=target.email,
                                subject=email_data.subject,
                                html_content=email_data.html_content,
                            )
                    except Exception as exc:
                        logger.warning(
                            "Failed to send %s email to %s: %s",
                            phase['type'].value,
                            target.email,
                            exc,
                        )
                created += 1

    return created


def get_period_window(
    periods: list[RosterPeriod], today: date | None = None
) -> tuple[RosterPeriod | None, RosterPeriod | None, RosterPeriod | None]:
    today = today or date.today()
    periods_by_start = sorted(periods, key=lambda period: period.startdate)

    current_period = next(
        (period for period in periods_by_start if period.startdate <= today <= period.enddate),
        None,
    )
    upcoming_period = next(
        (period for period in periods_by_start if period.startdate > today),
        None,
    )
    request_open_period = next(
        (period for period in periods_by_start if period.status == "RequestOpen"),
        None,
    )
    return current_period, upcoming_period, request_open_period
