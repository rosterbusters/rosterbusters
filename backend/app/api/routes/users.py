from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

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

router = APIRouter(prefix="/users", tags=["users"])


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


@router.get("/me", response_model=RBACUserPublic)
def read_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get current user (using RBAC authentication).
    """
    from app.rbac import user_has_role
    wardid = None
    name = None
    is_superuser = user_has_role(session, current_user.email, "Admin")
    if current_user.nurseid:
        # Nurse: look up their ward from the Nurse table
        nurse = session.exec(
            select(Nurse).where(Nurse.nurseid == current_user.nurseid)
        ).first()
        if nurse:
            wardid = nurse.wardid
            name = nurse.name
    elif current_user.managerid:
        # Nurse Manager: look up their display name from the NurseManager table.
        # They manage multiple wards so wardid stays None.
        manager = session.exec(
            select(NurseManager).where(NurseManager.managerid == current_user.managerid)
        ).first()
        if manager:
            name = manager.name

    return RBACUserPublic(
        userid=current_user.userid,
        username=current_user.username,
        email=current_user.email,
        nurseid=current_user.nurseid,
        managerid=current_user.managerid,
        isactive=current_user.isactive,
        is_superuser=is_superuser,
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
