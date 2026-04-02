import logging
import math
from datetime import timedelta

from sqlmodel import Session, delete, select

from app.core.db import engine
from app import crud
from app.core.config import settings
from app.models.enums import NotificationType
from app.models.rbac import NurseManager
from app.models.roster import Roster, RosterPeriod, Ward
from app.rostering.algo_scheduler import generate_roster
from app.worker import celery_app

logger = logging.getLogger(__name__)

SHIFT_CODE_TO_DB = {
    "AM": "A",
    "PM": "P",
    "NIGHT": "N",
    "OFF": "DO",
    "DO": "DO",
    "A": "A",
    "P": "P",
    "N": "N",
}


def _json_safe_number(value: float | int | None) -> float | int | None:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value

def _save_roster_result(
    db: Session,
    ward_id: int,
    period_id: int,
    roster: dict,
    assignment_method: str,
) -> int:
    period = db.get(RosterPeriod, period_id)
    if not period:
        raise ValueError(f"Period {period_id} not found")

    db.exec(
        delete(Roster).where(
            Roster.wardid == ward_id,
            Roster.periodid == period_id,
        )
    )

    start_date = period.startdate
    for nurse_result in roster.get("nurses", []):
        for day_idx, shift_label in enumerate(nurse_result["schedule"]):
            db.add(Roster(
                nurseid=nurse_result["id"],
                wardid=ward_id,
                periodid=period_id,
                shiftdate=start_date + timedelta(days=day_idx),
                shiftcode=SHIFT_CODE_TO_DB.get(shift_label, shift_label),
                status="Pending",
                assignmentmethod=assignment_method,
                assignedby=None,
            ))
    db.commit()
    return len(roster.get("nurses", []))


