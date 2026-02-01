from sqlmodel import Session, select
from app.models import RBACUser, UserRole, Role

def get_rbac_user_by_email(session: Session, email: str) -> RBACUser | None:
    return session.exec(select(RBACUser).where(RBACUser.email == email)).first()

def get_user_roles(session: Session, email: str) -> list[str]:
    rbac_user = get_rbac_user_by_email(session, email)
    if not rbac_user:
        return []
    
    # MODIFIED: Changed user_id to userid to match the model definition
    statement = select(Role.RoleName).join(UserRole, Role.RoleID == UserRole.RoleID).where(
        UserRole.UserID == rbac_user.userid,
        UserRole.IsActive == True
    )
    return list(session.exec(statement).all())

def user_has_role(session: Session, email: str, role_name: str) -> bool:
    return role_name in get_user_roles(session, email)