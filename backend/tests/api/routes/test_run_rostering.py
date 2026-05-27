from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.api.routes import run_rostering
from app.models.designation import Designation
from app.models.leave import LeaveRequest
from app.models.rbac import Nurse, NurseManager
from app.models.roster import Roster, RosterPeriod, Ward
from app.models.shifts import ShiftCode, ShiftRequest
from app.rostering.cp_sat_algo import parse_inputs as parse_ga_inputs
from app.rostering.milp_algo import _parse_inputs as parse_milp_inputs
from app.tasks import roster_tasks


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


def _ensure_base_shift_codes(db: Session) -> None:
    for shiftcode, description, isworking, hours in (
        ("A", "AM", True, 8.5),
        ("A-ADD", "AM additional", True, 9.5),
        ("P", "PM", True, 8.5),
        ("N", "Night", True, 11.0),
        ("AM", "AM", True, 8.5),
        ("PM", "PM", True, 8.5),
        ("NIGHT", "Night", True, 11.0),
        ("AL", "Annual Leave", False, None),
        ("HOL", "Public Holiday", False, None),
        ("ML", "Medical Leave", False, None),
        ("DO", "Day Off", False, None),
        ("RD", "Rest Day", False, None),
        ("SD", "Sleeping Day", False, None),
    ):
        existing = db.get(ShiftCode, shiftcode)
        if existing:
            existing.isworking = isworking
            existing.shiftdurationhours = hours
            db.add(existing)
            continue
        db.add(
            ShiftCode(
                shiftcode=shiftcode,
                description=description,
                isworking=isworking,
                shiftdurationhours=hours,
            )
        )
    db.commit()


def _ensure_designations(db: Session) -> None:
    for designation, rank in (("RN", "A"), ("EN", "B"), ("HCA3", "C")):
        existing = db.get(Designation, designation)
        if existing:
            existing.rank = rank
            db.add(existing)
            continue
        db.add(Designation(designation=designation, rank=rank))
    db.commit()


def test_generation_inputs_use_classified_requests_and_previous_roster(
    db: Session,
) -> None:
    _ensure_designations(db)

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
        employeeid=f"EMP-HARD-{ward.wardid}",
        designation="RN",
        email=f"hard-{ward.wardid}@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    nurse_2 = Nurse(
        name="Nurse Soft",
        employeeid=f"EMP-SOFT-{ward.wardid}",
        designation="EN",
        email=f"soft-{ward.wardid}@example.com",
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

    _ensure_base_shift_codes(db)

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
            requestnumber=1,
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
            requestnumber=2,
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
            requestnumber=3,
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
            requestnumber=4,
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
            requestnumber=5,
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
            requestnumber=6,
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
            requestnumber=7,
            status="Pending",
            timestamp=datetime(2026, 3, 7, tzinfo=timezone.utc),
        )
    )
    db.commit()

    inputs = run_rostering._load_generation_inputs(
        db,
        ward.wardid,
        current_period.periodid,
    )

    assert inputs["hard_requests"] == {}
    assert inputs["soft_requests"] == {
        nurse_1.nurseid: [
            (0, "AM", "approved"),
            (1, "PM", "pending"),
            (2, "OFF", "approved"),
        ],
    }
    assert inputs["shift_hours"] == {
        "AM": 8.5,
        "PM": 8.5,
        "NIGHT": 11.0,
        "OFF": 0.0,
    }
    assert {"ML", "AL"}.issubset(inputs["non_working_shift_codes"])


