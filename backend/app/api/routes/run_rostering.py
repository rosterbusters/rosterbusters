import json
import queue
import threading

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep, get_db
from app.designation_mapping import classify_designation
from app.models.rbac import Nurse, NurseManager
from app.models.roster import Roster, RosterChangeLog, RosterChangeLogPublic, RosterPeriod, Ward
from app.models.shifts import ShiftCode, ShiftRequest
from app.rbac import user_has_role
from app.rostering.algo_scheduler import generate_roster


class ChangelogCreateRequest(BaseModel):
    rosterid: Optional[int] = None
    oldnurseid: Optional[int] = None
    oldshiftcode: Optional[str] = None
    newshiftcode: Optional[str] = None
    changetype: str  # "shift_change" | "comment"
    reason: Optional[str] = None
    changesource: str = "Manual"


class RosterCommentUpdate(BaseModel):
    comment: Optional[str] = None


class RosterGenerationRequest(BaseModel):
    ward_id: int
    period_id: int


class TriggeredItem(BaseModel):
    ward_id: int
    period_id: int
    task_id: str


class SkippedItem(BaseModel):
    ward_id: int
    period_id: int
    reason: str


class ScheduledGenerationResponse(BaseModel):
    triggered: list[TriggeredItem]
    skipped: list[SkippedItem]


class RosterUpsertRequest(BaseModel):
    ward_id: int
    nurse_id: int
    period_id: int
    shift_date: date
    shift_code: str
    comment: Optional[str] = None
    status: str = "Pending"
    assignment_method: str = "Manual"


class BulkRosterUpsertRequest(BaseModel):
    entries: list[RosterUpsertRequest]


router = APIRouter()


def _get_celery_app():
    try:
        from app.worker import celery_app
    except ModuleNotFoundError as exc:
        if exc.name != "celery":
            raise
        raise HTTPException(
            status_code=503,
            detail="Celery is not available in the backend service.",
        ) from exc
    return celery_app


def _can_manage_ward(session: Session, current_user: CurrentUser, ward: Ward) -> bool:
    if current_user.managerid == ward.managerid:
        return True
    if current_user.email:
        return user_has_role(session, current_user.email, "Admin")
    return False


def _get_existing_roster_entry(
    session: Session,
    ward_id: int,
    nurse_id: int,
    period_id: int,
    shift_date: date,
) -> Roster | None:
    return session.exec(
        select(Roster).where(
            Roster.wardid == ward_id,
            Roster.nurseid == nurse_id,
            Roster.periodid == period_id,
            Roster.shiftdate == shift_date,
        )
    ).first()


