import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.api.routes.notifications import get_email_enabled
from app.core.config import settings
from app.models.enums import NotificationType
from app.models.leave import (
    LeaveRequest,
    LeaveRequestCreate,
    LeaveRequestPublic,
    LeaveRequestUpdate,
)
from app.models.rbac import Nurse, NurseManager, RBACUser, Role, UserRole
from app.models.shifts import ShiftCode, ShiftCodePublic
from app.rbac import get_rbac_user_by_email, user_has_role
from app.utils import (
    generate_leave_request_manager_email,
    generate_leave_review_nurse_email,
    send_email,
)

logger = logging.getLogger(__name__)

# tag "leave-requests" generates LeaveRequestsService in the client
router = APIRouter(prefix="/leave", tags=["leave-requests"])


EXCLUDED_LEAVE_CODES = ["DO", "RD", "SD"]


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


@router.get("/leave-codes", response_model=list[ShiftCodePublic])
def get_leave_codes(session: SessionDep, current_user: CurrentUser) -> Any:
    """Get non-working leave request codes, excluding roster allocation codes."""
    statement = select(ShiftCode).where(
        ShiftCode.isworking == False,  # noqa: E712
        ShiftCode.shiftcode.notin_(EXCLUDED_LEAVE_CODES),  # type: ignore[attr-defined]
    )
    return list(session.exec(statement).all())

