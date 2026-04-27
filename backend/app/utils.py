import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import random
import string
from uuid import uuid4

import emails  # type: ignore
import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from app.core import security
from app.core.config import settings
from app.models.enums import NotificationType

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_str = (
        Path(__file__).parent / "email-templates" / "build" / template_name
    ).read_text()
    html_content = Template(template_str).render(context)
    return html_content


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    assert settings.emails_enabled, "no provided configuration for email variables"
    if settings.aws_ses_enabled and not settings.smtp_enabled:
        import boto3

        client_kwargs: dict[str, str] = {"region_name": settings.AWS_REGION or ""}
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            client_kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            client_kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        ses_client = boto3.client("ses", **client_kwargs)
        sender_email = settings.AWS_SES_SENDER_EMAIL
        assert sender_email, "AWS_SES_SENDER_EMAIL must be set when using SES"
        if settings.EMAILS_FROM_NAME:
            source = f"{settings.EMAILS_FROM_NAME} <{sender_email}>"
        else:
            source = str(sender_email)

        response = ses_client.send_email(
            Source=source,
            Destination={"ToAddresses": [email_to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": html_content, "Charset": "UTF-8"}},
            },
        )
        logger.info("send email result: %s", response.get("MessageId"))
        return

    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    smtp_options = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT}
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        smtp_options["password"] = settings.SMTP_PASSWORD
    response = message.send(to=email_to, smtp=smtp_options)
    logger.info(f"send email result: {response}")


