from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.rbac import Nurse
from app.models.roster import Ward


def test_manager_statistics_returns_designation_derivatives(
    client: TestClient,
    db: Session,
) -> None:
    ward = Ward(wardname="Statistics Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurses = [
        Nurse(
            name="Alpha Nurse",
            employeeid="STAT-001",
            designation="STAFF NURSE I",
            email="alpha.nurse@example.com",
            contactnumber="",
            wardid=ward.wardid,
            employmenttype="FullTime",
            isactive=True,
        ),
        Nurse(
            name="Bravo Assistant",
            employeeid="STAT-002",
            designation="SNR PATIENT SERVICE ASST",
            email="bravo.assistant@example.com",
            contactnumber="",
            wardid=ward.wardid,
            employmenttype="FullTime",
            isactive=True,
        ),
        Nurse(
            name="Manager Excluded",
            employeeid="STAT-003",
            designation="NURSE MANAGER I",
            email="manager.excluded@example.com",
            contactnumber="",
            wardid=ward.wardid,
            employmenttype="FullTime",
            isactive=True,
        ),
    ]
    for nurse in nurses:
        db.add(nurse)
    db.commit()

    response = client.get(f"/api/v1/roster/manager/statistics?ward_id={ward.wardid}")

    assert response.status_code == 200, response.text
    payload = response.json()
    rows = {row["designation"]: row for row in payload["nurses"]}

    assert rows["STAFF NURSE I"]["staffing_role"] == "RN"
    assert rows["STAFF NURSE I"]["roster_rank"] == "A"
    assert rows["SNR PATIENT SERVICE ASST"]["staffing_role"] == "NA"
    assert rows["SNR PATIENT SERVICE ASST"]["roster_rank"] == "B"
    assert rows["NURSE MANAGER I"]["staffing_role"] is None
    assert rows["NURSE MANAGER I"]["roster_rank"] is None
