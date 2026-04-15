"""
Models package.

Re-exports all models for backwards compatibility with `from app.models import ...`
"""

from sqlmodel import SQLModel

# Web schemas (no more User/Item models)
from app.models.web import (
    LoginAccessTokenResponse,
    LoginEmail2FAResend,
    LoginEmail2FAVerify,
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

# Designation reference data
from app.models.designation import Designation

# Enums
from app.models.enums import NotificationType

# Roster/scheduling models
from app.models.roster import (
    NursePeriodConstraint,
    NursePeriodConstraintPublic,
    NotificationPreference,
    NotificationQueue,
    Roster,
    RosterChangeLog,
    RosterChangeLogPublic,
    RosterPeriod,
    RosterPeriodPublic,
    RosterPeriodWindowPublic,
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
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    NotificationsListResponse,
    NotificationStatsResponse,
)

__all__ = [
    # SQLModel base
    "SQLModel",
    # Web schemas
    "LoginAccessTokenResponse",
    "LoginEmail2FAResend",
    "LoginEmail2FAVerify",
    "Message",
    "NewPassword",
    "Token",
    "TokenPayload",
    "UpdatePassword",
    # RBAC
    "Nurse", "NurseManager", "NursePublic",
    "RBACUser", "RBACUserPublic", "Role", "UserRole",
    # Designations
    "Designation",
    # Enums
    "NotificationType",
    # Roster
    "NursePeriodConstraint", "NursePeriodConstraintPublic",
    "NotificationPreference", "NotificationQueue",
    "Roster", "RosterChangeLog", "RosterChangeLogPublic",
    "RosterPeriod", "RosterPeriodPublic", "RosterPeriodWindowPublic", "Ward",
    # Leave
    "LeaveRequest", "LeaveRequestCreate", "LeaveRequestPublic", "LeaveRequestUpdate",
    # Shifts
    "ShiftCode", "ShiftCodePublic", "ShiftRequest", "ShiftRequestCreate",
    "ShiftRequestPublic", "ShiftRequestReview", "ShiftRequestUpdate", "WardShiftCode",
    # Notifications
    "MarkNotificationReadRequest", "NotificationPreferencesResponse",
    "NotificationPreferencesUpdate", "NotificationResponse",
    "NotificationsListResponse", "NotificationStatsResponse",
]
