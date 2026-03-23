from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.routes import run_rostering
from app.core.config import settings
from app.models.rbac import Nurse
from app.models.roster import Roster, RosterPeriod, Ward
from app.models.shifts import ShiftCode, ShiftRequest
from app.rostering.ga_algo import parse_inputs as parse_ga_inputs
from app.rostering.milp_algo import _parse_inputs as parse_milp_inputs


def _create_period(
    db: Session,
    *,
    name: str,
    startdate: date,
    enddate: date,
) -> RosterPeriod:
    period = RosterPeriod(
        name=name,
        startdate=startdate,
        enddate=enddate,
        requestopendate=startdate - timedelta(days=14),
        requestclosedate=startdate - timedelta(days=1),
        status="RequestOpen",
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


def test_generate_algorithm_uses_classified_requests_and_previous_roster(
    client: TestClient,
    db: Session,
    monkeypatch,
) -> None:
    ward = Ward(
        wardname="Routing Ward",
        isactive=True,
        am_rn=1,
        am_en_na_min=0,
        am_hca_min=0,
        pm_rn=1,
        pm_en_na_min=0,
        pm_hca_min=0,
        nd_rn=1,
        nd_en_na_min=0,
        nd_hca_min=0,
    )
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse_1 = Nurse(
        name="Nurse Hard",
        employeeid="EMP-HARD",
        designation="RN",
        email="hard@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    nurse_2 = Nurse(
        name="Nurse Soft",
        employeeid="EMP-SOFT",
        designation="EN",
        email="soft@example.com",
        contactnumber="222",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    db.add(nurse_1)
    db.add(nurse_2)
    db.commit()
    db.refresh(nurse_1)
    db.refresh(nurse_2)

    current_period = _create_period(
        db,
        name="Current Period",
        startdate=date(2026, 4, 1),
        enddate=date(2026, 4, 14),
    )
    previous_period = _create_period(
        db,
        name="Previous Period",
        startdate=date(2026, 3, 18),
        enddate=date(2026, 3, 31),
    )

    db.add(
        ShiftCode(shiftcode="ML", description="Medical Leave", isworking=False)
    )
    db.add(
        ShiftCode(shiftcode="AL", description="Annual Leave", isworking=False)
    )
    db.add(
        ShiftCode(shiftcode="A", description="AM", isworking=True, shiftdurationhours=8.5)
    )
    db.add(
        ShiftCode(shiftcode="P", description="PM", isworking=True, shiftdurationhours=8.5)
    )
    db.add(
        ShiftCode(shiftcode="N", description="Night", isworking=True, shiftdurationhours=11.0)
    )
    db.add(
        Roster(
            nurseid=nurse_1.nurseid,
            wardid=ward.wardid,
            periodid=previous_period.periodid,
            shiftdate=previous_period.enddate,
            shiftcode="NIGHT",
            status="Confirmed",
        )
    )
    db.add(
        Roster(
            nurseid=nurse_2.nurseid,
            wardid=ward.wardid,
            periodid=previous_period.periodid,
            shiftdate=previous_period.enddate,
            shiftcode="PM",
            status="Confirmed",
        )
    )

    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.startdate,
            preferredshifttype="PM",
            status="Approved",
            timestamp=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.startdate,
            preferredshifttype="AM",
            status="Approved",
            timestamp=datetime(2026, 3, 2, tzinfo=timezone.utc),
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.startdate,
            preferredshifttype="NIGHT",
            status="Pending",
            timestamp=datetime(2026, 3, 3, tzinfo=timezone.utc),
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.startdate + timedelta(days=1),
            preferredshifttype="PM",
            status="Pending",
            timestamp=datetime(2026, 3, 4, tzinfo=timezone.utc),
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.startdate + timedelta(days=2),
            preferredshifttype="ML",
            status="Approved",
            timestamp=datetime(2026, 3, 5, tzinfo=timezone.utc),
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.startdate + timedelta(days=3),
            preferredshifttype="OFF",
            status="Rejected",
            timestamp=datetime(2026, 3, 6, tzinfo=timezone.utc),
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=current_period.periodid,
            preferreddate=current_period.enddate + timedelta(days=1),
            preferredshifttype="AM",
            status="Pending",
            timestamp=datetime(2026, 3, 7, tzinfo=timezone.utc),
        )
    )
    db.commit()

    captured: dict[str, object] = {}

    def fake_generate_roster(**kwargs):
        captured.update(kwargs)
        return {"method": "MILP", "roster": {"nurses": [], "metadata": {"algorithm": "MILP"}}}

    monkeypatch.setattr(run_rostering, "generate_roster", fake_generate_roster)

    response = client.post(
        f"{settings.API_V1_STR}/roster/generate-algorithm",
        json={"ward_id": ward.wardid, "period_id": current_period.periodid},
    )

    assert response.status_code == 200, response.text
    assert captured["hard_requests"] == {
        nurse_1.nurseid: [(2, "ML")],
    }
    assert captured["soft_requests"] == {
        nurse_1.nurseid: [(1, "PM")],
    }
    assert captured["prev_last_shift"] == {
        nurse_1.nurseid: "NIGHT",
        nurse_2.nurseid: "PM",
    }
    assert captured["shift_hours"] == {
        "AM": 8.5,
        "PM": 8.5,
        "NIGHT": 11.0,
        "OFF": 0.0,
    }
    assert captured["non_working_shift_codes"] == {"ML", "AL"}


