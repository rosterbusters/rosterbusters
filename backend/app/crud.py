from sqlmodel import Session, select

from app.core.security import verify_password
from app.models import RBACUser


def authenticate(*, session: Session, email: str, password: str) -> RBACUser | None:
    """Authenticate using RBACUser table."""
    statement = select(RBACUser).where(RBACUser.email == email)
    db_user = session.exec(statement).first()
    if not db_user:
        return None
    if not verify_password(password, db_user.passwordhash):
        return None
    return db_user
