from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from datetime import date
from typing import Optional
from pydantic import BaseModel

from app.api.deps import get_current_user, SessionDep
from app.models import Roster, ShiftCode, Nurse, Ward, User

router = APIRouter()


class UpcomingShiftResponse(BaseModel):
    has_shift: bool
    nurse_name: str
    shift_type: Optional[str] = None
    shift_time: Optional[str] = None
    shift_date: Optional[date] = None
    shift_day: Optional[str] = None
    formatted_date: Optional[str] = None
    shift_code: Optional[str] = None
    ward_name: Optional[str] = None


@router.get("/upcoming-shift", response_model=UpcomingShiftResponse)
async def get_upcoming_shift(
    session: SessionDep,
    current_user: User = Depends(get_current_user)
):
    nurse_id = getattr(current_user, "NurseID", None) or getattr(current_user, "nurse_id", None)
    
    if not nurse_id:
        user_name = getattr(current_user, "Name", None) or getattr(current_user, "username", "User")
        return UpcomingShiftResponse(has_shift=False, nurse_name=str(user_name))
    
    nurse_query = select(Nurse).where(Nurse.NurseID == nurse_id)
    nurse = session.exec(nurse_query).first()
    
    if not nurse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nurse profile not found")
    
    today = date.today()
    
    roster_query = (
        select(Roster, ShiftCode, Ward)
        .join(ShiftCode, Roster.ShiftCode == ShiftCode.Code)
        .join(Ward, Roster.WardID == Ward.WardID)
        .where(Roster.NurseID == nurse_id, Roster.ShiftDate >= today, Roster.Status == "Confirmed")
        .order_by(Roster.ShiftDate.asc())
        .limit(1)
    )
    
    result = session.exec(roster_query).first()
    
    if not result:
        return UpcomingShiftResponse(has_shift=False, nurse_name=nurse.Name)
    
    roster, shift_code, ward = result
    shift_date = roster.ShiftDate
    day_name = shift_date.strftime("%A")
    formatted_date = shift_date.strftime("%d/%m/%Y")
    shift_type = shift_code.ShiftName
    shift_time = shift_code.StartTime.strftime("%I:%M%p") if shift_code.StartTime else None
    
    return UpcomingShiftResponse(
        has_shift=True,
        nurse_name=nurse.Name,
        shift_type=shift_type,
        shift_time=shift_time,
        shift_date=shift_date,
        shift_day=day_name,
        formatted_date=formatted_date,
        shift_code=roster.ShiftCode,
        ward_name=ward.WardName
    )