@router.get("/me", response_model=list[LeaveRequestPublic])
def get_my_leave_requests(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get all leave requests for the logged-in nurse."""
    if not current_user.nurseid:
        return []
    return list(
        session.exec(
            select(LeaveRequest).where(LeaveRequest.nurseid == current_user.nurseid)
        ).all()
    )


@router.post("/", response_model=LeaveRequestPublic)
def create_leave_request(
    session: SessionDep,
    current_user: CurrentUser,
    leave_in: LeaveRequestCreate,
) -> Any:
    """Submit a new leave request for the logged-in nurse or a ward nurse (manager only)."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user:
        raise HTTPException(status_code=400, detail="User is not linked to an RBAC record")

    target_nurse_id = current_user.nurseid
    is_nurse_manager = user_has_role(session, current_user.email, "NurseManager")
    if leave_in.nurseid is not None:
        if not is_nurse_manager:
            raise HTTPException(
                status_code=403,
                detail="Only nurse managers can create a leave request for another nurse",
            )
        if not rbac_user.managerid:
            raise HTTPException(
                status_code=400,
                detail="User is not linked to a nurse manager record",
            )
        target_nurse = session.get(Nurse, leave_in.nurseid)
        if not target_nurse:
            raise HTTPException(status_code=404, detail="Nurse not found")
        target_nurse_id = leave_in.nurseid

    if not target_nurse_id:
        if is_nurse_manager:
            raise HTTPException(
                status_code=400,
                detail="Please select a nurse for this leave request",
            )
        raise HTTPException(status_code=400, detail="User is not linked to a nurse record")

    nurse = session.get(Nurse, target_nurse_id)
    nurse = session.get(Nurse, target_nurse_id)
    if not nurse:
        raise HTTPException(status_code=404, detail="Nurse profile not found")

    leave = LeaveRequest(
        **leave_in.model_dump(exclude={"nurseid"}),
        nurseid=target_nurse_id,
        status="Approved",
    )
    session.add(leave)
    session.commit()
    session.refresh(leave)

    # Notify the ward's nurse manager
    manager_rbac = session.exec(
        select(RBACUser)
        .join(UserRole, RBACUser.userid == UserRole.userid)  # type: ignore[arg-type]
        .join(Role, UserRole.roleid == Role.roleid)
        .where(
            UserRole.wardid == nurse.wardid,
            Role.rolename == "NurseManager",
            UserRole.isactive == True,  # noqa: E712
        )
    ).first()

    if manager_rbac and manager_rbac.managerid:
        crud.create_notification(
            session,
            recipient_type="NurseManager",
            recipient_id=manager_rbac.managerid,
            notification_type=NotificationType.LEAVE_REQUEST,
            priority="Urgent",
            related_entity_type="LeaveRequest",
            related_entity_id=leave.leaveid,
            nurse_name=nurse.name,
            leave_code=leave.leavetype,
            request_date=str(leave.startdate),
        )
        session.commit()

        if settings.emails_enabled:
            manager = session.get(NurseManager, manager_rbac.managerid)
            if manager and manager.email:
                try:
                    email_data = generate_leave_request_manager_email(
                        email_to=manager.email,
                        nurse_name=nurse.name,
                        leave_code=leave.leavetype,
                        start_date=str(leave.startdate),
                        end_date=str(leave.enddate),
                        manager_name=manager.name,
                    )
                    send_email(
                        email_to=manager.email,
                        subject=email_data.subject,
                        html_content=email_data.html_content,
                    )
                except Exception:
                    logger.exception(
                        "Failed to send leave request manager email for leave %s",
                        leave.leaveid,
                    )

    return leave


@router.get("/ward/{ward_id}", response_model=list[LeaveRequestPublic])
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


@router.patch("/{leave_id}/review", response_model=LeaveRequestPublic)
def review_leave_request(
    leave_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    status: str,
) -> Any:
    """Approve or reject a leave request. Only a NurseManager can review."""
    if status not in ("Approved", "Rejected"):
        raise HTTPException(status_code=422, detail="status must be Approved or Rejected")

    leave_request = session.get(LeaveRequest, leave_id)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave_request.status = status
    session.add(leave_request)

    nurse = session.get(Nurse, leave_request.nurseid)
    if nurse:
        ntype = (
            NotificationType.LEAVE_APPROVED
            if status == "Approved"
            else NotificationType.LEAVE_REJECTED
        )
        leave_dates = (
            str(leave_request.startdate)
            if leave_request.startdate == leave_request.enddate
            else f"{leave_request.startdate} – {leave_request.enddate}"
        )
        crud.create_notification(
            session,
            recipient_type="Nurse",
            recipient_id=leave_request.nurseid,
            notification_type=ntype,
            related_entity_type="LeaveRequest",
            related_entity_id=leave_id,
            leave_dates=leave_dates,
        )

        if settings.emails_enabled and nurse.email:
            if get_email_enabled(session, "Nurse", leave_request.nurseid, ntype.value):
                try:
                    email_data = generate_leave_review_nurse_email(
                        email_to=nurse.email,
                        nurse_name=nurse.name,
                        leave_code=leave_request.leavetype,
                        start_date=str(leave_request.startdate),
                        end_date=str(leave_request.enddate),
                        status=status,
                        rejection_reason=leave_request.rejectionreason,
                    )
                    send_email(
                        email_to=nurse.email,
                        subject=email_data.subject,
                        html_content=email_data.html_content,
                    )
                except Exception:
                    logger.exception(
                        "Failed to send leave review email to nurse %s",
                        leave_request.nurseid,
                    )

    session.commit()
    session.refresh(leave_request)
    return leave_request


@router.patch("/{leave_id}", response_model=LeaveRequestPublic)
def update_leave_request(
    leave_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    update_in: LeaveRequestUpdate,
) -> Any:
    """Update a leave request. The owning nurse or their nurse manager can update."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user:
        raise HTTPException(status_code=400, detail="User is not linked to an RBAC record")
    leave_request = session.get(LeaveRequest, leave_id)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    can_update = leave_request.nurseid == rbac_user.nurseid
    if not can_update and user_has_role(session, current_user.email, "NurseManager"):
        if not rbac_user.managerid:
            raise HTTPException(
                status_code=400,
                detail="User is not linked to a nurse manager record",
            )
        can_update = True

    if not can_update:
        raise HTTPException(status_code=403, detail="Not authorized to update this request")

    if update_in.leavetype is not None:
        leave_request.leavetype = update_in.leavetype
    if update_in.startdate is not None:
        leave_request.startdate = update_in.startdate
    if update_in.enddate is not None:
        leave_request.enddate = update_in.enddate

    session.add(leave_request)
    session.commit()
    session.refresh(leave_request)
    return leave_request


@router.delete("/{leave_id}", status_code=204)
def delete_leave_request(
    leave_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    """Withdraw/delete a leave request. The owning nurse or their nurse manager can delete."""
    rbac_user = get_rbac_user_by_email(session, current_user.email)
    if not rbac_user:
        raise HTTPException(status_code=400, detail="User is not linked to an RBAC record")
    leave_request = session.get(LeaveRequest, leave_id)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    can_delete = leave_request.nurseid == rbac_user.nurseid
    if not can_delete and user_has_role(session, current_user.email, "NurseManager"):
        if not rbac_user.managerid:
            raise HTTPException(
                status_code=400,
                detail="User is not linked to a nurse manager record",
            )
        can_delete = True

    if not can_delete:
        raise HTTPException(status_code=403, detail="Not authorized to delete this request")

    session.delete(leave_request)
    session.commit()