def _upsert_roster_entry(
    session: Session,
    payload: RosterUpsertRequest,
    current_user: CurrentUser,
) -> Roster:
    ward = session.get(Ward, payload.ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    period = session.get(RosterPeriod, payload.period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")

    nurse = session.get(Nurse, payload.nurse_id)
    if not nurse:
        raise HTTPException(status_code=404, detail="Nurse not found")
    if nurse.wardid != payload.ward_id:
        raise HTTPException(status_code=400, detail="Nurse does not belong to the selected ward")

    if not _can_manage_ward(session, current_user, ward):
        raise HTTPException(status_code=403, detail="Not authorized to manage this ward roster")

    entry = _get_existing_roster_entry(
        session=session,
        ward_id=payload.ward_id,
        nurse_id=payload.nurse_id,
        period_id=payload.period_id,
        shift_date=payload.shift_date,
    )

    if entry:
        entry.shiftcode = payload.shift_code
        entry.comment = payload.comment
        entry.status = payload.status
        entry.assignmentmethod = payload.assignment_method
        entry.assignedby = current_user.managerid
    else:
        entry = Roster(
            nurseid=payload.nurse_id,
            wardid=payload.ward_id,
            periodid=payload.period_id,
            shiftdate=payload.shift_date,
            shiftcode=payload.shift_code,
            status=payload.status,
            assignmentmethod=payload.assignment_method,
            assignedby=current_user.managerid,
            comment=payload.comment,
        )
        session.add(entry)

    session.flush()
    return entry


@router.get("/manager/statistics")
def get_ward_statistics(ward_id: int, db: Session = Depends(get_db)):
    """Get nurses list for a ward (used by roster grid)."""
    ward = db.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    nurses = db.exec(
        select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
    ).all()

    return {
        "ward": {"wardId": ward.wardid, "wardName": ward.wardname},
        "nurses": [
            {
                "nurseId": n.nurseid,
                "name": n.name,
                "designation": n.designation,
                "employmentType": n.employmenttype,
                "staffing_role": classify_designation(n.designation).staffing_role,
                "roster_rank": classify_designation(n.designation).roster_rank,
            }
            for n in nurses
        ],
        "total_nurses": len(nurses),
    }


@router.get("/ward/{ward_id}")
def get_ward_roster(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    """Get roster entries for a ward within a roster period."""
    ward = db.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    period = db.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")

    entries = db.exec(
        select(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == period_id,
        )
    ).all()

    return {
        "ward": {"wardId": ward.wardid, "wardName": ward.wardname, "wardType": ward.wardtype},
        "period": {
            "periodId": period.periodid,
            "startDate": str(period.startdate),
            "endDate": str(period.enddate),
        },
        "roster_entries": [
            {
                "roster_id": e.rosterid,
                "nurse_id": e.nurseid,
                "shift_date": str(e.shiftdate),
                "shift_code": e.shiftcode,
                "status": e.status,
                "assignment_method": e.assignmentmethod,
                "comment": e.comment,
            }
            for e in entries
        ],
    }


@router.post("/create")
def create_or_update_roster_entry(
    body: RosterUpsertRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Create or update a single roster assignment."""
    entry = _upsert_roster_entry(session, body, current_user)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return {
        "roster_id": entry.rosterid,
        "nurse_id": entry.nurseid,
        "ward_id": entry.wardid,
        "period_id": entry.periodid,
        "shift_date": entry.shiftdate,
        "shift_code": entry.shiftcode,
        "status": entry.status,
        "comment": entry.comment,
    }


@router.post("/bulk-upsert")
def bulk_upsert_roster_entries(
    body: BulkRosterUpsertRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Create or update many roster assignments in one request."""
    if not body.entries:
        return {"entries": [], "count": 0}

    saved_entries: list[dict[str, Any]] = []
    for entry_payload in body.entries:
        entry = _upsert_roster_entry(session, entry_payload, current_user)
        session.add(entry)
        session.flush()
        saved_entries.append(
            {
                "roster_id": entry.rosterid,
                "nurse_id": entry.nurseid,
                "ward_id": entry.wardid,
                "period_id": entry.periodid,
                "shift_date": entry.shiftdate,
                "shift_code": entry.shiftcode,
                "status": entry.status,
                "comment": entry.comment,
            }
        )

    session.commit()
    return {"entries": saved_entries, "count": len(saved_entries)}


@router.post("/ward/{ward_id}/publish")
def publish_ward_roster(
    ward_id: int,
    period_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Finalize a ward roster for a given period by confirming all assignments."""
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    period = session.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")

    if not _can_manage_ward(session, current_user, ward):
        raise HTTPException(status_code=403, detail="Not authorized to publish this ward roster")

    entries = session.exec(
        select(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == period_id,
        )
    ).all()

    if not entries:
        raise HTTPException(status_code=400, detail="No roster assignments found to publish")

    for entry in entries:
        entry.status = "Confirmed"
        session.add(entry)

    period.status = "Finalized"
    session.add(period)
    session.commit()

    return {
        "ward_id": ward_id,
        "period_id": period_id,
        "published_count": len(entries),
        "status": period.status,
    }


@router.patch("/roster/{roster_id}/comment")
def update_roster_comment(
    roster_id: int,
    body: RosterCommentUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Update the comment on a roster entry."""
    entry = session.get(Roster, roster_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Roster entry not found")
    entry.comment = body.comment or None
    session.add(entry)
    session.commit()
    return {"roster_id": roster_id, "comment": entry.comment}


@router.post("/changelog", response_model=RosterChangeLogPublic)
def create_changelog_entry(
    request: ChangelogCreateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Record a roster change made by the currently logged-in manager."""
    manager_id = current_user.managerid

    # Resolve manager display name
    manager_name = "Unknown"
    if manager_id:
        mgr = session.get(NurseManager, manager_id)
        if mgr:
            manager_name = mgr.name

    # Resolve nurse display name (prefer explicit oldnurseid, else via roster)
    nurse_name = "Unknown"
    shift_date = None
    nurse_id = request.oldnurseid

    if request.rosterid:
        roster_entry = session.get(Roster, request.rosterid)
        if roster_entry:
            shift_date = roster_entry.shiftdate
            if not nurse_id:
                nurse_id = roster_entry.nurseid

    if nurse_id:
        nurse = session.get(Nurse, nurse_id)
        if nurse:
            nurse_name = nurse.name

    changelog = RosterChangeLog(
        rosterid=request.rosterid,
        changedbymanagerid=manager_id,
        changedat=datetime.now(timezone.utc),
        changetype=request.changetype,
        oldnurseid=nurse_id,
        oldshiftcode=request.oldshiftcode,
        newshiftcode=request.newshiftcode,
        reason=request.reason,
        changesource=request.changesource,
    )
    session.add(changelog)
    session.commit()
    session.refresh(changelog)

    return RosterChangeLogPublic(
        changeid=changelog.changeid,
        rosterid=changelog.rosterid,
        changedat=changelog.changedat,
        changetype=changelog.changetype,
        oldshiftcode=changelog.oldshiftcode,
        newshiftcode=changelog.newshiftcode,
        reason=changelog.reason,
        changesource=changelog.changesource,
        shiftdate=shift_date,
        nursename=nurse_name,
        modifiedby=manager_name,
    )


@router.get("/changelog", response_model=list[RosterChangeLogPublic])
def get_roster_changelog(
    ward_id: int,
    period_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get all changelog entries for a ward+period, newest first."""
    # Collect roster IDs for this ward+period
    roster_ids = [
        r.rosterid
        for r in session.exec(
            select(Roster).where(
                Roster.wardid == ward_id,
                Roster.periodid == period_id,
            )
        ).all()
        if r.rosterid is not None
    ]

    if not roster_ids:
        return []

    changelog_entries = session.exec(
        select(RosterChangeLog)
        .where(RosterChangeLog.rosterid.in_(roster_ids))  # type: ignore[attr-defined]
        .order_by(RosterChangeLog.changedat.desc())
    ).all()

    # Build lookup maps for names
    nurse_ids = {e.oldnurseid for e in changelog_entries if e.oldnurseid}
    manager_ids = {e.changedbymanagerid for e in changelog_entries if e.changedbymanagerid}
    roster_map = {r.rosterid: r for r in session.exec(
        select(Roster).where(Roster.rosterid.in_(roster_ids))  # type: ignore[attr-defined]
    ).all()}

    nurse_map: dict[int, str] = {}
    if nurse_ids:
        for nurse in session.exec(select(Nurse).where(Nurse.nurseid.in_(list(nurse_ids)))).all():  # type: ignore[attr-defined]
            nurse_map[nurse.nurseid] = nurse.name

    manager_map: dict[int, str] = {}
    if manager_ids:
        for mgr in session.exec(select(NurseManager).where(NurseManager.managerid.in_(list(manager_ids)))).all():  # type: ignore[attr-defined]
            manager_map[mgr.managerid] = mgr.name

    result = []
    for entry in changelog_entries:
        roster = roster_map.get(entry.rosterid) if entry.rosterid else None
        nurse_name = nurse_map.get(entry.oldnurseid, "Unknown") if entry.oldnurseid else "Unknown"
        manager_name = manager_map.get(entry.changedbymanagerid, "Unknown") if entry.changedbymanagerid else "System"
        result.append(RosterChangeLogPublic(
            changeid=entry.changeid,
            rosterid=entry.rosterid,
            changedat=entry.changedat,
            changetype=entry.changetype,
            oldshiftcode=entry.oldshiftcode,
            newshiftcode=entry.newshiftcode,
            reason=entry.reason,
            changesource=entry.changesource,
            shiftdate=roster.shiftdate if roster else None,
            nursename=nurse_name,
            modifiedby=manager_name,
        ))

    return result


@router.get("/ward/{ward_id}/shift-requirements")
def get_shift_requirements(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    """Get daily shift staffing requirements for a ward (repeated for 14 days)."""
    ward = db.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    daily_requirement = {
        "am_rn": ward.am_rn or 0,
        "am_en": ward.am_en_na_min or 0,
        "am_hca": ward.am_hca_min or 0,
        "pm_rn": ward.pm_rn or 0,
        "pm_en": ward.pm_en_na_min or 0,
        "pm_hca": ward.pm_hca_min or 0,
        "night_rn": ward.nd_rn or 0,
        "night_en": ward.nd_en_na_min or 0,
        "night_hca": ward.nd_hca_min or 0,
    }
    return [daily_requirement for _ in range(14)]


@router.get("/ward/{ward_id}/requests")
def get_ward_requests(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    """Get formatted shift requests for nurses in a ward for the rostering algorithm."""
    statement = (
        select(ShiftRequest)
        .join(Nurse, Nurse.nurseid == ShiftRequest.nurseid)
        .where(Nurse.wardid == ward_id)
        .where(ShiftRequest.periodid == period_id)
    )
    results = db.exec(statement).all()

    return [
        {
            "nurse_id": req.nurseid,
            "date": req.preferreddate.isoformat(),
            "shift": req.preferredshifttype,
        }
        for req in results
    ]


@router.post("/generate-algorithm")
def generate_roster_endpoint(
    request_data: RosterGenerationRequest,
    db: Session = Depends(get_db),
):
    """Run the MILP/GA rostering algorithm for a ward and roster period."""
    try:
        generation_inputs = _load_generation_inputs(db, request_data.ward_id, request_data.period_id)
        result = generate_roster(
            nurses=generation_inputs["nurses"],
            shifts=generation_inputs["shifts"],
            hard_requests=generation_inputs["hard_requests"],
            soft_requests=generation_inputs["soft_requests"],
            prev_last_shift=generation_inputs["prev_last_shift"],
            shift_hours=generation_inputs["shift_hours"],
            non_working_shift_codes=generation_inputs["non_working_shift_codes"],
            milp_config=generation_inputs["milp_config"],
        )
        return {"method": result["method"], "roster": result["roster"]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-algorithm-async")
def generate_roster_async(
    request_data: RosterGenerationRequest,
    db: Session = Depends(get_db),
):
    """Queue roster generation as a Celery background task. Returns a task_id to poll."""
    ward = db.get(Ward, request_data.ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    task = _get_celery_app().send_task(
        "tasks.generate_roster",
        args=[request_data.ward_id, request_data.period_id],
    )
    return {"task_id": task.id, "status": "queued"}


@router.post("/trigger-scheduled-generation", response_model=ScheduledGenerationResponse)
def trigger_scheduled_generation(
    days_ahead: int = 8,
    db: Session = Depends(get_db),
):
    """
    Called by AWS Lambda on a schedule. No user auth required.
    Finds RosterPeriods starting in `days_ahead` days, queues generate_and_save_roster_task
    for every active ward. Existing rosters are overwritten by the task.
    """
    target_date = date.today() + timedelta(days=days_ahead)

    periods = db.exec(
        select(RosterPeriod).where(
            RosterPeriod.startdate == target_date,
            RosterPeriod.status == "RequestOpen",
        )
    ).all()

    active_wards = db.exec(
        select(Ward).where(Ward.isactive == True)  # noqa: E712
    ).all()

    triggered: list[dict] = []
    skipped: list[dict] = []

    for period in periods:
        for ward in active_wards:
            task = _get_celery_app().send_task(
                "tasks.generate_and_save_roster",
                args=[ward.wardid, period.periodid],
            )
            triggered.append({
                "ward_id": ward.wardid,
                "period_id": period.periodid,
                "task_id": task.id,
            })

    return {"triggered": triggered, "skipped": skipped}


@router.get("/task/{task_id}/status")
def get_task_status(task_id: str):
    """Poll the status of a queued roster generation task."""
    result = _get_celery_app().AsyncResult(task_id)

    if result.state == "PENDING":
        return {"task_id": task_id, "status": "pending"}
    if result.state == "STARTED":
        return {"task_id": task_id, "status": "started"}
    if result.state == "PROGRESS":
        return {"task_id": task_id, "status": "in_progress", **(result.info or {})}
    if result.state == "SUCCESS":
        return {"task_id": task_id, "status": "complete", **(result.result or {})}
    if result.state == "FAILURE":
        return {"task_id": task_id, "status": "failed", "error": str(result.info)}
    return {"task_id": task_id, "status": result.state.lower()}


@router.post("/generate-algorithm-stream")
def generate_roster_stream(
    request_data: RosterGenerationRequest,
    db: Session = Depends(get_db),
):
    """Run the MILP/GA rostering algorithm and stream SSE progress events."""
    # Fetch all DB data before spawning the thread (SQLAlchemy sessions are not thread-safe)
    generation_inputs = _load_generation_inputs(db, request_data.ward_id, request_data.period_id)

    q: queue.Queue = queue.Queue()

    def _run():
        try:
            def on_progress(gen: int, total_gens: int, best_score: float) -> None:
                q.put({
                    "type": "progress",
                    "generation": gen,
                    "total": total_gens,
                    "percent": round(gen / total_gens * 100),
                    "best_score": round(best_score, 2),
                })

            result = generate_roster(
                nurses=generation_inputs["nurses"],
                shifts=generation_inputs["shifts"],
                hard_requests=generation_inputs["hard_requests"],
                soft_requests=generation_inputs["soft_requests"],
                prev_last_shift=generation_inputs["prev_last_shift"],
                shift_hours=generation_inputs["shift_hours"],
                non_working_shift_codes=generation_inputs["non_working_shift_codes"],
                progress_callback=on_progress,
                milp_config=generation_inputs["milp_config"],
            )
            q.put({"type": "complete", "method": result["method"], "roster": result["roster"]})
        except Exception as exc:
            q.put({"type": "error", "message": str(exc)})

    threading.Thread(target=_run, daemon=True).start()

    def _event_stream():
        while True:
            try:
                item = q.get(timeout=600)  # 10-minute hard cap
                yield f"data: {json.dumps(item)}\n\n"
                if item["type"] in ("complete", "error"):
                    break
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Timed out'})}\n\n"
                break

    return StreamingResponse(_event_stream(), media_type="text/event-stream")


def _staffing_to_algo_inputs(ward: Ward):
    """
    Build (shifts_data, milp_config) from ward.staffing_json when available,
    otherwise fall back to the legacy Ward scalar fields.

    shifts_data : 14-element list of {"AM": {"A":int,"B":int,"C":int}, "PM":..., "NIGHT":...}
    milp_config : WARD_CONFIG-compatible dict, or None (MILP will use its built-in lookup)
    """
    if ward.staffing_json:
        try:
            g = json.loads(ward.staffing_json)

            def _min(role: str, shift: str) -> int:
                return int(g.get(role, {}).get(shift, {}).get("minimum", 0))

            # Rank A = RN, B = EN+NA, C = HCA12+HCA3
            # DailyStaffingGuideline shift keys: A=AM, P=PM, N=NIGHT
            daily_req = {
                "AM":    {"A": _min("RN","A"), "B": _min("EN","A") + _min("NA","A"), "C": _min("HCA12","A") + _min("HCA3","A")},
                "PM":    {"A": _min("RN","P"), "B": _min("EN","P") + _min("NA","P"), "C": _min("HCA12","P") + _min("HCA3","P")},
                "NIGHT": {"A": _min("RN","N"), "B": _min("EN","N") + _min("NA","N"), "C": _min("HCA12","N") + _min("HCA3","N")},
            }
            shifts_data = [daily_req for _ in range(14)]

            rn_min  = {"A": _min("RN","A"),                              "P": _min("RN","P"),  "N": _min("RN","N")}
            en_min  = {"A": _min("EN","A") + _min("NA","A"),             "P": _min("EN","P") + _min("NA","P"),  "N": _min("EN","N") + _min("NA","N")}
            hca_min = {"A": _min("HCA12","A") + _min("HCA3","A"),        "P": _min("HCA12","P") + _min("HCA3","P"), "N": _min("HCA12","N") + _min("HCA3","N")}

            milp_config = {
                "LOW_DAYS": set(),
                "RN":  {"normal_min": rn_min,  "low_exact": None, "day_target": rn_min,  "shift_target": {"A": 5, "P": 3, "N": 2}},
                "EN":  {"normal_min": en_min,  "low_exact": None, "day_target": en_min,  "shift_target": {"A": 5, "P": 3, "N": 2}},
                "HCA": {"normal_min": hca_min, "low_exact": None, "day_target": hca_min, "shift_target": {"A": 5, "P": 3, "N": 2}},
                "TOTAL_MIN": {
                    "A": rn_min["A"] + en_min["A"] + hca_min["A"],
                    "P": rn_min["P"] + en_min["P"] + hca_min["P"],
                    "N": rn_min["N"] + en_min["N"] + hca_min["N"],
                },
            }
            return shifts_data, milp_config
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            pass  # fall through to legacy fields

    daily_req = {
        "AM":    {"A": ward.am_rn or 0, "B": ward.am_en_na_min or 0, "C": ward.am_hca_min or 0},
        "PM":    {"A": ward.pm_rn or 0, "B": ward.pm_en_na_min or 0, "C": ward.pm_hca_min or 0},
        "NIGHT": {"A": ward.nd_rn or 0, "B": ward.nd_en_na_min or 0, "C": ward.nd_hca_min or 0},
    }
    return [daily_req for _ in range(14)], None


def _load_generation_inputs(db: Session, ward_id: int, period_id: int) -> dict[str, Any]:
    ward = db.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    period = db.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")

    shifts_data, milp_config = _staffing_to_algo_inputs(ward)

    nurses_db = db.exec(
        select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
    ).all()
    nurses_data = [
        {"id": n.nurseid, "name": n.name, "rank": _map_rank(n.designation)}
        for n in nurses_db
    ]

    nurse_ids = [n["id"] for n in nurses_data]
    hard_requests, soft_requests = _load_shift_requests(db, ward_id, period, nurse_ids, len(shifts_data))
    prev_last_shift = _load_previous_last_shift(db, ward_id, period, nurse_ids)

    for nurse_id, shift_name in prev_last_shift.items():
        if str(shift_name).strip().upper() != "NIGHT":
            continue
        hard_requests[nurse_id] = [
            item for item in hard_requests.get(nurse_id, [])
            if item[0] != 0
        ]
        soft_requests[nurse_id] = [
            item for item in soft_requests.get(nurse_id, [])
            if item[0] != 0
        ]

    return {
        "nurses": nurses_data,
        "shifts": shifts_data,
        "milp_config": milp_config,
        "hard_requests": hard_requests,
        "soft_requests": soft_requests,
        "prev_last_shift": prev_last_shift,
        "shift_hours": _load_shift_hours(db),
        "non_working_shift_codes": _load_non_working_shift_codes(db),
    }


def _load_shift_requests(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    nurse_ids: list[int],
    num_days: int,
) -> tuple[dict[int, list[tuple[int, str]]], dict[int, list[tuple[int, str]]]]:
    if not nurse_ids:
        return {}, {}

    statement = (
        select(ShiftRequest)
        .join(Nurse, Nurse.nurseid == ShiftRequest.nurseid)
        .where(Nurse.wardid == ward_id)
        .where(ShiftRequest.periodid == period.periodid)
    )
    requests = db.exec(statement).all()

    latest_by_bucket: dict[tuple[int, int, str], ShiftRequest] = {}
    for req in requests:
        if req.nurseid not in nurse_ids:
            continue
        status = str(req.status).strip()
        if status not in {"Approved", "Pending"}:
            continue

        day_idx = (req.preferreddate - period.startdate).days
        if day_idx < 0 or day_idx >= num_days:
            continue

        key = (req.nurseid, day_idx, status)
        current = latest_by_bucket.get(key)
        if current is None or req.timestamp > current.timestamp:
            latest_by_bucket[key] = req

    hard_requests: dict[int, list[tuple[int, str]]] = {}
    soft_requests: dict[int, list[tuple[int, str]]] = {}

    approved_keys = {
        (nurse_id, day_idx)
        for nurse_id, day_idx, status in latest_by_bucket.keys()
        if status == "Approved"
    }

    for (nurse_id, day_idx, status), req in latest_by_bucket.items():
        shift_name = str(req.preferredshifttype).upper()
        if status == "Approved":
            hard_requests.setdefault(nurse_id, []).append((day_idx, shift_name))
        elif (nurse_id, day_idx) not in approved_keys:
            soft_requests.setdefault(nurse_id, []).append((day_idx, shift_name))

    return hard_requests, soft_requests


def _load_previous_last_shift(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    nurse_ids: list[int],
) -> dict[int, str]:
    if not nurse_ids:
        return {}

    previous_period = db.exec(
        select(RosterPeriod)
        .where(RosterPeriod.enddate < period.startdate)
        .order_by(RosterPeriod.enddate.desc())
    ).first()
    if not previous_period:
        return {}

    roster_rows = db.exec(
        select(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == previous_period.periodid,
            Roster.shiftdate == previous_period.enddate,
            Roster.status == "Confirmed",
            Roster.nurseid.in_(nurse_ids),  # type: ignore[attr-defined]
        )
    ).all()

    latest_by_nurse: dict[int, Roster] = {}
    for row in roster_rows:
        if row.nurseid is None:
            continue
        current = latest_by_nurse.get(row.nurseid)
        current_id = current.rosterid if current and current.rosterid is not None else -1
        row_id = row.rosterid if row.rosterid is not None else -1
        if current is None or row_id > current_id:
            latest_by_nurse[row.nurseid] = row

    return {
        nurse_id: str(row.shiftcode).upper()
        for nurse_id, row in latest_by_nurse.items()
    }


def _load_non_working_shift_codes(db: Session) -> set[str]:
    rows = db.exec(select(ShiftCode).where(ShiftCode.isworking == False)).all()  # noqa: E712
    return {str(row.shiftcode).upper() for row in rows}


def _load_shift_hours(db: Session) -> dict[str, float]:
    code_to_label = {"A": "AM", "P": "PM", "N": "NIGHT"}
    rows = db.exec(
        select(ShiftCode).where(ShiftCode.shiftcode.in_(list(code_to_label.keys())))  # type: ignore[attr-defined]
    ).all()
    row_map = {str(row.shiftcode).upper(): row for row in rows}

    shift_hours = {"OFF": 0.0}
    for code, label in code_to_label.items():
        row = row_map.get(code)
        if row is None:
            raise HTTPException(status_code=500, detail=f"Missing shift code configuration for {code}")
        if row.shiftdurationhours is None:
            raise HTTPException(status_code=500, detail=f"Missing shiftdurationhours for shift code {code}")
        shift_hours[label] = float(row.shiftdurationhours)

    return shift_hours


def _map_rank(designation: str) -> str:
    """Map nurse designation to scheduling rank A/B/C."""
    RANK_A = {
        "SNR STAFF NURSE I", "SNR STAFF NURSE II",
        "STAFF NURSE I", "STAFF NURSE II",
        "RN", "SSN",
    }
    RANK_B = {
        "SNR ENROLLED NURSE II", "ENROLLED NURSE I", "ENROLLED NURSE II",
        "NURSING AIDE I", "NURSING AIDE II",
        "SENIOR NURSING AIDE I", "SENIOR NURSING AIDE II",
        "SNR PATIENT SERVICE ASST",
        "EN", "NA",
    }
    if designation in RANK_A:
        return "A"
    if designation in RANK_B:
        return "B"
    return "C"
