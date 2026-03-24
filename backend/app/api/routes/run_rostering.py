import json
import logging
import os
import queue
import threading

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select, delete

from app import crud
from app.api.deps import CurrentUser, SessionDep, get_db
from app.core.config import settings
from app.models.enums import NotificationType
from app.designation_mapping import classify_designation, staffing_role_to_roster_rank
from app.models.enums import NotificationType
from app.models.rbac import Nurse, NurseManager
from app.models.roster import (
    NotificationQueue,
    Roster,
    RosterChangeLog,
    RosterChangeLogPublic,
    RosterPeriod,
    Ward,
)
from app.models.leave import LeaveRequest
from app.models.shifts import ShiftCode, ShiftRequest
from app.rbac import user_has_role
from app.utils import generate_roster_release_email, generate_shift_updated_email, send_email
import app.crud as crud
from app.rostering.algo_scheduler import generate_roster

import logging
logger = logging.getLogger(__name__)


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
    algorithm: Optional[str] = None  # "MILP" | "GA" | None (auto)


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


class AlgorithmNotificationRequest(BaseModel):
    ward_id: int
    period_id: int
    notification_type: str


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


def _can_generate_roster(session: Session, current_user: CurrentUser) -> bool:
    if not current_user.email:
        return False
    return user_has_role(session, current_user.email, "NurseManager") or user_has_role(
        session, current_user.email, "Admin"
    )


