from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import get_db
from app.models.rbac import Nurse
from app.models.roster import Ward
from app.models.shifts import ShiftRequest
from app.rostering.algo_scheduler import generate_roster


class RosterGenerationRequest(BaseModel):
    ward_id: int
    period_id: int


router = APIRouter()


@router.get("/ward/{ward_id}/shift-requirements")
def get_shift_requirements(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    """Get daily shift staffing requirements for a ward (repeated for 14 days)."""
    ward = db.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    daily_requirement = {
        "am_rn": ward.am_rn or 0,
        "am_en": ward.am_en_na_min or 0,
        "am_hca": ward.am_hca_min or 0,
        "pm_rn": ward.pm_rn or 0,
        "pm_en": ward.pm_en_na_min or 0,
        "pm_hca": ward.pm_hca_min or 0,
        "night_rn": ward.nd_rn or 0,
        "night_en": ward.nd_en_na_min or 0,
        "night_hca": ward.nd_hca_min or 0,
    }
    return [daily_requirement for _ in range(14)]


@router.get("/ward/{ward_id}/requests")
def get_ward_requests(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    """Get formatted shift requests for nurses in a ward for the rostering algorithm."""
    statement = (
        select(ShiftRequest)
        .join(Nurse, Nurse.nurseid == ShiftRequest.nurseid)
        .where(Nurse.wardid == ward_id)
        .where(ShiftRequest.periodid == period_id)
    )
    results = db.exec(statement).all()

    return [
        {
            "nurse_id": req.nurseid,
            "date": req.preferreddate.isoformat(),
            "shift": req.preferredshifttype,
        }
        for req in results
    ]


@router.post("/generate-algorithm")
def generate_roster_endpoint(
    request_data: RosterGenerationRequest,
    db: Session = Depends(get_db),
):
    """Run the MILP/GA rostering algorithm for a ward and roster period."""
    try:
        ward = db.get(Ward, request_data.ward_id)
        if not ward:
            raise HTTPException(status_code=404, detail="Ward not found")

        daily_req = {
            "AM": {"A": ward.am_rn or 0, "B": ward.am_en_na_min or 0, "C": ward.am_hca_min or 0},
            "PM": {"A": ward.pm_rn or 0, "B": ward.pm_en_na_min or 0, "C": ward.pm_hca_min or 0},
            "NIGHT": {"A": ward.nd_rn or 0, "B": ward.nd_en_na_min or 0, "C": ward.nd_hca_min or 0},
        }
        shifts_data = [daily_req for _ in range(14)]

        nurses_db = db.exec(
            select(Nurse).where(Nurse.wardid == request_data.ward_id, Nurse.isactive == True)  # noqa: E712
        ).all()
        nurses_data = [
            {"id": n.nurseid, "name": n.name, "rank": _map_rank(n.designation)}
            for n in nurses_db
        ]

        result = generate_roster(nurses=nurses_data, shifts=shifts_data, requests=None)
        return {"method": result["method"], "roster": result["roster"]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _map_rank(designation: str) -> str:
    """Map nurse designation to scheduling rank A/B/C."""
    RANK_A = {
        "SNR STAFF NURSE I", "SNR STAFF NURSE II",
        "STAFF NURSE I", "STAFF NURSE II",
        "RN", "SSN",
    }
    RANK_B = {
        "SNR ENROLLED NURSE II", "ENROLLED NURSE I", "ENROLLED NURSE II",
        "NURSING AIDE I", "NURSING AIDE II",
        "SENIOR NURSING AIDE I", "SENIOR NURSING AIDE II",
        "SNR PATIENT SERVICE ASST",
        "EN", "NA",
    }
    if designation in RANK_A:
        return "A"
    if designation in RANK_B:
        return "B"
    return "C"
