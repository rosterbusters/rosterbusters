from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import select
from typing import List, Annotated
from datetime import datetime, timezone

from backend.database import (
    SessionDep, CurrentUser, RequireAdmin, RequireManager,
    require_permission, user_can_access_ward, user_has_role, get_user_roles,
    Roster, Ward, Nurse, RosterPeriod
)

router = APIRouter(prefix="/roster", tags=["roster"])


@router.get("/wards")
def get_accessible_wards(session: SessionDep, current_user: CurrentUser) -> List[dict]:
    """Get wards user can access"""
    # Admins see all
    if user_has_role(session, current_user.UserID, "Admin"):
        wards = session.exec(select(Ward).where(Ward.IsActive == True)).all()
        return [{"ward_id": w.WardID, "ward_name": w.WardName, 
                 "ward_type": w.WardType, "campus": w.Campus} for w in wards]
    
    # Managers see assigned wards
    if user_has_role(session, current_user.UserID, "NurseManager"):
        roles = get_user_roles(session, current_user.UserID)
        ward_ids = [r["WardID"] for r in roles if r["WardID"]]
        
        if ward_ids:
            wards = session.exec(select(Ward).where(
                Ward.WardID.in_(ward_ids), Ward.IsActive == True
            )).all()
            return [{"ward_id": w.WardID, "ward_name": w.WardName,
                     "ward_type": w.WardType, "campus": w.Campus} for w in wards]
    
    # Nurses see their ward
    if current_user.NurseID:
        nurse = session.get(Nurse, current_user.NurseID)
        if nurse and nurse.WardID:
            ward = session.get(Ward, nurse.WardID)
            if ward:
                return [{"ward_id": ward.WardID, "ward_name": ward.WardName,
                         "ward_type": ward.WardType, "campus": ward.Campus}]
    
    return []


@router.get("/ward/{ward_id}")
def get_ward_roster(ward_id: int, period_id: int, session: SessionDep, 
                    current_user: CurrentUser) -> dict:
    """Get roster for specific ward"""
    if not user_can_access_ward(session, current_user.UserID, ward_id):
        raise HTTPException(403, "Access denied to this ward")
    
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(404, "Ward not found")
    
    period = session.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(404, "Period not found")
    
    roster_entries = session.exec(select(Roster).where(
        Roster.WardID == ward_id, Roster.PeriodID == period_id
    )).all()
    
    return {
        "ward": {"ward_id": ward.WardID, "ward_name": ward.WardName,
                 "ward_type": ward.WardType, "campus": ward.Campus},
        "period": {"period_id": period.PeriodID, "start_date": period.StartDate,
                   "end_date": period.EndDate, "status": period.Status},
        "roster_entries": [{"roster_id": r.RosterID, "nurse_id": r.NurseID,
                           "shift_date": r.ShiftDate, "shift_code": r.ShiftCode,
                           "status": r.Status} for r in roster_entries]
    }


@router.get("/my-roster")
def get_my_roster(period_id: int, session: SessionDep, 
                  current_user: CurrentUser) -> List[dict]:
    """Get personal roster"""
    if not current_user.NurseID:
        raise HTTPException(400, "User is not a nurse")
    
    entries = session.exec(select(Roster).where(
        Roster.NurseID == current_user.NurseID, Roster.PeriodID == period_id
    )).all()
    
    return [{"roster_id": r.RosterID, "shift_date": r.ShiftDate,
             "shift_code": r.ShiftCode, "status": r.Status, 
             "ward_id": r.WardID} for r in entries]


@router.post("/ward/{ward_id}/approve")
def approve_roster(ward_id: int, period_id: int, session: SessionDep,
                   current_user: Annotated[CurrentUser, Depends(require_permission("approve_roster"))]) -> dict:
    """Approve roster (requires permission)"""
    if not user_can_access_ward(session, current_user.UserID, ward_id):
        raise HTTPException(403, "Access denied to this ward")
    
    entries = session.exec(select(Roster).where(
        Roster.WardID == ward_id, Roster.PeriodID == period_id, 
        Roster.Status == "Draft"
    )).all()
    
    if not entries:
        raise HTTPException(404, "No draft entries found")
    
    for entry in entries:
        entry.Status = "Confirmed"
        entry.ApprovedBy = current_user.UserID
        entry.ApprovedAt = datetime.now(timezone.utc)
        session.add(entry)
    
    session.commit()
    return {"message": f"Roster approved for Ward {ward_id}", 
            "entries_approved": len(entries)}


