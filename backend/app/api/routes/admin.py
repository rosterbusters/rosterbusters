"""
Admin endpoints for managing RBACUsers (the real authentication table).

All endpoints require the Admin role.
"""

from datetime import date, datetime, timezone
import logging
import re
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import EmailStr
from sqlmodel import Field, SQLModel, func, or_, select

from app.api.deps import SessionDep, get_current_active_superuser
from app.core.config import settings
from app.core.security import (
    decrypt_default_password,
    encrypt_default_password,
    generate_random_password,
    get_password_hash,
)
from app.designation_mapping import (
    canonical_designation_from_value,
    load_designation_rank_map,
)
from app.models import Designation, Message, RBACUser, Role, UserRole
from app.models.rbac import Nurse, NurseManager
from app.models.roster import Ward
from app.rbac import get_user_roles, get_user_roles_by_userid
from app.utils import (
    generate_first_login_setup_email,
    generate_first_login_setup_token,
    send_email,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_active_superuser)],
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  Request / Response schemas
# ---------------------------------------------------------------------------

class WardInfo(SQLModel):
    ward_id: int
    ward_name: str


class AdminUserPublic(SQLModel):
    userid: int
    username: str
    name: Optional[str] = None
    email: Optional[str] = None
    employee_id: Optional[str] = None
    join_date: Optional[date] = None
    designation: Optional[str] = None
    shift_pattern: Optional[str] = None
    isactive: bool
    nurseid: Optional[int] = None
    managerid: Optional[int] = None
    must_change_password: bool = False
    roles: list[str] = []
    wards: list[WardInfo] = []
    generated_password: Optional[str] = None  # Only returned on create


class AdminUsersPublic(SQLModel):
    data: list[AdminUserPublic]
    count: int


class AdminPasswordResetResponse(SQLModel):
    username: str
    generated_password: str


class AdminUserCreate(SQLModel):
    username: Optional[str] = Field(default=None, min_length=1, max_length=255)
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    employee_id: Optional[str] = Field(default=None, max_length=100)
    join_date: Optional[date] = None
    designation: Optional[str] = Field(default=None, max_length=100)
    shift_pattern: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_active: bool = True
    role: str = Field(default="Nurse", description="Nurse | NurseManager | Admin")
    ward_ids: list[int] = []


class AdminUserUpdate(SQLModel):
    username: Optional[str] = Field(default=None, max_length=255)
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    employee_id: Optional[str] = Field(default=None, max_length=100)
    join_date: Optional[date] = None
    designation: Optional[str] = Field(default=None, max_length=100)
    shift_pattern: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_active: Optional[bool] = None
    ward_ids: Optional[list[int]] = None


