"""
Amazon SES Email Utility
------------------------
Fully structured for SES. Email is NOT sent yet (pending Capstone Office SES approval).
When approved, set SES_ENABLED=true in .env and install boto3.

Required .env vars (add when SES is approved):
    SES_ENABLED=false           # flip to true once approved
    SES_REGION=ap-southeast-1
    SES_SENDER_EMAIL=no-reply@sach.com.sg
    AWS_ACCESS_KEY_ID=...
    AWS_SECRET_ACCESS_KEY=...
"""

import logging
import os

logger = logging.getLogger(__name__)

SES_ENABLED = os.getenv("SES_ENABLED", "false").lower() == "true"
SES_REGION = os.getenv("SES_REGION", "ap-southeast-1")
SES_SENDER_EMAIL = os.getenv("SES_SENDER_EMAIL", "no-reply@sach.com.sg")


def send_password_reset_email(*, recipient_email: str, reset_link: str, username: str) -> None:
    """
    Send a password reset email via Amazon SES.
    While SES_ENABLED=false, the email is only logged (not delivered).
    """
    subject = "SACH Staff Rostering – Password Reset Request"
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>Password Reset Request</h2>
        <p>Dear {username},</p>
        <p>We received a request to reset your password for the SACH Staff Rostering System.</p>
        <p>Click the button below to reset your password. This link is valid for <strong>30 minutes</strong>.</p>
        <p style="margin: 24px 0;">
            <a href="{reset_link}"
               style="background:#2B8A3E;color:#fff;padding:12px 24px;
                      text-decoration:none;border-radius:6px;font-weight:bold;">
                Reset Password
            </a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="{reset_link}">{reset_link}</a></p>
        <p>If you did not request a password reset, please ignore this email. Your password will not change.</p>
        <hr/>
        <p style="font-size:12px;color:#888;">
            This is an automated message from the SACH Staff Rostering System.<br/>
            Please do not reply to this email.
        </p>
    </body>
    </html>
    """
    body_text = (
        f"Dear {username},\n\n"
        f"We received a request to reset your SACH Staff Rostering password.\n\n"
        f"Reset link (valid 30 minutes):\n{reset_link}\n\n"
        f"If you did not request this, please ignore this email."
    )

    if SES_ENABLED:
        try:
            import boto3  # noqa: PLC0415
            client = boto3.client(
                "ses",
                region_name=SES_REGION,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
            client.send_email(
                Source=SES_SENDER_EMAIL,
                Destination={"ToAddresses": [recipient_email]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": body_text, "Charset": "UTF-8"},
                        "Html": {"Data": body_html, "Charset": "UTF-8"},
                    },
                },
            )
            logger.info("SES password reset email sent to %s", recipient_email)
        except Exception as exc:  # noqa: BLE001
            logger.error("SES send_email failed for %s: %s", recipient_email, exc)
            raise
    else:
        # SES not yet enabled – log the email content for testing
        logger.info(
            "[SES STUB] Password reset email would be sent.\n"
            "  To: %s\n"
            "  Subject: %s\n"
            "  Reset Link: %s",
            recipient_email,
            subject,
            reset_link,
        )