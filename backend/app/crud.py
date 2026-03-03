import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import Item, ItemCreate, User, UserCreate, UserUpdate, RBACUser
from app.models.enums import NotificationType
from app.models.roster import NotificationQueue


def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


def authenticate(*, session: Session, email: str, password: str) -> RBACUser | None:
    """Authenticate using RBACUser table."""
    statement = select(RBACUser).where(RBACUser.email == email)
    db_user = session.exec(statement).first()
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


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item
