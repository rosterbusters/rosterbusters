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
from app.models import TokenPayload, RBACUser

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
    user = session.get(RBACUser, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.isactive:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[RBACUser, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> RBACUser:
    # Check if user has Admin role - for now just check if active
    # TODO: Implement proper role checking via UserRole table
    if not current_user.isactive:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