def _queue_algorithm_notification(
    session: Session,
    *,
    manager_id: int | None,
    ward_id: int,
    period_id: int,
    notification_type: NotificationType,
) -> None:
    """Queue an algorithm notification (and email) for the ward's nurse manager, if applicable."""
    if not manager_id:
        return

    ward = session.get(Ward, ward_id)
    if not ward or ward.managerid != manager_id:
        return

    period = session.get(RosterPeriod, period_id)
    if not period:
        return

    crud.create_notification(
        session,
        recipient_type="NurseManager",
        recipient_id=manager_id,
        notification_type=notification_type,
        related_entity_type="RosterPeriod",
        related_entity_id=period.periodid,
        roster_period=period.name,
    )
    session.commit()

    if not settings.emails_enabled:
        return

    manager = session.get(NurseManager, manager_id)
    if not manager or not manager.email:
        return

    try:
        from app.utils import generate_algorithm_notification_email, send_email

        email_data = generate_algorithm_notification_email(
            email_to=manager.email,
            roster_period=period.name,
            message=notification_type.template.format(roster_period=period.name),
            manager_name=manager.name,
        )
        send_email(
            email_to=manager.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    except Exception:
        logger.exception(
            "Failed to send roster planning email for ward %s period %s",
            ward_id,
            period_id,
        )


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
    existing = _get_existing_roster_entry(
        session=session,
        ward_id=body.ward_id,
        nurse_id=body.nurse_id,
        period_id=body.period_id,
        shift_date=body.shift_date,
    )
    old_shift_code = existing.shiftcode if existing else None
    is_update = existing is not None

    entry = _upsert_roster_entry(session, body, current_user)
    session.add(entry)
    session.commit()
    session.refresh(entry)

    if is_update and old_shift_code and old_shift_code != body.shift_code:
        nurse = session.get(Nurse, body.nurse_id)
        if nurse:
            crud.create_notification(
                session,
                recipient_type="Nurse",
                recipient_id=body.nurse_id,
                notification_type=NotificationType.SHIFT_UPDATED,
                related_entity_type="Roster",
                related_entity_id=entry.rosterid,
                start_date=str(body.shift_date),
            )
            session.commit()

            if settings.emails_enabled and nurse.email:
                try:
                    email_data = generate_shift_updated_email(
                        email_to=nurse.email,
                        nurse_name=nurse.name,
                        shift_date=str(body.shift_date),
                        new_shift_code=body.shift_code,
                        old_shift_code=old_shift_code,
                    )
                    send_email(
                        email_to=nurse.email,
                        subject=email_data.subject,
                        html_content=email_data.html_content,
                    )
                except Exception:
                    logger.exception(
                        "Failed to send shift updated email to nurse %s for date %s",
                        body.nurse_id,
                        body.shift_date,
                    )

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

    roster_period_label = period.name or f"{period.startdate} to {period.enddate}"
    nurses = session.exec(
        select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
    ).all()

    for nurse in nurses:
        if not nurse.nurseid:
            continue
        crud.create_notification(
            session,
            recipient_type="Nurse",
            recipient_id=nurse.nurseid,
            notification_type=NotificationType.ROSTER_RELEASE,
            channel="Email",
            related_entity_type="RosterPeriod",
            related_entity_id=period.periodid,
            roster_period=roster_period_label,
        )
    session.commit()

    if settings.emails_enabled:
        for nurse in nurses:
            if not nurse.email:
                continue
            try:
                email_data = generate_roster_release_email(
                    email_to=nurse.email,
                    roster_period=roster_period_label,
                    ward_name=ward.wardname,
                )
                send_email(
                    email_to=nurse.email,
                    subject=email_data.subject,
                    html_content=email_data.html_content,
                )
            except Exception:
                logger.warning(
                    "Failed to send roster release email to %s",
                    nurse.email,
                )
    else:
        logger.info("Email notifications skipped: email settings not configured.")

    return {
        "ward_id": ward_id,
        "period_id": period_id,
        "published_count": len(entries),
        "status": period.status,
    }


@router.delete("/ward/{ward_id}/clear")
def clear_ward_roster(
    ward_id: int,
    period_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Clear all roster assignments for a ward + period when not yet published."""
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    period = session.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")

    if not _can_manage_ward(session, current_user, ward):
        raise HTTPException(status_code=403, detail="Not authorized to clear this ward roster")

    if period.status in {"Finalized", "Published"}:
        raise HTTPException(status_code=400, detail="Roster period is already published")

    entries = session.exec(
        select(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == period_id,
        )
    ).all()

    if not entries:
        raise HTTPException(status_code=400, detail="No roster assignments found to clear")

    if any(entry.status == "Confirmed" for entry in entries):
        raise HTTPException(status_code=400, detail="Roster entries are already published")

    deleted = session.exec(
        delete(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == period_id,
        )
    ).rowcount or 0
    session.commit()

    return {
        "ward_id": ward_id,
        "period_id": period_id,
        "cleared_count": deleted,
        "status": "cleared",
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
    db: SessionDep,
    current_user: CurrentUser,
):
    """Run the MILP/GA rostering algorithm for a ward and roster period."""
    if not _can_generate_roster(db, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")
    try:
        generation_inputs = _load_generation_inputs(db, request_data.ward_id, request_data.period_id)
        _queue_algorithm_notification(
            db,
            manager_id=current_user.managerid,
            ward_id=request_data.ward_id,
            period_id=request_data.period_id,
            notification_type=NotificationType.ALGORITHM_IN_PROGRESS,
        )
        result = generate_roster(
            nurses=generation_inputs["nurses"],
            shifts=generation_inputs["shifts"],
            hard_requests=generation_inputs["hard_requests"],
            soft_requests=generation_inputs["soft_requests"],
            prev_last_shift=generation_inputs["prev_last_shift"],
            shift_hours=generation_inputs["shift_hours"],
            non_working_shift_codes=generation_inputs["non_working_shift_codes"],
            milp_config=generation_inputs["milp_config"],
            algorithm=request_data.algorithm,
        )
        _queue_algorithm_notification(
            db,
            manager_id=current_user.managerid,
            ward_id=request_data.ward_id,
            period_id=request_data.period_id,
            notification_type=NotificationType.ALGORITHM_GENERATION,
        )
        return {"method": result["method"], "roster": result["roster"]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-algorithm-async")
def generate_roster_async(
    request_data: RosterGenerationRequest,
    db: SessionDep,
    current_user: CurrentUser,
):
    """Queue roster generation as a Celery background task. Returns a task_id to poll."""
    if not _can_generate_roster(db, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")
    ward = db.get(Ward, request_data.ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    _queue_algorithm_notification(
        db,
        manager_id=current_user.managerid,
        ward_id=request_data.ward_id,
        period_id=request_data.period_id,
        notification_type=NotificationType.ALGORITHM_IN_PROGRESS,
    )

    task = _get_celery_app().send_task(
        "tasks.generate_roster",
        args=[request_data.ward_id, request_data.period_id],
        kwargs={"algorithm": request_data.algorithm},
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


@router.post("/task/{task_id}/cancel")
def cancel_task(
    task_id: str,
    db: SessionDep,
    current_user: CurrentUser,
):
    """Cancel a queued roster generation task."""
    if not _can_generate_roster(db, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")
    _get_celery_app().control.revoke(task_id, terminate=True)
    return {"task_id": task_id, "status": "cancelled"}


@router.post("/algorithm-notification")
def queue_algorithm_notification(
    body: AlgorithmNotificationRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Queue an algorithm notification without running the algorithm (test helper)."""
    if not _can_generate_roster(session, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")
    if body.notification_type not in {
        "ALGORITHM_IN_PROGRESS",
        "ALGORITHM_GENERATION",
    }:
        raise HTTPException(status_code=400, detail="Unsupported notification type.")

    ward = session.get(Ward, body.ward_id)
    if not ward or not ward.managerid:
        raise HTTPException(status_code=404, detail="Ward not found or missing manager.")
    period = session.get(RosterPeriod, body.period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found.")

    if body.notification_type == "ALGORITHM_IN_PROGRESS":
        notification = NotificationType.ALGORITHM_IN_PROGRESS
    else:
        notification = NotificationType.ALGORITHM_GENERATION

    message = notification.template.format(roster_period=period.name)

    session.add(
        NotificationQueue(
            recipienttype="NurseManager",
            recipientid=ward.managerid,
            notificationtype=notification.value,
            channel="Email",
            priority="Normal",
            subject=notification.value,
            messagebody=message,
            relatedentitytype="RosterPeriod",
            relatedentityid=period.periodid,
        )
    )
    session.commit()
    return {"status": "ok", "notification_type": body.notification_type}


@router.post("/generate-algorithm-stream")
def generate_roster_stream(
    request_data: RosterGenerationRequest,
    db: SessionDep,
    current_user: CurrentUser,
):
    """Run the MILP/GA rostering algorithm and stream SSE progress events."""
    if not _can_generate_roster(db, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")
    # Fetch all DB data before spawning the thread (SQLAlchemy sessions are not thread-safe)
    generation_inputs = _load_generation_inputs(db, request_data.ward_id, request_data.period_id)
    _queue_algorithm_notification(
        db,
        manager_id=current_user.managerid,
        ward_id=request_data.ward_id,
        period_id=request_data.period_id,
        notification_type=NotificationType.ALGORITHM_IN_PROGRESS,
    )

    q: queue.Queue = queue.Queue()
    manager_id = current_user.managerid

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
                algorithm=request_data.algorithm,
            )
            q.put({"type": "complete", "method": result["method"], "roster": result["roster"]})
            try:
                from app.core.db import engine
                with Session(engine) as session:
                    _queue_algorithm_notification(
                        session,
                        manager_id=manager_id,
                        ward_id=request_data.ward_id,
                        period_id=request_data.period_id,
                        notification_type=NotificationType.ALGORITHM_GENERATION,
                    )
            except Exception:
                logger.exception(
                    "Failed to queue algorithm completion notification for ward %s period %s",
                    request_data.ward_id,
                    request_data.period_id,
                )
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


@router.post("/ward/{ward_id}/seed-requests")
def seed_ward_requests(
    ward_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Seed deterministic test shift requests for a ward (dev/demo helper)."""
    from app.test_algo import seed_requests as _seed_requests

    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    if not _can_manage_ward(session, current_user, ward):
        raise HTTPException(status_code=403, detail="Not authorized to manage this ward")

    try:
        _seed_requests(session, ward_id)
    except SystemExit as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"status": "ok", "ward_id": ward_id}


@router.post("/seed-requests-anonymized")
def seed_anonymized_requests(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Seed an anonymized test ward with requests via test_algo helpers."""
    if not _can_generate_roster(session, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")

    from app.test_algo import (
        seed_test_ward_with_anonymized_requests,
        TEST_MANAGER_EMAIL,
        TEST_MANAGER_PASSWORD,
        TEST_MANAGER_USERNAME,
    )
    from app.services.roster_period_service import ensure_roster_period_window, get_period_window

    created = seed_test_ward_with_anonymized_requests(session)

    ward = session.exec(
        select(Ward).where(Ward.wardname == "Test Ward Requests").order_by(Ward.wardid.desc())
    ).first()
    if not ward:
        raise HTTPException(status_code=500, detail="Seeded ward not found.")

    periods = ensure_roster_period_window(session)
    current_period, upcoming_period, request_open_period = get_period_window(periods)
    period = request_open_period or upcoming_period or current_period
    if not period:
        raise HTTPException(status_code=500, detail="No roster period available.")

    return {
        "status": "ok",
        "ward_id": ward.wardid,
        "created": created,
        "manager": {
            "username": TEST_MANAGER_USERNAME,
            "email": TEST_MANAGER_EMAIL,
            "password": TEST_MANAGER_PASSWORD,
        },
        "period": {
            "periodid": period.periodid,
            "name": period.name,
            "startdate": str(period.startdate),
            "enddate": str(period.enddate),
        },
    }


def _shift_target_from_min(normal_min: dict) -> dict:
    """Derive per-nurse shift-type target by normalising normal_min to 10 working shifts."""
    total = normal_min.get("A", 0) + normal_min.get("P", 0) + normal_min.get("N", 0)
    if total == 0:
        return {"A": 5, "P": 3, "N": 2}
    return {s: max(0, round(10 * normal_min.get(s, 0) / total)) for s in ("A", "P", "N")}


def _build_milp_config(rn_min: dict, en_min: dict, hca_min: dict) -> dict:
    return {
        "LOW_DAYS": {6, 7, 13, 14},
        "RN":  {"normal_min": rn_min,  "low_exact": None, "day_target": rn_min,  "shift_target": _shift_target_from_min(rn_min)},
        "EN":  {"normal_min": en_min,  "low_exact": None, "day_target": en_min,  "shift_target": _shift_target_from_min(en_min)},
        "HCA": {"normal_min": hca_min, "low_exact": None, "day_target": hca_min, "shift_target": _shift_target_from_min(hca_min)},
        "TOTAL_MIN": {
            "A": rn_min["A"] + en_min["A"] + hca_min["A"],
            "P": rn_min["P"] + en_min["P"] + hca_min["P"],
            "N": rn_min["N"] + en_min["N"] + hca_min["N"],
        },
    }


def _staffing_to_algo_inputs(ward: Ward):
    """
    Build (shifts_data, milp_config) from ward.staffing_json when available,
    otherwise fall back to the legacy Ward scalar fields.

    shifts_data : 14-element list of {"AM": {"A":int,"B":int,"C":int}, "PM":..., "NIGHT":...}
    milp_config : WARD_CONFIG-compatible dict derived from the ward's staffing data.
                  LOW_DAYS is always {6,7,13,14}; shift_target is derived from normal_min.
    """
    if ward.staffing_json:
        try:
            g = json.loads(ward.staffing_json)

            def _min(role: str, shift: str) -> int:
                return int(g.get(role, {}).get(shift, {}).get("minimum", 0))

            rank_min = {
                "A": {"A": 0, "P": 0, "N": 0},
                "B": {"A": 0, "P": 0, "N": 0},
                "C": {"A": 0, "P": 0, "N": 0},
            }
            for role in ("RN", "EN", "NA", "HCA12", "HCA3"):
                rank = staffing_role_to_roster_rank(role)
                if rank is None:
                    continue
                for shift in ("A", "P", "N"):
                    rank_min[rank][shift] += _min(role, shift)

            daily_req = {
                "AM":    {"A": rank_min["A"]["A"], "B": rank_min["B"]["A"], "C": rank_min["C"]["A"]},
                "PM":    {"A": rank_min["A"]["P"], "B": rank_min["B"]["P"], "C": rank_min["C"]["P"]},
                "NIGHT": {"A": rank_min["A"]["N"], "B": rank_min["B"]["N"], "C": rank_min["C"]["N"]},
            }
            return [daily_req for _ in range(14)], _build_milp_config(
                rank_min["A"],
                rank_min["B"],
                rank_min["C"],
            )
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            pass  # fall through to legacy fields

    rn_min  = {"A": ward.am_rn or 0,       "P": ward.pm_rn or 0,        "N": ward.nd_rn or 0}
    en_min  = {"A": ward.am_en_na_min or 0, "P": ward.pm_en_na_min or 0, "N": ward.nd_en_na_min or 0}
    hca_min = {"A": ward.am_hca_min or 0,  "P": ward.pm_hca_min or 0,   "N": ward.nd_hca_min or 0}
    daily_req = {
        "AM":    {"A": rn_min["A"], "B": en_min["A"], "C": hca_min["A"]},
        "PM":    {"A": rn_min["P"], "B": en_min["P"], "C": hca_min["P"]},
        "NIGHT": {"A": rn_min["N"], "B": en_min["N"], "C": hca_min["N"]},
    }
    return [daily_req for _ in range(14)], _build_milp_config(rn_min, en_min, hca_min)


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
    shift_label_map = _load_shift_label_map(db)
    hard_requests, soft_requests = _load_shift_requests(db, ward_id, period, nurse_ids, len(shifts_data), shift_label_map)
    leave_hard = _load_leave_requests(db, ward_id, period, set(nurse_ids), len(shifts_data))
    for nurse_id, days in leave_hard.items():
        existing = hard_requests.setdefault(nurse_id, [])
        leave_days = {day_idx for day_idx, _ in days}
        existing[:] = [(d, s) for d, s in existing if d not in leave_days]
        existing.extend(days)
        if nurse_id in soft_requests:
            soft_requests[nurse_id] = [(d, s) for d, s in soft_requests[nurse_id] if d not in leave_days]
    prev_last_shift = _load_previous_last_shift(db, ward_id, period, nurse_ids)

    logger.warning(f"[DEBUG] ward={ward_id} period={period_id} ({period.startdate}→{period.enddate})")
    logger.warning(f"[DEBUG] nurses={len(nurses_data)} hard_requests={sum(len(v) for v in hard_requests.values())} soft_requests={sum(len(v) for v in soft_requests.values())}")
    if soft_requests:
        for nid, reqs in list(soft_requests.items())[:3]:
            logger.warning(f"[DEBUG]   nurse {nid}: {reqs}")

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


def _jsonify_algo_inputs(payload: Any) -> Any:
    """Convert algorithm inputs to JSON-serializable types (e.g., sets -> lists)."""
    if isinstance(payload, dict):
        return {k: _jsonify_algo_inputs(v) for k, v in payload.items()}
    if isinstance(payload, (list, tuple)):
        return [_jsonify_algo_inputs(v) for v in payload]
    if isinstance(payload, set):
        return [_jsonify_algo_inputs(v) for v in sorted(payload)]
    return payload


@router.get("/generation-inputs")
def get_generation_inputs(
    ward_id: int,
    period_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Return the exact inputs that will be fed into the rostering algorithm."""
    if not _can_generate_roster(session, current_user):
        raise HTTPException(status_code=403, detail="Nurse manager access required")

    inputs = _load_generation_inputs(session, ward_id, period_id)
    cpu_count = os.cpu_count() or 1
    inputs["cpu_count"] = cpu_count
    inputs["ga_worker_count"] = max(1, cpu_count - 1)
    return _jsonify_algo_inputs(inputs)


def _load_shift_requests(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    nurse_ids: list[int],
    num_days: int,
    shift_label_map: dict[str, str] | None = None,
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
        raw = str(req.preferredshifttype).upper()
        # Use DB-driven map if available; fall back to OFF for unknown codes
        shift_name = (shift_label_map or {}).get(raw, "OFF")
        if status == "Approved":
            hard_requests.setdefault(nurse_id, []).append((day_idx, shift_name))
        elif (nurse_id, day_idx) not in approved_keys:
            soft_requests.setdefault(nurse_id, []).append((day_idx, shift_name))

    return hard_requests, soft_requests


def _load_leave_requests(
    db: Session,
    ward_id: int,
    period: RosterPeriod,
    nurse_ids: set[int],
    num_days: int,
) -> dict[int, list[tuple[int, str]]]:
    """Return approved leave days as hard entries keyed by leave type.
    Format: nurse_id -> [(day_idx, leavetype), ...]
    """
    statement = (
        select(LeaveRequest)
        .join(Nurse, Nurse.nurseid == LeaveRequest.nurseid)
        .where(Nurse.wardid == ward_id)
        .where(LeaveRequest.status == "Approved")
        .where(LeaveRequest.enddate >= period.startdate)
        .where(LeaveRequest.startdate <= period.enddate)
    )
    leaves = db.exec(statement).all()

    result: dict[int, list[tuple[int, str]]] = {}
    for leave in leaves:
        if leave.nurseid not in nurse_ids:
            continue
        leave_code = str(leave.leavetype).upper()
        current = max(leave.startdate, period.startdate)
        end = min(leave.enddate, period.enddate)
        while current <= end:
            day_idx = (current - period.startdate).days
            if 0 <= day_idx < num_days:
                result.setdefault(leave.nurseid, []).append((day_idx, leave_code))
            current += timedelta(days=1)
    return result


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


def _load_shift_label_map(db: Session) -> dict[str, str]:
    """
    Build a mapping from every DB shift code to an algorithm label.
    Working shifts (A→AM, P→PM, N→NIGHT) keep their label; all non-working
    codes (AL, MAR, FCL, HOL, CCL, DO, …) map to "OFF".
    """
    _WORKING = {"A": "AM", "P": "PM", "N": "NIGHT"}
    rows = db.exec(select(ShiftCode)).all()
    result: dict[str, str] = {}
    for row in rows:
        code = str(row.shiftcode).upper()
        result[code] = _WORKING.get(code, "OFF") if row.isworking else "OFF"
    # Ensure the three working codes are always present even if missing from DB
    for code, label in _WORKING.items():
        result.setdefault(code, label)
    return result


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
    rank = classify_designation(designation).roster_rank
    return rank or "C"
