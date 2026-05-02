import re
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import EmailStr, Field
from sqlmodel import select

from app.api.deps import (
    CurrentUser,
    NurseManagerUser,
    SessionDep,
)
from app.core.security import get_password_hash, should_bypass_verification, verify_password
from app.core.security import decrypt_default_password, encrypt_default_password, generate_random_password
from app.designation_mapping import canonical_designation_from_value, load_designation_rank_map
from app.models import (
    Message,
    Designation,
    Nurse,
    NurseManager,
    RBACUser,
    RBACUserPublic,
    Role,
    UpdatePassword,
    SQLModel,
    UserRole,
)
from app.models.roster import Ward
from app.rbac import get_user_roles_by_userid
from app.utils import (
    generate_email_verification_email,
    generate_first_login_setup_email,
    generate_first_login_setup_token,
    send_email,
    store_email_verification_code,
    verify_email_code,
    verify_first_login_setup_token,
)

router = APIRouter(prefix="/users", tags=["users"])


# Schema for first-login setup
class FirstLoginSetup(SQLModel):
    new_password: str = Field(min_length=8, max_length=128)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    employee_id: Optional[str] = Field(default=None, max_length=100)


class PublicFirstLoginSetup(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
    employee_id: Optional[str] = Field(default=None, max_length=100)


class FirstLoginSetupContext(SQLModel):
    email: EmailStr
    username: str
    name: Optional[str] = None
    employee_id: Optional[str] = None
    requires_employee_id: bool


# Schema for email verification
class SendEmailVerificationCode(SQLModel):
    email: EmailStr


class VerifyEmailCode(SQLModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class WardInfo(SQLModel):
    ward_id: int
    ward_name: str


class NurseManagerStaffPublic(SQLModel):
    userid: int
    nurseid: int
    username: str
    name: str
    email: Optional[str] = None
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    shift_pattern: Optional[str] = None
    isactive: bool
    must_change_password: bool = False
    ward: Optional[WardInfo] = None
    generated_password: Optional[str] = None


class NurseManagerPasswordResetResponse(SQLModel):
    username: str
    generated_password: str


class DesignationOption(SQLModel):
    designation: str
    rank: str


class NurseManagerStaffCreate(SQLModel):
    username: Optional[str] = Field(default=None, min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    employee_id: Optional[str] = Field(default=None, max_length=100)
    designation: str = Field(min_length=1, max_length=100)
    shift_pattern: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_active: bool = True
    ward_id: int


class NurseManagerStaffUpdate(SQLModel):
    username: Optional[str] = Field(default=None, max_length=255)
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    employee_id: Optional[str] = Field(default=None, max_length=100)
    designation: Optional[str] = Field(default=None, max_length=100)
    shift_pattern: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_active: Optional[bool] = None
    ward_id: Optional[int] = None


def _slugify_username(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", ".", value.lower()).strip(".")
    return re.sub(r"\.+", ".", slug)


def _generate_unique_username(session: SessionDep, seed: str) -> str:
    base = _slugify_username(seed) or "nurse"
    candidate = base
    suffix = 2
    while session.exec(select(RBACUser).where(RBACUser.username == candidate)).first():
        candidate = f"{base}{suffix}"
        suffix += 1
    return candidate


def _username_seed_from_name(value: str) -> str:
    return " ".join(value.strip().split()[:2])


def _managed_wards(session: SessionDep, manager_id: int) -> list[Ward]:
    return list(
        session.exec(
            select(Ward).where(
                Ward.managerid == manager_id,
                Ward.isactive == True,  # noqa: E712
            )
        ).all()
    )


def _managed_ward_ids(session: SessionDep, manager_id: int) -> set[int]:
    return {ward.wardid for ward in _managed_wards(session, manager_id)}


def _normalize_designation(session: SessionDep, raw: str) -> str:
    rank_map = load_designation_rank_map(session)
    canonical = canonical_designation_from_value(raw)
    if not canonical or canonical.upper() not in rank_map:
        raise HTTPException(status_code=400, detail=f"Unknown designation: {raw}")
    return canonical


def _build_staff_public(
    session: SessionDep,
    user: RBACUser,
    nurse: Nurse,
) -> NurseManagerStaffPublic:
    ward = session.get(Ward, nurse.wardid) if nurse.wardid else None
    ward_info = None
    if ward:
        ward_info = WardInfo(ward_id=ward.wardid, ward_name=ward.wardname)

    generated_password = None
    if user.must_change_password and user.default_password_encrypted:
        generated_password = decrypt_default_password(user.default_password_encrypted)

    return NurseManagerStaffPublic(
        userid=user.userid,
        nurseid=nurse.nurseid,
        username=user.username,
        name=nurse.name,
        email=user.email,
        employee_id=nurse.employeeid,
        designation=nurse.designation,
        shift_pattern=nurse.shiftpattern,
        isactive=user.isactive,
        must_change_password=user.must_change_password,
        ward=ward_info,
        generated_password=generated_password,
    )


def _get_managed_nurse_target(
    session: SessionDep,
    current_user: NurseManagerUser,
    userid: int,
) -> tuple[RBACUser, Nurse]:
    user = session.get(RBACUser, userid)
    if not user or not user.nurseid:
        raise HTTPException(status_code=404, detail="Nurse account not found")

    nurse = session.get(Nurse, user.nurseid)
    if not nurse:
        raise HTTPException(status_code=404, detail="Nurse record not found")

    roles = set(get_user_roles_by_userid(session, user.userid))
    if "Nurse" not in roles or "Admin" in roles or "NurseManager" in roles:
        raise HTTPException(
            status_code=403,
            detail="Nurse managers can only manage nurse accounts.",
        )

    if not current_user.managerid:
        raise HTTPException(status_code=403, detail="Nurse manager profile not found")

    return user, nurse


def _get_linked_staff_records(
    session: SessionDep,
    user: RBACUser,
) -> tuple[Optional[Nurse], Optional[NurseManager]]:
    nurse = None
    manager = None
    if user.nurseid:
        nurse = session.exec(select(Nurse).where(Nurse.nurseid == user.nurseid)).first()
    if user.managerid:
        manager = session.exec(
            select(NurseManager).where(NurseManager.managerid == user.managerid)
        ).first()
    return nurse, manager


def _validate_first_login_employee_id(
    session: SessionDep,
    user: RBACUser,
    employee_id: Optional[str],
) -> None:
    if not (user.nurseid or user.managerid):
        return

    if not employee_id:
        raise HTTPException(
            status_code=400,
            detail="Employee ID is required for first-time setup.",
        )

    if user.nurseid:
        dup_nurse = session.exec(
            select(Nurse).where(
                Nurse.employeeid == employee_id,
                Nurse.nurseid != user.nurseid,
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

    if user.managerid:
        dup_manager = session.exec(
            select(NurseManager).where(
                NurseManager.employeeid == employee_id,
                NurseManager.managerid != user.managerid,
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


def _build_first_login_context(
    user: RBACUser,
    nurse: Optional[Nurse],
    manager: Optional[NurseManager],
) -> FirstLoginSetupContext:
    if not user.email:
        raise HTTPException(status_code=400, detail="This setup link is invalid.")

    return FirstLoginSetupContext(
        email=user.email,
        username=user.username,
        name=(nurse.name if nurse else manager.name if manager else None),
        employee_id=(nurse.employeeid if nurse else manager.employeeid if manager else None),
        requires_employee_id=bool(user.nurseid or user.managerid),
    )


def _get_first_login_user_from_token(session: SessionDep, token: str) -> RBACUser:
    user_id = verify_first_login_setup_token(token)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired setup link.")

    user = session.get(RBACUser, user_id)
    if not user or not user.isactive or not user.must_change_password or not user.email:
        raise HTTPException(status_code=400, detail="Invalid or expired setup link.")

    return user


@router.get("/nurse-manager/designations", response_model=list[DesignationOption])
def list_nurse_manager_designations(
    *,
    session: SessionDep,
    current_user: NurseManagerUser,
) -> Any:
    """List designation options for nurse managers creating ward staff."""
    if not current_user.managerid:
        raise HTTPException(status_code=403, detail="Nurse manager profile not found")

    rows = session.exec(
        select(Designation).order_by(Designation.rank, Designation.designation)
    ).all()
    return [
        DesignationOption(designation=row.designation, rank=row.rank)
        for row in rows
    ]


@router.get("/nurse-manager/staff", response_model=list[NurseManagerStaffPublic])
def list_nurse_manager_staff(
    *,
    session: SessionDep,
    current_user: NurseManagerUser,
    ward_id: Optional[int] = None,
) -> Any:
    """List nurse accounts for any ward."""
    if not current_user.managerid:
        raise HTTPException(status_code=403, detail="Nurse manager profile not found")

    query = select(Nurse)
    if ward_id is not None:
        query = query.where(Nurse.wardid == ward_id)
    nurses = list(session.exec(query).all())

    if not nurses:
        return []

    nurse_ids = [n.nurseid for n in nurses]
    users = list(
        session.exec(select(RBACUser).where(RBACUser.nurseid.in_(nurse_ids))).all()  # type: ignore[arg-type]
    )
    users_by_nurse_id = {u.nurseid: u for u in users if u.nurseid is not None}

    results: list[NurseManagerStaffPublic] = []
    for nurse in nurses:
        user = users_by_nurse_id.get(nurse.nurseid)
        if not user:
            continue

        roles = set(get_user_roles_by_userid(session, user.userid))
        if "Nurse" not in roles or "Admin" in roles or "NurseManager" in roles:
            continue

        results.append(_build_staff_public(session, user, nurse))

    results.sort(key=lambda item: item.name.lower())
    return results


@router.post("/nurse-manager/staff", response_model=NurseManagerStaffPublic, status_code=201)
def create_nurse_manager_staff(
    *,
    session: SessionDep,
    background_tasks: BackgroundTasks,
    current_user: NurseManagerUser,
    body: NurseManagerStaffCreate,
) -> Any:
    """Create a nurse account in any ward."""
    if not current_user.managerid:
        raise HTTPException(status_code=403, detail="Nurse manager profile not found")
    ward = session.get(Ward, body.ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    requested_username = body.username.strip() if body.username else ""
    username = requested_username or _generate_unique_username(
        session,
        _username_seed_from_name(body.name) or (body.email.split("@")[0] if body.email else ""),
    )

    if session.exec(select(RBACUser).where(RBACUser.username == username)).first():
        raise HTTPException(status_code=409, detail="Username already in use.")

    if body.email and session.exec(select(RBACUser).where(RBACUser.email == body.email)).first():
        raise HTTPException(status_code=409, detail="Email already in use.")

    employee_id = body.employee_id.strip() if body.employee_id else None
    if employee_id:
        dup_nurse = session.exec(select(Nurse).where(Nurse.employeeid == employee_id)).first()
        if dup_nurse:
            raise HTTPException(
                status_code=409,
                detail="This employee ID is already assigned to a nurse.",
            )
        dup_manager = session.exec(
            select(NurseManager).where(NurseManager.employeeid == employee_id)
        ).first()
        if dup_manager:
            raise HTTPException(
                status_code=409,
                detail="This employee ID is already assigned to a nurse manager.",
            )

    shift_pattern = body.shift_pattern.strip().upper() if body.shift_pattern else None
    if body.shift_pattern is not None and shift_pattern not in {None, "AM_ONLY", "PM_ONLY"}:
        raise HTTPException(status_code=400, detail="shift_pattern must be AM_ONLY, PM_ONLY, or null")

    designation = _normalize_designation(session, body.designation.strip())

    nurse_role = session.exec(select(Role).where(Role.rolename == "Nurse")).first()
    if not nurse_role:
        raise HTTPException(status_code=500, detail="Nurse role is not configured.")

    raw_password = body.password if body.password else generate_random_password()

    user = RBACUser(
        username=username,
        email=body.email,
        passwordhash=get_password_hash(raw_password),
        isactive=body.is_active,
        must_change_password=True,
        default_password_encrypted=encrypt_default_password(raw_password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    nurse = Nurse(
        name=body.name.strip(),
        employeeid=employee_id,
        designation=designation,
        email=body.email or "",
        contactnumber="",
        wardid=body.ward_id,
        employmenttype="Full-time",
        shiftpattern=shift_pattern,
        isactive=body.is_active,
    )
    session.add(nurse)
    session.commit()
    session.refresh(nurse)

    user.nurseid = nurse.nurseid
    session.add(user)

    user_role = UserRole(
        userid=user.userid,
        roleid=nurse_role.roleid,
        isactive=True,
    )
    session.add(user_role)
    session.commit()
    session.refresh(user)

    result = _build_staff_public(session, user, nurse)
    if not body.password:
        result.generated_password = raw_password

    if user.email and user.must_change_password:
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

    return result


@router.patch("/nurse-manager/staff/{userid}", response_model=NurseManagerStaffPublic)
def update_nurse_manager_staff(
    *,
    session: SessionDep,
    current_user: NurseManagerUser,
    userid: int,
    body: NurseManagerStaffUpdate,
) -> Any:
    """Update a nurse account."""
    user, nurse = _get_managed_nurse_target(session, current_user, userid)

    if body.ward_id is not None:
        ward = session.get(Ward, body.ward_id)
        if not ward:
            raise HTTPException(status_code=404, detail="Ward not found")

    email_provided = "email" in body.model_fields_set
    if email_provided and body.email is not None and body.email != user.email:
        dup_email = session.exec(
            select(RBACUser).where(RBACUser.email == body.email, RBACUser.userid != user.userid)
        ).first()
        if dup_email:
            raise HTTPException(status_code=409, detail="Email already in use.")

    if body.username is not None and body.username != user.username:
        requested_username = body.username.strip()
        if not requested_username:
            raise HTTPException(status_code=400, detail="Username cannot be empty.")
        dup_username = session.exec(
            select(RBACUser).where(RBACUser.username == requested_username, RBACUser.userid != user.userid)
        ).first()
        if dup_username:
            raise HTTPException(status_code=409, detail="Username already in use.")
        user.username = requested_username

    if body.employee_id is not None:
        employee_id = body.employee_id.strip()
        if not employee_id:
            raise HTTPException(status_code=400, detail="Employee ID cannot be empty.")

        dup_nurse = session.exec(
            select(Nurse).where(Nurse.employeeid == employee_id, Nurse.nurseid != nurse.nurseid)
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
        nurse.employeeid = employee_id

    if body.designation is not None:
        designation_value = body.designation.strip()
        if not designation_value:
            raise HTTPException(status_code=400, detail="Designation cannot be empty.")
        nurse.designation = _normalize_designation(session, designation_value)

    if body.shift_pattern is not None:
        shift_pattern = body.shift_pattern.strip().upper() if body.shift_pattern else None
        if shift_pattern not in {None, "AM_ONLY", "PM_ONLY"}:
            raise HTTPException(status_code=400, detail="shift_pattern must be AM_ONLY, PM_ONLY, or null")
        nurse.shiftpattern = shift_pattern

    if body.name is not None:
        nurse.name = body.name.strip() or user.username

    if email_provided:
        if body.email != user.email:
            user.email_verified = False
        user.email = body.email
        nurse.email = body.email or ""

    if body.password is not None:
        user.passwordhash = get_password_hash(body.password)
        user.default_password_encrypted = None

    if body.is_active is not None:
        user.isactive = body.is_active
        nurse.isactive = body.is_active

    if body.ward_id is not None:
        nurse.wardid = body.ward_id

    session.add(user)
    session.add(nurse)
    session.commit()
    session.refresh(user)
    session.refresh(nurse)

    return _build_staff_public(session, user, nurse)


@router.post(
    "/nurse-manager/staff/{userid}/reset-password",
    response_model=NurseManagerPasswordResetResponse,
)
def reset_nurse_manager_staff_password(
    *,
    session: SessionDep,
    current_user: NurseManagerUser,
    userid: int,
) -> Any:
    """Generate a new temporary password for a managed nurse account."""
    user, _nurse = _get_managed_nurse_target(session, current_user, userid)

    raw_password = generate_random_password()
    user.passwordhash = get_password_hash(raw_password)
    user.must_change_password = True
    user.default_password_encrypted = encrypt_default_password(raw_password)
    session.add(user)
    session.commit()
    session.refresh(user)

    return NurseManagerPasswordResetResponse(
        username=user.username,
        generated_password=raw_password,
    )


@router.delete("/nurse-manager/staff/{userid}", response_model=Message)
def delete_nurse_manager_staff(
    *,
    session: SessionDep,
    current_user: NurseManagerUser,
    userid: int,
) -> Any:
    """Delete a managed nurse account."""
    user, nurse = _get_managed_nurse_target(session, current_user, userid)

    user_roles = session.exec(select(UserRole).where(UserRole.userid == user.userid)).all()
    for user_role in user_roles:
        session.delete(user_role)

    session.delete(user)
    session.delete(nurse)
    session.commit()
    return Message(message="User deleted successfully")


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
    current_user.default_password_encrypted = None
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

    nurse, manager = _get_linked_staff_records(session, current_user)
    employee_id = body.employee_id.strip() if body.employee_id else None

    # Staff users must confirm/set employee ID on first login.
    _validate_first_login_employee_id(session, current_user, employee_id)

    # Require email to be verified first via /users/me/verify-email-code.
    submitted_email = body.email.strip().lower() if body.email else ""
    current_email = current_user.email.strip().lower() if current_user.email else ""
    bypass_verification = should_bypass_verification(current_user)
    if submitted_email:
        existing_user = session.exec(
            select(RBACUser).where(
                RBACUser.email == submitted_email,
                RBACUser.userid != current_user.userid,
            )
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="This email is already registered to another user.",
            )

        if bypass_verification:
            current_email = submitted_email
            current_user.email = submitted_email
            current_user.email_verified = True
        else:
            if not current_email or not current_user.email_verified:
                raise HTTPException(
                    status_code=400,
                    detail="Email is not verified. Please verify your email before completing setup.",
                )
            if submitted_email.lower() != current_email.lower():
                raise HTTPException(
                    status_code=400,
                    detail="Submitted email does not match verified email. Please verify this email first.",
                )
    elif (not current_email or not current_user.email_verified) and not bypass_verification:
        raise HTTPException(
            status_code=400,
            detail="Email verification is required before completing setup.",
        )

    # Apply linked staff updates only after all setup validation passes.
    if nurse and employee_id:
        nurse.employeeid = employee_id
        session.add(nurse)
    if manager and employee_id:
        manager.employeeid = employee_id
        session.add(manager)

    # Keep linked nurse/manager email in sync with the verified account email.
    if nurse and current_email and nurse.email != current_email:
        nurse.email = current_email
        session.add(nurse)
    if manager and current_email and manager.email != current_email:
        manager.email = current_email
        session.add(manager)

    # Set the new password only after email and employee ID checks pass.
    current_user.passwordhash = get_password_hash(body.new_password)
    current_user.must_change_password = False
    current_user.default_password_encrypted = None

    session.add(current_user)
    session.commit()
    return Message(message="Account setup completed successfully.")


@router.get("/first-login-setup", response_model=FirstLoginSetupContext)
def get_first_login_setup_context(
    *,
    session: SessionDep,
    token: str,
) -> Any:
    user = _get_first_login_user_from_token(session, token)
    nurse, manager = _get_linked_staff_records(session, user)
    return _build_first_login_context(user, nurse, manager)


@router.post("/first-login-setup", response_model=Message)
def complete_public_first_login_setup(
    *,
    session: SessionDep,
    body: PublicFirstLoginSetup,
) -> Any:
    user = _get_first_login_user_from_token(session, body.token)
    nurse, manager = _get_linked_staff_records(session, user)
    employee_id = body.employee_id.strip() if body.employee_id else None

    _validate_first_login_employee_id(session, user, employee_id)

    if nurse and employee_id:
        nurse.employeeid = employee_id
        session.add(nurse)
    if manager and employee_id:
        manager.employeeid = employee_id
        session.add(manager)

    if nurse and user.email and nurse.email != user.email:
        nurse.email = user.email
        session.add(nurse)
    if manager and user.email and manager.email != user.email:
        manager.email = user.email
        session.add(manager)

    user.passwordhash = get_password_hash(body.new_password)
    user.must_change_password = False
    user.default_password_encrypted = None
    user.email_verified = True

    session.add(user)
    session.commit()
    return Message(message="Account setup completed successfully.")


@router.post("/me/send-email-verification-code", response_model=Message)
def send_email_verification_code(
    *, 
    session: SessionDep, 
    body: SendEmailVerificationCode,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser
) -> Any:
    """
    Send an email verification code to the provided email address.
    """
    email = body.email.strip().lower()
    
    # Check if email is already in use by another user
    existing_user = session.exec(
        select(RBACUser).where(
            RBACUser.email == email,
            RBACUser.userid != current_user.userid
        )
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="This email is already registered to another user."
        )
    
    # Generate and store verification code
    code = store_email_verification_code(email, current_user.userid)
    
    # Send email in background
    email_data = generate_email_verification_email(email_to=email, code=code)
    background_tasks.add_task(
        send_email,
        email_to=email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    
    return Message(message="Verification code sent to your email.")


@router.post("/me/verify-email-code", response_model=Message)
def verify_email_code_endpoint(
    *,
    session: SessionDep,
    body: VerifyEmailCode,
    current_user: CurrentUser
) -> Any:
    """
    Verify the email verification code and confirm the email.
    """
    email = body.email.strip().lower()
    code = "".join(ch for ch in body.code if ch.isdigit())
    
    # Verify the code
    if not verify_email_code(email, code, current_user.userid):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification code."
        )
    
    # Check if email is already in use by another user (final check)
    existing_user = session.exec(
        select(RBACUser).where(
            RBACUser.email == email,
            RBACUser.userid != current_user.userid
        )
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="This email is already registered to another user."
        )
    
    # Update user email
    current_user.email = email
    current_user.email_verified = True
    session.add(current_user)
    
    # Also update the linked nurse/manager email
    nurse = None
    manager = None
    
    if current_user.nurseid:
        nurse = session.exec(
            select(Nurse).where(Nurse.nurseid == current_user.nurseid)
        ).first()
    if current_user.managerid:
        manager = session.exec(
            select(NurseManager).where(NurseManager.managerid == current_user.managerid)
        ).first()
    
    if nurse:
        nurse.email = email
        session.add(nurse)
    if manager:
        manager.email = email
        session.add(manager)
    
    session.commit()
    
    return Message(message="Email verified and confirmed successfully.")


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
        email_verified=current_user.email_verified,
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
