from sqlmodel import Session, select

from app.models import RBACUser, Role, UserRole


def get_rbac_user_by_email(session: Session, email: str) -> RBACUser | None:
    return session.exec(select(RBACUser).where(RBACUser.email == email)).first()


def get_user_roles(session: Session, email: str) -> list[str]:
    rbac_user = get_rbac_user_by_email(session, email)
    if not rbac_user:
        return []
    return get_user_roles_by_userid(session, rbac_user.userid)


def get_user_roles_by_userid(session: Session, userid: int) -> list[str]:
    """Look up roles by userid directly (works even when email is None)."""
    statement = (
        select(Role.rolename)
        .distinct()
        .join(UserRole, Role.roleid == UserRole.roleid)  # type: ignore[arg-type]
        .where(
            UserRole.userid == userid,
            UserRole.isactive == True,  # noqa: E712
        )
    )
    return list(session.exec(statement).all())


def user_has_role_by_userid(session: Session, userid: int, role_name: str) -> bool:
    return role_name in get_user_roles_by_userid(session, userid)


def user_has_role(session: Session, email: str, role_name: str) -> bool:
    return role_name in get_user_roles(session, email)
