from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import RBACUser, Role, UserRole
from app.models.rbac import Nurse, NurseManager
from app.models.roster import Ward
from tests.utils.user import authentication_token_from_email


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


def test_admin_can_change_nurse_role_without_deleting_staff_history(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Role Change Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    create_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "role.change.nurse",
            "name": "Role Change Nurse",
            "email": "role.change.nurse@example.com",
            "employee_id": "ROLE-CHANGE-1",
            "designation": "RN",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()
    nurse_id = created["nurseid"]

    promote_response = client.patch(
        f"{settings.API_V1_STR}/admin/users/{created['userid']}",
        headers=superuser_token_headers,
        json={"role": "NurseManager", "ward_ids": [ward.wardid]},
    )
    assert promote_response.status_code == 200, promote_response.text
    promoted = promote_response.json()
    assert promoted["roles"] == ["NurseManager"]
    assert promoted["nurseid"] == nurse_id
    assert promoted["managerid"] is not None

    nurse = db.get(Nurse, nurse_id)
    assert nurse is not None
    assert nurse.isactive is False

    demote_response = client.patch(
        f"{settings.API_V1_STR}/admin/users/{created['userid']}",
        headers=superuser_token_headers,
        json={"role": "Nurse", "ward_ids": [ward.wardid]},
    )
    assert demote_response.status_code == 200, demote_response.text
    demoted = demote_response.json()
    assert demoted["roles"] == ["Nurse"]
    assert demoted["nurseid"] == nurse_id

    db.refresh(nurse)
    assert nurse.isactive is True
    manager = db.get(NurseManager, promoted["managerid"])
    assert manager is not None
    assert manager.isactive is False


def test_nurse_manager_can_change_staff_role(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Manager Role Change Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    actor_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "role.change.actor",
            "name": "Role Change Actor",
            "email": "role.change.actor@example.com",
            "employee_id": "ROLE-ACTOR-1",
            "role": "NurseManager",
            "ward_ids": [ward.wardid],
        },
    )
    assert actor_response.status_code == 201, actor_response.text

    target_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "role.change.target",
            "name": "Role Change Target",
            "email": "role.change.target@example.com",
            "employee_id": "ROLE-TARGET-1",
            "designation": "RN",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )
    assert target_response.status_code == 201, target_response.text
    target = target_response.json()

    manager_headers = authentication_token_from_email(
        client=client,
        email="role.change.actor@example.com",
        db=db,
    )
    promote_response = client.patch(
        f"{settings.API_V1_STR}/users/nurse-manager/staff/{target['userid']}",
        headers=manager_headers,
        json={"role": "NurseManager", "ward_id": ward.wardid},
    )
    assert promote_response.status_code == 200, promote_response.text
    assert promote_response.json()["role"] == "NurseManager"

    demote_response = client.patch(
        f"{settings.API_V1_STR}/users/nurse-manager/staff/{target['userid']}",
        headers=manager_headers,
        json={"role": "Nurse", "ward_id": ward.wardid},
    )
    assert demote_response.status_code == 200, demote_response.text
    assert demote_response.json()["role"] == "Nurse"


def test_nurse_manager_can_delete_nurse_manager_staff_account(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward = Ward(wardname="Manager Delete Staff Ward", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    actor_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "delete.staff.actor",
            "name": "Delete Staff Actor",
            "email": "delete.staff.actor@example.com",
            "employee_id": "DELETE-ACTOR-1",
            "role": "NurseManager",
            "ward_ids": [ward.wardid],
        },
    )
    assert actor_response.status_code == 201, actor_response.text
    actor = actor_response.json()

    target_response = client.post(
        f"{settings.API_V1_STR}/admin/users",
        headers=superuser_token_headers,
        json={
            "username": "delete.staff.target",
            "name": "Delete Staff Target",
            "email": "delete.staff.target@example.com",
            "employee_id": "DELETE-TARGET-1",
            "designation": "RN",
            "role": "Nurse",
            "ward_ids": [ward.wardid],
        },
    )
    assert target_response.status_code == 201, target_response.text
    target = target_response.json()

    manager_headers = authentication_token_from_email(
        client=client,
        email="delete.staff.actor@example.com",
        db=db,
    )
    promote_response = client.patch(
        f"{settings.API_V1_STR}/users/nurse-manager/staff/{target['userid']}",
        headers=manager_headers,
        json={"role": "NurseManager", "ward_id": ward.wardid},
    )
    assert promote_response.status_code == 200, promote_response.text
    promoted = promote_response.json()

    self_delete_response = client.delete(
        f"{settings.API_V1_STR}/users/nurse-manager/staff/{actor['userid']}",
        headers=manager_headers,
    )
    assert self_delete_response.status_code == 403, self_delete_response.text

    delete_response = client.delete(
        f"{settings.API_V1_STR}/users/nurse-manager/staff/{target['userid']}",
        headers=manager_headers,
    )
    assert delete_response.status_code == 200, delete_response.text

    assert db.get(RBACUser, target["userid"]) is None
    assert db.get(Nurse, target["nurseid"]) is None
    assert db.get(NurseManager, promoted["managerid"]) is None
