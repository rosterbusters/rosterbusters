from sqlmodel import Session, or_, select

from app.core.security import verify_password
from app.models import RBACUser


def authenticate(*, session: Session, email: str, password: str) -> RBACUser | None:
    """Authenticate using RBACUser table. Accepts email or username."""
    statement = select(RBACUser).where(
        or_(RBACUser.email == email, RBACUser.username == email)
    )
    db_user = session.exec(statement).first()
    if not db_user:
        return None
    if not verify_password(password, db_user.passwordhash):
        return None
    return db_user
