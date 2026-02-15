"""
API routes for notifications
"""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func, col
from datetime import datetime, timezone

from app.api.deps import CurrentUser, get_db
from app.models import NotificationQueue, Nurse, NurseManager
from app.models.notification_models import (
    NotificationResponse,
    NotificationsListResponse,
    MarkNotificationReadRequest,
    NotificationStatsResponse
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


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
        # Return empty list if no nurse record
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
        # Return empty list if no manager record
        return NotificationsListResponse(
            notifications=[],
            total=0,
            unread_count=0
        )
    
    # Build query
    query = select(NotificationQueue).where(
        NotificationQueue.recipienttype == "Manager",
        NotificationQueue.recipientid == manager_id
    )
    
    if status:
        query = query.where(NotificationQueue.status == status)
    if notification_type:
        query = query.where(NotificationQueue.notificationtype == notification_type)
    
    # Get total count
    count_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == "Manager",
        NotificationQueue.recipientid == manager_id
    )
    if status:
        count_query = count_query.where(NotificationQueue.status == status)
    if notification_type:
        count_query = count_query.where(NotificationQueue.notificationtype == notification_type)
    
    total = db.exec(count_query).one()
    
    # Get unread count
    unread_query = select(func.count()).select_from(NotificationQueue).where(
        NotificationQueue.recipienttype == "Manager",
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
    
    recipient_type = "Nurse" if nurse_id else "Manager"
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
    
    recipient_type = "Nurse" if nurse_id else "Manager"
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
    
    recipient_type = "Nurse" if nurse_id else "Manager"
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