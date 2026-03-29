import re
from typing import Literal, NamedTuple

from sqlmodel import Session, select

from app.models.designation import Designation


StaffingRole = Literal["RN", "EN", "NA", "HCA12", "HCA3"]
RosterRank = Literal["A", "B", "C"]


class DesignationClassification(NamedTuple):
    staffing_role: StaffingRole | None
    roster_rank: RosterRank | None



_CANONICAL_ROLE_MAP: dict[str, StaffingRole] = {
    "SN": "RN",
    "SSN": "RN",
    "HCA1": "HCA12",
    "HCA2": "HCA12",
    "SEN": "EN",
    "EN": "EN",
    "NA": "NA",
    "HCA3": "HCA3",
}

_STAFFING_ROLE_TO_CANONICAL: dict[StaffingRole, str] = {
    "RN": "SN",
    "EN": "EN",
    "NA": "NA",
    "HCA12": "HCA1",
    "HCA3": "HCA3",
}

_ALIASES: dict[str, str] = {
    # Staff/registered nurses
    "RN": "SN",
    "REGISTEREDNURSE": "SN",
    "STAFFNURSE": "SN",
    "STAFFNURSEI": "SN",
    "STAFFNURSEII": "SN",
    "SNRSTAFFNURSEI": "SSN",
    "SNRSTAFFNURSEII": "SSN",
    "SENIORSTAFFNURSE": "SSN",
    "SENIORSTAFFNURSEI": "SSN",
    "SENIORSTAFFNURSEII": "SSN",
    # Enrolled nurses
    "ENROLLEDNURSE": "EN",
    "ENROLLEDNURSEI": "EN",
    "ENROLLEDNURSEII": "EN",
    "SENIORENROLLEDNURSE": "SEN",
    "SENIORENROLLEDNURSEI": "SEN",
    "SENIORENROLLEDNURSEII": "SEN",
    "SNRENROLLEDNURSE": "SEN",
    "SNRENROLLEDNURSEI": "SEN",
    "SNRENROLLEDNURSEII": "SEN",
    # Nursing aides
    "NURSINGAIDE": "NA",
    "NURSINGAIDEI": "NA",
    "NURSINGAIDEII": "NA",
    "SENIORNURSINGAIDEI": "NA",
    "SENIORNURSINGAIDEII": "NA",

    # Healthcare assistants
    "HCA": "HCA1",
    "HCA1": "HCA1",
    "HCA2": "HCA2",
    "HCA3": "HCA3",
    "HEALTHCAREASSISTANT": "HCA1",
    "HEALTHCAREASSISTANTI": "HCA1",
    "HEALTHCAREASSISTANTII": "HCA2",
    "HEALTHCAREASSISTANTIII": "HCA3",
    "HEALTHCAREASST": "HCA1",
    "HEALTHCAREASSTI": "HCA1",
    "HEALTHCAREASSTII": "HCA2",
    "HEALTHCAREASSTIII": "HCA3",
    "SENIORHEALTHCAREASSISTANTI": "HCA1",
    "SENIORHEALTHCAREASSISTANTII": "HCA2",
}


def _tokenize(value: str) -> list[str]:
    cleaned = re.sub(r"[^A-Za-z0-9]+", " ", value or "").strip().upper()
    return cleaned.split()


def normalize_designation(value: str) -> str:
    tokens = _tokenize(value)
    return "".join(tokens)


def _resolve_canonical_designation(value: str) -> str | None:
    tokens = _tokenize(value)
    if not tokens:
        return None
    compact = "".join(tokens)
    return _ALIASES.get(compact, compact)


def canonical_designation_from_value(value: str) -> str | None:
    return _resolve_canonical_designation(value)


def load_designation_rank_map(session: Session) -> dict[str, str]:
    rows = session.exec(select(Designation)).all()
    return {str(row.designation).upper(): str(row.rank).upper() for row in rows}


def classify_designation_with_rank_map(
    rank_map: dict[str, str], value: str
) -> DesignationClassification:
    canonical = _resolve_canonical_designation(value)
    if not canonical:
        return DesignationClassification(None, None)

    rank = rank_map.get(canonical.upper())
    if not rank:
        return DesignationClassification(None, None)

    staffing_role = _CANONICAL_ROLE_MAP.get(canonical.upper())
    return DesignationClassification(staffing_role, rank)  # type: ignore[arg-type]


def classify_designation(session: Session, value: str) -> DesignationClassification:
    rank_map = load_designation_rank_map(session)
    return classify_designation_with_rank_map(rank_map, value)


def roster_rank_for_designation_with_rank_map(
    rank_map: dict[str, str], value: str
) -> RosterRank | None:
    canonical = _resolve_canonical_designation(value)
    if not canonical:
        return None
    rank = rank_map.get(canonical.upper())
    return rank  # type: ignore[return-value]


def roster_rank_for_designation(session: Session, value: str) -> RosterRank | None:
    rank_map = load_designation_rank_map(session)
    return roster_rank_for_designation_with_rank_map(rank_map, value)


def staffing_role_to_roster_rank(session: Session, role: str | None) -> RosterRank | None:
    if role is None:
        return None
    canonical = _STAFFING_ROLE_TO_CANONICAL.get(role.upper())  # type: ignore[arg-type]
    if not canonical:
        return None
    rank_map = load_designation_rank_map(session)
    rank = rank_map.get(canonical.upper())
    return rank  # type: ignore[return-value]
