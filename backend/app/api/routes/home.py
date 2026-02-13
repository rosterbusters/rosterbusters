from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from datetime import date
from typing import Optional
from pydantic import BaseModel

from app.api.deps import get_current_user, SessionDep
from app.models import Roster, ShiftCode, Nurse, Ward, RBACUser

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
    current_user: RBACUser = Depends(get_current_user)
):
    # Get nurseid directly from RBACUser
    nurse_id = current_user.nurseid
    
    if not nurse_id:
        # Fallback to email or username
        user_name = current_user.email or current_user.username
        return UpcomingShiftResponse(has_shift=False, nurse_name=str(user_name))
    
    # Query the Nurse table using correct column name
    nurse_query = select(Nurse).where(Nurse.nurseid == nurse_id)
    nurse = session.exec(nurse_query).first()
    
    if not nurse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nurse profile not found")
    
    today = date.today()
    
    # Query roster with correct column names
    roster_query = (
        select(Roster, ShiftCode, Ward)
        .join(ShiftCode, Roster.shiftcode == ShiftCode.shiftcode)
        .join(Ward, Roster.wardid == Ward.wardid)
        .where(
            Roster.nurseid == nurse_id,
            Roster.shiftdate >= today,
            Roster.status == "Confirmed"
        )
        .order_by(Roster.shiftdate.asc())
        .limit(1)
    )
    
    result = session.exec(roster_query).first()
    
    if not result:
        return UpcomingShiftResponse(has_shift=False, nurse_name=nurse.name)
    
    roster, shift_code, ward = result
    shift_date = roster.shiftdate
    day_name = shift_date.strftime("%A")
    formatted_date = shift_date.strftime("%d/%m/%Y")
    shift_type = shift_code.description  # Use description for shift name
    # Use ROSTER.starttime (actual scheduled time) and format it as string
    shift_time = roster.starttime.strftime("%I:%M%p") if roster.starttime else None
    
    return UpcomingShiftResponse(
        has_shift=True,
        nurse_name=nurse.name,
        shift_type=shift_type,
        shift_time=shift_time,
        shift_date=shift_date,
        shift_day=day_name,
        formatted_date=formatted_date,
        shift_code=roster.shiftcode,
        ward_name=ward.wardname
    )