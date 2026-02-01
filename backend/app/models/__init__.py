"""
Models package.

Re-exports all models for backwards compatibility with `from app.models import ...`
"""

from sqlmodel import SQLModel

# Web authentication models
from app.models.web import (
    Item,
    ItemBase,
    ItemCreate,
    ItemPublic,
    ItemsPublic,
    ItemUpdate,
    Message,
    NewPassword,
    Token,
    TokenPayload,
    UpdatePassword,
    User,
    UserBase,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)

# RBAC models
from app.models.rbac import (
    Nurse,
    NurseManager,
    RBACUser,
    Role,
    UserRole,
)

# Roster/scheduling models
from app.models.roster import (
    LeaveRequest,
    NotificationQueue,
    Roster,
    RosterPeriod,
    ShiftCode,
    ShiftRequest,
    Ward,
)

__all__ = [
    # SQLModel base
    "SQLModel",
    # Web auth
    "Item",
    "ItemBase",
    "ItemCreate",
    "ItemPublic",
    "ItemsPublic",
    "ItemUpdate",
    "Message",
    "NewPassword",
    "Token",
    "TokenPayload",
    "UpdatePassword",
    "User",
    "UserBase",
    "UserCreate",
    "UserPublic",
    "UserRegister",
    "UsersPublic",
    "UserUpdate",
    "UserUpdateMe",
    # RBAC
    "Nurse",
    "NurseManager",
    "RBACUser",
    "Role",
    "UserRole",
    # Roster
    "LeaveRequest",
    "NotificationQueue",
    "Roster",
    "RosterPeriod",
    "ShiftCode",
    "ShiftRequest",
    "Ward",
]
