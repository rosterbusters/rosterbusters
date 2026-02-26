# from fastapi import APIRouter, HTTPException
# from pydantic import BaseModel
# from typing import List, Dict, Optional
# from app.rostering.algo_scheduler import generate_roster

# router = APIRouter()

# class Nurse(BaseModel):
#     id: int
#     name: str
#     rank: str  # "A" for RN, "B" for EN, "C" for HCA

# class ShiftRequirement(BaseModel):
#     AM: Dict[str, int]     # {"A": 2, "B": 4, "C": 1}
#     PM: Dict[str, int]     # {"A": 2, "B": 2, "C": 1}
#     NIGHT: Dict[str, int]  # {"A": 1, "B": 1, "C": 1}

# class RosterRequest(BaseModel):
#     nurses: List[Nurse]
#     shifts: List[ShiftRequirement]  # One dict per day (14 days)
#     requests: Optional[Dict[int, List[List]]] = None  # {nurse_id: [[day_idx, "AM"], [day_idx, "NIGHT"]]}

# class RosterResponse(BaseModel):
#     method: str  # "MILP" or "GA"
#     roster: Dict

# @router.post("/generate-roster", response_model=RosterResponse)
# def generate_roster_endpoint(data: RosterRequest):
#     """
#     Generate a nurse roster using MILP algorithm (with GA fallback).
    
#     Example request:
#     {
#         "nurses": [
#             {"id": 1, "name": "Alice", "rank": "A"},
#             {"id": 2, "name": "Bob", "rank": "B"}
#         ],
#         "shifts": [
#             {
#                 "AM": {"A": 2, "B": 4, "C": 1},
#                 "PM": {"A": 2, "B": 2, "C": 1},
#                 "NIGHT": {"A": 1, "B": 1, "C": 1}
#             }
#             // ... repeat for 14 days
#         ],
#         "requests": {
#             1: [[0, "AM"], [3, "NIGHT"]],
#             2: [[5, "PM"]]
#         }
#     }
#     """
#     try:
#         # Convert Pydantic models to dicts for the algorithm
#         nurses_data = [nurse.dict() for nurse in data.nurses]
#         shifts_data = [shift.dict() for shift in data.shifts]
        
#         # Call the algorithm
#         result = generate_roster(
#             nurses=nurses_data,
#             shifts=shifts_data,
#             requests=data.requests,
#         )
        
#         return {
#             "method": result["method"],  # "MILP" or "GA"
#             "roster": result["roster"]
#         }
        
#     except ValueError as e:
#         # Input validation errors
#         raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
#     except Exception as e:
#         # Algorithm errors (MILP/GA failures)
#         raise HTTPException(status_code=500, detail=f"Roster generation failed: {str(e)}")

from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select
from app.api.deps import get_db # Your database session dependency
from app.models.roster import Ward, RosterPeriod
from app.models.rbac import Nurse
from app.models.shifts import ShiftRequest
from app.rostering.algo_scheduler import generate_roster
from pydantic import BaseModel

# 1. Define what the frontend should send (Just the IDs!)
class RosterGenerationRequest(BaseModel):
    ward_id: int
    period_id: int

router = APIRouter()

# --- NEW: Satisfies GET /api/v1/roster/wards ---
@router.get("/wards")
def get_all_wards(db: Session = Depends(get_db)):
    wards = db.exec(select(Ward)).all()
    return wards

# --- NEW: Satisfies GET /api/v1/roster/ward/{ward_id}/nurses ---
@router.get("/ward/{ward_id}/nurses")
def get_ward_nurses(ward_id: int, db: Session = Depends(get_db)):
    # Look for active nurses assigned to this ward
    statement = select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)
    nurses = db.exec(statement).all()
    
    if not nurses:
        # Return empty list instead of 404 so the frontend doesn't crash
        return []
        
    return nurses

