from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import select
from datetime import date
from typing import Optional, List
from pydantic import BaseModel

from app.api.deps import get_current_user, SessionDep
from app.models import Roster, ShiftCode, Nurse, Ward, RBACUser, NurseManager

router = APIRouter()


class RosterShiftPublic(BaseModel):
    shiftdate: date
    shiftcode: str
    starttime: Optional[str] = None
    endtime: Optional[str] = None
    description: Optional[str] = None


class UpcomingShiftResponse(BaseModel):
    has_shift: bool
    nurse_name: str
    shift_type: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
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
    user_name = None
    nurse_id = current_user.nurseid
    manager_id = current_user.managerid
  
    if nurse_id:
        nurse_query = select(Nurse).where(Nurse.nurseid == nurse_id)
        nurse = session.exec(nurse_query).first()
        if nurse:
            user_name = nurse.name

    if not user_name and manager_id:
        manager_query = select(NurseManager).where(NurseManager.managerid == manager_id)
        manager = session.exec(manager_query).first()
        if manager:
            user_name = manager.name

    if not user_name:
        user_name = current_user.email or current_user.username
    
    if not nurse_id:
        return UpcomingShiftResponse(has_shift=False, nurse_name=str(user_name))
    
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
            Roster.status == "Confirmed",
            ShiftCode.isworking == True  # CRITICAL FIX: Only show actual work shifts
        )
        .order_by(Roster.shiftdate.asc())
        .limit(1)
    )
    
    result = session.exec(roster_query).first()
    
    if not result:
        return UpcomingShiftResponse(has_shift=False, nurse_name=str(user_name))
    
    roster, shift_code, ward = result
    shift_date = roster.shiftdate
    day_name = shift_date.strftime("%A")
    formatted_date = shift_date.strftime("%d/%m/%Y")
    
    # Extract shift type name from shift code description
    shift_description = shift_code.description
    if "(" in shift_description and ")" in shift_description:
        # Extract text within parentheses and capitalize properly
        shift_type = shift_description.split("(")[1].split(")")[0].title()
    else:
        shift_type = shift_description
    
    # Use ROSTER.starttime and endtime (actual scheduled times) if available,
    # otherwise fall back to shift code defaults
    start_time = None
    end_time = None
    
    if roster.starttime:
        start_time = roster.starttime.strftime("%H:%M")
    elif shift_code.defaultstart:
        start_time = shift_code.defaultstart.strftime("%H:%M")
    
    if roster.endtime:
        end_time = roster.endtime.strftime("%H:%M")
    elif shift_code.defaultend:
        end_time = shift_code.defaultend.strftime("%H:%M")
    
    return UpcomingShiftResponse(
        has_shift=True,
        nurse_name=str(user_name),
        shift_type=shift_type,
        start_time=start_time,
        end_time=end_time,
        shift_date=shift_date,
        shift_day=day_name,
        formatted_date=formatted_date,
        shift_code=roster.shiftcode,
        ward_name=ward.wardname
    )


@router.get("/my-shifts", response_model=List[RosterShiftPublic])
async def get_my_shifts(
    session: SessionDep,
    current_user: RBACUser = Depends(get_current_user),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
):
    nurse_id = current_user.nurseid
    if not nurse_id:
        return []

    query = (
        select(Roster, ShiftCode)
        .join(ShiftCode, Roster.shiftcode == ShiftCode.shiftcode)
        .where(Roster.nurseid == nurse_id, Roster.status == "Confirmed")
    )
    if start_date:
        query = query.where(Roster.shiftdate >= start_date)
    if end_date:
        query = query.where(Roster.shiftdate <= end_date)
    query = query.order_by(Roster.shiftdate.asc())

    results = session.exec(query).all()

    shifts = []
    for roster, shift_code in results:
        start_time = None
        end_time = None
        if roster.starttime:
            start_time = roster.starttime.strftime("%H:%M")
        elif shift_code.defaultstart:
            start_time = shift_code.defaultstart.strftime("%H:%M")
        if roster.endtime:
            end_time = roster.endtime.strftime("%H:%M")
        elif shift_code.defaultend:
            end_time = shift_code.defaultend.strftime("%H:%M")
        shifts.append(RosterShiftPublic(
            shiftdate=roster.shiftdate,
            shiftcode=roster.shiftcode,
            starttime=start_time,
            endtime=end_time,
            description=shift_code.description,
        ))
    return shifts