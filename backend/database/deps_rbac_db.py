from typing import Annotated, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlmodel import Session, select, create_engine
from pydantic import ValidationError
import os

from .models_rbac_db import RBACUser, UserRole, Role, Permission, RolePermission

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL") or f"postgresql://{os.getenv('POSTGRES_USER', 'postgres')}:{os.getenv('POSTGRES_PASSWORD', 'changethis')}@localhost:{os.getenv('POSTGRES_PORT', '5432')}/nurse_rostering"
engine = create_engine(DATABASE_URL, echo=False)

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
API_V1_STR = os.getenv("API_V1_STR", "/api/v1")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{API_V1_STR}/login/access-token")


def get_session():
    """Database session dependency"""
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]


def get_current_user(session: SessionDep, token: TokenDep) -> RBACUser:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except (JWTError, ValidationError):
        raise credentials_exception
    
    user = session.get(RBACUser, user_id)
    if not user:
        raise credentials_exception
    
    if not user.IsActive:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return user


CurrentUser = Annotated[RBACUser, Depends(get_current_user)]


def get_user_roles(session: Session, user_id: int) -> List[dict]:
    """Get all active roles for a user"""
    statement = select(Role, UserRole).join(
        UserRole, Role.RoleID == UserRole.RoleID
    ).where(
        UserRole.UserID == user_id,
        UserRole.IsActive == True,
        Role.IsActive == True
    )
    
    results = session.exec(statement).all()
    return [
        {
            "RoleID": role.RoleID,
            "RoleName": role.RoleName,
            "DisplayName": role.DisplayName,
            "WardID": user_role.WardID
        }
        for role, user_role in results
    ]


def get_user_permissions(session: Session, user_id: int) -> List[str]:
    """Get all permissions for a user based on their roles"""
    statement = select(Permission.PermissionName).join(
        RolePermission, Permission.PermissionID == RolePermission.PermissionID
    ).join(
        UserRole, RolePermission.RoleID == UserRole.RoleID
    ).where(
        UserRole.UserID == user_id,
        UserRole.IsActive == True
    ).distinct()
    
    permissions = session.exec(statement).all()
    return list(permissions)


def user_has_permission(session: Session, user_id: int, permission_name: str) -> bool:
    """Check if user has a specific permission"""
    permissions = get_user_permissions(session, user_id)
    return permission_name in permissions


def user_has_role(session: Session, user_id: int, role_name: str) -> bool:
    """Check if user has a specific role"""
    roles = get_user_roles(session, user_id)
    return any(role["RoleName"] == role_name for role in roles)


def user_can_access_ward(session: Session, user_id: int, ward_id: int) -> bool:
    """Check if user can access a specific ward"""
    # Admins can access all wards
    if user_has_role(session, user_id, "Admin"):
        return True
    
    # Check if user is manager of this ward
    statement = select(UserRole).join(
        Role, UserRole.RoleID == Role.RoleID
    ).where(
        UserRole.UserID == user_id,
        Role.RoleName == "NurseManager",
        UserRole.WardID == ward_id,
        UserRole.IsActive == True
    )
    
    if session.exec(statement).first():
        return True
    
    # Check if user (nurse) is assigned to this ward
    user = session.get(RBACUser, user_id)
    if user and user.NurseID:
        from .models_rbac_db import Nurse
        nurse = session.get(Nurse, user.NurseID)
        if nurse and nurse.WardID == ward_id:
            return True
    
    return False


def require_permission(permission_name: str):
    """Dependency to require a specific permission"""
    def permission_checker(session: SessionDep, current_user: CurrentUser):
        if not user_has_permission(session, current_user.UserID, permission_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_name} required"
            )
        return current_user
    
    return permission_checker


def require_role(role_name: str):
    """Dependency to require a specific role"""
    def role_checker(session: SessionDep, current_user: CurrentUser):
        if not user_has_role(session, current_user.UserID, role_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role required: {role_name}"
            )
        return current_user
    
    return role_checker


# Convenience dependencies for common roles
RequireAdmin = Annotated[RBACUser, Depends(require_role("Admin"))]
RequireManager = Annotated[RBACUser, Depends(require_role("NurseManager"))]
RequireNurse = Annotated[RBACUser, Depends(require_role("Nurse"))]