from sqlmodel import Session, select
from app.models import RBACUser, UserRole, Role

def get_rbac_user_by_email(session: Session, email: str) -> RBACUser | None:
    return session.exec(select(RBACUser).where(RBACUser.email == email)).first()

def get_user_roles(session: Session, email: str) -> list[str]:
    rbac_user = get_rbac_user_by_email(session, email)
    if not rbac_user:
        return []
    
    # MODIFIED: Changed user_id to userid to match the model definition
    statement = select(Role.rolename).join(UserRole, Role.roleid == UserRole.roleid).where(  # type: ignore[arg-type]
        UserRole.userid == rbac_user.userid,
        UserRole.isactive == True  # noqa: E712
    )
    return list(session.exec(statement).all())

def user_has_role(session: Session, email: str, role_name: str) -> bool:
    return role_name in get_user_roles(session, email)