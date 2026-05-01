from datetime import date, timedelta
from uuid import uuid4

import xlrd
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models.rbac import Nurse
from app.models.roster import RosterPeriod, Ward


def _create_period(
    db: Session,
    *,
    name: str,
    startdate: date,
    enddate: date,
) -> RosterPeriod:
    period = RosterPeriod(
        name=name,
        startdate=startdate,
        enddate=enddate,
        requestopendate=startdate - timedelta(days=14),
        requestclosedate=startdate - timedelta(days=1),
        status="RequestOpen",
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


def _open_xls_response(response):
    return xlrd.open_workbook(file_contents=response.content, formatting_info=True)


def _create_export_fixture(db: Session):
    suffix = uuid4().hex
    ward = Ward(wardname=f"Export Ward {suffix}", isactive=True)
    db.add(ward)
    db.commit()
    db.refresh(ward)

    nurse_1 = Nurse(
        name="Export Nurse One",
        employeeid="1102493",
        designation="SSN",
        email=f"export-one-{suffix}@example.com",
        contactnumber="111",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    nurse_2 = Nurse(
        name="Export Nurse Two",
        employeeid="1101301",
        designation="EN",
        email=f"export-two-{suffix}@example.com",
        contactnumber="222",
        wardid=ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    db.add(nurse_1)
    db.add(nurse_2)
    db.commit()
    db.refresh(nurse_1)
    db.refresh(nurse_2)

    period = _create_period(
        db,
        name=f"Export Period {suffix}",
        startdate=date(2026, 4, 26),
        enddate=date(2026, 5, 9),
    )
    return ward, period, nurse_1, nurse_2


def test_export_xls_uses_visible_week_and_template_format(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    ward, period, nurse_1, nurse_2 = _create_export_fixture(db)

    response = client.post(
        f"{settings.API_V1_STR}/roster/export-xls",
        headers=superuser_token_headers,
        json={
            "ward_id": ward.wardid,
            "period_id": period.periodid,
            "start_date": "2026-04-26",
            "view_mode": "week",
            "rows": [
                {
                    "nurse_id": nurse_1.nurseid,
                    "shifts": {
                        "2026-04-26": "A",
                        "2026-04-27": "P",
                        "2026-04-28": "N",
                    },
                },
                {
                    "nurse_id": nurse_2.nurseid,
                    "shifts": {
                        "2026-04-26": "DO",
                        "2026-05-02": "RD",
                    },
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/vnd.ms-excel")
    assert 'filename="roster_2026-04-26.xls"' in response.headers["content-disposition"]

    workbook = _open_xls_response(response)
    sheet = workbook.sheet_by_name("Sheet1")
    assert sheet.ncols == 10
    assert sheet.rowinfo_map[0].hidden == 1
    assert sheet.cell_value(0, 0) == "EMP_NO"
    assert sheet.row_values(1, 3, 10) == [
        "2026-04-26",
        "2026-04-27",
        "2026-04-28",
        "2026-04-29",
        "2026-04-30",
        "2026-05-01",
        "2026-05-02",
    ]
    assert sheet.row_values(2, 0, 10) == [
        "SSN",
        "Export Nurse One",
        "1102493",
        "A",
        "P",
        "N",
        "",
        "",
        "",
        "",
    ]
    assert sheet.cell_value(3, 0) == "EN"
    assert sheet.cell_value(3, 1) == "Export Nurse Two"
    assert sheet.cell_value(3, 2) == "1101301"
    assert sheet.cell_value(3, 3) == "DO"
    assert sheet.cell_value(3, 9) == "RD"

    date_xf = workbook.xf_list[sheet.cell_xf_index(1, 3)]
    employee_xf = workbook.xf_list[sheet.cell_xf_index(2, 2)]
    assert workbook.font_list[date_xf.font_index].bold == 1
    assert workbook.format_map[date_xf.format_key].format_str == "@"
    assert workbook.format_map[employee_xf.format_key].format_str == "@"
    assert employee_xf.alignment.text_wrapped == 1


def test_export_xls_uses_fourteen_days_for_two_week_view(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    ward, period, nurse_1, _ = _create_export_fixture(db)

    response = client.post(
        f"{settings.API_V1_STR}/roster/export-xls",
        headers=superuser_token_headers,
        json={
            "ward_id": ward.wardid,
            "period_id": period.periodid,
            "start_date": "2026-04-26",
            "view_mode": "twoWeeks",
            "rows": [
                {
                    "nurse_id": nurse_1.nurseid,
                    "shifts": {
                        "2026-04-26": "A",
                        "2026-05-09": "N",
                    },
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    sheet = _open_xls_response(response).sheet_by_name("Sheet1")
    assert sheet.ncols == 17
    assert sheet.cell_value(1, 3) == "2026-04-26"
    assert sheet.cell_value(1, 16) == "2026-05-09"
    assert sheet.cell_value(2, 3) == "A"
    assert sheet.cell_value(2, 16) == "N"


def test_export_xls_allows_missing_or_cross_ward_nurse_metadata(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    ward, period, _, _ = _create_export_fixture(db)
    suffix = uuid4().hex
    other_ward = Ward(wardname=f"Other Export Ward {suffix}", isactive=True)
    db.add(other_ward)
    db.commit()
    db.refresh(other_ward)
    other_nurse = Nurse(
        name="Wrong Ward Nurse",
        employeeid="1109999",
        designation="EN",
        email=f"wrong-ward-{suffix}@example.com",
        contactnumber="333",
        wardid=other_ward.wardid,
        employmenttype="FT",
        isactive=True,
    )
    db.add(other_nurse)
    db.commit()
    db.refresh(other_nurse)

    response = client.post(
        f"{settings.API_V1_STR}/roster/export-xls",
        headers=superuser_token_headers,
        json={
            "ward_id": ward.wardid,
            "period_id": period.periodid,
            "start_date": "2026-04-26",
            "view_mode": "week",
            "rows": [
                {
                    "nurse_id": other_nurse.nurseid,
                    "shifts": {"2026-04-26": "A"},
                },
                {
                    "nurse_id": 99999999,
                    "shifts": {"2026-04-27": "P"},
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    sheet = _open_xls_response(response).sheet_by_name("Sheet1")
    assert sheet.row_values(2, 0, 5) == ["EN", "Wrong Ward Nurse", "1109999", "A", ""]
    assert sheet.row_values(3, 0, 5) == ["", "", "", "", "P"]
