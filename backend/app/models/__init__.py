"""
Models package.

Re-exports all models for backwards compatibility with `from app.models import ...`
"""

from sqlmodel import SQLModel

# Web schemas (no more User/Item models)
from app.models.web import (
    Message,
    NewPassword,
    Token,
    TokenPayload,
    UpdatePassword,
)

# RBAC models
from app.models.rbac import (
    Nurse,
    NurseManager,
    NursePublic,
    RBACUser,
    RBACUserPublic,
    Role,
    UserRole,
)

# Roster/scheduling models
from app.models.roster import (
    LeaveRequest,
    LeaveRequestPublic,
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
    ShiftRequestReview,
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
    # Web schemas
    "Message",
    "NewPassword",
    "Token",
    "TokenPayload",
    "UpdatePassword",
    # RBAC
    "Nurse",
    "NurseManager",
    "NursePublic",
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
    "WardShiftCode",
    "ShiftRequest",
    "ShiftRequestCreate",
    "ShiftRequestPublic",
    # Notifications
    "NotificationResponse",
    "NotificationsListResponse",
    "MarkNotificationReadRequest",
    "NotificationStatsResponse"
]
