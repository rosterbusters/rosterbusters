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

# Enums
from app.models.enums import NotificationType

# Roster/scheduling models
from app.models.roster import (
    NotificationQueue,
    Roster,
    RosterChangeLog,
    RosterChangeLogPublic,
    RosterPeriod,
    RosterPeriodPublic,
    Ward,
)

# Leave models
from app.models.leave import (
    LeaveRequest,
    LeaveRequestCreate,
    LeaveRequestPublic,
    LeaveRequestUpdate,
)

# Shift models
from app.models.shifts import (
    ShiftCode,
    ShiftCodePublic,
    ShiftRequest,
    ShiftRequestCreate,
    ShiftRequestPublic,
    ShiftRequestReview,
    ShiftRequestUpdate,
    WardShiftCode,
)

# Notification models
from app.models.notification_models import (
    MarkNotificationReadRequest,
    NotificationResponse,
    NotificationsListResponse,
    NotificationStatsResponse,
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
    "Nurse", "NurseManager", "NursePublic",
    "RBACUser", "RBACUserPublic", "Role", "UserRole",
    # Enums
    "NotificationType",
    # Roster
    "NotificationQueue", "Roster", "RosterChangeLog", "RosterChangeLogPublic",
    "RosterPeriod", "RosterPeriodPublic", "Ward",
    # Leave
    "LeaveRequest", "LeaveRequestCreate", "LeaveRequestPublic", "LeaveRequestUpdate",
    # Shifts
    "ShiftCode", "ShiftCodePublic", "ShiftRequest", "ShiftRequestCreate",
    "ShiftRequestPublic", "ShiftRequestReview", "ShiftRequestUpdate", "WardShiftCode",
    # Notifications
    "MarkNotificationReadRequest", "NotificationResponse",
    "NotificationsListResponse", "NotificationStatsResponse",
]
