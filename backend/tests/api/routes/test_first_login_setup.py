from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import verify_password
from app.models import RBACUser
from app.models.rbac import Nurse, Role, UserRole
from app.models.roster import Ward
from app.utils import generate_first_login_setup_token


def test_admin_create_user_with_email_sends_first_login_email(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    monkeypatch,
) -> None:
    sent_emails: list[dict[str, str]] = []

    def fake_send_email(*, email_to: str, subject: str = "", html_content: str = "") -> None:
        sent_emails.append(
            {
                "email_to": email_to,
                "subject": subject,
                "html_content": html_content,
            }
        )

    monkeypatch.setattr("app.api.routes.admin.send_email", fake_send_email)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setattr(settings, "EMAILS_FROM_EMAIL", "noreply@example.com")

    ward = Ward(wardname="Email Setup Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "email.setup",
            "name": "Email Setup",
            "email": "email.setup@example.com",
            "employee_id": "EMP-FLS-1",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )

    assert response.status_code == 201, response.text
    assert len(sent_emails) == 1
    assert sent_emails[0]["email_to"] == "email.setup@example.com"
    assert "Set up your account" in sent_emails[0]["subject"]
    assert "https://sachduby.com/first-login-setup?token=" in sent_emails[0]["html_content"]


def test_admin_create_user_without_email_does_not_send_first_login_email(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    monkeypatch,
) -> None:
    sent_emails: list[dict[str, str]] = []

    def fake_send_email(*, email_to: str, subject: str = "", html_content: str = "") -> None:
        sent_emails.append(
            {
                "email_to": email_to,
                "subject": subject,
                "html_content": html_content,
            }
        )

    monkeypatch.setattr("app.api.routes.admin.send_email", fake_send_email)

    ward = Ward(wardname="No Email Setup Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "no.email.setup",
            "name": "No Email Setup",
            "employee_id": "EMP-FLS-2",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )

    assert response.status_code == 201, response.text
    assert sent_emails == []


def test_public_first_login_context_and_completion_flow(
    client: TestClient,
    db: Session,
) -> None:
    ward = Ward(wardname="Public Setup Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse_role = db.exec(select(Role).where(Role.rolename == "Nurse")).first()
    assert nurse_role is not None

    user = RBACUser(
        username="public.setup",
        email="public.setup@example.com",
        passwordhash="old-hash",
        isactive=True,
        must_change_password=True,
        createdat=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    nurse = Nurse(
        name="Public Setup Nurse",
        employeeid=None,
        designation="SN",
        email=user.email,
        contactnumber="",
        wardid=ward.wardid,
        employmenttype="Full-time",
        shiftpattern=None,
        isactive=True,
    )
    db.add(nurse)
    db.commit()
    db.refresh(nurse)

    user.nurseid = nurse.nurseid
    db.add(user)
    db.add(
        UserRole(
            userid=user.userid,
            roleid=nurse_role.roleid,
            isactive=True,
            assignedat=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(user)

    token = generate_first_login_setup_token(user.userid)

    context_response = client.get(
        f"{settings.API_V1_STR}/users/first-login-setup",
        params={"token": token},
    )
    assert context_response.status_code == 200, context_response.text
    context_payload = context_response.json()
    assert context_payload["email"] == user.email
    assert context_payload["requires_employee_id"] is True
    assert context_payload["name"] == "Public Setup Nurse"

    complete_response = client.post(
        f"{settings.API_V1_STR}/users/first-login-setup",
        json={
            "token": token,
            "new_password": "NewPassword123!",
            "employee_id": "EMP-FLS-3",
        },
    )
    assert complete_response.status_code == 200, complete_response.text

    db.refresh(user)
    db.refresh(nurse)
    assert user.must_change_password is False
    assert user.default_password_encrypted is None
    assert verify_password("NewPassword123!", user.passwordhash)
    assert nurse.employeeid == "EMP-FLS-3"

    reused_response = client.get(
        f"{settings.API_V1_STR}/users/first-login-setup",
        params={"token": token},
    )
    assert reused_response.status_code == 400
    assert reused_response.json()["detail"] == "Invalid or expired setup link."
