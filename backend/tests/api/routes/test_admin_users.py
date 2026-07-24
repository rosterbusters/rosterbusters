from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import RBACUser, Role, UserRole
from app.models.rbac import Nurse
from app.models.roster import Ward
from tests.utils.user import user_authentication_headers


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
            "name": "Nurse Import",
            "email": "nurse.import@example.com",
            "employee_id": "EMP-1001",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["employee_id"] == "EMP-1001"
    assert payload["username"] == "nurse.import"
    assert payload["name"] == "Nurse Import"
    assert payload["nurseid"] is not None

    nurse = db.exec(
        select(Nurse).where(Nurse.nurseid == payload["nurseid"])
    ).first()
    assert nurse is not None
    assert nurse.employeeid == "EMP-1001"
    assert nurse.name == "Nurse Import"


def test_create_nurse_user_stores_join_date(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Join Date Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "nurse.joindate",
            "name": "Nurse Join Date",
            "email": "nurse.joindate@example.com",
            "employee_id": "EMP-1002",
            "join_date": "2026-04-15",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["join_date"] == "2026-04-15"
    assert payload["nurseid"] is not None

    nurse = db.exec(
        select(Nurse).where(Nurse.nurseid == payload["nurseid"])
    ).first()
    assert nurse is not None
    assert str(nurse.join_date) == "2026-04-15"


def test_create_admin_user_can_log_in_and_access_admin_routes(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    password = "AdminCreated123!"
    response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "created.admin",
            "name": "Created Admin",
            "password": password,
            "role": "Admin",
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["username"] == "created.admin"
    assert payload["email"] is None
    assert payload["roles"] == ["Admin"]

    created_admin_headers = user_authentication_headers(
        client=client,
        email="created.admin",
        password=password,
    )
    admin_response = client.get(
        f"{settings.API_V1_STR}/admin/users",
        headers=created_admin_headers,
    )
    assert admin_response.status_code == 200, admin_response.text

    created_admin = db.exec(
        select(RBACUser).where(RBACUser.userid == payload["userid"])
    ).first()
    assert created_admin is not None
    assert created_admin.nurseid is None
    assert created_admin.managerid is None


def test_update_nurse_user_updates_and_clears_join_date(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Join Date Update Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    create_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "nurse.joindate.update",
            "name": "Nurse Join Date Update",
            "email": "nurse.joindate.update@example.com",
            "employee_id": "EMP-1003",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )
    assert create_response.status_code == 201, create_response.text
    payload = create_response.json()

    update_response = client.patch(
        f"{settings.API_V1_STR}/admin/users/{payload['userid']}",
        headers=superuser_token_headers,
        json={"join_date": "2026-04-20"},
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["join_date"] == "2026-04-20"

    nurse = db.exec(
        select(Nurse).where(Nurse.nurseid == payload["nurseid"])
    ).first()
    assert nurse is not None
    assert str(nurse.join_date) == "2026-04-20"

    clear_response = client.patch(
        f"{settings.API_V1_STR}/admin/users/{payload['userid']}",
        headers=superuser_token_headers,
        json={"join_date": None},
    )
    assert clear_response.status_code == 200, clear_response.text
    assert clear_response.json()["join_date"] is None

    db.refresh(nurse)
    assert nurse.join_date is None


def test_multiple_nurse_managers_can_share_the_same_ward(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Shared Manager Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    first_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "manager.one",
            "name": "Manager One",
            "email": "manager.one@example.com",
            "employee_id": "MGR-1001",
            "role": "NurseManager",
            "ward_ids": [ward.wardid],
        },
    )
    assert first_response.status_code == 201, first_response.text

    second_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "manager.two",
            "name": "Manager Two",
            "email": "manager.two@example.com",
            "employee_id": "MGR-1002",
            "role": "NurseManager",
            "ward_ids": [ward.wardid],
        },
    )
    assert second_response.status_code == 201, second_response.text

    manager_role = db.exec(
        select(Role).where(Role.rolename == "NurseManager")
    ).first()
    assert manager_role is not None

    first_user = db.exec(
        select(RBACUser).where(RBACUser.userid == first_response.json()["userid"])
    ).first()
    second_user = db.exec(
        select(RBACUser).where(RBACUser.userid == second_response.json()["userid"])
    ).first()
    assert first_user is not None
    assert second_user is not None

    first_assignment = db.exec(
        select(UserRole).where(
            UserRole.userid == first_user.userid,
            UserRole.roleid == manager_role.roleid,
            UserRole.wardid == ward.wardid,
        )
    ).first()
    second_assignment = db.exec(
        select(UserRole).where(
            UserRole.userid == second_user.userid,
            UserRole.roleid == manager_role.roleid,
            UserRole.wardid == ward.wardid,
        )
    ).first()
    assert first_assignment is not None
    assert second_assignment is not None

    list_response = client.get(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
    )
    assert list_response.status_code == 200, list_response.text
    users = {row["username"]: row for row in list_response.json()["data"]}
    assert [entry["ward_id"] for entry in users["manager.one"]["wards"]] == [ward.wardid]
    assert [entry["ward_id"] for entry in users["manager.two"]["wards"]] == [ward.wardid]
