import logging

from datetime import timedelta, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.requests import Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core import security
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import Message, RBACUser, RBACUserPublic
from app.utils import (
    generate_password_changed_email,
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> dict[str, str | bool]:
    """
    OAuth2 compatible token login, get an access token for future requests.
    Accepts email or username in the 'username' field.
    """
    user = crud.authenticate(session=session, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.isactive:
        raise HTTPException(status_code=400, detail="Inactive user")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(user.userid, expires_delta=access_token_expires)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "must_change_password": user.must_change_password,
    }


@router.post("/login/test-token")
def test_token(current_user: CurrentUser) -> RBACUserPublic:
    """Test access token"""
    return current_user  # type: ignore[return-value]


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Send a password recovery email.
    """
    user = session.exec(select(RBACUser).where(RBACUser.email == email)).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="No account found with that email.",
        )

    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )
    send_email(
        email_to=user.email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )

    return Message(message="Password recovery link sent.")


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password using a valid recovery token.
    After a successful reset, send a security notification email to the user.
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")

    user = session.exec(select(RBACUser).where(RBACUser.email == email)).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    if not user.isactive:
        raise HTTPException(status_code=400, detail="Inactive user")

    hashed_password = get_password_hash(password=body.new_password)
    user.passwordhash = hashed_password
    session.add(user)
    session.commit()

    # Send security notification — wrapped in try/except so a mail failure
    # never rolls back the already-committed password change.
    try:
        notification = generate_password_changed_email(
            email_to=user.email,
            username=user.username,
        )
        send_email(
            email_to=user.email,
            subject=notification.subject,
            html_content=notification.html_content,
        )
    except Exception:
        # Log but don't surface mail errors to the caller
        logger.warning(f"Failed to send password-changed notification to {user.email}")

    return Message(message="Password updated successfully")
