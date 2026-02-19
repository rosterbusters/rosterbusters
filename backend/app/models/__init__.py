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
    NursePublic,
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
    Ward,
)

# Shift models
from app.models.shifts import (
    ShiftCode,
    WardShiftCode,
    ShiftRequest,
    ShiftRequestCreate,
    ShiftRequestPublic,
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
    "NursePublic",
    "RBACUser",
    "Role",
    "UserRole",
    # Roster
    "LeaveRequest",
    "NotificationQueue",
    "Roster",
    "RosterPeriod",
    "Ward",
    # Shifts
    "ShiftCode",
    "WardShiftCode",
    "ShiftRequest",
    "ShiftRequestCreate",
    "ShiftRequestPublic",
]
