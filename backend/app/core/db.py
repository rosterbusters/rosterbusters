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

def ensure_bootstrap_schema(session: Session) -> None:
    """Heal legacy schemas before bootstrap ORM queries touch newer fields."""
    bind = session.get_bind()
    inspector = inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("User")}
    ward_columns = {column["name"] for column in inspector.get_columns("ward")}
    nurse_columns = {column["name"] for column in inspector.get_columns("nurse")}

    if "defaultpassword" not in user_columns:
        session.exec(sa.text('ALTER TABLE "User" ADD COLUMN defaultpassword VARCHAR'))
        session.commit()

    if "wardhourtype" not in ward_columns:
        session.exec(
            sa.text(
                "ALTER TABLE ward "
                "ADD COLUMN wardhourtype VARCHAR(20) NOT NULL DEFAULT '8_HOURS'"
            )
        )
        session.exec(
            sa.text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ward_wardhourtype'
                  ) THEN
                    ALTER TABLE ward
                    ADD CONSTRAINT chk_ward_wardhourtype
                    CHECK (wardhourtype IN ('8_HOURS', '12_HOURS'));
                  END IF;
                END $$;
                """
            )
        )
        session.commit()

    if "join_date" not in nurse_columns:
        session.exec(sa.text("ALTER TABLE nurse ADD COLUMN join_date DATE"))
        session.commit()


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from sqlmodel import SQLModel

    # This works because the models are already imported and registered from app.models
    # SQLModel.metadata.create_all(engine)

    ensure_bootstrap_schema(session)

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
