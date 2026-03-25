from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import EmailStr
from sqlmodel import Field, SQLModel, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
)
from app.core.security import get_password_hash, verify_password
from app.models import (
    Message,
    Nurse,
    NurseManager,
    RBACUser,
    RBACUserPublic,
    UpdatePassword,
)
from app.models.roster import Ward

router = APIRouter(prefix="/users", tags=["users"])


# Schema for first-login setup
class FirstLoginSetup(SQLModel):
    new_password: str = Field(min_length=8, max_length=128)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    employee_id: Optional[str] = Field(default=None, max_length=100)


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password.
    """
    if not verify_password(body.current_password, current_user.passwordhash):
        raise HTTPException(status_code=400, detail="Incorrect password")
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    hashed_password = get_password_hash(body.new_password)
    current_user.passwordhash = hashed_password
    session.add(current_user)
    session.commit()
    return Message(message="Password updated successfully")


@router.post("/me/first-login-setup", response_model=Message)
def first_login_setup(
    *, session: SessionDep, body: FirstLoginSetup, current_user: CurrentUser
) -> Any:
    """
    First-time login setup: set a new password, and optionally provide an email.
    Only allowed when the user's must_change_password flag is True.
    """
    if not current_user.must_change_password:
        raise HTTPException(
            status_code=400,
            detail="Password change is not required for this account.",
        )

    nurse = None
    manager = None
    employee_id = body.employee_id.strip() if body.employee_id else None

    if current_user.nurseid:
        nurse = session.exec(
            select(Nurse).where(Nurse.nurseid == current_user.nurseid)
        ).first()
    if current_user.managerid:
        manager = session.exec(
            select(NurseManager).where(NurseManager.managerid == current_user.managerid)
        ).first()

    # Staff users must confirm/set employee ID on first login.
    if current_user.nurseid or current_user.managerid:
        if not employee_id:
            raise HTTPException(
                status_code=400,
                detail="Employee ID is required for first-time setup.",
            )

        if current_user.nurseid:
            dup_nurse = session.exec(
                select(Nurse).where(
                    Nurse.employeeid == employee_id,
                    Nurse.nurseid != current_user.nurseid,
                )
            ).first()
            if dup_nurse:
                raise HTTPException(
                    status_code=400,
                    detail="This employee ID is already assigned to another nurse.",
                )
            dup_manager = session.exec(
                select(NurseManager).where(NurseManager.employeeid == employee_id)
            ).first()
            if dup_manager:
                raise HTTPException(
                    status_code=400,
                    detail="This employee ID is already assigned to a nurse manager.",
                )

        if current_user.managerid:
            dup_manager = session.exec(
                select(NurseManager).where(
                    NurseManager.employeeid == employee_id,
                    NurseManager.managerid != current_user.managerid,
                )
            ).first()
            if dup_manager:
                raise HTTPException(
                    status_code=400,
                    detail="This employee ID is already assigned to another nurse manager.",
                )
            dup_nurse = session.exec(
                select(Nurse).where(Nurse.employeeid == employee_id)
            ).first()
            if dup_nurse:
                raise HTTPException(
                    status_code=400,
                    detail="This employee ID is already assigned to a nurse.",
                )

        if nurse:
            nurse.employeeid = employee_id
            session.add(nurse)
        if manager:
            manager.employeeid = employee_id
            session.add(manager)

    # Set new password
    current_user.passwordhash = get_password_hash(body.new_password)
    current_user.must_change_password = False

    # Optionally set email
    if body.email:
        # Check duplicate
        existing = session.exec(
            select(RBACUser).where(
                RBACUser.email == body.email, RBACUser.userid != current_user.userid
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400, detail="A user with this email already exists."
            )
        current_user.email = body.email

        # Also update the linked nurse/manager email
        if nurse:
            nurse.email = body.email
            session.add(nurse)
        if manager:
            manager.email = body.email
            session.add(manager)

    session.add(current_user)
    session.commit()
    return Message(message="Account setup completed successfully.")


@router.get("/me", response_model=RBACUserPublic)
def read_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get current user (using RBAC authentication).
    """
    from app.rbac import get_user_roles_by_userid
    wardid = None
    name = None
    employee_id = None
    roles = get_user_roles_by_userid(session, current_user.userid)
    is_superuser = "Admin" in roles
    if current_user.nurseid:
        # Nurse: look up their ward from the Nurse table
        nurse = session.exec(
            select(Nurse).where(Nurse.nurseid == current_user.nurseid)
        ).first()
        if nurse:
            wardid = nurse.wardid
            name = nurse.name
            employee_id = nurse.employeeid
    elif current_user.managerid:
        manager = session.exec(
            select(NurseManager).where(NurseManager.managerid == current_user.managerid)
        ).first()
        if manager:
            name = manager.name
            employee_id = manager.employeeid
        ward = session.exec(
            select(Ward).where(Ward.managerid == current_user.managerid, Ward.isactive == True)  # noqa: E712
        ).first()
        if ward:
            wardid = ward.wardid

    return RBACUserPublic(
        userid=current_user.userid,
        username=current_user.username,
        email=current_user.email,
        employee_id=employee_id,
        nurseid=current_user.nurseid,
        managerid=current_user.managerid,
        isactive=current_user.isactive,
        is_superuser=is_superuser,
        must_change_password=current_user.must_change_password,
        wardid=wardid,
        name=name,
    )


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    """
    session.delete(current_user)
    session.commit()
    return Message(message="User deleted successfully")
