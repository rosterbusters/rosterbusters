from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.routes.shifts import _shift_codes_cache_key
from app.cache import cache_delete
from app.core.config import settings
from app.models.roster import RosterPeriod, Ward
from app.models.shifts import ShiftCode, WardShiftCode
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def _ensure_shift_code(
    db: Session,
    shiftcode: str,
    description: str,
    isworking: bool,
) -> None:
    existing = db.get(ShiftCode, shiftcode)
    if existing:
        existing.description = description
        existing.isworking = isworking
        db.add(existing)
    else:
        db.add(
            ShiftCode(
                shiftcode=shiftcode,
                description=description,
                isworking=isworking,
                shiftdurationhours=0 if not isworking else 8,
            )
        )
    db.commit()


def _create_user(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    *,
    role: str,
    ward_id: int,
    password: str,
) -> dict:
    unique = random_lower_string()[:10]
    response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": f"{role.lower()}.{unique}",
            "name": f"{role} {unique}",
            "email": random_email(),
            "employee_id": f"{role[:3].upper()}-{unique}",
            "password": password,
            "role": role,
            "ward_ids": [ward_id],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _setup_request_context(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> tuple[int, int, int, dict[str, str], dict[str, str]]:
    ward = Ward(wardname=f"Sleeping Day Ward {random_lower_string()[:8]}", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    period = RosterPeriod(
        name=f"Sleeping Day Period {random_lower_string()[:8]}",
        startdate=date(2026, 7, 1),
        enddate=date(2026, 7, 14),
        requestopendate=date(2026, 6, 1),
        requestclosedate=date(2026, 6, 15),
        status="RequestOpen",
    )
    db.add(period)
    db.commit()
    db.refresh(period)

    nurse_password = "NursePassword123!"
    manager_password = "ManagerPassword123!"
    nurse = _create_user(
        client,
        superuser_token_headers,
        role="Nurse",
        ward_id=ward.wardid,
        password=nurse_password,
    )
    manager = _create_user(
        client,
        superuser_token_headers,
        role="NurseManager",
        ward_id=ward.wardid,
        password=manager_password,
    )

    nurse_headers = user_authentication_headers(
        client=client,
        email=nurse["email"],
        password=nurse_password,
    )
    manager_headers = user_authentication_headers(
        client=client,
        email=manager["email"],
        password=manager_password,
    )

    cache_delete(_shift_codes_cache_key(f"requestable:staff:ward:{ward.wardid}"))
    cache_delete(_shift_codes_cache_key(f"requestable:manager:ward:{ward.wardid}"))
    cache_delete(_shift_codes_cache_key(f"ward:staff:{ward.wardid}"))
    cache_delete(_shift_codes_cache_key(f"ward:manager:{ward.wardid}"))

    return ward.wardid, nurse["nurseid"], period.periodid, nurse_headers, manager_headers


def test_leave_codes_exclude_sleeping_day(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    _ensure_shift_code(db, "SD", "SLEEPING DAY", False)

    response = client.get(
        f"{settings.API_V1_STR}/leave/leave-codes",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200, response.text
    assert "SD" not in {code["shiftcode"] for code in response.json()}


def test_requestable_shift_codes_are_role_aware_for_sleeping_day(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id, _, _, nurse_headers, manager_headers = _setup_request_context(
        client,
        superuser_token_headers,
        db,
    )
    _ensure_shift_code(db, "A", "0700-1500 (AM SHIFT)", True)
    db.add(WardShiftCode(wardid=ward_id, shiftcode="A"))
    db.commit()

    staff_response = client.get(
        f"{settings.API_V1_STR}/shift-requests/shift-codes/requestable/ward/{ward_id}",
        headers=nurse_headers,
    )
    manager_response = client.get(
        f"{settings.API_V1_STR}/shift-requests/shift-codes/requestable/ward/{ward_id}",
        headers=manager_headers,
    )

    assert staff_response.status_code == 200, staff_response.text
    assert manager_response.status_code == 200, manager_response.text
    staff_codes = {code["shiftcode"] for code in staff_response.json()}
    manager_codes = {code["shiftcode"] for code in manager_response.json()}
    assert staff_codes == {"A"}
    assert manager_codes == {"A", "SD"}


def test_roster_edit_shift_codes_are_role_aware_for_sleeping_day(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id, _, _, nurse_headers, manager_headers = _setup_request_context(
        client,
        superuser_token_headers,
        db,
    )

    staff_response = client.get(
        f"{settings.API_V1_STR}/shift-requests/shift-codes/ward/{ward_id}",
        headers=nurse_headers,
    )
    manager_response = client.get(
        f"{settings.API_V1_STR}/shift-requests/shift-codes/ward/{ward_id}",
        headers=manager_headers,
    )

    assert staff_response.status_code == 200, staff_response.text
    assert manager_response.status_code == 200, manager_response.text
    assert "SD" not in {code["shiftcode"] for code in staff_response.json()}
    assert "SD" in {code["shiftcode"] for code in manager_response.json()}


def test_sleeping_day_shift_request_requires_nurse_manager(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id, nurse_id, period_id, nurse_headers, manager_headers = _setup_request_context(
        client,
        superuser_token_headers,
        db,
    )
    preferred_date = "2026-07-03"

    staff_response = client.post(
        f"{settings.API_V1_STR}/shift-requests/",
        headers=nurse_headers,
        json={
            "periodid": period_id,
            "preferreddate": preferred_date,
            "preferredshifttype": "SD",
        },
    )
    manager_response = client.post(
        f"{settings.API_V1_STR}/shift-requests/",
        headers=manager_headers,
        json={
            "nurseid": nurse_id,
            "periodid": period_id,
            "preferreddate": preferred_date,
            "preferredshifttype": "SD",
        },
    )

    assert staff_response.status_code == 400, staff_response.text
    assert staff_response.json()["detail"] == "Selected shift is not available for this ward"
    assert manager_response.status_code == 200, manager_response.text
    assert manager_response.json()["preferredshifttype"] == "SD"

    cache_delete(_shift_codes_cache_key(f"requestable:staff:ward:{ward_id}"))
    cache_delete(_shift_codes_cache_key(f"requestable:manager:ward:{ward_id}"))