def _queue_algorithm_notification(
    db: Session,
    *,
    ward_id: int,
    period_id: int,
    notification_type: NotificationType,
) -> None:
    ward = db.get(Ward, ward_id)
    if not ward or not ward.managerid:
        return

    period = db.get(RosterPeriod, period_id)
    if not period:
        return

    crud.create_notification(
        db,
        recipient_type="NurseManager",
        recipient_id=ward.managerid,
        notification_type=notification_type,
        related_entity_type="RosterPeriod",
        related_entity_id=period.periodid,
        roster_period=period.name,
    )
    db.commit()

    if not settings.emails_enabled:
        return

    manager = db.get(NurseManager, ward.managerid)
    if not manager or not manager.email:
        return

    try:
        from app.utils import generate_algorithm_notification_email, send_email

        email_data = generate_algorithm_notification_email(
            email_to=manager.email,
            roster_period=period.name,
            message=notification_type.template.format(roster_period=period.name),
            manager_name=manager.name,
        )
        send_email(
            email_to=manager.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    except Exception:
        logger.exception(
            "Failed to send algorithm notification email for ward %s period %s",
            ward_id,
            period_id,
        )


@celery_app.task(bind=True, name="tasks.generate_roster", max_retries=2)
def generate_roster_task(self, ward_id: int, period_id: int, algorithm: str | None = None):
    """
    Celery task to run the roster generation algorithm.
    Results are stored in Redis and retrievable via task_id.
    """
    try:
        logger.info(
            "Starting roster generation task task_id=%s ward_id=%s period_id=%s algorithm=%s retry=%s",
            self.request.id,
            ward_id,
            period_id,
            algorithm,
            self.request.retries,
        )
        with Session(engine) as db:
            from app.api.routes.run_rostering import _load_generation_inputs

            generation_inputs = _load_generation_inputs(db, ward_id, period_id)
            logger.info(
                "Loaded generation inputs task_id=%s ward_id=%s period_id=%s nurses=%s shift_days=%s hard_request_nurses=%s soft_request_nurses=%s",
                self.request.id,
                ward_id,
                period_id,
                len(generation_inputs["nurses"]),
                len(generation_inputs["shifts"]),
                len(generation_inputs["hard_requests"]),
                len(generation_inputs["soft_requests"]),
            )

        def on_progress(gen: int, total_gens: int, best_score: float) -> None:
            self.update_state(
                state="PROGRESS",
                meta={
                    "generation": gen,
                    "total": total_gens,
                    "percent": round(gen / total_gens * 100),
                    "best_score": _json_safe_number(round(best_score, 2)),
                },
            )
            logger.info(
                "Roster generation progress task_id=%s ward_id=%s period_id=%s generation=%s total=%s best_score=%s",
                self.request.id,
                ward_id,
                period_id,
                gen,
                total_gens,
                best_score,
            )

        result = generate_roster(
            nurses=generation_inputs["nurses"],
            shifts=generation_inputs["shifts"],
            hard_requests=generation_inputs["hard_requests"],
            soft_requests=generation_inputs["soft_requests"],
            prev_last_shift=generation_inputs["prev_last_shift"],
            shift_hours=generation_inputs["shift_hours"],
            non_working_shift_codes=generation_inputs["non_working_shift_codes"],
            progress_callback=on_progress,
            milp_config=generation_inputs["milp_config"],
            algorithm=algorithm,
        )
        logger.info(
            "Roster generation completed task_id=%s ward_id=%s period_id=%s method=%s nurse_count=%s",
            self.request.id,
            ward_id,
            period_id,
            result["method"],
            len(result["roster"].get("nurses", [])),
        )

        with Session(engine) as db:
            _save_roster_result(db, ward_id, period_id, result["roster"], result["method"])
            _queue_algorithm_notification(
                db,
                ward_id=ward_id,
                period_id=period_id,
                notification_type=NotificationType.ALGORITHM_GENERATION,
            )

        return {
            "task_id": self.request.id,
            "status": "complete",
            "method": result["method"],
            "roster": result["roster"],
        }

    except Exception as exc:
        logger.exception(
            "Roster generation task failed task_id=%s ward_id=%s period_id=%s algorithm=%s retry=%s",
            self.request.id,
            ward_id,
            period_id,
            algorithm,
            self.request.retries,
        )
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True, name="tasks.generate_and_save_roster", max_retries=2)
def generate_and_save_roster_task(self, ward_id: int, period_id: int):
    """
    Scheduled variant: runs the algorithm AND saves results to DB.
    Deletes existing Roster entries for the ward+period before saving (overwrite).
    """
    try:
        with Session(engine) as db:
            from app.api.routes.run_rostering import _load_generation_inputs

            generation_inputs = _load_generation_inputs(db, ward_id, period_id)

            def on_progress(gen: int, total_gens: int, best_score: float) -> None:
                self.update_state(
                    state="PROGRESS",
                    meta={
                        "generation": gen,
                        "total": total_gens,
                        "percent": round(gen / total_gens * 100),
                        "best_score": round(best_score, 2),
                    },
                )

            result = generate_roster(
                nurses=generation_inputs["nurses"],
                shifts=generation_inputs["shifts"],
                hard_requests=generation_inputs["hard_requests"],
                soft_requests=generation_inputs["soft_requests"],
                prev_last_shift=generation_inputs["prev_last_shift"],
                shift_hours=generation_inputs["shift_hours"],
                non_working_shift_codes=generation_inputs["non_working_shift_codes"],
                progress_callback=on_progress,
                milp_config=generation_inputs["milp_config"],
            )

            nurses_saved = _save_roster_result(
                db,
                ward_id,
                period_id,
                result["roster"],
                result["method"],
            )
            _queue_algorithm_notification(
                db,
                ward_id=ward_id,
                period_id=period_id,
                notification_type=NotificationType.ALGORITHM_GENERATION,
            )

            return {
                "task_id": self.request.id,
                "status": "complete",
                "method": result["method"],
                "nurses_saved": nurses_saved,
            }

    except Exception as exc:
        logger.error(f"Scheduled roster generation failed for ward {ward_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)
