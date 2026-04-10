from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import or_, select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models.enums import NotificationType
from app.models.rbac import Nurse, NurseManager, NursePublic, Role, UserRole
from app.models.roster import (
    Roster,
    RosterPeriod,
    RosterPeriodPublic,
    RosterPeriodWindowPublic,
    Ward,
)
from app.models.shifts import (
    ShiftCode,
    ShiftCodePublic,
    ShiftRequest,
    ShiftRequestCreate,
    ShiftRequestPublic,
    ShiftRequestReview,
    ShiftRequestUpdate,
)
from app.utils import (
    generate_shift_request_approved_email,
    generate_shift_request_rejected_email,
    send_email,
)
from app.core.config import settings
from app.rbac import get_rbac_user_by_email, user_has_role
from app.services.roster_period_service import (
    ensure_roster_period_window,
    get_period_window,
    get_planning_lock_date,
)

import logging
logger = logging.getLogger(__name__)

# Main router — generates ShiftRequestsService in the client
router = APIRouter(prefix="/shift-requests", tags=["shift-requests"])

# Home router — generates HomeService in the client (same tag as before)
home_router = APIRouter(prefix="/home", tags=["home"])


# ─────────────────────────────────────────────
# HOME ENDPOINTS  (upcoming shift + my shifts)
# ─────────────────────────────────────────────

class RosterShiftPublic(BaseModel):
    shiftdate: date
    shiftcode: str
    starttime: Optional[str] = None
    endtime: Optional[str] = None
    description: Optional[str] = None


class UpcomingShiftResponse(BaseModel):
    has_shift: bool
    nurse_name: str
    shift_type: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    shift_date: Optional[date] = None
    shift_day: Optional[str] = None
    formatted_date: Optional[str] = None
    shift_code: Optional[str] = None
    ward_name: Optional[str] = None


class NurseShiftPatternUpdate(BaseModel):
    shift_pattern: Optional[str] = None


def _get_managed_ward_ids(session: SessionDep, user_id: int) -> set[int]:
    ward_ids = session.exec(
        select(UserRole.wardid)
        .join(Role, UserRole.roleid == Role.roleid)
        .where(
            UserRole.userid == user_id,
            UserRole.isactive == True,  # noqa: E712
            UserRole.wardid.is_not(None),
            Role.rolename == "NurseManager",
        )
    ).all()
    return {ward_id for ward_id in ward_ids if ward_id is not None}


def _can_manage_nurse_shift_request(
    session: SessionDep,
    current_user: CurrentUser,
    shift_request: ShiftRequest,
) -> bool:
    if current_user.nurseid and shift_request.nurseid == current_user.nurseid:
        return True

    if user_has_role(session, current_user.email, "NurseManager"):
        return True

    managed_ward_ids = _get_managed_ward_ids(session, current_user.userid)
    if not managed_ward_ids:
        return False

    nurse = session.exec(
        select(Nurse).where(Nurse.nurseid == shift_request.nurseid)
    ).first()
    return bool(nurse and nurse.wardid in managed_ward_ids)


