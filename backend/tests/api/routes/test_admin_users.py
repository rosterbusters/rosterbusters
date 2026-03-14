from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models.rbac import Nurse
from app.models.roster import Ward


def test_create_nurse_user_stores_employee_id(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Import Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "nurse.import",
            "email": "nurse.import@example.com",
            "employee_id": "EMP-1001",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["employee_id"] == "EMP-1001"
    assert payload["nurseid"] is not None

    nurse = db.exec(
        select(Nurse).where(Nurse.nurseid == payload["nurseid"])
    ).first()
    assert nurse is not None
    assert nurse.employeeid == "EMP-1001"
