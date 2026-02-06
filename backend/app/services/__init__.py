"""
Services layer for business logic.

Services handle complex operations that involve:
- Multiple database operations
- Email/notification sending
- Business rule validation
- Cross-entity coordination

Routes should be thin and delegate to services for anything beyond simple CRUD.
"""

from app.services import notification_service, leave_service

__all__ = [
    "notification_service",
    "leave_service",
]
