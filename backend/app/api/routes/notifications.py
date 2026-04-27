"""
API routes for notifications
"""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func, col
from datetime import datetime, timezone

from app.api.deps import CurrentUser, get_db
from app.models import NotificationPreference, NotificationQueue, Nurse, NurseManager
from app.models.notification_models import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    NotificationsListResponse,
    MarkNotificationReadRequest,
    NotificationStatsResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def get_nurse_id_from_user(db: Session, user: CurrentUser) -> int | None:
    """Get nurse ID from authenticated user"""
    statement = select(Nurse.nurseid).where(Nurse.email == user.email)
    result = db.exec(statement).first()
    return result


def get_manager_id_from_user(db: Session, user: CurrentUser) -> int | None:
    """Get manager ID from authenticated user"""
    statement = select(NurseManager.managerid).where(NurseManager.email == user.email)
    result = db.exec(statement).first()
    return result


def get_email_enabled(
    db: Session,
    recipient_type: str,
    recipient_id: int,
    notification_type: str,
) -> bool:
    """
    Check whether email notifications are enabled for a specific user + type.

    Returns True (enabled) if:
    - no preference row exists (default-on)
    - a row exists with email_enabled=True

    Returns False (suppressed) if a row exists with email_enabled=False.

    This is the single integration point for all notification-dispatch code to
    respect user preferences.
    """
    pref = db.exec(
        select(NotificationPreference).where(
            NotificationPreference.recipienttype == recipient_type,
            NotificationPreference.recipientid == recipient_id,
            NotificationPreference.notificationtype == notification_type,
        )
    ).first()
    if pref is None:
        return True
    return pref.email_enabled


# ---------------------------------------------------------------------------
# Preferences endpoints
# ---------------------------------------------------------------------------

@router.get("/preferences", response_model=NotificationPreferencesResponse)
def get_notification_preferences(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
):
    """
    Get the current user's email notification preferences.

    Returns a dict of {notification_type: bool} for all explicitly stored
    preferences.  Types not returned here are implicitly enabled (always-on).
    """
    nurse_id = get_nurse_id_from_user(db, current_user)
    manager_id = get_manager_id_from_user(db, current_user)

    if not nurse_id and not manager_id:
        return NotificationPreferencesResponse(preferences={})

    recipient_type = "Nurse" if nurse_id else "NurseManager"
    recipient_id = nurse_id if nurse_id else manager_id

    rows = db.exec(
        select(NotificationPreference).where(
            NotificationPreference.recipienttype == recipient_type,
            NotificationPreference.recipientid == recipient_id,
        )
    ).all()

    return NotificationPreferencesResponse(
        preferences={row.notificationtype: row.email_enabled for row in rows}
    )


@router.patch("/preferences", response_model=NotificationPreferencesResponse)
def update_notification_preferences(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
    body: NotificationPreferencesUpdate,
):
    """
    Update the current user's email notification preferences.

    Accepts a partial dict {notification_type: bool}.  Each entry is upserted
    (insert if new, update if existing).  Omitted types are left unchanged.
    """
    nurse_id = get_nurse_id_from_user(db, current_user)
    manager_id = get_manager_id_from_user(db, current_user)

    if not nurse_id and not manager_id:
        raise HTTPException(status_code=404, detail="User record not found")

    recipient_type = "Nurse" if nurse_id else "NurseManager"
    recipient_id = nurse_id if nurse_id else manager_id

    for notification_type, enabled in body.preferences.items():
        existing = db.exec(
            select(NotificationPreference).where(
                NotificationPreference.recipienttype == recipient_type,
                NotificationPreference.recipientid == recipient_id,
                NotificationPreference.notificationtype == notification_type,
            )
        ).first()

        if existing:
            existing.email_enabled = enabled
            existing.updatedat = datetime.now(timezone.utc)
            db.add(existing)
        else:
            db.add(
                NotificationPreference(
                    recipienttype=recipient_type,
                    recipientid=recipient_id,
                    notificationtype=notification_type,
                    email_enabled=enabled,
                )
            )

    db.commit()

    # Return the full updated state
    rows = db.exec(
        select(NotificationPreference).where(
            NotificationPreference.recipienttype == recipient_type,
            NotificationPreference.recipientid == recipient_id,
        )
    ).all()

    return NotificationPreferencesResponse(
        preferences={row.notificationtype: row.email_enabled for row in rows}
    )


# ---------------------------------------------------------------------------
# Notification list/read endpoints (unchanged)
# ---------------------------------------------------------------------------

@router.get("/nurse", response_model=NotificationsListResponse)
def get_nurse_notifications(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, description="Filter by status: Pending, Sent, Read"),
    notification_type: str | None = Query(default=None, description="Filter by type")
):
    """Get notifications for the current nurse"""

    nurse_id = get_nurse_id_from_user(db, current_user)
    if not nurse_id:
        return NotificationsListResponse(
            notifications=[],
            total=0,
            unread_count=0
        )

    # Build query
    query = select(NotificationQueue).where(
        NotificationQueue.recipienttype == "Nurse",
        NotificationQueue.recipientid == nurse_id
    )

    if status:
        query = query.where(NotificationQueue.status == status)
    if notification_type:
        query = query.where(NotificationQueue.notificationtype == notification_type)

    # Get total count
    count_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == "Nurse",
        NotificationQueue.recipientid == nurse_id
    )
    if status:
        count_query = count_query.where(NotificationQueue.status == status)
    if notification_type:
        count_query = count_query.where(NotificationQueue.notificationtype == notification_type)

    total = db.exec(count_query).one()

    # Get unread count
    unread_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == "Nurse",
        NotificationQueue.recipientid == nurse_id,
        NotificationQueue.status != "Read"
    )
    unread_count = db.exec(unread_query).one()

    # Get notifications ordered by most recent
    query = query.order_by(col(NotificationQueue.createdat).desc()).offset(offset).limit(limit)
    notifications = db.exec(query).all()

    return NotificationsListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count
    )


