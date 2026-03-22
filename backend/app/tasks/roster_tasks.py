import logging
from datetime import timedelta

from sqlmodel import Session, delete, select

from app.core.db import engine
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


@celery_app.task(bind=True, name="tasks.generate_roster", max_retries=2)
def generate_roster_task(self, ward_id: int, period_id: int, algorithm: str | None = None):
    """
    Celery task to run the roster generation algorithm.
    Results are stored in Redis and retrievable via task_id.
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
            algorithm=algorithm,
        )

        with Session(engine) as db:
            _save_roster_result(db, ward_id, period_id, result["roster"], result["method"])

        return {
            "task_id": self.request.id,
            "status": "complete",
            "method": result["method"],
            "roster": result["roster"],
        }

    except Exception as exc:
        logger.error(f"Roster generation task failed for ward {ward_id}: {exc}")
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

            return {
                "task_id": self.request.id,
                "status": "complete",
                "method": result["method"],
                "nurses_saved": nurses_saved,
            }

    except Exception as exc:
        logger.error(f"Scheduled roster generation failed for ward {ward_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)
