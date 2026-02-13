from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.rbac import Nurse
from app.models.roster import RosterPeriod, RosterPeriodPublic
from app.models.shifts import ShiftRequest, ShiftRequestCreate, ShiftRequestPublic
from app.rbac import get_rbac_user_by_email

router = APIRouter(prefix="/shift-requests", tags=["shift-requests"])


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

    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    shift_request = ShiftRequest(
        **request_in.model_dump(),
        nurseid=rbac_user.nurseid,
    )
    session.add(shift_request)
    session.commit()
    session.refresh(shift_request)
    return shift_request


@router.get("/", response_model=list[ShiftRequestPublic])
def get_user_shift_requests(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get all shift requests for the current user."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    statement = select(ShiftRequest).where(ShiftRequest.nurseid == rbac_user.nurseid)
    return list(session.exec(statement).all())


@router.get("/nurse/{nurse_id}", response_model=list[ShiftRequestPublic])
def get_shift_requests_by_nurse(
    session: SessionDep,
    current_user: CurrentUser,
    nurse_id: int,
) -> Any:
    """Get all shift requests for a specific nurse."""
    statement = select(ShiftRequest).where(ShiftRequest.nurseid == nurse_id)
    return list(session.exec(statement).all())


@router.get("/ward/{ward_id}", response_model=list[ShiftRequestPublic])
def get_shift_requests_by_ward(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: int,
) -> Any:
    """Get all shift requests for nurses in a specific ward."""
    statement = (
        select(ShiftRequest)
        .join(Nurse, ShiftRequest.nurseid == Nurse.nurseid)
        .where(Nurse.wardid == ward_id)
    )
    return list(session.exec(statement).all())