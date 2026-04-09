import sqlalchemy as sa
from sqlalchemy import inspect
from sqlmodel import Session, create_engine, select

from app.core.config import settings
from app.core.security import get_password_hash
from app.models import RBACUser
from app import models  # Ensure all models are imported for SQLModel metadata

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28

def _ensure_user_auth_columns(session: Session) -> None:
    """Heal legacy bootstrap schemas before ORM queries touch newer fields."""
    bind = session.get_bind()
    inspector = inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("User")}

    if "defaultpassword" not in user_columns:
        session.exec(sa.text('ALTER TABLE "User" ADD COLUMN defaultpassword VARCHAR'))
        session.commit()


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from sqlmodel import SQLModel

    # This works because the models are already imported and registered from app.models
    # SQLModel.metadata.create_all(engine)

    _ensure_user_auth_columns(session)

    # Ensure the first admin RBACUser exists
    from datetime import datetime, timezone
    username = settings.FIRST_SUPERUSER.split("@")[0]
    user = session.exec(
        select(RBACUser).where(
            (RBACUser.email == settings.FIRST_SUPERUSER) | (RBACUser.username == username)
        )
    ).first()
    if not user:
        user = RBACUser(
            username=username,
            email=settings.FIRST_SUPERUSER,
            passwordhash=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            isactive=True,
            createdat=datetime.now(timezone.utc),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Assign Admin role
        from app.models import Role, UserRole
        admin_role = session.exec(
            select(Role).where(Role.rolename == "Admin")
        ).first()
        if admin_role:
            session.add(UserRole(userid=user.userid, roleid=admin_role.roleid, isactive=True))
            session.commit()
