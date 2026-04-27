from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "rosterbusters",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.roster_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_expires=3600,  # results expire after 1 hour
    beat_schedule={
        "check-roster-period-notifications-hourly": {
            "task": "tasks.check_roster_period_notifications",
            "schedule": 3600.0,  # every hour
        },
    },
)
