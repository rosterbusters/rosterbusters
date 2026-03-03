from fastapi import APIRouter, HTTPException, Query, Depends
from app.models.roster import Ward
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from sqlmodel import select

router = APIRouter(prefix="/wards", tags=["wards"])


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
    db_ward = Ward.model_validate(ward_in, update={"wardid": None})
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
    db_ward.sqlmodel_update(update_data)
    session.add(db_ward)
    session.commit()
    session.refresh(db_ward)
    return db_ward


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