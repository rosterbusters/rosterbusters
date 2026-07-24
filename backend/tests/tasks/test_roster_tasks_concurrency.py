from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock

from app.api.routes import run_rostering
from app.tasks import roster_tasks


class _FakeSession:
    def __init__(self, _engine) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        pass


def test_generate_roster_tasks_for_different_wards_run_concurrently(
    monkeypatch,
) -> None:
    """Two wards must reach the solver at the same time and remain isolated."""
    solver_barrier = Barrier(2)
    state_lock = Lock()
    active_wards: set[int] = set()
    maximum_concurrent_solvers = 0
    saved_wards: list[int] = []
    refreshed_locks: list[tuple[int, str]] = []
    released_locks: list[tuple[int, str]] = []

    def fake_load_generation_inputs(_db, ward_id, _period_id):
        return {
            "nurses": [{"id": ward_id, "name": f"Ward {ward_id}", "rank": "A"}],
            "shifts": [{"AM": {"A": 1, "B": 0, "C": 0}}],
            "hard_requests": {},
            "soft_requests": {},
            "prev_last_shift": {},
            "ward_hour_type": "8_HOURS",
            "shift_hours": {"AM": 8.0, "OFF": 0.0},
            "non_working_shift_codes": {"DO"},
            "locked_roster_slots": [],
            "milp_config": {},
        }

    def fake_generate_roster(*, nurses, **_kwargs):
        nonlocal maximum_concurrent_solvers
        ward_id = nurses[0]["id"]
        with state_lock:
            active_wards.add(ward_id)
            maximum_concurrent_solvers = max(
                maximum_concurrent_solvers,
                len(active_wards),
            )

        solver_barrier.wait(timeout=5)

        with state_lock:
            active_wards.remove(ward_id)

        return {
            "method": "TEST",
            "roster": {
                "nurses": [
                    {
                        "id": ward_id,
                        "name": f"Ward {ward_id}",
                        "rank": "A",
                        "schedule": ["AM"],
                    }
                ]
            },
        }

    def fake_save_roster_result(
        _db,
        ward_id,
        _period_id,
        _roster,
        _assignment_method,
    ):
        with state_lock:
            saved_wards.append(ward_id)
        return 1

    monkeypatch.setattr(roster_tasks, "Session", _FakeSession)
    monkeypatch.setattr(
        run_rostering,
        "_load_generation_inputs",
        fake_load_generation_inputs,
    )
    monkeypatch.setattr(
        run_rostering,
        "_apply_locked_roster_overlay",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(roster_tasks, "generate_roster", fake_generate_roster)
    monkeypatch.setattr(
        roster_tasks,
        "_save_roster_result",
        fake_save_roster_result,
    )
    monkeypatch.setattr(
        roster_tasks,
        "_queue_algorithm_notification",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        roster_tasks,
        "refresh_ward_algorithm_lock",
        lambda ward_id, owner_id: refreshed_locks.append((ward_id, owner_id)),
    )
    monkeypatch.setattr(
        roster_tasks,
        "release_ward_algorithm_lock",
        lambda ward_id, owner_id: released_locks.append((ward_id, owner_id)),
    )

    def run_task(ward_id: int):
        return roster_tasks.generate_and_save_roster_task.apply(
            args=[ward_id, 100],
            task_id=f"ward-{ward_id}",
            throw=True,
        ).get()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run_task, (11, 22)))

    assert maximum_concurrent_solvers == 2
    assert {result["task_id"] for result in results} == {"ward-11", "ward-22"}
    assert {result["status"] for result in results} == {"complete"}
    assert set(saved_wards) == {11, 22}
    assert set(refreshed_locks) == {(11, "ward-11"), (22, "ward-22")}
    assert set(released_locks) == {(11, "ward-11"), (22, "ward-22")}
