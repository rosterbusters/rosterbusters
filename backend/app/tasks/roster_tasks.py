import logging
from datetime import timedelta

from sqlmodel import Session, select

from app.api.routes.run_rostering import _staffing_to_algo_inputs
from app.core.db import engine
from app.designation_mapping import classify_designation
from app.models.rbac import Nurse
from app.models.roster import Roster, RosterPeriod, Ward
from app.rostering.algo_scheduler import generate_roster
from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="tasks.generate_roster", max_retries=2)
def generate_roster_task(self, ward_id: int, period_id: int):
    """
    Celery task to run the roster generation algorithm.
    Results are stored in Redis and retrievable via task_id.
    """
    try:
        with Session(engine) as db:
            ward = db.get(Ward, ward_id)
            if not ward:
                raise ValueError(f"Ward {ward_id} not found")

            shifts_data, milp_config = _staffing_to_algo_inputs(ward)

            nurses_db = db.exec(
                select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
            ).all()
            nurses_data = [
                {
                    "id": n.nurseid,
                    "name": n.name,
                    "rank": classify_designation(n.designation).roster_rank or "C",
                }
                for n in nurses_db
            ]

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
            nurses=nurses_data,
            shifts=shifts_data,
            requests=None,
            progress_callback=on_progress,
            milp_config=milp_config,
        )

        return {
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
            ward = db.get(Ward, ward_id)
            if not ward:
                raise ValueError(f"Ward {ward_id} not found")

            period = db.get(RosterPeriod, period_id)
            if not period:
                raise ValueError(f"Period {period_id} not found")

            shifts_data, milp_config = _staffing_to_algo_inputs(ward)

            nurses_db = db.exec(
                select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)  # noqa: E712
            ).all()
            nurses_data = [
                {
                    "id": n.nurseid,
                    "name": n.name,
                    "rank": classify_designation(n.designation).roster_rank or "C",
                }
                for n in nurses_db
            ]

            # Delete existing roster entries for this ward+period (overwrite)
            existing = db.exec(
                select(Roster).where(
                    Roster.wardid == ward_id,
                    Roster.periodid == period_id,
                )
            ).all()
            for entry in existing:
                db.delete(entry)
            db.commit()

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
                nurses=nurses_data,
                shifts=shifts_data,
                requests=None,
                progress_callback=on_progress,
                milp_config=milp_config,
            )

            # Save to DB
            start_date = period.startdate
            for nurse_result in result["roster"]["nurses"]:
                for day_idx, shift_label in enumerate(nurse_result["schedule"]):
                    db.add(Roster(
                        nurseid=nurse_result["id"],
                        wardid=ward_id,
                        periodid=period_id,
                        shiftdate=start_date + timedelta(days=day_idx),
                        shiftcode=shift_label,  # "A", "P", "N", "DO" — matches DB directly
                        status="Pending",
                        assignmentmethod="Auto",
                        assignedby=None,
                    ))
            db.commit()

            return {
                "status": "complete",
                "method": result["method"],
                "nurses_saved": len(result["roster"]["nurses"]),
            }

    except Exception as exc:
        logger.error(f"Scheduled roster generation failed for ward {ward_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)
