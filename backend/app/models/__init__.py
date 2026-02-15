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
    RBACUserPublic,
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
    ShiftRequest,
    ShiftRequestCreate,
    ShiftRequestPublic,
)

# Notification models
from app.models.notification_models import (
       NotificationResponse,
       NotificationsListResponse,
       MarkNotificationReadRequest,
       NotificationStatsResponse
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
    "RBACUserPublic",
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
    "ShiftRequest",
    "ShiftRequestCreate",
    "ShiftRequestPublic",
    # Notifications
    "NotificationResponse",
    "NotificationsListResponse",
    "MarkNotificationReadRequest",
    "NotificationStatsResponse"
]
