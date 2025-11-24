"""
Database models and utilities for SACH Rostering System with RBAC
"""
from .deps_rbac import (
    get_session,
    get_current_user,
    get_user_roles,
    get_user_permissions,
    user_has_permission,
    user_has_role,
    user_can_access_ward,
    require_permission,
    require_role,
    SessionDep,
    CurrentUser,
    RequireAdmin,
    RequireManager,
    RequireNurse,
)

__all__ = [
    # Models
    "RBACUser",
    "Role",
    "Permission",
    "RolePermission",
    "UserRole",
    "SessionToken",
    "AuditAuthLog",
    "Ward",
    "Nurse",
    "NurseManager",
    "Roster",
    "RosterPeriod",
    # Dependencies
    "get_session",
    "get_current_user",
    "get_user_roles",
    "get_user_permissions",
    "user_has_permission",
    "user_has_role",
    "user_can_access_ward",
    "require_permission",
    "require_role",
    "SessionDep",
    "CurrentUser",
    "RequireAdmin",
    "RequireManager",
    "RequireNurse",
]