def test_milp_parse_inputs_separates_hard_soft_and_prev_context() -> None:
    nurses = [
        {"id": 1, "name": "Alice", "rank": "A"},
        {"id": 2, "name": "Bea", "rank": "B"},
        {"id": 3, "name": "Cara", "rank": "C"},
    ]
    shifts = [{"AM": {"A": 1, "B": 0, "C": 0}, "PM": {"A": 0, "B": 1, "C": 0}, "NIGHT": {"A": 0, "B": 0, "C": 1}} for _ in range(14)]

    parsed = parse_milp_inputs(
        nurses,
        shifts,
        hard_requests={1: [(0, "AM"), (1, "ML")]},
        soft_requests={2: [(2, "PM"), (3, "AL")]},
        prev_last_shift={1: "NIGHT", 2: "PM"},
        non_working_shift_codes={"AL", "ML"},
    )

    assert parsed["hard_requests_rn"] == {"Alice": {"Day 1": "A", "Day 2": "ML"}}
    assert parsed["soft_requests_en"] == {"Bea": {"Day 3": "P", "Day 4": "AL"}}
    assert parsed["prev_week_roster_rn"] == {"Alice": "N"}
    assert parsed["prev_week_roster_en"] == {}


def test_ga_parse_inputs_maps_non_working_codes_to_off_and_preserves_shift_hours() -> None:
    nurses = [
        {"id": 10, "name": "Alice", "rank": "A"},
        {"id": 20, "name": "Bea", "rank": "B"},
    ]
    shifts = [{"AM": {"A": 1, "B": 0, "C": 0}, "PM": {"A": 0, "B": 1, "C": 0}, "NIGHT": {"A": 0, "B": 0, "C": 0}} for _ in range(14)]

    parsed = parse_ga_inputs(
        nurses,
        shifts,
        hard_requests={10: [(3, "ML")]},
        soft_requests={20: [(4, "PM")]},
        prev_last_shift={10: "NIGHT", 20: "PM"},
        shift_hours={"AM": 8.5, "PM": 8.5, "NIGHT": 11.0, "OFF": 0.0},
        non_working_shift_codes={"AL", "ML"},
    )

    assert parsed["approved_requests"][0] == [(3, 0)]
    assert parsed["pending_requests"][1] == [(4, 2)]
    assert parsed["hard_requests"][0] == [(0, 0)]
    assert parsed["hard_requests"][1] == []
    assert parsed["shift_hours"] == {"AM": 8.5, "PM": 8.5, "NIGHT": 11.0, "OFF": 0.0}


def test_load_shift_hours_requires_base_shift_durations(db: Session) -> None:
    db.add(ShiftCode(shiftcode="A", description="AM", isworking=True, shiftdurationhours=8.5))
    db.add(ShiftCode(shiftcode="P", description="PM", isworking=True, shiftdurationhours=8.5))
    db.commit()

    try:
        run_rostering._load_shift_hours(db)
        assert False, "Expected missing NIGHT shift configuration to raise"
    except Exception as exc:
        assert "Missing shift code configuration for N" in str(exc)
