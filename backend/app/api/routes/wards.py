import json

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from app.models.roster import Ward
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from sqlmodel import select
from app.rbac import user_has_role


class WardStaffingIn(BaseModel):
    """Full DailyStaffingGuideline serialised as a JSON string."""
    staffing_json: str

router = APIRouter(prefix="/wards", tags=["wards"])


def _normalize_ward_hour_type(value: str | None) -> str:
    normalized = (value or "8_HOURS").strip().upper()
    if normalized not in {"8_HOURS", "12_HOURS"}:
        raise HTTPException(status_code=400, detail="wardhourtype must be 8_HOURS or 12_HOURS")
    return normalized


def _coerce_requirement_value(value: object, *, field_name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=422, detail=f"{field_name} must be a number")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{field_name} must be a number") from exc


def _extract_requirement(
    payload: dict[str, object],
    role: str,
    shift: str,
) -> tuple[int, int | None]:
    role_data = payload.get(role, {})
    if not isinstance(role_data, dict):
        raise HTTPException(status_code=422, detail=f"{role} must be an object")

    shift_data = role_data.get(shift, {})
    if not isinstance(shift_data, dict):
        raise HTTPException(status_code=422, detail=f"{role}.{shift} must be an object")

    minimum = _coerce_requirement_value(
        shift_data.get("minimum"),
        field_name=f"{role}.{shift}.minimum",
    )
    maximum = _coerce_requirement_value(
        shift_data.get("maximum"),
        field_name=f"{role}.{shift}.maximum",
    )
    return minimum or 0, maximum


def _sum_maximums(maximums: list[int | None]) -> int | None:
    numeric_maximums = [value for value in maximums if value is not None]
    if len(numeric_maximums) != len(maximums):
        return None
    return sum(numeric_maximums)


def _sync_legacy_staffing_columns(ward: Ward, staffing_json: str) -> None:
    try:
        payload = json.loads(staffing_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="staffing_json must be valid JSON") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="staffing_json must decode to an object")

    for shift, prefix in (("A", "am"), ("P", "pm"), ("N", "nd")):
        rn_min, rn_max = _extract_requirement(payload, "RN", shift)
        en_min, en_max = _extract_requirement(payload, "EN", shift)
        na_min, na_max = _extract_requirement(payload, "NA", shift)
        hca12_min, hca12_max = _extract_requirement(payload, "HCA12", shift)
        hca3_min, hca3_max = _extract_requirement(payload, "HCA3", shift)

        rank_b_min = en_min + na_min + hca12_min
        rank_b_max = _sum_maximums([en_max, na_max, hca12_max])
        rank_c_min = hca3_min
        rank_c_max = hca3_max

        setattr(ward, f"{prefix}_rn", rn_min)
        if shift == "N":
            ward.nd_rn_max = rn_max
        setattr(ward, f"{prefix}_en_na_min", rank_b_min)
        setattr(ward, f"{prefix}_en_na_max", rank_b_max)
        setattr(ward, f"{prefix}_hca_min", rank_c_min)
        setattr(ward, f"{prefix}_hca_max", rank_c_max)
        setattr(ward, f"{prefix}_total", rn_min + rank_b_min + rank_c_min)


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

    Accessible by any nurse manager or admin.
    """
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    has_staffing_access = bool(current_user.email) and (
        user_has_role(session, current_user.email, "Admin")
        or user_has_role(session, current_user.email, "NurseManager")
    )

    if not has_staffing_access:
        raise HTTPException(status_code=403, detail="Not authorized to update this ward's staffing")
    ward.staffing_json = body.staffing_json
    _sync_legacy_staffing_columns(ward, body.staffing_json)
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
