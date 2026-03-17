from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models import RosterPeriod

ROSTER_CYCLE_ANCHOR = date(2026, 3, 9)
PERIOD_LENGTH_DAYS = 14
PERIODS_PER_ROSTER_YEAR = 26
ROSTER_YEAR_LENGTH_DAYS = PERIOD_LENGTH_DAYS * PERIODS_PER_ROSTER_YEAR
ROSTER_YEARS_TO_KEEP = 2


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

    return list(
        session.exec(select(RosterPeriod).order_by(RosterPeriod.startdate.desc())).all()
    )


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
