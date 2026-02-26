"""
Notification models for API responses
"""
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class NotificationResponse(BaseModel):
    """Single notification response"""
    notificationid: int
    notificationtype: str
    subject: str
    messagebody: str
    priority: str
    status: str
    createdat: datetime
    sentat: Optional[datetime] = None
    readat: Optional[datetime] = None
    relatedentitytype: Optional[str] = None
    relatedentityid: Optional[int] = None

    class Config:
        from_attributes = True


class NotificationsListResponse(BaseModel):
    """List of notifications with metadata"""
    notifications: list[NotificationResponse]
    total: int
    unread_count: int


class MarkNotificationReadRequest(BaseModel):
    """Request to mark notification as read"""
    notification_ids: list[int]


class NotificationStatsResponse(BaseModel):
    """Notification statistics"""
    total: int
    unread: int
    by_type: dict[str, int]
    recent: list[NotificationResponse]