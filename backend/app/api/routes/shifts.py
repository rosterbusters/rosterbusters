import sys
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models.rbac import Nurse, NursePublic
from app.models.roster import RosterPeriod, RosterPeriodPublic
from app.models.shifts import ShiftCode, ShiftCodePublic, WardShiftCode, ShiftRequest, ShiftRequestCreate, ShiftRequestPublic, ShiftRequestUpdate
from app.rbac import get_rbac_user_by_email


def log(msg: str) -> None:
    print(msg, flush=True, file=sys.stderr)

router = APIRouter(prefix="/shift-requests", tags=["shift-requests"])


@router.get("/leave-codes", response_model=list[ShiftCodePublic])
def get_leave_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift codes where isworking is false."""
    statement = select(ShiftCode).where(ShiftCode.isworking == False)
    return list(session.exec(statement).all())

@router.get("/shift-codes", response_model=list[ShiftCodePublic])
def get_all_shift_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift codes."""
    statement = select(ShiftCode)
    return list(session.exec(statement).all())

@router.get("/shift-codes/working", response_model=list[ShiftCodePublic])
def get_working_shift_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift codes where isworking is true."""
    statement = select(ShiftCode).where(ShiftCode.isworking == True)
    return list(session.exec(statement).all())


@router.get("/shift-codes/ward/{ward_id}", response_model=list[ShiftCodePublic])
def get_shift_codes_by_ward(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: int,
) -> Any:
    """
    Get applicable shift codes for a ward.
    Falls back to all working shift codes if no mappings are configured for that ward.
    """
    mapping_count = session.exec(
        select(func.count()).where(WardShiftCode.wardid == ward_id)
    ).one()

    if mapping_count == 0:
        statement = select(ShiftCode).where(ShiftCode.isworking == True)
    else:
        statement = (
            select(ShiftCode)
            .join(WardShiftCode, ShiftCode.shiftcode == WardShiftCode.shiftcode)
            .where(WardShiftCode.wardid == ward_id)
        )

    return list(session.exec(statement).all())


@router.get("/periods", response_model=list[RosterPeriodPublic])
def get_roster_periods(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all roster periods."""
    statement = select(RosterPeriod).order_by(RosterPeriod.startdate.desc())
    return list(session.exec(statement).all())


@router.get("/period", response_model=RosterPeriodPublic)
def get_roster_period(
    session: SessionDep,
    current_user: CurrentUser,
    target_date: date = Query(..., description="Date to find the roster period for"),
) -> Any:
    """Get the roster period that contains the given date."""
    statement = select(RosterPeriod).where(
        RosterPeriod.startdate <= target_date,
        RosterPeriod.enddate >= target_date,
    )
    period = session.exec(statement).first()
    if not period:
        raise HTTPException(status_code=404, detail="No roster period found for the given date")
    return period


