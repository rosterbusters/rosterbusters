from typing import Any

from sqlmodel import Session, or_, select

from app.core.security import verify_password
from app.models import Nurse, NurseManager, RBACUser
from app.models.enums import NotificationType
from app.models.roster import NotificationQueue


def authenticate(*, session: Session, email: str, password: str) -> RBACUser | None:
    """Authenticate using RBACUser table. Accepts email, username, or employee ID."""
    identifier = email.strip()
    statement = select(RBACUser).where(
        or_(RBACUser.email == identifier, RBACUser.username == identifier)
    )
    db_user = session.exec(statement).first()

    if not db_user:
        nurse = session.exec(
            select(Nurse).where(Nurse.employeeid == identifier)
        ).first()
        if nurse:
            db_user = session.exec(
                select(RBACUser).where(RBACUser.nurseid == nurse.nurseid)
            ).first()

    if not db_user:
        manager = session.exec(
            select(NurseManager).where(NurseManager.employeeid == identifier)
        ).first()
        if manager:
            db_user = session.exec(
                select(RBACUser).where(RBACUser.managerid == manager.managerid)
            ).first()

    if not db_user:
        return None
    if not verify_password(password, db_user.passwordhash):
        return None
    return db_user


def create_notification(
    session: Session,
    *,
    recipient_type: str,
    recipient_id: int,
    notification_type: NotificationType,
    channel: str = "Email",
    priority: str = "Normal",
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
    **template_vars: Any,
) -> NotificationQueue:
    """Create a NotificationQueue row with the message body rendered from the enum template.

    The caller is responsible for calling session.commit() / session.refresh().
    """
    notification = NotificationQueue(
        recipienttype=recipient_type,
        recipientid=recipient_id,
        notificationtype=notification_type.value,
        channel=channel,
        priority=priority,
        subject=notification_type.value,
        messagebody=notification_type.template.format(**template_vars),
        relatedentitytype=related_entity_type,
        relatedentityid=related_entity_id,
    )
    session.add(notification)
    return notification

