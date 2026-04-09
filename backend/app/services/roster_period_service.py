from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Nurse
from app.models.enums import NotificationType
from app.models.roster import NotificationQueue
from app.utils import (
    generate_shift_request_period_closed_email,
    generate_shift_request_period_open_email,
    send_email,
)

from app.models import RosterPeriod

ROSTER_CYCLE_ANCHOR = date(2026, 3, 9)
PERIOD_LENGTH_DAYS = 14
PERIODS_PER_ROSTER_YEAR = 26
ROSTER_YEAR_LENGTH_DAYS = PERIOD_LENGTH_DAYS * PERIODS_PER_ROSTER_YEAR
ROSTER_YEARS_TO_KEEP = 2
# TODO: Replace this temporary bypass with the real roster planning lock cutoff
# once the implementation date/policy is finalized.
PLANNING_LOCK_OFFSET_DAYS = -365
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
    # TODO: Re-enable roster period planning lock calculation once policy is finalized.
    # return startdate - timedelta(days=PLANNING_LOCK_OFFSET_DAYS)
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
            enddate = startdate + timedelta(days=PERIOD_LENGTH_DAYS - 1)
            requestopendate = startdate - timedelta(days=14)
            # TODO: revert to original close date (startdate - 10 days) once request window timing is finalised
            # requestclosedate = startdate - timedelta(days=10)
            requestclosedate = startdate - timedelta(days=13)

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
    session: Session, today: date | None = None
) -> list[RosterPeriod]:
    today = today or date.today()
    definitions = build_roster_period_definitions(today=today)
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
        _queue_shift_request_open_notifications(session, periods, today=today)
        _queue_shift_request_closed_notifications(session, periods, today=today)
    except Exception:
        logger.exception("Failed to queue roster period notifications")
    session.commit()

    return periods


def _queue_shift_request_open_notifications(
    session: Session,
    periods: list[RosterPeriod],
    today: date | None = None,
) -> int:
    """Queue notifications for ward staff when the shift request period opens.

    Notifications are created once per nurse per roster period, keyed by relatedentity.
    """
    today = today or date.today()
    open_periods = [
        period
        for period in periods
        if period.status == "RequestOpen" and period.requestopendate <= today <= period.requestclosedate
    ]
    if not open_periods:
        return 0

    nurses = list(
        session.exec(
            select(Nurse).where(
                Nurse.isactive == True,  # noqa: E712
                Nurse.wardid.is_not(None),
            )
        ).all()
    )
    if not nurses:
        return 0

    nurse_ids = [nurse.nurseid for nurse in nurses]
    open_period_ids = [period.periodid for period in open_periods if period.periodid is not None]
    if not open_period_ids:
        return 0

    existing_pairs = set(
        session.exec(
            select(NotificationQueue.recipientid, NotificationQueue.relatedentityid).where(
                NotificationQueue.recipienttype == "Nurse",
                NotificationQueue.notificationtype == NotificationType.SHIFT_REQUEST_PERIOD_OPEN.value,
                NotificationQueue.relatedentitytype == "RosterPeriod",
                NotificationQueue.relatedentityid.in_(open_period_ids),
                NotificationQueue.recipientid.in_(nurse_ids),
            )
        ).all()
    )

    created = 0
    for period in open_periods:
        if period.periodid is None:
            continue
        for nurse in nurses:
            nurse_id = nurse.nurseid
            if (nurse_id, period.periodid) in existing_pairs:
                continue
            crud.create_notification(
                session,
                recipient_type="Nurse",
                recipient_id=nurse_id,
                notification_type=NotificationType.SHIFT_REQUEST_PERIOD_OPEN,
                related_entity_type="RosterPeriod",
                related_entity_id=period.periodid,
                roster_period=period.name,
            )
            if settings.emails_enabled and nurse.email:
                try:
                    email_data = generate_shift_request_period_open_email(
                        email_to=nurse.email,
                        roster_period=period.name,
                    )
                    send_email(
                        email_to=nurse.email,
                        subject=email_data.subject,
                        html_content=email_data.html_content,
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to send shift request open email to %s: %s",
                        nurse.email,
                        exc,
                    )
            created += 1

    return created


def _queue_shift_request_closed_notifications(
    session: Session,
    periods: list[RosterPeriod],
    today: date | None = None,
) -> int:
    """Queue notifications for ward staff when the shift request period closes."""
    today = today or date.today()
    closed_periods = [
        period
        for period in periods
        if period.status != "RequestOpen"
        and period.requestclosedate < today <= period.startdate
    ]
    if not closed_periods:
        return 0

    nurses = list(
        session.exec(
            select(Nurse).where(
                Nurse.isactive == True,  # noqa: E712
                Nurse.wardid.is_not(None),
            )
        ).all()
    )
    if not nurses:
        return 0

    nurse_ids = [nurse.nurseid for nurse in nurses]
    closed_period_ids = [period.periodid for period in closed_periods if period.periodid is not None]
    if not closed_period_ids:
        return 0

    existing_pairs = set(
        session.exec(
            select(NotificationQueue.recipientid, NotificationQueue.relatedentityid).where(
                NotificationQueue.recipienttype == "Nurse",
                NotificationQueue.notificationtype == NotificationType.SHIFT_REQUEST_PERIOD_CLOSED.value,
                NotificationQueue.relatedentitytype == "RosterPeriod",
                NotificationQueue.relatedentityid.in_(closed_period_ids),
                NotificationQueue.recipientid.in_(nurse_ids),
            )
        ).all()
    )

    created = 0
    for period in closed_periods:
        if period.periodid is None:
            continue
        for nurse in nurses:
            nurse_id = nurse.nurseid
            if (nurse_id, period.periodid) in existing_pairs:
                continue
            crud.create_notification(
                session,
                recipient_type="Nurse",
                recipient_id=nurse_id,
                notification_type=NotificationType.SHIFT_REQUEST_PERIOD_CLOSED,
                related_entity_type="RosterPeriod",
                related_entity_id=period.periodid,
                roster_period=period.name,
            )
            if settings.emails_enabled and nurse.email:
                try:
                    email_data = generate_shift_request_period_closed_email(
                        email_to=nurse.email,
                        roster_period=period.name,
                    )
                    send_email(
                        email_to=nurse.email,
                        subject=email_data.subject,
                        html_content=email_data.html_content,
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to send shift request closed email to %s: %s",
                        nurse.email,
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
