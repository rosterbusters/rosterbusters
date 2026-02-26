from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import or_, select

from app.api.deps import CurrentUser, SessionDep
from app.models.roster import LeaveRequest, LeaveRequestPublic, LeaveRequestUpdate, RosterPeriod, RosterPeriodPublic
from app.models.shifts import (
    ShiftCode,
    ShiftCodePublic,
    ShiftRequest,
    ShiftRequestCreate,
    ShiftRequestPublic,
    ShiftRequestUpdate,
    ShiftRequestReview,
)
from app.models.rbac import Nurse, NursePublic
from app.rbac import get_rbac_user_by_email

router = APIRouter(prefix="/shift-requests", tags=["shift-requests"])


# ─────────────────────────────────────────────
# SHIFT CODE ENDPOINTS
# ─────────────────────────────────────────────

@router.get("/leave-codes", response_model=list[ShiftCodePublic])
def get_leave_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get all shift codes where isworking is false."""
    statement = select(ShiftCode).where(ShiftCode.isworking == False)  # noqa: E712
    return list(session.exec(statement).all())


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
    """Get applicable shift codes for a ward.

    Falls back to all working shift codes if no mappings are configured for that ward.
    """
    # Try to get ward-specific shift codes via WardShiftCode mapping table if it exists,
    # otherwise fall back to all working shift codes.
    try:
        from app.models.shifts import WardShiftCode  # noqa: F401
        statement = (
            select(ShiftCode)
            .join(WardShiftCode, ShiftCode.shiftcode == WardShiftCode.shiftcode)
            .where(WardShiftCode.wardid == ward_id)
        )
        codes = list(session.exec(statement).all())
        if codes:
            return codes
    except Exception:
        pass

    # Fallback: return all working shift codes
    statement = select(ShiftCode).where(ShiftCode.isworking == True)  # noqa: E712
    return list(session.exec(statement).all())


# ─────────────────────────────────────────────
# ROSTER PERIOD ENDPOINTS
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# SHIFT REQUEST ENDPOINTS (current user)
# ─────────────────────────────────────────────

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


@router.post("/", response_model=ShiftRequestPublic)
def create_shift_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_in: ShiftRequestCreate,
) -> Any:
    """Create a shift request for the logged-in nurse."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    # Count existing requests for this nurse in this period (for request number assignment)
    existing_requests = list(
        session.exec(
            select(ShiftRequest).where(
                ShiftRequest.nurseid == rbac_user.nurseid,
                ShiftRequest.periodid == request_in.periodid,
            )
        ).all()
    )

    # Enforce 3-request cap for working shifts and DO/RD (leave requests are unlimited)
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
                    ShiftRequest.nurseid == rbac_user.nurseid,
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

    # NOTE: Per-date uniqueness is NOT enforced — the DB schema enforces uniqueness on
    # (NurseID, PeriodID, RequestNumber) only. Multiple requests on the same date
    # with different request numbers are allowed.

    # Determine the next request number
    used_numbers = {r.requestnumber for r in existing_requests}
    next_number = next(n for n in range(1, len(existing_requests) + 2) if n not in used_numbers)

    shift_request = ShiftRequest(
        **request_in.model_dump(),
        nurseid=rbac_user.nurseid,
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
    """Update a shift request (shift type and/or date). Only the owning nurse can update."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    shift_request = session.get(ShiftRequest, request_id)
    if not shift_request:
        raise HTTPException(status_code=404, detail="Shift request not found")
    if shift_request.nurseid != rbac_user.nurseid:
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
    session.commit()
    session.refresh(shift_request)
    return shift_request


@router.delete("/{request_id}", status_code=204)
def delete_shift_request(
    request_id: int,
    session: SessionDep,
    current_user: CurrentUser,
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


# ─────────────────────────────────────────────
# WARD-SCOPED ENDPOINTS (for calendar view)
# ─────────────────────────────────────────────

@router.get("/ward/{ward_id}", response_model=list[ShiftRequestPublic])
def get_shift_requests_by_ward(
    ward_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    period_id: int | None = Query(default=None),
) -> Any:
    """Get all shift requests for nurses in a specific ward."""
    # Get all nurse IDs in this ward
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
    """Get all nurses for a specific ward."""
    statement = select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
    return list(session.exec(statement).all())


@router.get("/ward/{ward_id}/leave-requests", response_model=list[LeaveRequestPublic])
def get_ward_leave_requests(
    ward_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
) -> Any:
    """Get all leave requests for nurses in a specific ward, optionally filtered by date range."""
    nurse_ids = list(
        session.exec(select(Nurse.nurseid).where(Nurse.wardid == ward_id)).all()
    )
    if not nurse_ids:
        return []

    statement = select(LeaveRequest).where(LeaveRequest.nurseid.in_(nurse_ids))  # type: ignore[attr-defined]
    if start_date is not None:
        statement = statement.where(LeaveRequest.enddate >= start_date)
    if end_date is not None:
        statement = statement.where(LeaveRequest.startdate <= end_date)

    return list(session.exec(statement).all())


@router.patch("/leave-requests/{leave_id}", response_model=LeaveRequestPublic)
def update_leave_request(
    leave_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    update_in: LeaveRequestUpdate,
) -> Any:
    """Update a leave request's type. Only the owning nurse can update."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    leave_request = session.get(LeaveRequest, leave_id)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave_request.nurseid != rbac_user.nurseid:
        raise HTTPException(status_code=403, detail="Not authorized to update this request")

    if update_in.leavetype is not None:
        leave_request.leavetype = update_in.leavetype

    session.add(leave_request)
    session.commit()
    session.refresh(leave_request)
    return leave_request


@router.delete("/leave-requests/{leave_id}", status_code=204)
def delete_leave_request(
    leave_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    """Withdraw/delete a leave request. Only the owning nurse can delete."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user or not rbac_user.nurseid:
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    leave_request = session.get(LeaveRequest, leave_id)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave_request.nurseid != rbac_user.nurseid:
        raise HTTPException(status_code=403, detail="Not authorized to delete this request")

    session.delete(leave_request)
    session.commit()