def generate_test_email(email_to: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
    link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_first_login_setup_email(email_to: str, username: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Set up your account"
    link = f"{settings.first_login_setup_host}/first-login-setup?token={token}"
    html_content = render_email_template(
        template_name="first_login_setup.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


def generate_first_login_setup_token(user_id: int) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    return security.create_access_token(
        subject=str(user_id),
        expires_delta=delta,
        token_use="first_login_setup",
    )


def verify_first_login_setup_token(token: str) -> int | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
    except InvalidTokenError:
        return None

    if decoded_token.get("token_use") != "first_login_setup":
        return None

    try:
        return int(decoded_token["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def generate_password_changed_email(email_to: str, username: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password changed successfully"
    html_content = render_email_template(
        template_name="password_changed.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_login_2fa_email(email_to: str, code: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Login verification code"
    html_content = render_email_template(
        template_name="login_2fa.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "email": email_to,
            "verification_code": code,
            "code_expiry_minutes": 10,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


# ============================================================================
# Email Verification Code Management
# ============================================================================

# Simple in-memory store for email verification codes (can be upgraded to Redis)
_email_verification_codes: dict[str, dict[str, Any]] = {}


_login_2fa_codes: dict[str, dict[str, Any]] = {}


def generate_email_verification_code() -> str:
    """Generate a 6-digit verification code."""
    return "".join(random.choices(string.digits, k=6))


def generate_login_2fa_code() -> str:
    return generate_email_verification_code()


def _email_verification_key(email: str, user_id: int) -> str:
    return f"{user_id}:{email.strip().lower()}"


def store_email_verification_code(email: str, user_id: int) -> str:
    """
    Generate and store a verification code for an email.
    Returns the code that was generated.
    """
    code = generate_email_verification_code()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=10)  # 10 minute expiry
    
    normalized_email = email.strip().lower()
    verification_key = _email_verification_key(normalized_email, user_id)

    _email_verification_codes[verification_key] = {
        "code": code,
        "user_id": user_id,
        "email": normalized_email,
        "expiry": expiry,
    }
    
    logger.info(f"Generated verification code for email: {email} (expires at {expiry})")
    return code


def verify_email_code(email: str, code: str, user_id: int) -> bool:
    """
    Verify if the provided code matches the stored code for the email.
    Checks expiry and cleans up on success or expiry.
    """
    normalized_email = email.strip().lower()
    normalized_code = "".join(ch for ch in code if ch.isdigit())
    verification_key = _email_verification_key(normalized_email, user_id)

    if verification_key not in _email_verification_codes:
        return False
    
    stored_data = _email_verification_codes[verification_key]
    
    # Check if code has expired
    if datetime.now(timezone.utc) > stored_data["expiry"]:
        del _email_verification_codes[verification_key]
        logger.warning(f"Verification code for {normalized_email} has expired")
        return False
    
    # Check if user_id matches
    if stored_data["user_id"] != user_id:
        logger.warning(f"User ID mismatch for email verification: {normalized_email}")
        return False
    
    # Check if code matches
    if stored_data["code"] != normalized_code:
        logger.warning(f"Invalid verification code for {normalized_email}")
        return False
    
    # Code is valid, clean up
    del _email_verification_codes[verification_key]
    logger.info(f"Email verification successful for: {normalized_email}")
    return True


def generate_login_2fa_challenge_id() -> str:
    return uuid4().hex


def store_login_2fa_code(challenge_id: str, user_id: int) -> str:
    code = generate_login_2fa_code()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=10)

    _login_2fa_codes[challenge_id] = {
        "code": code,
        "user_id": user_id,
        "expiry": expiry,
    }

    logger.info("Generated login 2FA code for user %s (expires at %s)", user_id, expiry)
    return code


def verify_login_2fa_code(challenge_id: str, code: str, user_id: int) -> bool:
    if challenge_id not in _login_2fa_codes:
        return False

    stored_data = _login_2fa_codes[challenge_id]

    if datetime.now(timezone.utc) > stored_data["expiry"]:
        del _login_2fa_codes[challenge_id]
        logger.warning("Login 2FA code for challenge %s has expired", challenge_id)
        return False

    if stored_data["user_id"] != user_id:
        logger.warning("User ID mismatch for login 2FA challenge %s", challenge_id)
        return False

    if stored_data["code"] != code:
        logger.warning("Invalid login 2FA code for challenge %s", challenge_id)
        return False

    del _login_2fa_codes[challenge_id]
    logger.info("Login 2FA successful for challenge %s", challenge_id)
    return True


def generate_email_verification_email(email_to: str, code: str) -> EmailData:
    """Generate an email with the verification code."""
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Verify your email address"
    html_content = render_email_template(
        template_name="email_verification.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "email": email_to,
            "verification_code": code,
            "code_expiry_minutes": 10,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_algorithm_notification_email(
    email_to: str,
    roster_period: str,
    message: str,
    manager_name: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Roster algorithm update"
    html_content = render_email_template(
        template_name="roster_planning.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "email": email_to,
            "manager_name": manager_name or "Nurse Manager",
            "roster_period": roster_period,
            "message": message,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_roster_release_email(
    email_to: str,
    roster_period: str,
    ward_name: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    message = NotificationType.ROSTER_RELEASE.template.format(
        roster_period=roster_period
    )
    subject = f"{project_name} - {message}"
    html_content = render_email_template(
        template_name="roster_release.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "email": email_to,
            "roster_period": roster_period,
            "ward_name": ward_name or "",
            "message": message,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_shift_request_period_open_email(email_to: str, roster_period: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Shift request period is open"
    html_content = render_email_template(
        template_name="shift_request_open.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "email": email_to,
            "roster_period": roster_period,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_shift_request_period_closed_email(email_to: str, roster_period: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Shift request period is closed"
    html_content = render_email_template(
        template_name="shift_request_closed.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "email": email_to,
            "roster_period": roster_period,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_shift_request_approved_email(
    email_to: str,
    roster_period: str,
    nurse_name: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Shift request approved"
    html_content = render_email_template(
        template_name="shift_request_approved.html",
        context={
            "project_name": project_name,
            "email": email_to,
            "roster_period": roster_period,
            "nurse_name": nurse_name or "",
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_shift_request_rejected_email(
    email_to: str,
    roster_period: str,
    nurse_name: str | None = None,
    rejection_reason: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Shift request rejected"
    html_content = render_email_template(
        template_name="shift_request_rejected.html",
        context={
            "project_name": project_name,
            "email": email_to,
            "roster_period": roster_period,
            "nurse_name": nurse_name or "",
            "rejection_reason": rejection_reason or "",
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_leave_request_manager_email(
    email_to: str,
    nurse_name: str,
    leave_code: str,
    start_date: str,
    end_date: str,
    manager_name: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New leave request from {nurse_name}"
    html_content = render_email_template(
        template_name="leave_request_manager.html",
        context={
            "project_name": project_name,
            "email": email_to,
            "nurse_name": nurse_name,
            "leave_code": leave_code,
            "start_date": start_date,
            "end_date": end_date,
            "manager_name": manager_name or "Nurse Manager",
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_leave_review_nurse_email(
    email_to: str,
    nurse_name: str,
    leave_code: str,
    start_date: str,
    end_date: str,
    status: str,  # "Approved" or "Rejected"
    rejection_reason: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Leave request {status.lower()}"
    html_content = render_email_template(
        template_name="leave_review_nurse.html",
        context={
            "project_name": project_name,
            "email": email_to,
            "nurse_name": nurse_name,
            "leave_code": leave_code,
            "start_date": start_date,
            "end_date": end_date,
            "status": status,
            "is_approved": status == "Approved",
            "rejection_reason": rejection_reason or "",
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_shift_updated_email(
    email_to: str,
    nurse_name: str,
    shift_date: str,
    new_shift_code: str,
    old_shift_code: str | None = None,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Your shift has been updated"
    html_content = render_email_template(
        template_name="shift_updated.html",
        context={
            "project_name": project_name,
            "email": email_to,
            "nurse_name": nurse_name,
            "shift_date": shift_date,
            "new_shift_code": new_shift_code,
            "old_shift_code": old_shift_code or "",
        },
    )
    return EmailData(html_content=html_content, subject=subject)