@router.post("/ward/{ward_id}/publish")
def publish_roster(ward_id: int, period_id: int, session: SessionDep,
                   current_user: Annotated[CurrentUser, Depends(require_permission("approve_roster"))]) -> dict:
    """Publish roster - updates Draft entries to Confirmed and sets PublishedAt on period"""
    if not user_can_access_ward(session, current_user.UserID, ward_id):
        raise HTTPException(403, "Access denied to this ward")
    
    # Get the roster period
    period = session.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(404, "Period not found")
    
    # Update all Draft entries to Confirmed
    entries = session.exec(select(Roster).where(
        Roster.WardID == ward_id, Roster.PeriodID == period_id, 
        Roster.Status == "Draft"
    )).all()
    
    for entry in entries:
        entry.Status = "Confirmed"
        entry.ApprovedBy = current_user.UserID
        entry.ApprovedAt = datetime.now(timezone.utc)
        session.add(entry)
    
    # Set PublishedAt on the RosterPeriod
    period.PublishedAt = datetime.now(timezone.utc)
    period.FinalizedBy = current_user.ManagerID if hasattr(current_user, 'ManagerID') else None
    period.FinalizedAt = datetime.now(timezone.utc)
    session.add(period)
    
    session.commit()
    
    return {
        "message": f"Roster published for Ward {ward_id}",
        "entries_published": len(entries),
        "published_at": period.PublishedAt.isoformat()
    }


@router.post("/create")
def create_roster_entry(ward_id: int, nurse_id: int, period_id: int,
                        shift_date: datetime, shift_code: str, session: SessionDep,
                        current_user: Annotated[CurrentUser, Depends(require_permission("create_roster"))]) -> dict:
    """Create roster entry (requires permission)"""
    if not user_can_access_ward(session, current_user.UserID, ward_id):
        raise HTTPException(403, "Access denied to this ward")
    
    nurse = session.get(Nurse, nurse_id)
    if not nurse or nurse.WardID != ward_id:
        raise HTTPException(400, "Nurse not in this ward")
    
    entry = Roster(
        WardID=ward_id, NurseID=nurse_id, PeriodID=period_id,
        ShiftDate=shift_date, ShiftCode=shift_code, Status="Draft",
        CreatedAt=datetime.now(timezone.utc), CreatedBy=current_user.UserID
    )
    
    session.add(entry)
    session.commit()
    session.refresh(entry)
    
    return {"message": "Roster entry created", "roster_id": entry.RosterID}


@router.get("/admin/all-rosters")
def get_all_rosters(period_id: int, session: SessionDep, 
                    admin_user: RequireAdmin) -> List[dict]:
    """Get all rosters (admin only)"""
    entries = session.exec(select(Roster).where(Roster.PeriodID == period_id)).all()
    
    return [{"roster_id": r.RosterID, "ward_id": r.WardID, "nurse_id": r.NurseID,
             "shift_date": r.ShiftDate, "shift_code": r.ShiftCode, 
             "status": r.Status} for r in entries]


@router.get("/manager/statistics")
def get_manager_statistics(ward_id: int, session: SessionDep, 
                           manager_user: RequireManager) -> dict:
    """Get ward statistics (manager only)"""
    if not user_can_access_ward(session, manager_user.UserID, ward_id):
        raise HTTPException(403, "Access denied to this ward")
    
    nurses = session.exec(select(Nurse).where(
        Nurse.WardID == ward_id, Nurse.IsActive == True
    )).all()
    
    return {
        "ward_id": ward_id,
        "total_nurses": len(nurses),
        "rn_count": sum(1 for n in nurses if n.Designation == "RN"),
        "staff_nurse_count": sum(1 for n in nurses if n.Designation == "StaffNurse"),
        "hca_count": sum(1 for n in nurses if n.Designation == "HCA"),
        "nurses": [{"nurse_id": n.NurseID, "name": n.Name, 
                   "designation": n.Designation, 
                   "employment_type": n.EmploymentType} for n in nurses]
    }