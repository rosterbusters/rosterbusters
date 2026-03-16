from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Nurse, RosterPeriod, ShiftCode, ShiftRequest
from app.services.roster_period_service import (
    PERIODS_PER_ROSTER_YEAR,
    ROSTER_YEAR_LENGTH_DAYS,
    build_roster_period_definitions,
    ensure_roster_period_window,
    get_roster_year_start,
)


def _clear_roster_period_state(db: Session) -> None:
    for shift_request in db.exec(select(ShiftRequest)).all():
        db.delete(shift_request)
    for period in db.exec(select(RosterPeriod)).all():
        db.delete(period)
    db.commit()


def _ensure_shift_request_dependencies(db: Session) -> Nurse:
    shift_code = db.get(ShiftCode, "D")
    if shift_code is None:
        shift_code = ShiftCode(shiftcode="D", description="Day", isworking=True)
        db.add(shift_code)

    nurse = db.exec(select(Nurse).where(Nurse.email == "roster-period-test@example.com")).first()
    if nurse is None:
        nurse = Nurse(
            name="Roster Period Test Nurse",
            employeeid="RPTEST001",
            designation="RN",
            email="roster-period-test@example.com",
            contactnumber="90000000",
            wardid=None,
            employmenttype="FullTime",
            isactive=True,
        )
        db.add(nurse)

    db.commit()
    db.refresh(nurse)
    return nurse


def test_build_roster_period_definitions_uses_march_anchor() -> None:
    periods = build_roster_period_definitions(today=date(2026, 3, 9))

    assert len(periods) == PERIODS_PER_ROSTER_YEAR * 2
    assert periods[0].roster_year == 2026
    assert periods[0].period_number == 1
    assert periods[0].startdate == date(2026, 3, 9)
    assert periods[0].enddate == date(2026, 3, 22)
    assert periods[1].period_number == 2
    assert periods[1].startdate == date(2026, 3, 23)


def test_get_roster_year_start_rolls_over_after_364_days() -> None:
    assert get_roster_year_start(date(2026, 3, 9)) == date(2026, 3, 9)
    assert get_roster_year_start(date(2027, 3, 8)) == date(2027, 3, 8)
    assert get_roster_year_start(date(2027, 3, 21)) == date(2027, 3, 8)


def test_ensure_roster_period_window_is_idempotent_and_updates_statuses(db: Session) -> None:
    _clear_roster_period_state(db)

    first_run = ensure_roster_period_window(db, today=date(2026, 3, 17))
    second_run = ensure_roster_period_window(db, today=date(2026, 3, 17))

    assert len(first_run) == PERIODS_PER_ROSTER_YEAR * 2
    assert len(second_run) == PERIODS_PER_ROSTER_YEAR * 2

    all_periods = list(db.exec(select(RosterPeriod).order_by(RosterPeriod.startdate)).all())
    assert len(all_periods) == PERIODS_PER_ROSTER_YEAR * 2
    assert all_periods[0].startdate == date(2026, 3, 9)
    assert all_periods[0].status == "Pending"
    assert all_periods[1].startdate == date(2026, 3, 23)
    assert all_periods[1].status == "RequestOpen"


def test_ensure_roster_period_window_prunes_old_periods_and_cascades_shift_requests(
    db: Session,
) -> None:
    _clear_roster_period_state(db)
    nurse = _ensure_shift_request_dependencies(db)

    old_period = RosterPeriod(
        name="Old Period",
        startdate=date(2025, 1, 1),
        enddate=date(2025, 1, 14),
        requestopendate=date(2024, 12, 22),
        requestclosedate=date(2024, 12, 29),
        status="Published",
    )
    db.add(old_period)
    db.commit()
    db.refresh(old_period)

    shift_request = ShiftRequest(
        nurseid=nurse.nurseid,
        periodid=old_period.periodid,
        preferreddate=old_period.startdate,
        preferredshifttype="D",
        requestnumber=1,
        status="Pending",
    )
    db.add(shift_request)
    db.commit()

    ensure_roster_period_window(db, today=date(2026, 3, 17))

    assert db.exec(
        select(RosterPeriod).where(RosterPeriod.startdate == date(2025, 1, 1))
    ).first() is None
    assert db.exec(
        select(ShiftRequest).where(ShiftRequest.periodid == old_period.periodid)
    ).first() is None


def test_get_roster_periods_route_auto_populates_periods(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _clear_roster_period_state(db)

    response = client.get(
        f"{settings.API_V1_STR}/shift-requests/periods",
        headers=superuser_token_headers,
    )

    assert response.status_code == 200
    periods = response.json()
    assert len(periods) == PERIODS_PER_ROSTER_YEAR * 2
    assert db.exec(select(RosterPeriod)).all()


def test_get_roster_period_route_returns_period_for_in_window_date(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _clear_roster_period_state(db)
    target_date = get_roster_year_start(date.today())

    response = client.get(
        f"{settings.API_V1_STR}/shift-requests/period",
        headers=superuser_token_headers,
        params={"target_date": target_date.isoformat()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["startdate"] == target_date.isoformat()


def test_get_roster_period_route_returns_404_for_out_of_window_date(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _clear_roster_period_state(db)
    far_future_date = get_roster_year_start(date.today()) + date.resolution * (
        ROSTER_YEAR_LENGTH_DAYS * 5
    )

    response = client.get(
        f"{settings.API_V1_STR}/shift-requests/period",
        headers=superuser_token_headers,
        params={"target_date": far_future_date.isoformat()},
    )

    assert response.status_code == 404
