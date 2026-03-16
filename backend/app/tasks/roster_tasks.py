import logging

from sqlmodel import Session, select

from app.api.routes.run_rostering import _map_rank, _staffing_to_algo_inputs
from app.core.db import engine
from app.models.rbac import Nurse
from app.models.roster import Ward
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
                {"id": n.nurseid, "name": n.name, "rank": _map_rank(n.designation)}
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