class DesignationOption(SQLModel):
    designation: str
    rank: str


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _slugify_username(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", ".", value.lower()).strip(".")
    slug = re.sub(r"\.+", ".", slug)
    return slug


def _truncate_username(value: str, max_tokens: int = 2) -> str:
    normalized = _slugify_username(value)
    if not normalized:
        return ""
    return ".".join(normalized.split(".")[:max_tokens])


def _truncate_name(value: str, max_words: int = 3) -> str:
    words = value.split()
    if not words:
        return ""
    return " ".join(words[:max_words])


def _generate_unique_username(session, seed: str) -> str:
    base = _slugify_username(seed) or "user"
    candidate = base
    suffix = 2
    while session.exec(
        select(RBACUser).where(RBACUser.username == candidate)
    ).first():
        candidate = f"{base}{suffix}"
        suffix += 1
    return candidate


def _get_role_by_name(session: SessionDep, role_name: str) -> Role:
    role = session.exec(select(Role).where(Role.rolename == role_name)).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role {role_name} not found.")
    return role


def _get_manager_ward_ids(session: SessionDep, userid: int) -> list[int]:
    ward_ids = session.exec(
        select(UserRole.wardid)
        .join(Role, UserRole.roleid == Role.roleid)
        .where(
            UserRole.userid == userid,
            UserRole.isactive == True,  # noqa: E712
            UserRole.wardid.is_not(None),
            Role.rolename == "NurseManager",
        )
    ).all()
    return list(dict.fromkeys(wid for wid in ward_ids if wid is not None))


def _find_replacement_manager_id(
    session: SessionDep,
    ward_id: int,
    excluded_user_id: int,
) -> Optional[int]:
    manager_ids = session.exec(
        select(RBACUser.managerid)
        .join(UserRole, RBACUser.userid == UserRole.userid)  # type: ignore[arg-type]
        .join(Role, UserRole.roleid == Role.roleid)
        .where(
            UserRole.wardid == ward_id,
            UserRole.isactive == True,  # noqa: E712
            Role.rolename == "NurseManager",
            RBACUser.userid != excluded_user_id,
            RBACUser.managerid.is_not(None),
        )
    ).all()
    return next((manager_id for manager_id in manager_ids if manager_id is not None), None)


def _sync_manager_ward_assignments(
    session: SessionDep,
    user: RBACUser,
    ward_ids: list[int],
) -> None:
    if not user.userid or not user.managerid:
        return

    manager_role = _get_role_by_name(session, "NurseManager")
    previous_ward_ids = set(_get_manager_ward_ids(session, user.userid))
    normalized_ward_ids = list(dict.fromkeys(ward_ids))

    existing_roles = session.exec(
        select(UserRole).where(
            UserRole.userid == user.userid,
            UserRole.roleid == manager_role.roleid,
        )
    ).all()
    for existing_role in existing_roles:
        session.delete(existing_role)
    session.flush()

    if normalized_ward_ids:
        for ward_id in normalized_ward_ids:
            session.add(
                UserRole(
                    userid=user.userid,
                    roleid=manager_role.roleid,
                    wardid=ward_id,
                    isactive=True,
                    assignedat=datetime.now(timezone.utc),
                )
            )
    else:
        session.add(
            UserRole(
                userid=user.userid,
                roleid=manager_role.roleid,
                isactive=True,
                assignedat=datetime.now(timezone.utc),
            )
        )
    session.flush()

    current_ward_ids = set(normalized_ward_ids)
    for ward_id in previous_ward_ids - current_ward_ids:
        ward = session.get(Ward, ward_id)
        if ward and ward.managerid == user.managerid:
            ward.managerid = _find_replacement_manager_id(session, ward_id, user.userid)
            session.add(ward)

    for ward_id in current_ward_ids:
        ward = session.get(Ward, ward_id)
        if ward and ward.managerid is None:
            ward.managerid = user.managerid
            session.add(ward)

    session.commit()

def _enrich(session, user: RBACUser) -> AdminUserPublic:
    """Convert an RBACUser row to the public response model."""
    roles = get_user_roles_by_userid(session, user.userid)
    ward_list: list[WardInfo] = []
    employee_id: Optional[str] = None
    join_date: Optional[date] = None
    designation: Optional[str] = None
    shift_pattern: Optional[str] = None
    name: Optional[str] = None

    # Resolve ward for nurses (single primary ward via nurse.wardid)
    if user.nurseid:
        nurse = session.get(Nurse, user.nurseid)
        if nurse:
            name = nurse.name
            employee_id = nurse.employeeid
            join_date = nurse.join_date
            designation = nurse.designation
            shift_pattern = nurse.shiftpattern
            if nurse.wardid:
                ward = session.get(Ward, nurse.wardid)
                if ward:
                    ward_list.append(WardInfo(ward_id=ward.wardid, ward_name=ward.wardname))

    # Resolve wards for managers from role assignments so multiple managers can share a ward
    if user.managerid:
        manager = session.get(NurseManager, user.managerid)
        if manager:
            name = manager.name
            employee_id = manager.employeeid
        managed_ward_ids = _get_manager_ward_ids(session, user.userid)
        managed_wards = (
            session.exec(select(Ward).where(Ward.wardid.in_(managed_ward_ids))).all()
            if managed_ward_ids
            else []
        )
        for w in managed_wards:
            ward_list.append(WardInfo(ward_id=w.wardid, ward_name=w.wardname))

    generated_password = None
    if user.must_change_password and user.default_password_encrypted:
        generated_password = decrypt_default_password(user.default_password_encrypted)

    return AdminUserPublic(
        userid=user.userid,
        username=user.username,
        name=name,
        email=user.email,
        employee_id=employee_id,
        join_date=join_date,
        designation=designation,
        shift_pattern=shift_pattern,
        isactive=user.isactive,
        nurseid=user.nurseid,
        managerid=user.managerid,
        must_change_password=user.must_change_password,
        roles=roles,
        wards=ward_list,
        generated_password=generated_password,
    )


# ---------------------------------------------------------------------------
#  CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/users", response_model=AdminUsersPublic)
def list_users(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    search: str = "",
    role: str = "all",
    status: str = "all",
    password_state: str = "all",
    ward_id: int | None = None,
) -> Any:
    """List all RBACUsers with their roles."""
    query = select(RBACUser)
    count_query = select(func.count()).select_from(RBACUser)

    if search:
        pattern = f"%{search}%"
        matching_nurse_ids = select(Nurse.nurseid).where(Nurse.employeeid.ilike(pattern))  # type: ignore[union-attr]
        matching_manager_ids = select(NurseManager.managerid).where(NurseManager.employeeid.ilike(pattern))  # type: ignore[union-attr]
        search_filter = or_(
            RBACUser.username.ilike(pattern),  # type: ignore[union-attr]
            RBACUser.email.ilike(pattern),  # type: ignore[union-attr]
            RBACUser.nurseid.in_(matching_nurse_ids),  # type: ignore[union-attr]
            RBACUser.managerid.in_(matching_manager_ids),  # type: ignore[union-attr]
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if role != "all":
        matching_role_user_ids = (
            select(UserRole.userid)
            .join(Role, UserRole.roleid == Role.roleid)
            .where(
                UserRole.isactive.is_(True),
                Role.isactive.is_(True),
                Role.rolename == role,
            )
        )
        query = query.where(RBACUser.userid.in_(matching_role_user_ids))
        count_query = count_query.where(RBACUser.userid.in_(matching_role_user_ids))

    if status == "active":
        query = query.where(RBACUser.isactive.is_(True))
        count_query = count_query.where(RBACUser.isactive.is_(True))
    elif status == "inactive":
        query = query.where(RBACUser.isactive.is_(False))
        count_query = count_query.where(RBACUser.isactive.is_(False))

    if password_state == "temporary":
        query = query.where(RBACUser.must_change_password.is_(True))
        count_query = count_query.where(RBACUser.must_change_password.is_(True))
    elif password_state == "updated":
        query = query.where(RBACUser.must_change_password.is_(False))
        count_query = count_query.where(RBACUser.must_change_password.is_(False))

    if ward_id is not None:
        nurse_user_ids = (
            select(RBACUser.userid)
            .join(Nurse, RBACUser.nurseid == Nurse.nurseid)
            .where(Nurse.wardid == ward_id)
        )
        manager_user_ids = select(UserRole.userid).where(
            UserRole.wardid == ward_id,
            UserRole.isactive.is_(True),
        )
        ward_filter = or_(
            RBACUser.userid.in_(nurse_user_ids),
            RBACUser.userid.in_(manager_user_ids),
        )
        query = query.where(ward_filter)
        count_query = count_query.where(ward_filter)

    query = query.order_by(RBACUser.userid)
    count = session.exec(count_query).one()
    users = session.exec(query.offset(skip).limit(limit)).all()
    return AdminUsersPublic(
        data=[_enrich(session, u) for u in users],
        count=count,
    )


@router.get("/designations", response_model=list[DesignationOption])
def list_designations(session: SessionDep) -> Any:
    """List designation options from reference table."""
    rows = session.exec(
        select(Designation).order_by(Designation.rank, Designation.designation)
    ).all()
    return [
        DesignationOption(designation=row.designation, rank=row.rank)
        for row in rows
    ]


@router.get("/users/{userid}", response_model=AdminUserPublic)
def get_user(session: SessionDep, userid: int) -> Any:
    """Get a single RBACUser by userid."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _enrich(session, user)


@router.post("/users", response_model=AdminUserPublic, status_code=201)
def create_user(
    session: SessionDep,
    body: AdminUserCreate,
    background_tasks: BackgroundTasks,
) -> Any:
    """Create a new RBACUser and assign a role."""
    employee_id = body.employee_id.strip() if body.employee_id else None
    name = _truncate_name(body.name.strip()) if body.name else None
    designation = body.designation.strip() if body.designation else None
    join_date = body.join_date
    rank_map = load_designation_rank_map(session)

    def _normalize_designation(raw: str | None) -> str | None:
        if raw is None:
            return None
        canonical = canonical_designation_from_value(raw)
        if not canonical:
            raise HTTPException(status_code=400, detail=f"Unknown designation: {raw}")
        if canonical.upper() not in rank_map:
            raise HTTPException(status_code=400, detail=f"Unknown designation: {raw}")
        return canonical
    # Preserve explicit usernames exactly (after trimming) so clients can log in with the same value.
    requested_username = body.username.strip() if body.username else ""
    shift_pattern = body.shift_pattern.strip().upper() if body.shift_pattern else None
    if shift_pattern not in {None, "AM_ONLY", "PM_ONLY"}:
        raise HTTPException(status_code=400, detail="shift_pattern must be AM_ONLY, PM_ONLY, or null")

    # Check duplicate email (only if email provided)
    if body.email:
        existing = session.exec(
            select(RBACUser).where(RBACUser.email == body.email)
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A user with this email already exists.",
            )

    if requested_username:
        # Check duplicate username only when one is explicitly provided
        existing_username = session.exec(
            select(RBACUser).where(RBACUser.username == requested_username)
        ).first()
        if existing_username:
            raise HTTPException(
                status_code=400,
                detail="A user with this username already exists.",
            )

    # Generate username from name (fallback email prefix) when omitted
    username = requested_username or _generate_unique_username(
        session,
        name or (body.email.split("@")[0] if body.email else ""),
    )

    if employee_id:
        existing_nurse = session.exec(
            select(Nurse).where(Nurse.employeeid == employee_id)
        ).first()
        if existing_nurse:
            raise HTTPException(
                status_code=400,
                detail="This employee ID is already assigned to a nurse.",
            )

        existing_manager = session.exec(
            select(NurseManager).where(NurseManager.employeeid == employee_id)
        ).first()
        if existing_manager:
            raise HTTPException(
                status_code=400,
                detail="This employee ID is already assigned to a nurse manager.",
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

    # Auto-generate password if not provided
    raw_password = body.password if body.password else generate_random_password()

    user = RBACUser(
        username=username,
        email=body.email,
        passwordhash=get_password_hash(raw_password),
        isactive=body.is_active,
        must_change_password=True,
        default_password_encrypted=encrypt_default_password(raw_password),
        createdat=datetime.now(timezone.utc),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Create linked Nurse/NurseManager record and assign wards
    if body.role == "Nurse":
        if body.designation is not None and designation is None:
            raise HTTPException(status_code=400, detail="Designation cannot be empty.")
        canonical_designation = _normalize_designation(designation or "SN")
        nurse = Nurse(
            name=name or username,
            employeeid=employee_id,
            join_date=join_date,
            designation=canonical_designation or "SN",
            email=body.email or "",
            contactnumber="",
            wardid=body.ward_ids[0] if body.ward_ids else None,
            employmenttype="Full-time",
            shiftpattern=shift_pattern,
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
            name=name or username,
            employeeid=employee_id,
            email=body.email or "",
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

    # Assign role
    if body.role == "NurseManager":
        _sync_manager_ward_assignments(session, user, body.ward_ids)
    else:
        user_role = UserRole(
            userid=user.userid,
            roleid=role.roleid,
            isactive=True,
            assignedat=datetime.now(timezone.utc),
        )
        session.add(user_role)
        session.commit()

    result = _enrich(session, user)
    # Return the generated password so admin can share it with the user
    if not body.password:
        result.generated_password = raw_password

    if user.email and user.must_change_password and settings.emails_enabled:
        try:
            first_login_token = generate_first_login_setup_token(user.userid)
            email_data = generate_first_login_setup_email(
                email_to=user.email,
                username=result.name or user.username,
                token=first_login_token,
            )
            background_tasks.add_task(
                send_email,
                email_to=user.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )
        except Exception:
            logger.exception(
                "Failed to queue first-login email for user %s", user.userid
            )

    return result


@router.patch("/users/{userid}", response_model=AdminUserPublic)
def update_user(session: SessionDep, userid: int, body: AdminUserUpdate) -> Any:
    """Update an RBACUser (username, email, password, active status, wards)."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    employee_id = body.employee_id.strip() if body.employee_id else None
    name = body.name.strip() if body.name else None
    designation = body.designation.strip() if body.designation else None
    join_date_provided = "join_date" in body.model_fields_set
    shift_pattern = body.shift_pattern.strip().upper() if body.shift_pattern else None
    if body.shift_pattern is not None and shift_pattern not in {None, "AM_ONLY", "PM_ONLY"}:
        raise HTTPException(status_code=400, detail="shift_pattern must be AM_ONLY, PM_ONLY, or null")
    rank_map = load_designation_rank_map(session)

    def _normalize_designation(raw: str | None) -> str | None:
        if raw is None:
            return None
        if not raw:
            raise HTTPException(status_code=400, detail="Designation cannot be empty.")
        canonical = canonical_designation_from_value(raw)
        if not canonical:
            raise HTTPException(status_code=400, detail=f"Unknown designation: {raw}")
        if canonical.upper() not in rank_map:
            raise HTTPException(status_code=400, detail=f"Unknown designation: {raw}")
        return canonical
    email_provided = "email" in body.model_fields_set

    if email_provided and body.email is not None and body.email != user.email:
        dup = session.exec(
            select(RBACUser).where(RBACUser.email == body.email)
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Email already in use.")

    if body.username is not None and body.username != user.username:
        dup = session.exec(
            select(RBACUser).where(RBACUser.username == body.username)
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Username already in use.")

    nurse = session.get(Nurse, user.nurseid) if user.nurseid else None
    manager = session.get(NurseManager, user.managerid) if user.managerid else None
    manager_ward_ids = _get_manager_ward_ids(session, user.userid) if manager else []

    if body.designation is not None and designation is None:
        raise HTTPException(status_code=400, detail="Designation cannot be empty.")

    if body.employee_id is not None:
        if nurse:
            if employee_id:
                dup_nurse = session.exec(
                    select(Nurse).where(
                        Nurse.employeeid == employee_id,
                        Nurse.nurseid != user.nurseid,
                    )
                ).first()
                if dup_nurse:
                    raise HTTPException(
                        status_code=409,
                        detail="This employee ID is already assigned to another nurse.",
                    )
                dup_manager = session.exec(
                    select(NurseManager).where(NurseManager.employeeid == employee_id)
                ).first()
                if dup_manager:
                    raise HTTPException(
                        status_code=409,
                        detail="This employee ID is already assigned to a nurse manager.",
                    )

        if manager:
            if employee_id:
                dup_manager = session.exec(
                    select(NurseManager).where(
                        NurseManager.employeeid == employee_id,
                        NurseManager.managerid != user.managerid,
                    )
                ).first()
                if dup_manager:
                    raise HTTPException(
                        status_code=409,
                        detail="This employee ID is already assigned to another nurse manager.",
                    )
                dup_nurse = session.exec(
                    select(Nurse).where(Nurse.employeeid == employee_id)
                ).first()
                if dup_nurse:
                    raise HTTPException(
                        status_code=409,
                        detail="This employee ID is already assigned to a nurse.",
                    )

    if body.username is not None:
        user.username = body.username
    if email_provided:
        user.email = body.email
    if body.password is not None:
        user.passwordhash = get_password_hash(body.password)
        user.default_password_encrypted = None
    if body.is_active is not None:
        user.isactive = body.is_active

    session.add(user)
    session.commit()
    session.refresh(user)

    if body.employee_id is not None:
        if nurse:
            nurse.employeeid = employee_id
            if join_date_provided:
                nurse.join_date = body.join_date
            if body.designation is not None:
                nurse.designation = _normalize_designation(designation)
            if body.shift_pattern is not None:
                nurse.shiftpattern = shift_pattern
            if body.name is not None:
                nurse.name = name or user.username
            if email_provided:
                nurse.email = body.email or ""
            session.add(nurse)
            session.commit()

        if manager:
            manager.employeeid = employee_id
            if body.name is not None:
                manager.name = name or user.username
            if email_provided:
                manager.email = body.email or ""
            session.add(manager)
            session.commit()

    elif (
        body.username is not None
        or body.name is not None
        or email_provided
        or body.designation is not None
        or body.shift_pattern is not None
        or join_date_provided
    ):
        if nurse:
            if join_date_provided:
                nurse.join_date = body.join_date
            if body.designation is not None:
                nurse.designation = _normalize_designation(designation)
            if body.shift_pattern is not None:
                nurse.shiftpattern = shift_pattern
            if body.name is not None:
                nurse.name = name or user.username
            if email_provided:
                nurse.email = body.email or ""
            session.add(nurse)
            session.commit()

        if manager:
            if body.name is not None:
                manager.name = name or user.username
            if email_provided:
                manager.email = body.email or ""
            session.add(manager)
            session.commit()

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
            _sync_manager_ward_assignments(session, user, body.ward_ids)

    return _enrich(session, user)


@router.post("/users/{userid}/reset-password", response_model=AdminPasswordResetResponse)
def reset_user_password(session: SessionDep, userid: int) -> Any:
    """Generate a new temporary password for a user."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_password = generate_random_password()
    user.passwordhash = get_password_hash(raw_password)
    user.must_change_password = True
    user.default_password_encrypted = encrypt_default_password(raw_password)
    session.add(user)
    session.commit()
    session.refresh(user)

    return AdminPasswordResetResponse(
        username=user.username,
        generated_password=raw_password,
    )


@router.delete("/users/{userid}")
def delete_user(session: SessionDep, userid: int) -> Message:
    """Delete an RBACUser and their role assignments."""
    user = session.get(RBACUser, userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    nurse = session.get(Nurse, user.nurseid) if user.nurseid else None
    manager = session.get(NurseManager, user.managerid) if user.managerid else None

    user_roles = get_user_roles_by_userid(session, userid)
    if "Admin" in user_roles:
        raise HTTPException(
            status_code=403,
            detail="Admin accounts cannot be deleted.",
        )

    # Remove role assignments first
    roles = session.exec(
        select(UserRole).where(UserRole.userid == userid)
    ).all()
    for r in roles:
        session.delete(r)

    if manager:
        for ward_id in manager_ward_ids:
            ward = session.get(Ward, ward_id)
            if ward and ward.managerid == manager.managerid:
                ward.managerid = _find_replacement_manager_id(session, ward_id, user.userid)
                session.add(ward)

    session.delete(user)
    if nurse:
        session.delete(nurse)
    if manager:
        session.delete(manager)
    session.commit()
    return Message(message="User deleted successfully")