@home_router.get("/upcoming-shift", response_model=UpcomingShiftResponse)
def get_upcoming_shift(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get the next confirmed upcoming shift for the current user."""
    user_name: Optional[str] = None
    nurse_id = current_user.nurseid
    manager_id = current_user.managerid
    nurse = None

    if nurse_id:
        nurse = session.exec(select(Nurse).where(Nurse.nurseid == nurse_id)).first()
        if nurse:
            user_name = nurse.name

    if not user_name and manager_id:
        manager = session.exec(
            select(NurseManager).where(NurseManager.managerid == manager_id)
        ).first()
        if manager:
            user_name = manager.name

    if not user_name:
        user_name = current_user.email or current_user.username

    if not nurse_id:
        return UpcomingShiftResponse(has_shift=False, nurse_name=str(user_name))

    if not nurse:
        raise HTTPException(status_code=404, detail="Nurse profile not found")

    today = date.today()

    roster_query = (
        select(Roster, ShiftCode, Ward)
        .join(ShiftCode, Roster.shiftcode == ShiftCode.shiftcode)
        .join(Ward, Roster.wardid == Ward.wardid)
        .where(
            Roster.nurseid == nurse_id,
            Roster.shiftdate >= today,
            Roster.status == "Confirmed",
            ShiftCode.isworking == True,  # noqa: E712
        )
        .order_by(Roster.shiftdate.asc())
        .limit(1)
    )

    result = session.exec(roster_query).first()
    if not result:
        return UpcomingShiftResponse(has_shift=False, nurse_name=str(user_name))

    roster, shift_code, ward = result
    shift_date = roster.shiftdate
    day_name = shift_date.strftime("%A")
    formatted_date = shift_date.strftime("%d/%m/%Y")

    shift_description = shift_code.description
    if "(" in shift_description and ")" in shift_description:
        shift_type = shift_description.split("(")[1].split(")")[0].title()
    else:
        shift_type = shift_description

    start_time = None
    end_time = None
    if roster.starttime:
        start_time = roster.starttime.strftime("%H:%M")
    elif shift_code.defaultstart:
        start_time = shift_code.defaultstart.strftime("%H:%M")
    if roster.endtime:
        end_time = roster.endtime.strftime("%H:%M")
    elif shift_code.defaultend:
        end_time = shift_code.defaultend.strftime("%H:%M")

    return UpcomingShiftResponse(
        has_shift=True,
        nurse_name=str(user_name),
        shift_type=shift_type,
        start_time=start_time,
        end_time=end_time,
        shift_date=shift_date,
        shift_day=day_name,
        formatted_date=formatted_date,
        shift_code=roster.shiftcode,
        ward_name=ward.wardname,
    )


@home_router.get("/my-shifts", response_model=list[RosterShiftPublic])
def get_my_shifts(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
) -> Any:
    """Get confirmed roster shifts for the current nurse, optionally filtered by date range."""
    nurse_id = current_user.nurseid
    if not nurse_id:
        return []

    query = (
        select(Roster, ShiftCode)
        .join(ShiftCode, Roster.shiftcode == ShiftCode.shiftcode)
        .where(Roster.nurseid == nurse_id, Roster.status == "Confirmed")
    )
    if start_date:
        query = query.where(Roster.shiftdate >= start_date)
    if end_date:
        query = query.where(Roster.shiftdate <= end_date)
    query = query.order_by(Roster.shiftdate.asc())

    results = session.exec(query).all()

    shifts = []
    for roster, shift_code in results:
        start_time = None
        end_time = None
        if roster.starttime:
            start_time = roster.starttime.strftime("%H:%M")
        elif shift_code.defaultstart:
            start_time = shift_code.defaultstart.strftime("%H:%M")
        if roster.endtime:
            end_time = roster.endtime.strftime("%H:%M")
        elif shift_code.defaultend:
            end_time = shift_code.defaultend.strftime("%H:%M")
        shifts.append(RosterShiftPublic(
            shiftdate=roster.shiftdate,
            shiftcode=roster.shiftcode,
            starttime=start_time,
            endtime=end_time,
            description=shift_code.description,
        ))
    return shifts


# ─────────────────────────────────────────────
# SHIFT CODE ENDPOINTS
# ─────────────────────────────────────────────


@router.get("/shift-codes", response_model=list[ShiftCodePublic])
def get_all_shift_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift codes."""
    return list(session.exec(select(ShiftCode)).all())


@router.get("/shift-codes/working", response_model=list[ShiftCodePublic])
def get_working_shift_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift codes where isworking is true."""
    statement = select(ShiftCode).where(ShiftCode.isworking == True)  # noqa: E712
    return list(session.exec(statement).all())


@router.get("/shift-codes/ward/{ward_id}", response_model=list[ShiftCodePublic])
def get_shift_codes_by_ward(
    ward_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get applicable shift codes for a ward, falling back to all working codes."""
    try:
        from app.models.shifts import WardShiftCode  # noqa: F401
        statement = (
            select(ShiftCode)
            .join(WardShiftCode, ShiftCode.shiftcode == WardShiftCode.shiftcode)
            .where(WardShiftCode.wardid == ward_id)
            .where(ShiftCode.isworking == True)  # noqa: E712
        )
        codes = list(session.exec(statement).all())
        if codes:
            return codes
    except Exception:
        pass

    statement = select(ShiftCode).where(ShiftCode.isworking == True)  # noqa: E712
    return list(session.exec(statement).all())


# ─────────────────────────────────────────────
# ROSTER PERIOD ENDPOINTS
# ─────────────────────────────────────────────

def _to_roster_period_public(period: RosterPeriod) -> RosterPeriodPublic:
    return RosterPeriodPublic(
        periodid=period.periodid,
        name=period.name,
        startdate=period.startdate,
        enddate=period.enddate,
        requestopendate=period.requestopendate,
        requestclosedate=period.requestclosedate,
        planninglockdate=get_planning_lock_date(period.startdate),
        status=period.status,
    )


@router.get("/periods", response_model=list[RosterPeriodPublic])
def get_roster_periods(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all roster periods."""
    periods = ensure_roster_period_window(session)
    return [_to_roster_period_public(period) for period in periods]


@router.get("/period", response_model=RosterPeriodPublic)
def get_roster_period(
    session: SessionDep,
    current_user: CurrentUser,
    target_date: date = Query(..., description="Date to find the roster period for"),
) -> Any:
    """Get the roster period that contains the given date."""
    ensure_roster_period_window(session)
    statement = select(RosterPeriod).where(
        RosterPeriod.startdate <= target_date,
        RosterPeriod.enddate >= target_date,
    )
    period = session.exec(statement).first()
    if not period:
        raise HTTPException(status_code=404, detail="No roster period found for the given date")
    return _to_roster_period_public(period)


@router.get("/periods/current-upcoming", response_model=RosterPeriodWindowPublic)
def get_current_and_upcoming_roster_periods(
    session: SessionDep, current_user: CurrentUser
) -> Any:
    """Get the current, upcoming, and request-open roster periods."""
    periods = ensure_roster_period_window(session)
    current_period, upcoming_period, request_open_period = get_period_window(periods)
    def _map(period: RosterPeriod | None):
        if not period:
            return None
        return _to_roster_period_public(period)

    return RosterPeriodWindowPublic(
        current_period=_map(current_period),
        upcoming_period=_map(upcoming_period),
        request_open_period=_map(request_open_period),
    )


# ─────────────────────────────────────────────
# SHIFT REQUEST ENDPOINTS (current user)
# ─────────────────────────────────────────────

@router.get("/", response_model=list[ShiftRequestPublic])
def get_user_shift_requests(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift requests for the current user."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    statement = select(ShiftRequest).where(ShiftRequest.nurseid == rbac_user.nurseid)
    return list(session.exec(statement).all())


@router.post("/", response_model=ShiftRequestPublic)
def create_shift_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_in: ShiftRequestCreate,
) -> Any:
    """Create a shift request for the logged-in nurse or a ward nurse (manager only)."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user:
        raise HTTPException(status_code=400, detail="User is not linked to an RBAC record")

    target_nurse_id = rbac_user.nurseid
    if request_in.nurseid is not None:
        if not user_has_role(session, current_user.email, "NurseManager"):
            raise HTTPException(
                status_code=403,
                detail="Only nurse managers can create a request for another nurse",
            )
        if not rbac_user.managerid:
            raise HTTPException(status_code=400, detail="User is not linked to a nurse manager record")
        target_nurse = session.get(Nurse, request_in.nurseid)
        if not target_nurse:
            raise HTTPException(status_code=404, detail="Nurse not found")
        target_nurse_id = request_in.nurseid

    if not target_nurse_id:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    existing_requests = list(
        session.exec(
            select(ShiftRequest).where(
                ShiftRequest.nurseid == target_nurse_id,
                ShiftRequest.periodid == request_in.periodid,
            )
        ).all()
    )

    # Enforce 3-request cap for working shifts and DO/RD
    _CAPPED_CODES = {"DO", "RD"}
    shift_code = session.exec(
        select(ShiftCode).where(ShiftCode.shiftcode == request_in.preferredshifttype)
    ).first()

    if shift_code and (shift_code.isworking or shift_code.shiftcode in _CAPPED_CODES):
        existing_capped = list(
            session.exec(
                select(ShiftRequest)
                .join(ShiftCode, ShiftRequest.preferredshifttype == ShiftCode.shiftcode)
                .where(
                    ShiftRequest.nurseid == target_nurse_id,
                    ShiftRequest.periodid == request_in.periodid,
                    or_(ShiftCode.isworking == True, ShiftCode.shiftcode.in_(list(_CAPPED_CODES))),  # noqa: E712
                )
            ).all()
        )
        if len(existing_capped) >= 3:
            raise HTTPException(
                status_code=400,
                detail="You have reached the maximum of 3 shift requests per roster period",
            )

    used_numbers = {r.requestnumber for r in existing_requests}
    next_number = next(n for n in range(1, len(existing_requests) + 2) if n not in used_numbers)

    shift_request = ShiftRequest(
        **request_in.model_dump(exclude={"nurseid"}),
        nurseid=target_nurse_id,
        requestnumber=next_number,
    )
    session.add(shift_request)
    session.commit()
    session.refresh(shift_request)
    return shift_request


@router.patch("/{request_id}", response_model=ShiftRequestPublic)
def update_shift_request(
    request_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    request_in: ShiftRequestUpdate,
) -> Any:
    """Update a shift request. The owning nurse or their nurse manager can update."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user:
        raise HTTPException(status_code=400, detail="User is not linked to an RBAC record")
    shift_request = session.get(ShiftRequest, request_id)
    if not shift_request:
        raise HTTPException(status_code=404, detail="Shift request not found")

    can_update = shift_request.nurseid == rbac_user.nurseid
    if not can_update and user_has_role(session, current_user.email, "NurseManager"):
        if not rbac_user.managerid:
            raise HTTPException(status_code=400, detail="User is not linked to a nurse manager record")
        can_update = True

    if not can_update:
        raise HTTPException(status_code=403, detail="Not authorized to update this request")

    update_data = request_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(shift_request, key, value)

    session.add(shift_request)
    session.commit()
    session.refresh(shift_request)
    return shift_request


@router.patch("/{request_id}/review", response_model=ShiftRequestPublic)
def review_shift_request(
    request_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    review_in: ShiftRequestReview,
) -> Any:
    """Approve or reject a shift request (nurse manager action)."""
    shift_request = session.get(ShiftRequest, request_id)
    if not shift_request:
        raise HTTPException(status_code=404, detail="Shift request not found")

    shift_request.status = review_in.status
    if review_in.rejectionreason is not None:
        shift_request.rejectionreason = review_in.rejectionreason

    session.add(shift_request)

    if review_in.status in ("Approved", "Rejected"):
        period = session.get(RosterPeriod, shift_request.periodid)
        if period:
            ntype = (
                NotificationType.SHIFT_REQUEST_APPROVED
                if review_in.status == "Approved"
                else NotificationType.SHIFT_REQUEST_REJECTED
            )
            crud.create_notification(
                session,
                recipient_type="Nurse",
                recipient_id=shift_request.nurseid,
                notification_type=ntype,
                related_entity_type="ShiftRequest",
                related_entity_id=request_id,
                roster_period=period.name,
            )

            if settings.emails_enabled:
                nurse = session.get(Nurse, shift_request.nurseid)
                if nurse and nurse.email:
                    try:
                        if review_in.status == "Approved":
                            email_data = generate_shift_request_approved_email(
                                email_to=nurse.email,
                                roster_period=period.name,
                                nurse_name=nurse.name,
                            )
                        else:
                            email_data = generate_shift_request_rejected_email(
                                email_to=nurse.email,
                                roster_period=period.name,
                                nurse_name=nurse.name,
                                rejection_reason=review_in.rejectionreason,
                            )
                        send_email(
                            email_to=nurse.email,
                            subject=email_data.subject,
                            html_content=email_data.html_content,
                        )
                    except Exception:
                        logger.exception(
                            "Failed to send shift request review email to nurse %s",
                            shift_request.nurseid,
                        )

    session.commit()
    session.refresh(shift_request)
    return shift_request


@router.delete("/{request_id}", status_code=204)
def delete_shift_request(
    request_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    """Delete a shift request. The owning nurse or their nurse manager can delete."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user:
        raise HTTPException(status_code=400, detail="User is not linked to an RBAC record")
    shift_request = session.get(ShiftRequest, request_id)
    if not shift_request:
        raise HTTPException(status_code=404, detail="Shift request not found")

    can_delete = shift_request.nurseid == rbac_user.nurseid
    if not can_delete and user_has_role(session, current_user.email, "NurseManager"):
        if not rbac_user.managerid:
            raise HTTPException(status_code=400, detail="User is not linked to a nurse manager record")
        can_delete = True

    if not can_delete:
        raise HTTPException(status_code=403, detail="Not authorized to delete this request")

    session.delete(shift_request)
    session.commit()


# ─────────────────────────────────────────────
# WARD-SCOPED ENDPOINTS
# ─────────────────────────────────────────────

@router.get("/ward/{ward_id}", response_model=list[ShiftRequestPublic])
def get_shift_requests_by_ward(
    ward_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    period_id: int | None = Query(default=None),
) -> Any:
    """Get all shift requests for nurses in a specific ward."""
    nurse_ids = list(
        session.exec(select(Nurse.nurseid).where(Nurse.wardid == ward_id)).all()
    )
    if not nurse_ids:
        return []

    statement = select(ShiftRequest).where(ShiftRequest.nurseid.in_(nurse_ids))  # type: ignore[attr-defined]
    if period_id is not None:
        statement = statement.where(ShiftRequest.periodid == period_id)

    return list(session.exec(statement).all())


@router.get("/ward/{ward_id}/nurses", response_model=list[NursePublic])
def get_ward_nurses(
    ward_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get all active nurses for a specific ward."""
    statement = select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
    return list(session.exec(statement).all())


@router.patch("/nurses/{nurse_id}/shift-pattern", response_model=NursePublic)
def update_nurse_shift_pattern(
    nurse_id: int,
    body: NurseShiftPatternUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Update a nurse's permanent AM/PM-only pattern."""
    if not (
        user_has_role(session, current_user.email, "NurseManager")
        or user_has_role(session, current_user.email, "Admin")
    ):
        raise HTTPException(status_code=403, detail="Not authorized to update nurse patterns")

    nurse = session.get(Nurse, nurse_id)
    if not nurse:
        raise HTTPException(status_code=404, detail="Nurse not found")

    shift_pattern = body.shift_pattern.strip().upper() if body.shift_pattern else None
    if shift_pattern not in {None, "AM_ONLY", "PM_ONLY"}:
        raise HTTPException(status_code=400, detail="shift_pattern must be AM_ONLY, PM_ONLY, or null")

    nurse.shiftpattern = shift_pattern
    session.add(nurse)
    session.commit()
    session.refresh(nurse)
    return nurse


@router.get("/nurses", response_model=list[NursePublic])
def get_all_nurses(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get all active nurses (NurseManager/Admin only)."""
    if not (
        user_has_role(session, current_user.email, "NurseManager")
        or user_has_role(session, current_user.email, "Admin")
    ):
        raise HTTPException(status_code=403, detail="Not authorized to view all nurses")
    statement = select(Nurse).where(Nurse.isactive == True)  # noqa: E712
    return list(session.exec(statement).all())
