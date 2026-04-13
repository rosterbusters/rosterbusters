from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from app.models.roster import Ward
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from sqlmodel import select


class WardStaffingIn(BaseModel):
    """Full DailyStaffingGuideline serialised as a JSON string."""
    staffing_json: str

router = APIRouter(prefix="/wards", tags=["wards"])


def _normalize_ward_hour_type(value: str | None) -> str:
    normalized = (value or "8_HOURS").strip().upper()
    if normalized not in {"8_HOURS", "12_HOURS"}:
        raise HTTPException(status_code=400, detail="wardhourtype must be 8_HOURS or 12_HOURS")
    return normalized


@router.get("/", response_model=list[Ward])
def get_wards(session: SessionDep):
    statement = select(Ward).order_by(Ward.wardid.asc())
    return list(session.exec(statement).all())


@router.get("/{ward_id}", response_model=Ward)
def get_ward(ward_id: int, session: SessionDep):
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward


@router.post(
    "/",
    response_model=Ward,
    dependencies=[Depends(get_current_active_superuser)],
)
def create_ward(*, session: SessionDep, ward_in: Ward):
    """Create a new ward (admin only)."""
    db_ward = Ward.model_validate(
        ward_in,
        update={"wardid": None, "wardhourtype": _normalize_ward_hour_type(ward_in.wardhourtype)},
    )
    session.add(db_ward)
    session.commit()
    session.refresh(db_ward)
    return db_ward


@router.patch(
    "/{ward_id}",
    response_model=Ward,
    dependencies=[Depends(get_current_active_superuser)],
)
def update_ward(ward_id: int, *, session: SessionDep, ward_in: Ward):
    """Update ward details (admin only)."""
    db_ward = session.get(Ward, ward_id)
    if not db_ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    update_data = ward_in.model_dump(exclude_unset=True, exclude={"wardid"})
    if "wardhourtype" in update_data:
        update_data["wardhourtype"] = _normalize_ward_hour_type(update_data.get("wardhourtype"))
    db_ward.sqlmodel_update(update_data)
    session.add(db_ward)
    session.commit()
    session.refresh(db_ward)
    return db_ward


@router.patch("/{ward_id}/staffing", response_model=Ward)
def update_ward_staffing(
    ward_id: int,
    *,
    session: SessionDep,
    current_user: CurrentUser,
    body: WardStaffingIn,
):
    """Update the staffing requirements for a ward.

    Accessible by the ward's own nurse manager or a superuser.
    """
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    if not current_user.is_superuser and current_user.id != ward.managerid:
        raise HTTPException(status_code=403, detail="Not authorized to update this ward's staffing")
    ward.staffing_json = body.staffing_json
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return ward


@router.delete(
    "/{ward_id}",
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_ward(ward_id: int, session: SessionDep):
    """Delete a ward (admin only)."""
    db_ward = session.get(Ward, ward_id)
    if not db_ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    session.delete(db_ward)
    session.commit()
    return {"message": "Ward deleted successfully"}