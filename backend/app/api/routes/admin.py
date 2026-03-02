"""
Admin endpoints for managing RBACUsers (the real authentication table).

All endpoints require the Admin role.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr
from sqlmodel import Field, SQLModel, func, select

from app.api.deps import SessionDep, get_current_active_superuser
from app.core.security import get_password_hash
from app.models import Message, RBACUser, Role, UserRole
from app.models.rbac import Nurse, NurseManager
from app.models.roster import Ward
from app.rbac import get_user_roles

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_active_superuser)],
)


# ---------------------------------------------------------------------------
#  Request / Response schemas
# ---------------------------------------------------------------------------

class WardInfo(SQLModel):
    ward_id: int
    ward_name: str


class AdminUserPublic(SQLModel):
    userid: int
    username: str
    email: str
    isactive: bool
    nurseid: Optional[int] = None
    managerid: Optional[int] = None
    roles: list[str] = []
    wards: list[WardInfo] = []


class AdminUsersPublic(SQLModel):
    data: list[AdminUserPublic]
    count: int


class AdminUserCreate(SQLModel):
    username: str = Field(min_length=1, max_length=255)
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    is_active: bool = True
    role: str = Field(default="Nurse", description="Nurse | NurseManager | Admin")
    ward_ids: list[int] = []


class AdminUserUpdate(SQLModel):
    username: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_active: Optional[bool] = None
    ward_ids: Optional[list[int]] = None


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _enrich(session, user: RBACUser) -> AdminUserPublic:
    """Convert an RBACUser row to the public response model."""
    roles = get_user_roles(session, user.email)
    ward_list: list[WardInfo] = []

    # Resolve ward for nurses (single primary ward via nurse.wardid)
    if user.nurseid:
        nurse = session.get(Nurse, user.nurseid)
        if nurse and nurse.wardid:
            ward = session.get(Ward, nurse.wardid)
            if ward:
                ward_list.append(WardInfo(ward_id=ward.wardid, ward_name=ward.wardname))

    # Resolve wards for managers (multiple — every ward where ward.managerid matches)
    if user.managerid:
        managed_wards = session.exec(
            select(Ward).where(Ward.managerid == user.managerid)
        ).all()
        for w in managed_wards:
            ward_list.append(WardInfo(ward_id=w.wardid, ward_name=w.wardname))

    return AdminUserPublic(
        userid=user.userid,
        username=user.username,
        email=user.email,
        isactive=user.isactive,
        nurseid=user.nurseid,
        managerid=user.managerid,
        roles=roles,
        wards=ward_list,
    )


# ---------------------------------------------------------------------------
#  CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/users", response_model=AdminUsersPublic)
def list_users(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """List all RBACUsers with their roles."""
    count = session.exec(select(func.count()).select_from(RBACUser)).one()
    users = session.exec(select(RBACUser).offset(skip).limit(limit)).all()
    return AdminUsersPublic(
        data=[_enrich(session, u) for u in users],
        count=count,
    )


@router.get("/users/{userid}", response_model=AdminUserPublic)
def get_user(session: SessionDep, userid: int) -> Any:
    """Get a single RBACUser by userid."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _enrich(session, user)


@router.post("/users", response_model=AdminUserPublic, status_code=201)
def create_user(session: SessionDep, body: AdminUserCreate) -> Any:
    """Create a new RBACUser and assign a role."""
    # Check duplicate email
    existing = session.exec(
        select(RBACUser).where(RBACUser.email == body.email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A user with this email already exists.",
        )

    # Validate role
    role = session.exec(
        select(Role).where(Role.rolename == body.role)
    ).first()
    if not role:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown role: {body.role}. Must be Nurse, NurseManager, or Admin.",
        )

    # Validate all ward_ids
    for wid in body.ward_ids:
        if not session.get(Ward, wid):
            raise HTTPException(status_code=400, detail=f"Ward {wid} not found.")

    user = RBACUser(
        username=body.username,
        email=body.email,
        passwordhash=get_password_hash(body.password),
        isactive=body.is_active,
        createdat=datetime.now(timezone.utc),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Create linked Nurse/NurseManager record and assign wards
    if body.role == "Nurse":
        nurse = Nurse(
            name=body.username,
            designation="RN",
            email=body.email,
            contactnumber="",
            wardid=body.ward_ids[0] if body.ward_ids else None,
            employmenttype="Full-time",
            isactive=True,
        )
        session.add(nurse)
        session.commit()
        session.refresh(nurse)
        user.nurseid = nurse.nurseid
        session.add(user)
        session.commit()
        session.refresh(user)

    elif body.role == "NurseManager":
        manager = NurseManager(
            name=body.username,
            email=body.email,
            contactnumber="",
            isactive=True,
            createdat=datetime.now(timezone.utc),
        )
        session.add(manager)
        session.commit()
        session.refresh(manager)
        user.managerid = manager.managerid
        session.add(user)
        session.commit()
        session.refresh(user)

        # Assign all selected wards to this manager
        for wid in body.ward_ids:
            ward = session.get(Ward, wid)
            if ward:
                ward.managerid = manager.managerid
                session.add(ward)
        session.commit()

    # Assign role
    user_role = UserRole(
        userid=user.userid,
        roleid=role.roleid,
        isactive=True,
        assignedat=datetime.now(timezone.utc),
    )
    session.add(user_role)
    session.commit()

    return _enrich(session, user)


@router.patch("/users/{userid}", response_model=AdminUserPublic)
def update_user(session: SessionDep, userid: int, body: AdminUserUpdate) -> Any:
    """Update an RBACUser (username, email, password, active status, wards)."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.email is not None and body.email != user.email:
        dup = session.exec(
            select(RBACUser).where(RBACUser.email == body.email)
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Email already in use.")

    if body.username is not None:
        user.username = body.username
    if body.email is not None:
        user.email = body.email
    if body.password is not None:
        user.passwordhash = get_password_hash(body.password)
    if body.is_active is not None:
        user.isactive = body.is_active

    session.add(user)
    session.commit()
    session.refresh(user)

    # Handle multi-ward assignment changes
    if body.ward_ids is not None:
        # Validate all ward_ids
        for wid in body.ward_ids:
            if not session.get(Ward, wid):
                raise HTTPException(status_code=400, detail=f"Ward {wid} not found.")

        # For nurses: set nurse.wardid to first selected ward (primary ward for scheduling)
        if user.nurseid:
            nurse = session.get(Nurse, user.nurseid)
            if nurse:
                nurse.wardid = body.ward_ids[0] if body.ward_ids else None
                session.add(nurse)
                session.commit()

        # For managers: replace ward assignments
        if user.managerid:
            # Un-assign all current wards
            old_wards = session.exec(
                select(Ward).where(Ward.managerid == user.managerid)
            ).all()
            for ow in old_wards:
                ow.managerid = None
                session.add(ow)

            # Assign new wards
            for wid in body.ward_ids:
                ward = session.get(Ward, wid)
                if ward:
                    ward.managerid = user.managerid
                    session.add(ward)
            session.commit()

    return _enrich(session, user)


@router.delete("/users/{userid}")
def delete_user(session: SessionDep, userid: int) -> Message:
    """Delete an RBACUser and their role assignments."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Remove role assignments first
    roles = session.exec(
        select(UserRole).where(UserRole.userid == userid)
    ).all()
    for r in roles:
        session.delete(r)

    session.delete(user)
    session.commit()
    return Message(message="User deleted successfully")