@router.post("/", response_model=ShiftRequestPublic)
def create_shift_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_in: ShiftRequestCreate,
) -> Any:
    """Create a shift request for the logged-in nurse."""
    log(f"[create_shift_request] current_user.email={current_user.email}")

    rbac_user = get_rbac_user_by_email(session, current_user.email)
    log(f"[create_shift_request] rbac_user: userid={rbac_user.userid if rbac_user else None}, nurseid={rbac_user.nurseid if rbac_user else None}")

    if not rbac_user or not rbac_user.nurseid:
        log(f"[create_shift_request] User {current_user.email} is not linked to a nurse record")
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    log(f"[create_shift_request] Creating request: nurseid={rbac_user.nurseid}, periodid={request_in.periodid}, date={request_in.preferreddate}, shift={request_in.preferredshifttype}")

    existing_count = session.exec(
        select(func.count()).where(
            ShiftRequest.nurseid == rbac_user.nurseid,
            ShiftRequest.periodid == request_in.periodid,
        )
    ).one()
    if existing_count >= 3:
        raise HTTPException(status_code=400, detail="Maximum of 3 shift requests per period reached")

    duplicate = session.exec(
        select(ShiftRequest).where(
            ShiftRequest.nurseid == rbac_user.nurseid,
            ShiftRequest.periodid == request_in.periodid,
            ShiftRequest.preferreddate == request_in.preferreddate,
            ShiftRequest.preferredshifttype == request_in.preferredshifttype,
        )
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=f"You already have a {request_in.preferredshifttype} request for this date",
        )

    used_numbers = set(session.exec(
        select(ShiftRequest.requestnumber).where(
            ShiftRequest.nurseid == rbac_user.nurseid,
            ShiftRequest.periodid == request_in.periodid,
        )
    ).all())
    next_request_number = next(n for n in (1, 2, 3) if n not in used_numbers)

    data = request_in.model_dump()
    data["requestnumber"] = next_request_number
    shift_request = ShiftRequest(**data, nurseid=rbac_user.nurseid)
    session.add(shift_request)
    session.commit()
    session.refresh(shift_request)
    log(f"[create_shift_request] Created requestid={shift_request.requestid}")
    return shift_request


@router.get("/", response_model=list[ShiftRequestPublic])
def get_user_shift_requests(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get all shift requests for the current user."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    log(f"[get_user_shift_requests] email={current_user.email}, rbac nurseid={rbac_user.nurseid if rbac_user else None}")

    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    statement = select(ShiftRequest).where(ShiftRequest.nurseid == rbac_user.nurseid)
    results = list(session.exec(statement).all())
    log(f"[get_user_shift_requests] Found {len(results)} requests for nurseid={rbac_user.nurseid}")
    return results


@router.get("/ward/{ward_id}", response_model=list[ShiftRequestPublic])
def get_shift_requests_by_ward(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: int,
    period_id: int | None = Query(None),
) -> Any:
    """Get all shift requests for nurses in a specific ward."""
    log(f"[get_shift_requests_by_ward] ward_id={ward_id}, period_id={period_id}, requested_by={current_user.email}")
    statement = (
        select(ShiftRequest)
        .join(Nurse, ShiftRequest.nurseid == Nurse.nurseid)
        .where(Nurse.wardid == ward_id)
    )
    if period_id is not None:
        statement = statement.where(ShiftRequest.periodid == period_id)
    results = list(session.exec(statement).all())
    log(f"[get_shift_requests_by_ward] Found {len(results)} requests for ward_id={ward_id}")
    return results


@router.patch("/{request_id}", response_model=ShiftRequestPublic)
def update_shift_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_id: int,
    request_in: ShiftRequestUpdate,
) -> Any:
    """Update a shift request (shift type and/or date). Only the owning nurse can update."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    shift_request = session.get(ShiftRequest, request_id)
    if not shift_request:
        raise HTTPException(status_code=404, detail="Shift request not found")
    if shift_request.nurseid != rbac_user.nurseid:
        raise HTTPException(status_code=403, detail="Not authorized to edit this request")

    update_data = request_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shift_request, field, value)

    session.add(shift_request)
    session.commit()
    session.refresh(shift_request)
    return shift_request


@router.delete("/{request_id}", status_code=204)
def delete_shift_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_id: int,
) -> None:
    """Delete a shift request. Only the owning nurse can delete."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    shift_request = session.get(ShiftRequest, request_id)
    if not shift_request:
        raise HTTPException(status_code=404, detail="Shift request not found")
    if shift_request.nurseid != rbac_user.nurseid:
        raise HTTPException(status_code=403, detail="Not authorized to delete this request")

    session.delete(shift_request)
    session.commit()


@router.get("/ward/{ward_id}/nurses", response_model=list[NursePublic])
def get_ward_nurses(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: int,
) -> Any:
    """Get all nurses for a specific ward."""
    statement = select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)
    return list(session.exec(statement).all())