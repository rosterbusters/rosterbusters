from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api import deps
from app.api.routes import run_rostering
from app.core.config import settings
from app.main import app
from app.models.rbac import RBACUser
from app.models.roster import RosterPeriod, Ward
from app.tasks import roster_tasks


class _FakeTask:
    def __init__(self, task_id: str) -> None:
        self.id = task_id


class _FakeCelery:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send_task(self, name: str, args: list[int], kwargs: dict, task_id: str) -> _FakeTask:
        self.sent.append(
            {
                "name": name,
                "args": args,
                "kwargs": kwargs,
                "task_id": task_id,
            }
        )
        return _FakeTask(task_id)


def _create_ward_and_period(db: Session, ward_name: str) -> tuple[Ward, RosterPeriod]:
    ward = Ward(wardname=f"{ward_name} {uuid4()}", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    period = RosterPeriod(
        name=f"{ward_name} Period {uuid4()}",
        startdate=date(2026, 9, 1),
        enddate=date(2026, 9, 14),
        requestopendate=date(2026, 9, 1) - timedelta(days=14),
        requestclosedate=date(2026, 9, 1) - timedelta(days=1),
        status="RequestOpen",
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return ward, period


@pytest.fixture
def _manager_override(monkeypatch):
    app.dependency_overrides[deps.get_current_user] = lambda: RBACUser(
        userid=999_001,
        username="lock-test-manager",
        email="lock-test-manager@example.com",
        passwordhash="unused",
        managerid=123,
        isactive=True,
    )
    monkeypatch.setattr(run_rostering, "_can_generate_roster", lambda *args: True)
    monkeypatch.setattr(
        run_rostering,
        "_queue_algorithm_notification",
        lambda *args, **kwargs: None,
    )
    yield
    app.dependency_overrides.pop(deps.get_current_user, None)


def _post_generate_async(
    client: TestClient,
    ward_id: int,
    period_id: int,
):
    return client.post(
        f"{settings.API_V1_STR}/roster/generate-algorithm-async",
        json={
            "ward_id": ward_id,
            "period_id": period_id,
            "algorithm": "MILP",
            "prefilled_slots": [],
        },
    )


def test_generate_algorithm_async_rejects_second_same_ward_request(
    client: TestClient,
    db: Session,
    monkeypatch,
    _manager_override,
) -> None:
    fake_celery = _FakeCelery()
    locks: dict[int, str] = {}

    def acquire(ward_id: int, owner_id: str) -> bool:
        if ward_id in locks:
            return False
        locks[ward_id] = owner_id
        return True

    monkeypatch.setattr(run_rostering, "_get_celery_app", lambda: fake_celery)
    monkeypatch.setattr(run_rostering, "acquire_ward_algorithm_lock", acquire)
    monkeypatch.setattr(run_rostering, "release_ward_algorithm_lock", lambda *args: True)

    ward, period = _create_ward_and_period(db, "Same Ward Lock")

    first_response = _post_generate_async(client, ward.wardid, period.periodid)
    second_response = _post_generate_async(client, ward.wardid, period.periodid)

    assert first_response.status_code == 200, first_response.text
    assert first_response.json()["status"] == "queued"
    assert second_response.status_code == 409, second_response.text
    assert len(fake_celery.sent) == 1


def test_generate_algorithm_async_allows_different_wards(
    client: TestClient,
    db: Session,
    monkeypatch,
    _manager_override,
) -> None:
    fake_celery = _FakeCelery()
    locks: dict[int, str] = {}

    def acquire(ward_id: int, owner_id: str) -> bool:
        if ward_id in locks:
            return False
        locks[ward_id] = owner_id
        return True

    monkeypatch.setattr(run_rostering, "_get_celery_app", lambda: fake_celery)
    monkeypatch.setattr(run_rostering, "acquire_ward_algorithm_lock", acquire)
    monkeypatch.setattr(run_rostering, "release_ward_algorithm_lock", lambda *args: True)

    first_ward, first_period = _create_ward_and_period(db, "First Ward Lock")
    second_ward, second_period = _create_ward_and_period(db, "Second Ward Lock")

    first_response = _post_generate_async(client, first_ward.wardid, first_period.periodid)
    second_response = _post_generate_async(client, second_ward.wardid, second_period.periodid)

    assert first_response.status_code == 200, first_response.text
    assert second_response.status_code == 200, second_response.text
    assert len(fake_celery.sent) == 2


def test_generate_algorithm_bulk_async_queues_different_wards_and_skips_locked(
    client: TestClient,
    db: Session,
    monkeypatch,
    _manager_override,
) -> None:
    fake_celery = _FakeCelery()
    locked_ward_ids: set[int] = set()

    def acquire(ward_id: int, owner_id: str) -> bool:
        if ward_id in locked_ward_ids:
            return False
        locked_ward_ids.add(ward_id)
        return True

    monkeypatch.setattr(run_rostering, "_get_celery_app", lambda: fake_celery)
    monkeypatch.setattr(run_rostering, "acquire_ward_algorithm_lock", acquire)
    monkeypatch.setattr(run_rostering, "release_ward_algorithm_lock", lambda *args: True)

    first_ward, period = _create_ward_and_period(db, "Bulk First Ward")
    second_ward, _ = _create_ward_and_period(db, "Bulk Second Ward")

    locked_ward_ids.add(second_ward.wardid)

    response = client.post(
        f"{settings.API_V1_STR}/roster/generate-algorithm-bulk-async",
        json={
            "ward_ids": [first_ward.wardid, second_ward.wardid, first_ward.wardid],
            "period_id": period.periodid,
            "algorithm": "MILP",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["triggered"] == [
        {
            "ward_id": first_ward.wardid,
            "period_id": period.periodid,
            "task_id": fake_celery.sent[0]["task_id"],
        }
    ]
    assert payload["skipped"] == [
        {
            "ward_id": second_ward.wardid,
            "period_id": period.periodid,
            "reason": "algorithm_generation_in_progress",
        },
        {
            "ward_id": first_ward.wardid,
            "period_id": period.periodid,
            "reason": "duplicate_ward",
        },
    ]
    assert len(fake_celery.sent) == 1
    assert fake_celery.sent[0]["args"] == [first_ward.wardid, period.periodid]


def test_sync_and_stream_generation_return_conflict_when_ward_is_locked(
    client: TestClient,
    db: Session,
    monkeypatch,
    _manager_override,
) -> None:
    monkeypatch.setattr(run_rostering, "acquire_ward_algorithm_lock", lambda *args: False)

    ward, period = _create_ward_and_period(db, "Locked Sync Stream Ward")
    body = {
        "ward_id": ward.wardid,
        "period_id": period.periodid,
        "algorithm": "MILP",
        "prefilled_slots": [],
    }

    sync_response = client.post(
        f"{settings.API_V1_STR}/roster/generate-algorithm",
        json=body,
    )
    stream_response = client.post(
        f"{settings.API_V1_STR}/roster/generate-algorithm-stream",
        json=body,
    )

    assert sync_response.status_code == 409, sync_response.text
    assert stream_response.status_code == 409, stream_response.text


def test_worker_does_not_generate_when_starting_without_lock(monkeypatch) -> None:
    monkeypatch.setattr(roster_tasks, "refresh_ward_algorithm_lock", lambda *args: False)

    def fail_generate():
        raise AssertionError("generate_roster should not be called after lock loss")

    monkeypatch.setattr(roster_tasks, "generate_roster", fail_generate)

    result = roster_tasks.generate_roster_task.run(ward_id=1, period_id=2)

    assert result["status"] == "failed"
    assert "lock" in result["error"].lower()