@router.get("/manager", response_model=NotificationsListResponse)
def get_manager_notifications(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    notification_type: str | None = Query(default=None)
):
    """Get notifications for the current nurse manager"""

    manager_id = get_manager_id_from_user(db, current_user)
    if not manager_id:
        return NotificationsListResponse(
            notifications=[],
            total=0,
            unread_count=0
        )

    # Build query
    query = select(NotificationQueue).where(
        NotificationQueue.recipienttype == "NurseManager",
        NotificationQueue.recipientid == manager_id
    )

    if status:
        query = query.where(NotificationQueue.status == status)
    if notification_type:
        query = query.where(NotificationQueue.notificationtype == notification_type)

    # Get total count
    count_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == "NurseManager",
        NotificationQueue.recipientid == manager_id
    )
    if status:
        count_query = count_query.where(NotificationQueue.status == status)
    if notification_type:
        count_query = count_query.where(NotificationQueue.notificationtype == notification_type)

    total = db.exec(count_query).one()

    # Get unread count
    unread_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == "NurseManager",
        NotificationQueue.recipientid == manager_id,
        NotificationQueue.status != "Read"
    )
    unread_count = db.exec(unread_query).one()

    # Get notifications
    query = query.order_by(col(NotificationQueue.createdat).desc()).offset(offset).limit(limit)
    notifications = db.exec(query).all()

    return NotificationsListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count
    )


@router.post("/mark-read")
def mark_notifications_read(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
    request: MarkNotificationReadRequest
):
    """Mark notifications as read"""

    nurse_id = get_nurse_id_from_user(db, current_user)
    manager_id = get_manager_id_from_user(db, current_user)

    if not nurse_id and not manager_id:
        raise HTTPException(status_code=404, detail="User record not found")

    recipient_type = "Nurse" if nurse_id else "NurseManager"
    recipient_id = nurse_id if nurse_id else manager_id

    for notification_id in request.notification_ids:
        statement = select(NotificationQueue).where(
            NotificationQueue.notificationid == notification_id,
            NotificationQueue.recipienttype == recipient_type,
            NotificationQueue.recipientid == recipient_id
        )
        notification = db.exec(statement).first()

        if notification:
            notification.status = "Read"
            notification.readat = datetime.now(timezone.utc)
            db.add(notification)

    db.commit()

    return {"message": f"Marked {len(request.notification_ids)} notifications as read"}


@router.post("/mark-unread")
def mark_notifications_unread(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
    request: MarkNotificationReadRequest
):
    """Mark notifications as unread"""

    nurse_id = get_nurse_id_from_user(db, current_user)
    manager_id = get_manager_id_from_user(db, current_user)

    if not nurse_id and not manager_id:
        raise HTTPException(status_code=404, detail="User record not found")

    recipient_type = "Nurse" if nurse_id else "NurseManager"
    recipient_id = nurse_id if nurse_id else manager_id

    for notification_id in request.notification_ids:
        statement = select(NotificationQueue).where(
            NotificationQueue.notificationid == notification_id,
            NotificationQueue.recipienttype == recipient_type,
            NotificationQueue.recipientid == recipient_id
        )
        notification = db.exec(statement).first()

        if notification:
            notification.status = "Sent"  # Mark as unread
            notification.readat = None
            db.add(notification)

    db.commit()

    return {"message": f"Marked {len(request.notification_ids)} notifications as unread"}


@router.get("/stats", response_model=NotificationStatsResponse)
def get_notification_stats(
    db: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser
):
    """Get notification statistics for the current user"""

    nurse_id = get_nurse_id_from_user(db, current_user)
    manager_id = get_manager_id_from_user(db, current_user)

    if not nurse_id and not manager_id:
        raise HTTPException(status_code=404, detail="User record not found")

    recipient_type = "Nurse" if nurse_id else "NurseManager"
    recipient_id = nurse_id if nurse_id else manager_id

    # Get total count
    total_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == recipient_type,
        NotificationQueue.recipientid == recipient_id
    )
    total = db.exec(total_query).one()

    # Get unread count
    unread_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == recipient_type,
        NotificationQueue.recipientid == recipient_id,
        NotificationQueue.status != "Read"
    )
    unread = db.exec(unread_query).one()

    # Get count by type
    type_query = select(
        NotificationQueue.notificationtype,
        func.count(NotificationQueue.notificationid)
    ).where(
        NotificationQueue.recipienttype == recipient_type,
        NotificationQueue.recipientid == recipient_id
    ).group_by(NotificationQueue.notificationtype)

    type_results = db.exec(type_query).all()
    by_type = {notification_type: count for notification_type, count in type_results}

    # Get recent notifications (last 5)
    recent_query = select(NotificationQueue).where(
        NotificationQueue.recipienttype == recipient_type,
        NotificationQueue.recipientid == recipient_id
    ).order_by(col(NotificationQueue.createdat).desc()).limit(5)

    recent = db.exec(recent_query).all()

    return NotificationStatsResponse(
        total=total,
        unread=unread,
        by_type=by_type,
        recent=[NotificationResponse.model_validate(n) for n in recent]
    )