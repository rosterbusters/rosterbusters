import re
from typing import Literal, NamedTuple


StaffingRole = Literal["RN", "EN", "NA", "HCA12", "HCA3"]
RosterRank = Literal["A", "B", "C"]


class DesignationClassification(NamedTuple):
    staffing_role: StaffingRole | None
    roster_rank: RosterRank | None


def normalize_designation(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def classify_designation(value: str) -> DesignationClassification:
    normalized = normalize_designation(value)
    if not normalized:
        return DesignationClassification(None, None)

    manager_or_clinician_patterns = (
        "nurse manager",
        "nursing manager",
        "nurse clinician",
        "assistant nurse clinician",
        "senior nurse manager",
    )
    if any(pattern in normalized for pattern in manager_or_clinician_patterns):
        return DesignationClassification(None, None)

    if (
        normalized in {"rn", "ssn"}
        or "registered nurse" in normalized
        or "staff nurse" in normalized
    ):
        return DesignationClassification("RN", "A")

    if normalized == "en" or "enrolled nurse" in normalized:
        return DesignationClassification("EN", "B")

    if (
        normalized == "na"
        or "nursing aide" in normalized
        or "patient service asst" in normalized
        or "patient service assistant" in normalized
    ):
        return DesignationClassification("NA", "B")

    if (
        normalized in {"hca3", "hca 3"}
        or "healthcare assistant iii" in normalized
        or "healthcare asst iii" in normalized
        or "hca grade 3" in normalized
    ):
        return DesignationClassification("HCA3", "C")

    if (
        normalized in {"hca", "hca1", "hca 1", "hca2", "hca 2"}
        or "healthcare assistant" in normalized
        or "healthcare asst" in normalized
        or "hca grade 1" in normalized
        or "hca grade 2" in normalized
    ):
        return DesignationClassification("HCA12", "C")

    return DesignationClassification(None, None)
