from collections.abc import Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import RBACUser, TokenPayload
from app.rbac import get_user_roles, user_has_role, user_has_role_by_userid

try:
    from jwt.exceptions import InvalidTokenError
except ImportError:
    from jwt.exceptions import DecodeError as InvalidTokenError

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> RBACUser:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    try:
        user_id = int(token_data.sub)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = session.get(RBACUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.isactive:
        raise HTTPException(status_code=400, detail="Inactive user")
    if token_data.token_use != "access":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    return user


CurrentUser = Annotated[RBACUser, Depends(get_current_user)]


def get_current_active_superuser(
    session: SessionDep, current_user: CurrentUser
) -> RBACUser:
    """Only allow users with the Admin role."""
    if current_user.userid is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not user_has_role_by_userid(session, current_user.userid, "Admin"):
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def require_nurse_manager(
    session: SessionDep,
    current_user: CurrentUser,
) -> RBACUser:
    """Dependency: allows only users with the NurseManager role."""
    if not user_has_role(session, current_user.email, "NurseManager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nurse manager access required",
        )
    return current_user


def require_nurse(
    session: SessionDep,
    current_user: CurrentUser,
) -> RBACUser:
    """Dependency: allows users with the Nurse role OR the NurseManager role.

    NurseManagers who have been granted nurse access can reach ward-staff
    routes without needing a separate Nurse role assignment.
    """
    roles = get_user_roles(session, current_user.email)
    if "Nurse" not in roles and "NurseManager" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ward staff access required",
        )
    return current_user


NurseManagerUser = Annotated[RBACUser, Depends(require_nurse_manager)]
NurseUser = Annotated[RBACUser, Depends(require_nurse)]
