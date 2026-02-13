from collections.abc import Generator
from typing import Annotated

import jwt
from jwt.exceptions import InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import TokenPayload, User

# Define OAuth2 scheme to retrieve the token from the header
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


# Dependency to create a DB Session
def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


# Type aliases to keep dependency injection code concise
SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


# Function to retrieve the current user from the token
def get_current_user(
    session: SessionDep, token: str = Depends(reusable_oauth2)
) -> User:
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
    
    # Query RBACUser table instead of User table
    from app.models.rbac import RBACUser
    from sqlmodel import select
    
    user = session.exec(
        select(RBACUser).where(RBACUser.userid == token_data.sub)
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user.isactive:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return user

# Dependency to inject the current user into routes
CurrentUser = Annotated[User, Depends(get_current_user)]


# Function to check superuser privileges
def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user