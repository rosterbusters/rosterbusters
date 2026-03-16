"""
Password Reset Routes
POST /api/v1/auth/forgot-password   – generate token, "send" email via SES stub
POST /api/v1/auth/reset-password    – validate token, update password
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from sqlmodel import select

from app.api.deps import SessionDep
from app.core.security import get_password_hash
from app.core.ses_email import send_password_reset_email
from app.core.config import settings
from app.models.rbac import RBACUser

logger = logging.getLogger(__name__)
router = APIRouter()

TOKEN_EXPIRY_MINUTES = 30


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request a password reset link",
)
def forgot_password(body: ForgotPasswordRequest, session: SessionDep):
    user = session.exec(
        select(RBACUser).where(RBACUser.email == body.email)
    ).first()

    if user is None:
        logger.info("Password reset requested for unknown email: %s", body.email)
        return MessageResponse(
            message="If that email is registered, a reset link has been sent."
        )

    if not user.isactive:
        raise HTTPException(
            status_code=400,
            detail=(
                "This account is inactive. "
                "Please contact your administrator to reactivate it."
            ),
        )

    if user.email is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "No email address is linked to this account. "
                "Please contact your administrator to add an email address."
            ),
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)

    user.password_reset_token = token
    user.password_reset_token_expires_at = expires_at
    session.add(user)
    session.commit()

    frontend_url = str(settings.FRONTEND_HOST).rstrip("/")
    reset_link = f"{frontend_url}/reset-password?token={token}"

    try:
        send_password_reset_email(
            recipient_email=user.email,
            reset_link=reset_link,
            username=user.username,
        )
    except Exception as exc:
        logger.error("Email dispatch failed for userid=%s: %s", user.userid, exc)
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to send the password reset email. "
                "Please try again later or contact your administrator."
            ),
        ) from exc

    return MessageResponse(
        message="If that email is registered, a reset link has been sent."
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password using a valid token",
)
def reset_password(body: ResetPasswordRequest, session: SessionDep):
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long.",
        )

    user = session.exec(
        select(RBACUser).where(RBACUser.password_reset_token == body.token)
    ).first()

    if user is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "This password reset link is invalid. "
                "Please request a new one from the Forgot Password page."
            ),
        )

    expires_at = user.password_reset_token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at is None or datetime.now(timezone.utc) > expires_at:
        user.password_reset_token = None
        user.password_reset_token_expires_at = None
        session.add(user)
        session.commit()
        raise HTTPException(
            status_code=400,
            detail=(
                "This password reset link has expired (valid for 30 minutes). "
                "Please request a new one from the Forgot Password page."
            ),
        )

    if not user.isactive:
        raise HTTPException(
            status_code=400,
            detail="This account is inactive. Please contact your administrator.",
        )

    user.passwordhash = get_password_hash(body.new_password)
    user.password_reset_token = None
    user.password_reset_token_expires_at = None
    user.must_change_password = False
    session.add(user)
    session.commit()

    logger.info("Password successfully reset for userid=%s", user.userid)
    return MessageResponse(message="Password updated successfully.")