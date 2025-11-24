from sqlmodel import Session, select
from app.models_rbac import RBACUser, UserRole, Role, Permission, RolePermission

def get_rbac_user_by_email(session: Session, email: str) -> RBACUser | None:
    return session.exec(select(RBACUser).where(RBACUser.email == email)).first()

def get_user_roles(session: Session, email: str) -> list[str]:
    rbac_user = get_rbac_user_by_email(session, email)
    if not rbac_user:
        return []
    
    statement = select(Role.role_name).join(UserRole).where(
        UserRole.user_id == rbac_user.user_id,
        UserRole.is_active == True
    )
    return list(session.exec(statement).all())

def user_has_role(session: Session, email: str, role_name: str) -> bool:
    return role_name in get_user_roles(session, email)