def test_load_generation_inputs_treats_manual_pending_roster_as_locked(
    db: Session,
) -> None:
    _ensure_designations(db)
    _ensure_base_shift_codes(db)

    ward = Ward(
        wardname="Locked Input Ward",
        isactive=True,
        am_rn=1,
        am_en_na_min=0,
        am_hca_min=0,
        pm_rn=0,
        pm_en_na_min=0,
        pm_hca_min=0,
        nd_rn=0,
        nd_en_na_min=0,
        nd_hca_min=0,
    )
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse_1 = Nurse(
        name="Locked Nurse",
        employeeid=f"LOCK-1-{ward.wardid}",
        designation="RN",
        email=f"locked-{ward.wardid}@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    nurse_2 = Nurse(
        name="Ignored Nurse",
        employeeid=f"LOCK-2-{ward.wardid}",
        designation="EN",
        email=f"ignored-{ward.wardid}@example.com",
        contactnumber="222",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    inactive_nurse = Nurse(
        name="Inactive Nurse",
        employeeid=f"LOCK-3-{ward.wardid}",
        designation="RN",
        email=f"inactive-{ward.wardid}@example.com",
        contactnumber="333",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=False,
    )
    db.add(nurse_1)
    db.add(nurse_2)
    db.add(inactive_nurse)
    db.commit()
    db.refresh(nurse_1)
    db.refresh(nurse_2)
    db.refresh(inactive_nurse)

    period = _create_period(
        db,
        name="Locked Input Period",
        startdate=date(2026, 5, 1),
        enddate=date(2026, 5, 14),
    )

    db.add(
        Roster(
            nurseid=nurse_1.nurseid,
            wardid=ward.wardid,
            periodid=period.periodid,
            shiftdate=period.startdate,
            shiftcode="A",
            status="Pending",
            assignmentmethod="Manual",
            comment="keep",
        )
    )
    db.add(
        Roster(
            nurseid=nurse_1.nurseid,
            wardid=ward.wardid,
            periodid=period.periodid,
            shiftdate=period.startdate + timedelta(days=1),
            shiftcode="N",
            status="Pending",
            assignmentmethod="Manual",
        )
    )
    db.add(
        Roster(
            nurseid=nurse_2.nurseid,
            wardid=ward.wardid,
            periodid=period.periodid,
            shiftdate=period.startdate + timedelta(days=2),
            shiftcode="P",
            status="Pending",
            assignmentmethod="AB-RATIO",
        )
    )
    db.add(
        Roster(
            nurseid=nurse_2.nurseid,
            wardid=ward.wardid,
            periodid=period.periodid,
            shiftdate=period.startdate + timedelta(days=3),
            shiftcode="N",
            status="Confirmed",
            assignmentmethod="Manual",
        )
    )
    db.add(
        Roster(
            nurseid=inactive_nurse.nurseid,
            wardid=ward.wardid,
            periodid=period.periodid,
            shiftdate=period.startdate + timedelta(days=4),
            shiftcode="A",
            status="Pending",
            assignmentmethod="Manual",
        )
    )
    db.add(
        ShiftRequest(
            nurseid=nurse_1.nurseid,
            periodid=period.periodid,
            preferreddate=period.startdate,
            preferredshifttype="P",
            status="Pending",
            timestamp=datetime(2026, 4, 1, tzinfo=timezone.utc),
        )
    )
    db.add(
        LeaveRequest(
            nurseid=nurse_1.nurseid,
            startdate=period.startdate + timedelta(days=1),
            enddate=period.startdate + timedelta(days=1),
            leavetype="AL",
            status="Approved",
        )
    )
    db.commit()

    inputs = run_rostering._load_generation_inputs(db, ward.wardid, period.periodid)

    assert set(inputs["hard_requests"][nurse_1.nurseid]) == {
        (0, "AM"),
        (1, "AL"),
    }
    assert inputs["soft_requests"].get(nurse_1.nurseid) in (None, [])
    assert nurse_2.nurseid not in inputs["hard_requests"]
    assert inactive_nurse.nurseid not in inputs["hard_requests"]
    assert {
        (slot["nurse_id"], slot["day_idx"], slot["shift_label"])
        for slot in inputs["locked_roster_slots"]
    } == {
        (nurse_1.nurseid, 0, "AM"),
        (nurse_1.nurseid, 1, "NIGHT"),
    }

    inputs_with_prefilled = run_rostering._load_generation_inputs(
        db,
        ward.wardid,
        period.periodid,
        [
            run_rostering.RosterPrefilledSlot(
                nurse_id=nurse_2.nurseid,
                shift_date=period.startdate + timedelta(days=2),
                shift_code="P",
            ),
            run_rostering.RosterPrefilledSlot(
                nurse_id=inactive_nurse.nurseid,
                shift_date=period.startdate + timedelta(days=4),
                shift_code="A",
            ),
        ],
    )

    assert (2, "PM") in inputs_with_prefilled["hard_requests"][nurse_2.nurseid]
    assert inactive_nurse.nurseid not in inputs_with_prefilled["hard_requests"]


def test_load_generation_inputs_normalizes_prefilled_slots_for_solver_and_overlay(
    db: Session,
) -> None:
    _ensure_designations(db)
    _ensure_base_shift_codes(db)

    ward = Ward(
        wardname="Prefilled Variants Ward",
        isactive=True,
        am_rn=1,
        am_en_na_min=0,
        am_hca_min=0,
        pm_rn=0,
        pm_en_na_min=0,
        pm_hca_min=0,
        nd_rn=0,
        nd_en_na_min=0,
        nd_hca_min=0,
    )
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse = Nurse(
        name="Variant Nurse",
        employeeid=f"VAR-1-{ward.wardid}",
        designation="RN",
        email=f"variant-{ward.wardid}@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    db.add(nurse)
    db.commit()
    db.refresh(nurse)

    period = _create_period(
        db,
        name="Prefilled Variants Period",
        startdate=date(2026, 7, 1),
        enddate=date(2026, 7, 14),
    )

    inputs = run_rostering._load_generation_inputs(
        db,
        ward.wardid,
        period.periodid,
        [
            run_rostering.RosterPrefilledSlot(
                nurse_id=nurse.nurseid,
                shift_date=period.startdate,
                shift_code="A-ADD",
            ),
            run_rostering.RosterPrefilledSlot(
                nurse_id=nurse.nurseid,
                shift_date=period.startdate + timedelta(days=1),
                shift_code="RD",
            ),
            run_rostering.RosterPrefilledSlot(
                nurse_id=nurse.nurseid,
                shift_date=period.startdate + timedelta(days=2),
                shift_code="HOL",
            ),
            run_rostering.RosterPrefilledSlot(
                nurse_id=nurse.nurseid,
                shift_date=period.startdate + timedelta(days=3),
                shift_code="ML",
            ),
        ],
    )

    assert inputs["hard_requests"][nurse.nurseid] == [
        (0, "AM"),
        (1, "OFF"),
        (2, "HOL"),
        (3, "ML"),
    ]
    assert [
        (slot["day_idx"], slot["shift_code"], slot["shift_label"], slot["is_algorithm_locked"])
        for slot in inputs["locked_roster_slots"]
    ] == [
        (0, "A-ADD", "AM", True),
        (1, "RD", "OFF", True),
        (2, "HOL", "HOL", True),
        (3, "ML", "ML", True),
    ]


def test_locked_roster_overlay_preserves_exact_prefilled_codes() -> None:
    roster = {
        "nurses": [
            {
                "id": 10,
                "name": "Alice",
                "rank": "A",
                "schedule": ["PM", "AM", "DO", "A"],
            }
        ]
    }

    run_rostering._apply_locked_roster_overlay(
        roster,
        [
            {
                "nurse_id": 10,
                "day_idx": 0,
                "shift_code": "A-ADD",
                "shift_label": "AM",
                "is_algorithm_locked": True,
            },
            {
                "nurse_id": 10,
                "day_idx": 1,
                "shift_code": "HOL",
                "shift_label": "HOL",
                "is_algorithm_locked": True,
            },
            {
                "nurse_id": 10,
                "day_idx": 3,
                "shift_code": "ML",
                "shift_label": "ML",
                "is_algorithm_locked": True,
            },
            {
                "nurse_id": 10,
                "day_idx": 2,
                "shift_code": "N",
                "shift_label": "NIGHT",
                "is_algorithm_locked": False,
            },
        ],
    )

    assert roster["nurses"][0]["schedule"] == ["A-ADD", "HOL", "DO", "ML"]


def test_save_roster_result_persists_exact_overlaid_prefilled_codes(
    db: Session,
) -> None:
    _ensure_designations(db)

    ward = Ward(
        wardname="Prefilled Save Ward",
        isactive=True,
        am_rn=1,
        am_en_na_min=0,
        am_hca_min=0,
        pm_rn=0,
        pm_en_na_min=0,
        pm_hca_min=0,
        nd_rn=0,
        nd_en_na_min=0,
        nd_hca_min=0,
    )
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse = Nurse(
        name="Prefilled Save Nurse",
        employeeid=f"PREF-SAVE-1-{ward.wardid}",
        designation="RN",
        email=f"pref-save-{ward.wardid}@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    db.add(nurse)
    db.commit()
    db.refresh(nurse)

    period = _create_period(
        db,
        name="Prefilled Save Period",
        startdate=date(2026, 8, 1),
        enddate=date(2026, 8, 14),
    )

    roster_tasks._save_roster_result(
        db,
        ward.wardid,
        period.periodid,
        {
            "nurses": [
                {
                    "id": nurse.nurseid,
                    "name": nurse.name,
                    "rank": "A",
                    "schedule": ["A-ADD", "HOL", "RD"],
                }
            ]
        },
        "AB-RATIO",
    )

    rows = db.exec(
        select(Roster)
        .where(Roster.wardid == ward.wardid)
        .where(Roster.periodid == period.periodid)
        .order_by(Roster.shiftdate)
    ).all()

    assert [row.shiftcode for row in rows] == ["A-ADD", "HOL", "RD"]


def test_save_roster_result_preserves_manual_pending_locked_slots(
    db: Session,
) -> None:
    _ensure_designations(db)

    ward = Ward(
        wardname="Locked Save Ward",
        isactive=True,
        am_rn=1,
        am_en_na_min=0,
        am_hca_min=0,
        pm_rn=0,
        pm_en_na_min=0,
        pm_hca_min=0,
        nd_rn=0,
        nd_en_na_min=0,
        nd_hca_min=0,
    )
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse = Nurse(
        name="Save Nurse",
        employeeid=f"SAVE-1-{ward.wardid}",
        designation="RN",
        email=f"save-{ward.wardid}@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    db.add(nurse)
    db.commit()
    db.refresh(nurse)

    period = _create_period(
        db,
        name="Locked Save Period",
        startdate=date(2026, 6, 1),
        enddate=date(2026, 6, 14),
    )
    manager = NurseManager(
        name="Save Manager",
        employeeid=f"MGR-SAVE-{ward.wardid}",
        email=f"save-manager-{ward.wardid}@example.com",
        contactnumber="999",
        isactive=True,
    )
    db.add(manager)
    db.commit()
    db.refresh(manager)

    locked = Roster(
        nurseid=nurse.nurseid,
        wardid=ward.wardid,
        periodid=period.periodid,
        shiftdate=period.startdate,
        shiftcode="P",
        status="Pending",
        assignmentmethod="Manual",
        assignedby=manager.managerid,
        comment="preserve this",
    )
    old_generated = Roster(
        nurseid=nurse.nurseid,
        wardid=ward.wardid,
        periodid=period.periodid,
        shiftdate=period.startdate + timedelta(days=1),
        shiftcode="N",
        status="Pending",
        assignmentmethod="AB-RATIO",
    )
    old_manual_confirmed = Roster(
        nurseid=nurse.nurseid,
        wardid=ward.wardid,
        periodid=period.periodid,
        shiftdate=period.startdate + timedelta(days=2),
        shiftcode="A",
        status="Confirmed",
        assignmentmethod="Manual",
        comment="replace this",
    )
    db.add(locked)
    db.add(old_generated)
    db.add(old_manual_confirmed)
    db.commit()
    db.refresh(locked)
    locked_roster_id = locked.rosterid

    roster_tasks._save_roster_result(
        db,
        ward.wardid,
        period.periodid,
        {
            "nurses": [
                {
                    "id": nurse.nurseid,
                    "name": nurse.name,
                    "rank": "A",
                    "schedule": ["AM", "PM", "NIGHT"],
                }
            ]
        },
        "MILP",
    )

    rows = db.exec(
        select(Roster)
        .where(Roster.wardid == ward.wardid)
        .where(Roster.periodid == period.periodid)
        .order_by(Roster.shiftdate)
    ).all()

    assert [(row.shiftdate, row.shiftcode, row.assignmentmethod) for row in rows] == [
        (period.startdate, "P", "Manual"),
        (period.startdate + timedelta(days=1), "P", "MILP"),
        (period.startdate + timedelta(days=2), "N", "MILP"),
    ]
    assert rows[0].rosterid == locked_roster_id
    assert rows[0].comment == "preserve this"
    assert rows[0].assignedby == manager.managerid


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


def test_milp_parse_inputs_keeps_do_and_rd_as_off_requests() -> None:
    nurses = [
        {"id": 1, "name": "Alice", "rank": "A"},
    ]
    shifts = [{"AM": {"A": 1, "B": 0, "C": 0}, "PM": {"A": 0, "B": 0, "C": 0}, "NIGHT": {"A": 0, "B": 0, "C": 0}} for _ in range(14)]

    parsed = parse_milp_inputs(
        nurses,
        shifts,
        hard_requests={1: [(0, "DO")]},
        soft_requests={1: [(1, "RD"), (2, "HOL")]},
        prev_last_shift={},
        non_working_shift_codes={"AL", "DO", "RD", "HOL"},
    )

    assert parsed["hard_requests_rn"] == {"Alice": {"Day 1": "DO"}}
    assert parsed["soft_requests_rn"] == {"Alice": {"Day 2": "DO", "Day 3": "HOL"}}


def test_ga_parse_inputs_maps_non_working_leave_codes_to_al_and_preserves_shift_hours() -> None:
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

    assert parsed["al_day_requests"][0] == frozenset({3})
    assert parsed["approved_requests"][0] == []
    assert parsed["pending_requests"][1] == [(4, 2)]
    assert parsed["hard_requests"][0] == [(0, 0)]
    assert parsed["hard_requests"][1] == []
    assert parsed["shift_hours"] == {"AM": 8.5, "PM": 8.5, "NIGHT": 11.0, "OFF": 0.0}


def test_ga_parse_inputs_treats_hol_as_al_for_approved_leave_requests() -> None:
    nurses = [
        {"id": 10, "name": "Alice", "rank": "A"},
    ]
    shifts = [{"AM": {"A": 1, "B": 0, "C": 0}, "PM": {"A": 0, "B": 0, "C": 0}, "NIGHT": {"A": 0, "B": 0, "C": 0}} for _ in range(14)]

    parsed = parse_ga_inputs(
        nurses,
        shifts,
        hard_requests={10: [(2, "HOL")]},
        soft_requests={},
        prev_last_shift={},
        shift_hours={"AM": 8.0, "PM": 8.0, "NIGHT": 10.0, "OFF": 0.0},
        non_working_shift_codes={"AL", "HOL"},
    )

    assert parsed["al_nurses"] == frozenset()
    assert parsed["al_day_requests"][0] == frozenset({2})
    assert parsed["approved_requests"][0] == []


def test_ga_parse_inputs_keeps_do_and_rd_as_off_requests() -> None:
    nurses = [
        {"id": 10, "name": "Alice", "rank": "A"},
    ]
    shifts = [{"AM": {"A": 1, "B": 0, "C": 0}, "PM": {"A": 0, "B": 0, "C": 0}, "NIGHT": {"A": 0, "B": 0, "C": 0}} for _ in range(14)]

    parsed = parse_ga_inputs(
        nurses,
        shifts,
        hard_requests={10: [(1, "DO")]},
        soft_requests={10: [(2, "RD")]},
        prev_last_shift={},
        shift_hours={"AM": 8.0, "PM": 8.0, "NIGHT": 10.0, "OFF": 0.0},
        non_working_shift_codes={"AL", "DO", "RD", "HOL"},
    )

    assert parsed["approved_requests"][0] == [(1, 0)]
    assert parsed["pending_requests"][0] == [(2, 0)]
    assert parsed["al_day_requests"][0] == frozenset()


def test_load_shift_hours_returns_12_hour_shift_durations(db: Session) -> None:
    shift_hours = run_rostering._load_shift_hours(db, "12_HOURS")

    assert "A-12" in shift_hours
    assert "N-12" in shift_hours
    assert shift_hours["OFF"] == 0.0