@router.get("/ward/{ward_id}/shift-requirements")
def get_shift_requirements(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    # 1. Fetch the ward to get its staffing targets
    ward = db.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    # 2. Your frontend hook expects an array (one object per day).
    # Typically, rosters are 14 days. We will repeat the ward's 
    # requirements for every day in the period.
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

    # Create a 14-day list (or however many days your period is)
    # The frontend hook uses this to build its 'shifts' object
    requirements_list = [daily_requirement for _ in range(14)]
    
    return requirements_list

@router.get("/ward/{ward_id}/requests")
def get_ward_requests(ward_id: int, period_id: int, db: Session = Depends(get_db)):
    # 1. We need to find requests for nurses that actually belong to this ward
    # So we join the Nurse table with the ShiftRequest table
    statement = (
        select(ShiftRequest)
        .join(Nurse, Nurse.nurseid == ShiftRequest.nurseid)
        .where(Nurse.wardid == ward_id)
        .where(ShiftRequest.periodid == period_id)
    )
    
    results = db.exec(statement).all()

    # 2. Format the data to match what your frontend hook expects:
    # { nurse_id, date, shift }
    formatted_requests = []
    for req in results:
        formatted_requests.append({
            "nurse_id": req.nurseid,
            "date": req.preferreddate.isoformat(), # The frontend needs a string date
            "shift": req.preferredshifttype # e.g., "AM", "PM", "NIGHT"
        })
        
    return formatted_requests

# 2. Update your endpoint to use this model
@router.post("/generate-algorithm")
def generate_roster_endpoint(
    request_data: RosterGenerationRequest, # FastAPI will now look in the JSON body
    db: Session = Depends(get_db)
):
    try:
        # Use the IDs from the request_data object
        ward_id = request_data.ward_id
        period_id = request_data.period_id

        # --- Your existing logic to fetch from DB ---
        ward = db.get(Ward, ward_id)
        if not ward:
            raise HTTPException(status_code=404, detail="Ward not found")

        # Format requirements for the algorithm (assuming a 14-day period)
        daily_req = {
            "AM": {"A": ward.am_rn or 0, "B": ward.am_en_na_min or 0, "C": ward.am_hca_min or 0},
            "PM": {"A": ward.pm_rn or 0, "B": ward.pm_en_na_min or 0, "C": ward.pm_hca_min or 0},
            "NIGHT": {"A": ward.nd_rn or 0, "B": ward.nd_en_na_min or 0, "C": ward.nd_hca_min or 0},
        }
        shifts_data = [daily_req for _ in range(14)] # Repeat for 14 days

        # 2. FETCH NURSES
        nurses_db = db.exec(select(Nurse).where(Nurse.wardid == ward_id, Nurse.isactive == True)).all()
        nurses_data = [
            {"id": n.nurseid, "name": n.name, "rank": map_rank(n.designation)} 
            for n in nurses_db
        ]

        # 3. FETCH SHIFT REQUESTS
        requests_db = db.exec(select(ShiftRequest).where(ShiftRequest.periodid == period_id)).all()
        # (You would add logic here to format requests into the {id: [[day, shift]]} format)

        # 4. RUN THE ALGORITHM
        result = generate_roster(
            nurses=nurses_data,
            shifts=shifts_data,
            requests=None # pass your formatted requests here
        )

        return {"method": result["method"], "roster": result["roster"]}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def map_rank(designation: str) -> str:
    """Map nurse designation to scheduling rank A/B/C."""
    RANK_A = {
        "SNR STAFF NURSE I", "SNR STAFF NURSE II",
        "STAFF NURSE I", "STAFF NURSE II",
        # Legacy short codes
        "RN", "SSN",
    }
    RANK_B = {
        "SNR ENROLLED NURSE II", "ENROLLED NURSE I", "ENROLLED NURSE II",
        "NURSING AIDE I", "NURSING AIDE II",
        "SENIOR NURSING AIDE I", "SENIOR NURSING AIDE II",
        "SNR PATIENT SERVICE ASST",
        # Legacy short codes
        "EN", "NA",
    }
    # Everything else (HCAs, PSAs, Senior HCAs) → Rank C
    if designation in RANK_A:
        return "A"
    if designation in RANK_B:
        return "B"
    return "C"