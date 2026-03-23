import re
from typing import Literal, NamedTuple


StaffingRole = Literal["RN", "EN", "NA", "HCA12", "HCA3"]
RosterRank = Literal["A", "B", "C"]


class DesignationClassification(NamedTuple):
    staffing_role: StaffingRole | None
    roster_rank: RosterRank | None


_STAFFING_ROLE_TO_RANK: dict[StaffingRole, RosterRank] = {
    "RN": "A",
    "EN": "B",
    "NA": "B",
    "HCA12": "B",
    "HCA3": "C",
}

_CANONICAL_MAP: dict[str, tuple[StaffingRole, RosterRank]] = {
    "SN": ("RN", "A"),
    "SSN": ("RN", "A"),
    "HCA1": ("HCA12", "B"),
    "HCA2": ("HCA12", "B"),
    "SEN": ("EN", "B"),
    "EN": ("EN", "B"),
    "NA": ("NA", "B"),
    "HCA3": ("HCA3", "C"),
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


def classify_designation(value: str) -> DesignationClassification:
    tokens = _tokenize(value)
    if not tokens:
        return DesignationClassification(None, None)

    compact = "".join(tokens)
    canonical = _ALIASES.get(compact, compact)
    mapped = _CANONICAL_MAP.get(canonical)
    if not mapped:
        return DesignationClassification(None, None)

    return DesignationClassification(mapped[0], mapped[1])


def staffing_role_to_roster_rank(role: str | None) -> RosterRank | None:
    if role is None:
        return None
    return _STAFFING_ROLE_TO_RANK.get(role.upper())  # type: ignore[arg-type]
