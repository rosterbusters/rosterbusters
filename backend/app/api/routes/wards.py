from fastapi import APIRouter, HTTPException,Query
from app.models.roster import Ward
from app.api.deps import CurrentUser, SessionDep
from sqlmodel import select
router=APIRouter(prefix="/wards", tags=['wards'])

@router.get("/",response_model=list[Ward])
def get_wards(
    session:SessionDep
):
    statement=select(Ward).order_by(Ward.wardid.asc())
    return list(session.exec(statement).all())