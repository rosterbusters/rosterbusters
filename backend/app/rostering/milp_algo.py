# milp_algo.py
# MILP nurse rostering algorithm.
# Mirrors the logic in the later scheduling notebooks while remaining
# compatible with the algo_scheduler.py pipeline interface.
#
# Key notebook-aligned behaviour:
#   1. Coverage is strict by class: RN covers RN only, EN covers EN only,
#      HCA covers HCA only.
#   2. "RD" is treated as a true off-day (alongside DO and OFF).
#   3. Night shifts follow the scheduling notebook's strict N-N-DO model,
#      including carry-over handling across roster horizons.
#   4. Weekly caps remain notebook v14 defaults: <=2 night shifts and <=5
#      total worked shifts per week.
#   5. Objective defaults follow the notebook unless explicitly overridden.
#
# Expected call from algo_scheduler:
#   run_milp_pipeline(nurses, shifts, hard_requests, soft_requests, prev_last_shift, ward_name="DEFAULT")
#
# Input formats (as produced by algo_scheduler / validate_inputs):
#   nurses   : [{"id": int|str, "name": str, "rank": "A"|"B"|"C"}, ...]
#   shifts   : 14-element list of {"AM": {"A":int,"B":int,"C":int}, "PM":..., "NIGHT":...}
#   hard_requests : {nurse_id: [(day_idx_0based, shift_code), ...], ...} OR None
#                   — leave / non-working days only (AL, INHT, BL, …); enforced as hard constraints
#   soft_requests : {nurse_id: [(day_idx_0based, shift_code, priority), ...], ...} OR None
#                   — shift preferences; priority is "approved" (weight 5) or "pending" (weight 1)
#                   — both are soft: the solver tries to satisfy them but may override if needed
#   prev_last_shift : {nurse_id: "AM"|"PM"|"NIGHT"|"OFF"|"AL"|...} OR None
#   non_working_shift_codes : set[str] of DB shift codes that should count as non-working
#   ward_name: retained for pipeline compatibility; not used for hard-coded staffing

import random
import pandas as pd
from pyomo.common.errors import ApplicationError
from pyomo.environ import (
    ConcreteModel, Set, RangeSet, Var, Binary, NonNegativeReals,
    ConstraintList, Objective, minimize, SolverFactory, TerminationCondition,
)

# ---------------------------------------------------------------------------
# Public exception
# ---------------------------------------------------------------------------
class MILPError(Exception):
    """Raised when the MILP solver fails or finds no feasible solution."""
    pass


class MILPInfeasibilityError(MILPError):
    """Raised when roster inputs are deterministically infeasible."""
    pass


# ---------------------------------------------------------------------------
# Day-code classifier  (identical logic to the notebook)
# ---------------------------------------------------------------------------
_WORK_SHIFTS     = {"A", "P", "N"}
_OFF_CODES       = {"DO", "OFF", "RD"}   # RD is a true off-day (notebook v10)
_EQUIV_LEAVE     = {"AL", "HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}


def _classify(raw, non_working_shift_codes=None):
    """
    Returns (kind, val).
    kind in {"NONE", "WORK_SHIFT", "OFF", "EQUIV_LEAVE", "EQUIV_WORK"}
    """
    if raw is None:
        return ("NONE", "")
    s = str(raw).strip().upper()
    if s in ("", "NAN"):
        return ("NONE", "")
    if s in _WORK_SHIFTS:
        return ("WORK_SHIFT", s)
    if s in _OFF_CODES:
        return ("OFF", s)
    if s in _EQUIV_LEAVE:
        return ("EQUIV_LEAVE", s)
    if s in {str(code).upper() for code in (non_working_shift_codes or set())}:
        return ("EQUIV_WORK", s)
    return ("EQUIV_WORK", s)   # INHT / BL / …


# ---------------------------------------------------------------------------
# Extra nurse-constraint helpers
# ---------------------------------------------------------------------------
def _get_shift_pattern(nurse):
    raw = nurse.get("shift_pattern")
    if raw is None:
        return None
    normalized = str(raw).strip().upper()
    if normalized in {"AM_ONLY", "PM_ONLY"}:
        return normalized
    return None


def _has_no_night_constraint(nurse):
    if nurse.get("no_night"):
        return True
    for constraint in nurse.get("constraints") or []:
        constraint_type = str(
            constraint.get("constraint_type", constraint.get("type", ""))
        ).strip().upper()
        if constraint_type == "NO_NIGHT":
            return True
    return False


def _is_disallowed_milp_shift(milp_code, shift_pattern=None, no_night=False):
    if no_night and milp_code == "N":
        return True
    if shift_pattern == "AM_ONLY" and milp_code in {"P", "N"}:
        return True
    if shift_pattern == "PM_ONLY" and milp_code in {"A", "N"}:
        return True
    return False


# ---------------------------------------------------------------------------
# Prev-week carry-over helpers
# ---------------------------------------------------------------------------
def _normalize_last2(entry):
    """
    Accepts None, list/tuple of 2 codes, or dict with key 'last2'.
    Returns (code_day13, code_day14) as uppercase strings.
    """
    if entry is None:
        return ("", "")
    if isinstance(entry, dict):
        vals = entry.get("last2", ["", ""])
        if len(vals) < 2:
            vals = list(vals) + [""] * (2 - len(vals))
        return (str(vals[0]).strip().upper(), str(vals[1]).strip().upper())
    if isinstance(entry, (list, tuple)):
        vals = list(entry)
        if len(vals) < 2:
            vals = vals + [""] * (2 - len(vals))
        return (str(vals[0]).strip().upper(), str(vals[1]).strip().upper())
    return ("", "")


def _carry_state_from_last2(entry):
    """
    Returns one of:
      'NONE'      – no carry-in obligation
      'NEED_DO'   – previous horizon ended N,N → day 1 must be DO
      'NEED_N_DO' – previous horizon ended ?,N → day 1 must be N and day 2 must be DO
    """
    d13, d14 = _normalize_last2(entry)
    if d13 == "N" and d14 == "N":
        return "NEED_DO"
    if d14 == "N":
        return "NEED_N_DO"
    return "NONE"


# ---------------------------------------------------------------------------
# Input parser
# ---------------------------------------------------------------------------
def _parse_request_dict(
    nurses,
    num_days,
    requests,
    non_working_shift_codes=None,
    nurse_constraints_by_name=None,
    request_priority_weights=None,
):
    requests = requests or {}

    # Rank → class
    _rank_class = {"A": "RN", "B": "EN", "C": "HCA"}
    non_working_shift_codes = {
        str(code).upper() for code in (non_working_shift_codes or set())
    }
    _sched_to_milp = {
        "AM": "A",
        "PM": "P",
        "NIGHT": "N",
        "OFF": "DO",
        "RD":  "DO",   # RD is a true off-day (notebook v10)
        "AL": "AL",
    }

    id_to_nurse = {n["id"]: n for n in nurses}
    hard_rn, hard_en, hard_hca = {}, {}, {}
    request_priority_weights = request_priority_weights or {}

    for nurse_id, req_list in requests.items():
        nurse = id_to_nurse.get(nurse_id)
        if nurse is None:
            continue

        name = nurse["name"]
        cls = _rank_class.get(nurse["rank"])
        target = {"RN": hard_rn, "EN": hard_en, "HCA": hard_hca}.get(cls)
        if target is None:
            continue

        target.setdefault(name, {})
        nurse_constraints = (nurse_constraints_by_name or {}).get(name, {})
        shift_pattern = nurse_constraints.get("shift_pattern")
        no_night = bool(nurse_constraints.get("no_night"))
        for item in req_list:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            day_idx, shift_name = item[0], item[1]
            priority = str(item[2]).strip().lower() if len(item) >= 3 else None
            if 0 <= day_idx < num_days:
                normalized_shift = str(shift_name).upper()
                if normalized_shift in _OFF_CODES:
                    milp_code = "DO"
                elif normalized_shift == "AL" or normalized_shift in _EQUIV_LEAVE:
                    milp_code = normalized_shift  # preserve original code (HOL, MC, etc.)
                elif normalized_shift in non_working_shift_codes:
                    milp_code = normalized_shift
                else:
                    milp_code = _sched_to_milp.get(normalized_shift, normalized_shift)
                if _is_disallowed_milp_shift(milp_code, shift_pattern, no_night):
                    continue
                if priority is None:
                    target[name][f"Day {day_idx + 1}"] = milp_code
                else:
                    target[name][f"Day {day_idx + 1}"] = {
                        "code": milp_code,
                        "weight": float(request_priority_weights.get(priority, 1.0)),
                        "priority": priority,
                    }

    return hard_rn, hard_en, hard_hca


def _get_request_code(request_entry):
    if isinstance(request_entry, dict):
        return request_entry.get("code", "")
    return request_entry


def _get_request_weight(request_entry):
    if isinstance(request_entry, dict):
        try:
            return float(request_entry.get("weight", 1.0))
        except (TypeError, ValueError):
            return 1.0
    return 1.0


def _parse_prev_last_shift(nurses, prev_last_shift):
    """
    Convert previous-period carryover input into notebook-style last2 state.

    Accepted values per nurse_id:
      - "NIGHT" / "AM" / ...
      - ["A", "N"] or ("A", "N")
      - {"last2": ["A", "N"]}
    """
    prev_last_shift = prev_last_shift or {}
    _rank_class = {"A": "RN", "B": "EN", "C": "HCA"}
    id_to_nurse = {n["id"]: n for n in nurses}
    output = {"RN": {}, "EN": {}, "HCA": {}}

    for nurse_id, shift_value in prev_last_shift.items():
        nurse = id_to_nurse.get(nurse_id)
        if nurse is None:
            continue
        cls = _rank_class.get(nurse["rank"])
        if cls is None:
            continue

        if isinstance(shift_value, (list, tuple, dict)):
            day13, day14 = _normalize_last2(shift_value)
            if day13 or day14:
                output[cls][nurse["name"]] = [day13, day14]
            continue

        mapped = str(shift_value).strip().upper()
        if mapped == "NIGHT":
            output[cls][nurse["name"]] = ["", "N"]

    return output


def _parse_shift_requirements(shifts):
    """
    Convert API shift requirements into solver-friendly day/shift/class minima.
    """
    reqs = {}
    shift_map = {
        "AM": "A",
        "PM": "P",
        "NIGHT": "N",
    }
    rank_map = {
        "A": "RN",
        "B": "EN",
        "C": "HCA",
    }

    for day_idx, day_data in enumerate(shifts, start=1):
        day_reqs = {}
        for api_shift, milp_shift in shift_map.items():
            shift_data = day_data.get(api_shift, {}) or {}
            day_reqs[milp_shift] = {
                cls: int(shift_data.get(rank, 0) or 0)
                for rank, cls in rank_map.items()
            }
        reqs[day_idx] = day_reqs

    return reqs


def _parse_inputs(nurses, shifts, hard_requests, soft_requests, prev_last_shift, non_working_shift_codes=None):
    """
    Convert algo_scheduler-style inputs into notebook-style dicts.

    Returns
    -------
    dict with keys:
        rn_list, en_list, hca_list          - name lists
        hard_requests_rn/en/hca             - {name: {"Day X": code}}
        soft_requests_rn/en/hca             - {name: {"Day X": code}}
        annual_leave_rn/en/hca              - always {} (AL folded into requests)
        prev_week_last2_rn/en/hca          - {name: ["day13_code", "day14_code"]}
        num_days                            - int
    """
    num_days = len(shifts)

    # Rank → class
    _rank_class = {"A": "RN", "B": "EN", "C": "HCA"}

    rn_list, en_list, hca_list = [], [], []
    nurse_constraints_by_class = {"RN": {}, "EN": {}, "HCA": {}}
    for n in nurses:
        cls = _rank_class.get(n["rank"])
        if cls == "RN":
            rn_list.append(n["name"])
        elif cls == "EN":
            en_list.append(n["name"])
        elif cls == "HCA":
            hca_list.append(n["name"])
        if cls is not None:
            nurse_constraints_by_class[cls][n["name"]] = {
                "shift_pattern": _get_shift_pattern(n),
                "no_night": _has_no_night_constraint(n),
            }

    # Soft-request weights: approved shift requests carry higher weight than pending
    # but both remain soft — the solver may override either when scheduling constraints demand it.
    request_priority_weights = {
        "pending": 1.0,
        "approved": 5.0,
    }
    pending_weight = float(request_priority_weights.get("pending", 1.0))
    approved_weight = float(request_priority_weights.get("approved", pending_weight + 1.0))
    if approved_weight <= pending_weight:
        approved_weight = pending_weight + 1.0
    request_priority_weights["pending"] = pending_weight
    request_priority_weights["approved"] = approved_weight

    hard_rn, hard_en, hard_hca = _parse_request_dict(
        nurses,
        num_days,
        hard_requests,
        non_working_shift_codes,
        {
            **nurse_constraints_by_class["RN"],
            **nurse_constraints_by_class["EN"],
            **nurse_constraints_by_class["HCA"],
        },
    )
    soft_rn, soft_en, soft_hca = _parse_request_dict(
        nurses,
        num_days,
        soft_requests,
        non_working_shift_codes,
        {
            **nurse_constraints_by_class["RN"],
            **nurse_constraints_by_class["EN"],
            **nurse_constraints_by_class["HCA"],
        },
        request_priority_weights=request_priority_weights,
    )
    prev_roster = _parse_prev_last_shift(nurses, prev_last_shift)

    return {
        "rn_list":  rn_list,
        "en_list":  en_list,
        "hca_list": hca_list,
        "hard_requests_rn":  hard_rn,
        "hard_requests_en":  hard_en,
        "hard_requests_hca": hard_hca,
        "soft_requests_rn":  soft_rn,
        "soft_requests_en":  soft_en,
        "soft_requests_hca": soft_hca,
        "annual_leave_rn":   {},
        "annual_leave_en":   {},
        "annual_leave_hca":  {},
        "prev_week_last2_rn":  prev_roster["RN"],
        "prev_week_last2_en":  prev_roster["EN"],
        "prev_week_last2_hca": prev_roster["HCA"],
        "nurse_constraints_rn": nurse_constraints_by_class["RN"],
        "nurse_constraints_en": nurse_constraints_by_class["EN"],
        "nurse_constraints_hca": nurse_constraints_by_class["HCA"],
        "shift_requirements": _parse_shift_requirements(shifts),
        "num_days": num_days,
    }


def _average_daily_requirement(shift_requirements, class_name, shift_code):
    if not shift_requirements:
        return 0
    total = sum(
        int(shift_requirements.get(d, {}).get(shift_code, {}).get(class_name, 0) or 0)
        for d in shift_requirements
    )
    return round(total / max(len(shift_requirements), 1))


def _average_daily_total_requirement(shift_requirements, shift_code):
    if not shift_requirements:
        return 0
    total = sum(
        sum(
            int((shift_requirements.get(d, {}).get(shift_code, {}) or {}).get(class_name, 0) or 0)
            for class_name in ("RN", "EN", "HCA")
        )
        for d in shift_requirements
    )
    return round(total / max(len(shift_requirements), 1))


def _normalize_days(raw_days, num_days):
    if raw_days is None:
        return []
    normalized = []
    for day in raw_days:
        try:
            day_num = int(day)
        except (TypeError, ValueError):
            continue
        if 1 <= day_num <= num_days:
            normalized.append(day_num)
    return sorted(set(normalized))


def _resolve_requirement(class_cfg, shift_requirements, low_days, class_name, day, shift_code):
    if day in low_days and class_cfg.get("low_exact") is not None:
        return int(class_cfg.get("low_exact", {}).get(shift_code, 0) or 0)

    if class_cfg.get("normal_min") is not None:
        return int(class_cfg.get("normal_min", {}).get(shift_code, 0) or 0)

    return int(shift_requirements.get(day, {}).get(shift_code, {}).get(class_name, 0) or 0)


def _summarize_hard_requests(hard_dict, non_working_shift_codes=None):
    summary = {
        "work_shift": 0,
        "off": 0,
        "equiv_leave": 0,
        "equiv_work": 0,
        "night": 0,
        "isolated_night": 0,
    }
    for _, reqs in (hard_dict or {}).items():
        night_days = set()
        for day_label, raw in reqs.items():
            kind, val = _classify(raw, non_working_shift_codes)
            if kind == "WORK_SHIFT":
                summary["work_shift"] += 1
                if val == "N":
                    summary["night"] += 1
                    try:
                        night_days.add(int(str(day_label).split()[-1]))
                    except (TypeError, ValueError):
                        pass
            elif kind == "OFF":
                summary["off"] += 1
            elif kind == "EQUIV_LEAVE":
                summary["equiv_leave"] += 1
            elif kind == "EQUIV_WORK":
                summary["equiv_work"] += 1

        for day in night_days:
            if (day - 1) not in night_days and (day + 1) not in night_days:
                summary["isolated_night"] += 1
    return summary


def _debug_milp_feasibility(
    rn_nurses, en_nurses, hca_nurses,
    shift_requirements,
    rn_cfg, en_cfg, hca_cfg,
    low_days, num_days,
    equivalent_shift_target,
    weekly_work_cap, weekly_night_cap,
    total_min_cfg,
    hard_requests_rn, hard_requests_en, hard_requests_hca,
    annual_leave_rn, annual_leave_en, annual_leave_hca,
    prev_week_last2_rn, prev_week_last2_en, prev_week_last2_hca,
    non_working_shift_codes=None,
):
    classes = (
        ("RN", rn_nurses, rn_cfg, hard_requests_rn, annual_leave_rn, prev_week_last2_rn),
        ("EN", en_nurses, en_cfg, hard_requests_en, annual_leave_en, prev_week_last2_en),
        ("HCA", hca_nurses, hca_cfg, hard_requests_hca, annual_leave_hca, prev_week_last2_hca),
    )
    print(
        "[MILP DEBUG] settings="
        f"days={num_days} low_days={sorted(low_days)} eq_target={equivalent_shift_target} "
        f"weekly_work_cap={weekly_work_cap} weekly_night_cap={weekly_night_cap} total_min={dict(total_min_cfg or {})}"
    )

    total_required = {s: 0 for s in ("A", "P", "N")}
    for d in range(1, num_days + 1):
        for s in ("A", "P", "N"):
            total_required[s] += int((total_min_cfg or {}).get(s, 0) or 0)
    print(f"[MILP DEBUG] total_min_required={total_required}")

    for class_name, nurses, class_cfg, hard_dict, al_dict, prev_last2_dict in classes:
        req_totals = {
            s: sum(
                _resolve_requirement(class_cfg, shift_requirements, low_days, class_name, d, s)
                for d in range(1, num_days + 1)
            )
            for s in ("A", "P", "N")
        }
        req_total_all = sum(req_totals.values())
        nurse_count = len(nurses)
        max_equiv_capacity = nurse_count * equivalent_shift_target
        hard_summary = _summarize_hard_requests(hard_dict, non_working_shift_codes)
        leave_days = sum(len(v or []) for v in (al_dict or {}).values())
        carry_need_do = 0
        carry_need_n_do = 0
        day1_forced_night = 0
        day1_forced_off = 0
        for nurse in nurses:
            carry_state = _carry_state_from_last2((prev_last2_dict or {}).get(nurse))
            if carry_state == "NEED_DO":
                carry_need_do += 1
                day1_forced_off += 1
            elif carry_state == "NEED_N_DO":
                carry_need_n_do += 1
                day1_forced_night += 1
            raw_day1 = (hard_dict or {}).get(nurse, {}).get("Day 1", "")
            kind_day1, val_day1 = _classify(raw_day1, non_working_shift_codes)
            if kind_day1 == "WORK_SHIFT" and val_day1 == "N":
                day1_forced_night += 1
            elif kind_day1 == "OFF":
                day1_forced_off += 1

        print(
            f"[MILP DEBUG] {class_name}: nurses={nurse_count} req={req_totals} req_total={req_total_all} "
            f"max_equiv_capacity={max_equiv_capacity} leave_days={leave_days} "
            f"hard={hard_summary} carry_need_do={carry_need_do} carry_need_n_do={carry_need_n_do} "
            f"day1_forced_night={day1_forced_night} day1_forced_off={day1_forced_off}"
        )


# ---------------------------------------------------------------------------
# Output formatter
# ---------------------------------------------------------------------------
def _apply_do_rd_pattern(schedule: list) -> list:
    """Relabel every 2nd DO (OFF) as RD across the schedule in day order.
    Produces the DO → RD → DO → RD alternating rest-day pattern.
    Leave days and working shifts are left unchanged.
    """
    result = list(schedule)
    off_count = 0
    for i, code in enumerate(result):
        if code == "OFF":
            off_count += 1
            if off_count % 2 == 0:
                result[i] = "RD"
    return result


def _format_output(nurses, roster_rn, roster_en, roster_hca, num_days, solver_status="optimal"):
    """Convert DataFrames → standardised JSON matching GA output shape."""
    _milp_to_sched = {
        "A":    "AM",
        "P":    "PM",
        "N":    "NIGHT",
        "DO":   "OFF",
        "AL":   "AL",
        "INHT": "TRAINING",
        "BL":   "STUDY",
    }

    name_to_nurse = {n["name"]: n for n in nurses}
    output_nurses = []

    for rank_label, roster_df in (("A", roster_rn), ("B", roster_en), ("C", roster_hca)):
        if roster_df is None or roster_df.empty:
            continue
        for nurse_name in roster_df.index:
            if nurse_name not in name_to_nurse:
                continue
            nurse_info = name_to_nurse[nurse_name]
            schedule = []
            for day in range(1, num_days + 1):
                code = str(roster_df.loc[nurse_name, f"Day {day}"])
                schedule.append(_milp_to_sched.get(code, code))

            schedule = _apply_do_rd_pattern(schedule)

            stats = {
                "total_shifts": sum(1 for s in schedule if s in ("AM", "PM", "NIGHT")),
                "am_shifts":    schedule.count("AM"),
                "pm_shifts":    schedule.count("PM"),
                "night_shifts": schedule.count("NIGHT"),
                "days_off":     schedule.count("OFF") + schedule.count("RD"),
            }
            output_nurses.append({
                "id":       nurse_info["id"],
                "name":     nurse_info["name"],
                "rank":     nurse_info["rank"],
                "schedule": schedule,
                "stats":    stats,
            })

    output_nurses.sort(key=lambda x: x["id"])
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days":    num_days,
            "num_nurses":  len(output_nurses),
            "algorithm":   "MILP",
            "solver_status": solver_status,
        },
    }


def _is_infeasibility_error(exc):
    message = str(exc).lower()
    return "infeasible" in message or "no feasible" in message


def _validate_class_capacity(
    class_name,
    nurses,
    class_cfg,
    shift_requirements,
    low_days,
    num_days,
    equivalent_shift_target,
):
    req_totals = {
        s: sum(
            _resolve_requirement(class_cfg, shift_requirements, low_days, class_name, d, s)
            for d in range(1, num_days + 1)
        )
        for s in ("A", "P", "N")
    }
    req_total_all = sum(req_totals.values())
    max_equiv_capacity = len(nurses) * equivalent_shift_target
    if req_total_all <= max_equiv_capacity:
        return

    shortage = req_total_all - max_equiv_capacity
    raise MILPInfeasibilityError(
        f"{class_name} demand exceeds class capacity: required={req_total_all} "
        f"capacity={max_equiv_capacity} shortage={shortage} req={req_totals} "
        f"nurses={len(nurses)} eq_target={equivalent_shift_target}"
    )


# ---------------------------------------------------------------------------
# Core Pyomo solver  (mirrors the notebook's generate_multi_roster_pyomo)
# ---------------------------------------------------------------------------
def _solve(
    rn_list, en_list, hca_list,
    dept_name="DEFAULT",
    milp_config=None,
    shift_requirements=None,
    hard_requests_rn=None,  soft_requests_rn=None,
    annual_leave_rn=None,   prev_week_last2_rn=None,
    nurse_constraints_rn=None,
    hard_requests_en=None,  soft_requests_en=None,
    annual_leave_en=None,   prev_week_last2_en=None,
    nurse_constraints_en=None,
    hard_requests_hca=None, soft_requests_hca=None,
    annual_leave_hca=None,  prev_week_last2_hca=None,
    nurse_constraints_hca=None,
    non_working_shift_codes=None,
    solver_name="gurobi",
    weights=None,
    seed=None,
    time_limit=120,
):
    cfg = milp_config or {}
    rn_cfg   = cfg.get("RN", {})
    en_cfg   = cfg.get("EN", {})
    hca_cfg  = cfg.get("HCA", {})
    shift_requirements = shift_requirements or {}

    num_days = max(int(cfg.get("num_days", 0) or 0), len(shift_requirements) or 14)
    DAYS         = list(range(1, num_days + 1))
    SHIFTS       = ["A", "P", "N"]
    week_break = min(7, num_days)
    WEEK1        = list(range(1, week_break + 1))
    WEEK2        = list(range(week_break + 1, num_days + 1))
    WEEKEND_DAYS = _normalize_days(cfg.get("weekend_days", [6, 7, 13, 14]), num_days)
    LOW_DAYS     = set(_normalize_days(cfg.get("LOW_DAYS", []), num_days))
    equivalent_shift_target = int(cfg.get("equivalent_shift_target", 10) or 10)
    weekly_night_cap = int(cfg.get("weekly_night_cap", 2) or 2)
    weekly_work_cap = int(cfg.get("weekly_work_cap", 5) or 5)
    weekly_do_cap_raw = cfg.get("weekly_do_cap")
    weekly_do_cap = None if weekly_do_cap_raw in (None, "") else int(weekly_do_cap_raw)
    min_do_with_other_nonwork = int(cfg.get("min_do_with_other_nonwork", 2) or 2)
    weekend_night_target = float(cfg.get("weekend_night_target", 0.5) or 0.5)
    coverage_mode = str(cfg.get("coverage_mode", "strict_by_class")).strip().lower()
    total_min_cfg = cfg.get("TOTAL_MIN") or {}
    shift_priority_cfg = cfg.get("shift_priority", {}) or {}
    shift_priority_enabled = bool(shift_priority_cfg.get("enabled", False))
    shift_priority_order = [
        str(shift).strip().upper()
        for shift in shift_priority_cfg.get("order", ["A", "P", "N"])
        if str(shift).strip().upper() in SHIFTS
    ]
    if len(shift_priority_order) != 3:
        shift_priority_order = ["A", "P", "N"]
    shift_priority_gap_max = int(shift_priority_cfg.get("max_gap", 1) or 1)

    hard_requests_rn     = hard_requests_rn     or {}
    soft_requests_rn     = soft_requests_rn     or {}
    annual_leave_rn      = annual_leave_rn      or {}
    prev_week_last2_rn   = prev_week_last2_rn   or {}
    nurse_constraints_rn = nurse_constraints_rn or {}

    hard_requests_en     = hard_requests_en     or {}
    soft_requests_en     = soft_requests_en     or {}
    annual_leave_en      = annual_leave_en      or {}
    prev_week_last2_en   = prev_week_last2_en   or {}
    nurse_constraints_en = nurse_constraints_en or {}

    hard_requests_hca    = hard_requests_hca    or {}
    soft_requests_hca    = soft_requests_hca    or {}
    annual_leave_hca     = annual_leave_hca     or {}
    prev_week_last2_hca  = prev_week_last2_hca  or {}
    nurse_constraints_hca = nurse_constraints_hca or {}
    non_working_shift_codes = {
        str(code).upper() for code in (non_working_shift_codes or set())
    }

    if seed is None:
        seed = random.randint(0, 2**31)
    print(f"[MILP] Nurse ordering seed: {seed}")
    rng = random.Random(seed)
    rn_nurses  = list(rn_list);  rng.shuffle(rn_nurses)
    en_nurses  = list(en_list);  rng.shuffle(en_nurses)
    hca_nurses = list(hca_list); rng.shuffle(hca_nurses)
    _debug_milp_feasibility(
        rn_nurses,
        en_nurses,
        hca_nurses,
        shift_requirements,
        rn_cfg,
        en_cfg,
        hca_cfg,
        LOW_DAYS,
        num_days,
        equivalent_shift_target,
        weekly_work_cap,
        weekly_night_cap,
        total_min_cfg,
        hard_requests_rn,
        hard_requests_en,
        hard_requests_hca,
        annual_leave_rn,
        annual_leave_en,
        annual_leave_hca,
        prev_week_last2_rn,
        prev_week_last2_en,
        prev_week_last2_hca,
        non_working_shift_codes,
    )
    for class_name, nurses, class_cfg in (
        ("RN", rn_nurses, rn_cfg),
        ("EN", en_nurses, en_cfg),
        ("HCA", hca_nurses, hca_cfg),
    ):
        _validate_class_capacity(
            class_name,
            nurses,
            class_cfg,
            shift_requirements,
            LOW_DAYS,
            num_days,
            equivalent_shift_target,
        )

    _default_w = {
        "dev_shift": 1.0,
        "dev_day": 0.5,
        "AP": 3.0,
        "pref": 100.0,
        "weekend": 3.0,
        "rest": 25.0,
        "balance": 20.0,
        "day_smooth": 30.0,
        "day_smooth_hca": 15.0,
        "hca_morning": 20.0,
    }
    if weights is None:
        weights = cfg.get("weights")
    if weights is None:
        weights = _default_w
    else:
        tmp = _default_w.copy(); tmp.update(weights); weights = tmp

    # ---- Build model ----
    m = ConcreteModel()
    m.D   = RangeSet(1, num_days)
    m.S   = Set(initialize=SHIFTS)
    m.N_RN  = Set(initialize=rn_nurses)
    m.N_EN  = Set(initialize=en_nurses)
    m.N_HCA = Set(initialize=hca_nurses)

    m.x_rn  = Var(m.N_RN,  m.D, m.S, within=Binary)
    m.x_en  = Var(m.N_EN,  m.D, m.S, within=Binary)
    m.x_hca = Var(m.N_HCA, m.D, m.S, within=Binary)

    m.off_rn  = Var(m.N_RN,  m.D, within=Binary)
    m.off_en  = Var(m.N_EN,  m.D, within=Binary)
    m.off_hca = Var(m.N_HCA, m.D, within=Binary)

    # Night-block start variables.
    m.startN_rn  = Var(m.N_RN,  m.D, within=Binary)
    m.startN_en  = Var(m.N_EN,  m.D, within=Binary)
    m.startN_hca = Var(m.N_HCA, m.D, within=Binary)

    # Deviation variables for soft objectives
    for grp, nurses in (("rn", rn_nurses), ("en", en_nurses), ("hca", hca_nurses)):
        for attr in ("dev_A", "dev_P", "dev_N"):
            setattr(m, f"{attr}_{grp}", Var(getattr(m, f"N_{grp.upper()}"), within=NonNegativeReals))
        setattr(m, f"dev_day_{grp}",   Var(m.D, m.S, within=NonNegativeReals))
        setattr(m, f"dev_AP_{grp}",    Var(m.D,      within=NonNegativeReals))
        setattr(m, f"weekend_dev_{grp}", Var(getattr(m, f"N_{grp.upper()}"), within=NonNegativeReals))
        setattr(m, f"rest_violation_{grp}", Var(getattr(m, f"N_{grp.upper()}"), within=Binary))
        setattr(m, f"pref_violate_{grp}",   Var(getattr(m, f"N_{grp.upper()}"), m.D, within=Binary))

    # Extra v13 soft terms: RN/EN daily A-P-N balance and day-to-day smoothing.
    m.dev_rn_AP = Var(m.D, within=NonNegativeReals)
    m.dev_rn_AN = Var(m.D, within=NonNegativeReals)
    m.dev_rn_PN = Var(m.D, within=NonNegativeReals)
    m.dev_en_AP = Var(m.D, within=NonNegativeReals)
    m.dev_en_AN = Var(m.D, within=NonNegativeReals)
    m.dev_en_PN = Var(m.D, within=NonNegativeReals)
    m.dev_rn_day_total = Var(RangeSet(2, num_days), within=NonNegativeReals)
    m.dev_en_day_total = Var(RangeSet(2, num_days), within=NonNegativeReals)
    m.dev_hca_day_total = Var(RangeSet(2, num_days), within=NonNegativeReals)
    m.dev_hca_A_ge_P = Var(m.D, within=NonNegativeReals)
    m.dev_hca_A_ge_N = Var(m.D, within=NonNegativeReals)
    m.dev_hca_P_ge_N = Var(m.D, within=NonNegativeReals)

    m.cons = ConstraintList()

    # ---- Nurse rules ----
    def add_nurse_rules(class_nurses, x_var, off_var, startN_var,
                        al_dict, hard_dict, prev_week_last2_dict,
                        nurse_constraints_dict):
        for n in class_nurses:
            al_days            = set(al_dict.get(n, []))
            other_nonwork_days = set()
            carry_state = _carry_state_from_last2(prev_week_last2_dict.get(n))
            nurse_constraints = nurse_constraints_dict.get(n, {})
            shift_pattern = nurse_constraints.get("shift_pattern")
            no_night = bool(nurse_constraints.get("no_night"))
            preferred_shift = "A" if shift_pattern == "AM_ONLY" else "P" if shift_pattern == "PM_ONLY" else None

            # Scan hard requests to collect AL / INHT/BL days
            for d in DAYS:
                raw = _get_request_code(hard_dict.get(n, {}).get(f"Day {d}", ""))
                kind, _ = _classify(raw, non_working_shift_codes)
                if kind == "EQUIV_LEAVE":
                    al_days.add(d)
                elif kind == "EQUIV_WORK":
                    other_nonwork_days.add(d)
            nurse_constraints["nonwork_days"] = set(al_days) | set(other_nonwork_days)

            # Carry-in obligations from previous horizon
            if carry_state == "NEED_DO":
                # Previous horizon ended N,N → day 1 must be DO
                m.cons.add(off_var[n, 1] == 1)
                for s in SHIFTS:
                    m.cons.add(x_var[n, 1, s] == 0)

            elif carry_state == "NEED_N_DO":
                # Previous horizon ended ?,N → day 1 = N, day 2 = DO
                m.cons.add(off_var[n, 1] == 0)
                m.cons.add(x_var[n, 1, "N"] == 1)
                m.cons.add(x_var[n, 1, "A"] == 0)
                m.cons.add(x_var[n, 1, "P"] == 0)
                m.cons.add(off_var[n, 2] == 1)
                for s in SHIFTS:
                    m.cons.add(x_var[n, 2, s] == 0)

            # Daily linking
            for d in DAYS:
                # Skip days already forced by carry-in
                if carry_state == "NEED_DO" and d == 1:
                    continue
                if carry_state == "NEED_N_DO" and d in {1, 2}:
                    continue

                raw = _get_request_code(hard_dict.get(n, {}).get(f"Day {d}", ""))
                kind, val = _classify(raw, non_working_shift_codes)

                if no_night:
                    m.cons.add(x_var[n, d, "N"] == 0)
                if shift_pattern == "AM_ONLY":
                    m.cons.add(x_var[n, d, "P"] == 0)
                    m.cons.add(x_var[n, d, "N"] == 0)
                elif shift_pattern == "PM_ONLY":
                    m.cons.add(x_var[n, d, "A"] == 0)
                    m.cons.add(x_var[n, d, "N"] == 0)

                if kind == "WORK_SHIFT":
                    m.cons.add(off_var[n, d] == 0)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == (1 if s == val else 0))

                elif kind == "OFF":
                    m.cons.add(off_var[n, d] == 1)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == 0)

                elif kind in ("EQUIV_LEAVE", "EQUIV_WORK") or d in al_days or d in other_nonwork_days:
                    # AL / INHT / BL / … : non-working, NOT DO
                    m.cons.add(off_var[n, d] == 0)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == 0)

                else:
                    # Free day: exactly one of work-shifts or DO
                    m.cons.add(sum(x_var[n, d, s] for s in SHIFTS) + off_var[n, d] == 1)

            fixed_equivalent_days = len(al_days) + len(other_nonwork_days)
            equivalent_days = (
                sum(x_var[n, d, s] for d in DAYS for s in SHIFTS)
                + fixed_equivalent_days
            )
            if preferred_shift is None:
                m.cons.add(equivalent_days == equivalent_shift_target)

            # Weekly caps / permanent shift pattern
            if preferred_shift is None:
                if WEEK1:
                    m.cons.add(sum(x_var[n, d, "N"] for d in WEEK1) <= weekly_night_cap)
                    m.cons.add(sum(x_var[n, d, s] for d in WEEK1 for s in SHIFTS) <= weekly_work_cap)
                if WEEK2:
                    m.cons.add(sum(x_var[n, d, "N"] for d in WEEK2) <= weekly_night_cap)
                    m.cons.add(sum(x_var[n, d, s] for d in WEEK2 for s in SHIFTS) <= weekly_work_cap)
            else:
                for week_days in (WEEK1, WEEK2):
                    if not week_days:
                        continue
                    week_other_nonwork = sum(
                        1 for d in week_days if d in al_days or d in other_nonwork_days
                    )
                    free_days = max(0, len(week_days) - week_other_nonwork)
                    preferred_target = min(4, free_days)
                    off_target = free_days - preferred_target
                    m.cons.add(sum(x_var[n, d, preferred_shift] for d in week_days) == preferred_target)
                    m.cons.add(sum(off_var[n, d] for d in week_days) == off_target)

            if weekly_do_cap is not None:
                if WEEK1 and not any(d in WEEK1 for d in al_days | other_nonwork_days):
                    m.cons.add(sum(off_var[n, d] for d in WEEK1) <= weekly_do_cap)
                if WEEK2 and not any(d in WEEK2 for d in al_days | other_nonwork_days):
                    m.cons.add(sum(off_var[n, d] for d in WEEK2) <= weekly_do_cap)

            if min_do_with_other_nonwork > 0:
                if any(d in WEEK1 for d in other_nonwork_days):
                    m.cons.add(sum(off_var[n, d] for d in WEEK1) >= min_do_with_other_nonwork)
                if any(d in WEEK2 for d in other_nonwork_days):
                    m.cons.add(sum(off_var[n, d] for d in WEEK2) >= min_do_with_other_nonwork)

            # ---- N-N-DO block rules ----
            if no_night or preferred_shift is not None:
                for d in DAYS:
                    m.cons.add(startN_var[n, d] == 0)
                continue

            # No two block starts on consecutive days
            for d in range(1, num_days):
                m.cons.add(startN_var[n, d] + startN_var[n, d + 1] <= 1)

            # If a block starts on day d → d and d+1 are N, d+2 is DO
            for d in range(1, max(num_days - 1, 1)):
                m.cons.add(x_var[n, d,     "N"] >= startN_var[n, d])
                m.cons.add(x_var[n, d + 1, "N"] >= startN_var[n, d])
                if d + 2 <= num_days:
                    m.cons.add(off_var[n, d + 2]    >= startN_var[n, d])

            # Penultimate-day start → last two days are N (next horizon handles the DO)
            if num_days >= 2:
                m.cons.add(x_var[n, num_days - 1, "N"] >= startN_var[n, num_days - 1])
                m.cons.add(x_var[n, num_days, "N"] >= startN_var[n, num_days - 1])

            # Last-day start → last day is N (next horizon handles N,DO)
            m.cons.add(x_var[n, num_days, "N"] >= startN_var[n, num_days])

            # Every N must belong to exactly one valid block
            if carry_state == "NEED_N_DO":
                # Day 1 may be the second N from the previous horizon's block.
                m.cons.add(x_var[n, 1, "N"] == 1)
                m.cons.add(startN_var[n, 1] == 0)
            else:
                m.cons.add(x_var[n, 1, "N"] == startN_var[n, 1])

            for d in range(2, num_days + 1):
                m.cons.add(
                    x_var[n, d, "N"] == startN_var[n, d] + startN_var[n, d - 1]
                )

    add_nurse_rules(rn_nurses,  m.x_rn,  m.off_rn,  m.startN_rn,
                    annual_leave_rn,  hard_requests_rn,  prev_week_last2_rn,
                    nurse_constraints_rn)
    add_nurse_rules(en_nurses,  m.x_en,  m.off_en,  m.startN_en,
                    annual_leave_en,  hard_requests_en,  prev_week_last2_en,
                    nurse_constraints_en)
    add_nurse_rules(hca_nurses, m.x_hca, m.off_hca, m.startN_hca,
                    annual_leave_hca, hard_requests_hca, prev_week_last2_hca,
                    nurse_constraints_hca)

    # ---- Coverage constraints (strict by class only, notebook v14) ----
    def _req_for_day(class_name, class_cfg, d, s):
        return _resolve_requirement(class_cfg, shift_requirements, LOW_DAYS, class_name, d, s)

    # Pre-compute per-(day, shift) coverage sums once and reuse across all
    # constraint sections to avoid rebuilding identical Pyomo expressions.
    _cov_rn  = {(d, s): sum(m.x_rn[n,  d, s] for n in rn_nurses)  for d in DAYS for s in SHIFTS}
    _cov_en  = {(d, s): sum(m.x_en[n,  d, s] for n in en_nurses)  for d in DAYS for s in SHIFTS}
    _cov_hca = {(d, s): sum(m.x_hca[n, d, s] for n in hca_nurses) for d in DAYS for s in SHIFTS}

    for d in DAYS:
        for s in SHIFTS:
            r_req = _req_for_day("RN", rn_cfg, d, s)
            e_req = _req_for_day("EN", en_cfg, d, s)
            h_req = _req_for_day("HCA", hca_cfg, d, s)

            c_rn  = _cov_rn[(d, s)]
            c_en  = _cov_en[(d, s)]
            c_hca = _cov_hca[(d, s)]

            m.cons.add(c_rn >= r_req)
            m.cons.add(c_en >= e_req)
            m.cons.add(c_hca >= h_req)

    if total_min_cfg:
        for d in DAYS:
            for s in SHIFTS:
                total_required = int(total_min_cfg.get(s, 0) or 0)
                if total_required <= 0:
                    continue
                total_coverage = _cov_rn[(d, s)] + _cov_en[(d, s)] + _cov_hca[(d, s)]
                m.cons.add(total_coverage >= total_required)

    # ---- v13 RN/EN consecutive-day staffing smoothing ----
    for d in range(2, num_days + 1):
        rn_total_today = sum(m.x_rn[n, d, s] for n in rn_nurses for s in SHIFTS)
        rn_total_prev  = sum(m.x_rn[n, d - 1, s] for n in rn_nurses for s in SHIFTS)
        m.cons.add(rn_total_today - rn_total_prev <= m.dev_rn_day_total[d])
        m.cons.add(rn_total_prev - rn_total_today <= m.dev_rn_day_total[d])

        en_total_today = sum(m.x_en[n, d, s] for n in en_nurses for s in SHIFTS)
        en_total_prev  = sum(m.x_en[n, d - 1, s] for n in en_nurses for s in SHIFTS)
        m.cons.add(en_total_today - en_total_prev <= m.dev_en_day_total[d])
        m.cons.add(en_total_prev - en_total_today <= m.dev_en_day_total[d])

        hca_total_today = sum(m.x_hca[n, d, s] for n in hca_nurses for s in SHIFTS)
        hca_total_prev  = sum(m.x_hca[n, d - 1, s] for n in hca_nurses for s in SHIFTS)
        m.cons.add(hca_total_today - hca_total_prev <= m.dev_hca_day_total[d])
        m.cons.add(hca_total_prev - hca_total_today <= m.dev_hca_day_total[d])

    for class_name, class_cfg, cov_map in (("RN", rn_cfg, _cov_rn), ("EN", en_cfg, _cov_en), ("HCA", hca_cfg, _cov_hca)):
        max_night_per_day = class_cfg.get("max_night_per_day")
        for d in DAYS:
            if max_night_per_day is not None:
                m.cons.add(cov_map[(d, "N")] <= int(max_night_per_day))

    # ---- Shift-balance deviations (soft) ----
    def add_shift_balance(
        class_nurses,
        x_var,
        dev_A,
        dev_P,
        dev_N,
        class_cfg,
        class_name,
        nurse_constraints_dict,
    ):
        st = class_cfg.get("shift_target", {
            "A": round(sum(_req_for_day(class_name, class_cfg, d, "A") for d in DAYS) / max(len(class_nurses), 1)),
            "P": round(sum(_req_for_day(class_name, class_cfg, d, "P") for d in DAYS) / max(len(class_nurses), 1)),
            "N": round(sum(_req_for_day(class_name, class_cfg, d, "N") for d in DAYS) / max(len(class_nurses), 1)),
        })
        tA, tP, tN = st["A"], st["P"], st["N"]
        for n in class_nurses:
            nurse_constraints = nurse_constraints_dict.get(n, {})
            shift_pattern = nurse_constraints.get("shift_pattern")
            no_night = bool(nurse_constraints.get("no_night"))
            nonwork_days = set(nurse_constraints.get("nonwork_days", set()))
            tA_ = sum(x_var[n, d, "A"] for d in DAYS)
            tP_ = sum(x_var[n, d, "P"] for d in DAYS)
            tN_ = sum(x_var[n, d, "N"] for d in DAYS)
            if shift_pattern == "AM_ONLY":
                fixed_target = sum(
                    min(
                        4,
                        max(
                            0,
                            len(week_days)
                            - sum(
                                1
                                for d in week_days
                                if d in nonwork_days
                            ),
                        ),
                    )
                    for week_days in (WEEK1, WEEK2)
                    if week_days
                )
                m.cons.add(tA_ == fixed_target)
                m.cons.add(dev_A[n] == 0)
                m.cons.add(dev_P[n] == 0)
                m.cons.add(dev_N[n] == 0)
                continue
            if shift_pattern == "PM_ONLY":
                fixed_target = sum(
                    min(
                        4,
                        max(
                            0,
                            len(week_days)
                            - sum(
                                1
                                for d in week_days
                                if d in nonwork_days
                            ),
                        ),
                    )
                    for week_days in (WEEK1, WEEK2)
                    if week_days
                )
                m.cons.add(tP_ == fixed_target)
                m.cons.add(dev_A[n] == 0)
                m.cons.add(dev_P[n] == 0)
                m.cons.add(dev_N[n] == 0)
                continue
            m.cons.add(tA_ - tA <= dev_A[n]); m.cons.add(-(tA_ - tA) <= dev_A[n])
            m.cons.add(tP_ - tP <= dev_P[n]); m.cons.add(-(tP_ - tP) <= dev_P[n])
            m.cons.add(tN_ - tN <= dev_N[n]); m.cons.add(-(tN_ - tN) <= dev_N[n])

    add_shift_balance(rn_nurses,  m.x_rn,  m.dev_A_rn,  m.dev_P_rn,  m.dev_N_rn,  rn_cfg,  "RN", nurse_constraints_rn)
    add_shift_balance(en_nurses,  m.x_en,  m.dev_A_en,  m.dev_P_en,  m.dev_N_en,  en_cfg,  "EN", nurse_constraints_en)
    add_shift_balance(hca_nurses, m.x_hca, m.dev_A_hca, m.dev_P_hca, m.dev_N_hca, hca_cfg, "HCA", nurse_constraints_hca)

    # ---- Daily smoothing + A–P balance (soft) ----
    dt_rn  = rn_cfg.get("day_target",  {s: _average_daily_requirement(shift_requirements, "RN", s) for s in SHIFTS})
    dt_en  = en_cfg.get("day_target",  {s: _average_daily_requirement(shift_requirements, "EN", s) for s in SHIFTS})
    dt_hca = hca_cfg.get("day_target", {s: _average_daily_requirement(shift_requirements, "HCA", s) for s in SHIFTS})

    for d in DAYS:
        for s in SHIFTS:
            y = _cov_rn[(d, s)]
            t = dt_rn[s]
            m.cons.add(y - t <= m.dev_day_rn[d, s])
            m.cons.add(-(y - t) <= m.dev_day_rn[d, s])

        for s in SHIFTS:
            y = _cov_en[(d, s)]; t = dt_en[s]
            m.cons.add(y - t <= m.dev_day_en[d, s])
            m.cons.add(-(y - t) <= m.dev_day_en[d, s])

        for s in SHIFTS:
            y = _cov_hca[(d, s)]; t = dt_hca[s]
            m.cons.add(y - t <= m.dev_day_hca[d, s])
            m.cons.add(-(y - t) <= m.dev_day_hca[d, s])

        # A–P balance
        A_rn = _cov_rn[(d, "A")]
        P_rn = _cov_rn[(d, "P")]
        m.cons.add(A_rn - P_rn <= m.dev_AP_rn[d]); m.cons.add(-(A_rn - P_rn) <= m.dev_AP_rn[d])

        A_en = _cov_en[(d, "A")]
        P_en = _cov_en[(d, "P")]
        m.cons.add(A_en - P_en <= m.dev_AP_en[d]); m.cons.add(-(A_en - P_en) <= m.dev_AP_en[d])

        A_h = _cov_hca[(d, "A")]
        P_h = _cov_hca[(d, "P")]
        N_h = _cov_hca[(d, "N")]
        m.cons.add(A_h - P_h <= m.dev_AP_hca[d]); m.cons.add(-(A_h - P_h) <= m.dev_AP_hca[d])
        m.cons.add(P_h - A_h <= m.dev_hca_A_ge_P[d])
        m.cons.add(N_h - A_h <= m.dev_hca_A_ge_N[d])
        m.cons.add(N_h - P_h <= m.dev_hca_P_ge_N[d])

        # v13 daily RN/EN class-level balance across all shift pairs.
        A_rn = _cov_rn[(d, "A")]
        P_rn = _cov_rn[(d, "P")]
        N_rn = _cov_rn[(d, "N")]
        m.cons.add(A_rn - P_rn <= m.dev_rn_AP[d]); m.cons.add(P_rn - A_rn <= m.dev_rn_AP[d])
        m.cons.add(A_rn - N_rn <= m.dev_rn_AN[d]); m.cons.add(N_rn - A_rn <= m.dev_rn_AN[d])
        m.cons.add(P_rn - N_rn <= m.dev_rn_PN[d]); m.cons.add(N_rn - P_rn <= m.dev_rn_PN[d])

        A_en = _cov_en[(d, "A")]
        P_en = _cov_en[(d, "P")]
        N_en = _cov_en[(d, "N")]
        m.cons.add(A_en - P_en <= m.dev_en_AP[d]); m.cons.add(P_en - A_en <= m.dev_en_AP[d])
        m.cons.add(A_en - N_en <= m.dev_en_AN[d]); m.cons.add(N_en - A_en <= m.dev_en_AN[d])
        m.cons.add(P_en - N_en <= m.dev_en_PN[d]); m.cons.add(N_en - P_en <= m.dev_en_PN[d])

    # ---- Soft preferences ----
    def add_soft_prefs(class_nurses, x_var, hard_dict, soft_dict, pref_viol):
        for n in class_nurses:
            for d in DAYS:
                hard_raw = _get_request_code(hard_dict.get(n, {}).get(f"Day {d}", ""))
                if _classify(hard_raw, non_working_shift_codes)[0] != "NONE":
                    continue  # hard request already pinned this day
                soft_raw = _get_request_code(soft_dict.get(n, {}).get(f"Day {d}", ""))
                kind, val = _classify(soft_raw, non_working_shift_codes)
                if kind == "WORK_SHIFT":
                    m.cons.add(x_var[n, d, val] >= 1 - pref_viol[n, d])
                elif kind in ("OFF", "EQUIV_LEAVE", "EQUIV_WORK"):
                    m.cons.add(sum(x_var[n, d, s] for s in SHIFTS) <= pref_viol[n, d])

    add_soft_prefs(rn_nurses,  m.x_rn,  hard_requests_rn,  soft_requests_rn,  m.pref_violate_rn)
    add_soft_prefs(en_nurses,  m.x_en,  hard_requests_en,  soft_requests_en,  m.pref_violate_en)
    add_soft_prefs(hca_nurses, m.x_hca, hard_requests_hca, soft_requests_hca, m.pref_violate_hca)

    # ---- Weekend fairness ----
    def add_weekend_fair(class_nurses, x_var, wdev):
        for n in class_nurses:
            wn = sum(x_var[n, d, "N"] for d in WEEKEND_DAYS)
            m.cons.add(wn - weekend_night_target <= wdev[n])
            m.cons.add(-(wn - weekend_night_target) <= wdev[n])

    add_weekend_fair(rn_nurses,  m.x_rn,  m.weekend_dev_rn)
    add_weekend_fair(en_nurses,  m.x_en,  m.weekend_dev_en)
    add_weekend_fair(hca_nurses, m.x_hca, m.weekend_dev_hca)

    # ---- Previous-week rest (uses last-2-days carry-over) ----
    def add_prev_week_constraints(class_nurses, x_var, prev_week_last2_dict, rest_viol):
        for n in class_nurses:
            _, prev_last = _normalize_last2(prev_week_last2_dict.get(n))
            if prev_last == "N":
                # Previous horizon's last day was N → rest violation if day 1 is worked
                worked_day1 = sum(x_var[n, 1, s] for s in SHIFTS)
                m.cons.add(rest_viol[n] >= worked_day1)
            else:
                m.cons.add(rest_viol[n] >= 0)

    add_prev_week_constraints(rn_nurses,  m.x_rn,  prev_week_last2_rn,  m.rest_violation_rn)
    add_prev_week_constraints(en_nurses,  m.x_en,  prev_week_last2_en,  m.rest_violation_en)
    add_prev_week_constraints(hca_nurses, m.x_hca, prev_week_last2_hca, m.rest_violation_hca)

    # ---- Objective ----
    pref_weight_rn = {
        (n, d): _get_request_weight(soft_requests_rn.get(n, {}).get(f"Day {d}", ""))
        for n in rn_nurses for d in DAYS
    }
    pref_weight_en = {
        (n, d): _get_request_weight(soft_requests_en.get(n, {}).get(f"Day {d}", ""))
        for n in en_nurses for d in DAYS
    }
    pref_weight_hca = {
        (n, d): _get_request_weight(soft_requests_hca.get(n, {}).get(f"Day {d}", ""))
        for n in hca_nurses for d in DAYS
    }
    lw = weights
    m.obj = Objective(
        expr=(
            lw["dev_shift"] * sum(m.dev_A_rn[n] + m.dev_P_rn[n] + 2*m.dev_N_rn[n] for n in rn_nurses)
          # Notebook v14 leaves RN daily target/AP deviation terms disabled.
          + lw["pref"]      * sum(pref_weight_rn[n, d] * m.pref_violate_rn[n, d] for n in rn_nurses for d in DAYS)
          + lw["weekend"]   * sum(m.weekend_dev_rn[n] for n in rn_nurses)
          + lw["rest"]      * sum(m.rest_violation_rn[n] for n in rn_nurses)

            + lw["dev_shift"] * sum(m.dev_A_en[n] + m.dev_P_en[n] + 2*m.dev_N_en[n] for n in en_nurses)
          # Notebook v14 leaves EN daily target/AP deviation terms disabled.
          + lw["pref"]      * sum(pref_weight_en[n, d] * m.pref_violate_en[n, d] for n in en_nurses for d in DAYS)
          + lw["weekend"]   * sum(m.weekend_dev_en[n] for n in en_nurses)
          + lw["rest"]      * sum(m.rest_violation_en[n] for n in en_nurses)

          + lw["dev_shift"] * sum(m.dev_A_hca[n] + m.dev_P_hca[n] + 2*m.dev_N_hca[n] for n in hca_nurses)
          + lw["dev_day"]   * sum(m.dev_day_hca[d, s] for d in DAYS for s in SHIFTS)
          + lw["AP"]        * sum(m.dev_AP_hca[d] for d in DAYS)
          + lw["pref"]      * sum(pref_weight_hca[n, d] * m.pref_violate_hca[n, d] for n in hca_nurses for d in DAYS)
          + lw["weekend"]   * sum(m.weekend_dev_hca[n] for n in hca_nurses)
          + lw["rest"]      * sum(m.rest_violation_hca[n] for n in hca_nurses)
          + lw["balance"]   * (
                sum(m.dev_rn_AP[d] + m.dev_rn_AN[d] + m.dev_rn_PN[d] for d in DAYS)
              + sum(m.dev_en_AP[d] + m.dev_en_AN[d] + m.dev_en_PN[d] for d in DAYS)
            )
          + lw["day_smooth"] * (
                sum(m.dev_rn_day_total[d] for d in range(2, num_days + 1))
              + sum(m.dev_en_day_total[d] for d in range(2, num_days + 1))
            )
          + lw["day_smooth_hca"] * sum(m.dev_hca_day_total[d] for d in range(2, num_days + 1))
          + lw["hca_morning"] * sum(
                m.dev_hca_A_ge_P[d] + m.dev_hca_A_ge_N[d] + m.dev_hca_P_ge_N[d]
                for d in DAYS
            )
        ),
        sense=minimize,
    )

    # ---- Solve ----
    solver = SolverFactory(solver_name)
    if solver is None:
        raise RuntimeError(f"MILP solver '{solver_name}' is not available")

    try:
        is_available = solver.available(False)
    except TypeError:
        is_available = solver.available()
    except Exception as exc:
        raise RuntimeError(
            f"MILP solver '{solver_name}' availability check failed: {exc}"
        ) from exc

    if not is_available:
        raise RuntimeError(f"MILP solver '{solver_name}' is not available")

    # Gurobi uses "TimeLimit"; CBC uses "seconds". Adjust if using a different solver.
    if time_limit is not None:
        solver.options["TimeLimit"] = time_limit
    if solver_name == "gurobi":
        solver.options["MIPGap"]   = 0.02  # 2% gap — sufficient for nurse schedules
        solver.options["Threads"]  = 0     # 0 = use all available cores
        solver.options["Method"]   = 2     # Barrier LP relaxation (faster for large MIPs)
        solver.options["Presolve"] = 2     # Aggressive presolve

    try:
        res = solver.solve(m, tee=False)
    except ApplicationError as exc:
        raise RuntimeError(
            f"MILP solver '{solver_name}' could not be executed: {exc}"
        ) from exc

    tc = res.solver.termination_condition
    if tc not in {TerminationCondition.optimal, TerminationCondition.maxTimeLimit}:
        raise RuntimeError(
            f"{dept_name} infeasible or not optimal: {tc}"
        )
    if tc == TerminationCondition.maxTimeLimit:
        print(f"[MILP] Warning: {dept_name} hit time limit ({time_limit}s) — solution may be suboptimal")

    # ---- Build output DataFrames ----
    days_cols = [f"Day {d}" for d in DAYS]
    roster_rn  = pd.DataFrame(index=rn_nurses,  columns=days_cols)
    roster_en  = pd.DataFrame(index=en_nurses,  columns=days_cols)
    roster_hca = pd.DataFrame(index=hca_nurses, columns=days_cols)

    def fill_roster(df, class_nurses, x_var, off_var, hard_dict):
        for n in class_nurses:
            for d in DAYS:
                key = f"Day {d}"
                raw = hard_dict.get(n, {}).get(key, "")
                kind, val = _classify(raw, non_working_shift_codes)
                if kind in ("OFF", "EQUIV_LEAVE", "EQUIV_WORK"):
                    df.loc[n, key] = val
                elif off_var[n, d]() and off_var[n, d]() > 0.5:
                    df.loc[n, key] = "DO"
                else:
                    assigned = next(
                        (s for s in SHIFTS if x_var[n, d, s]() and x_var[n, d, s]() > 0.5),
                        None
                    )
                    df.loc[n, key] = assigned if assigned else "DO"
        return df.reindex(sorted(df.index)).copy()

    roster_rn  = fill_roster(roster_rn,  rn_nurses,  m.x_rn,  m.off_rn,  hard_requests_rn)
    roster_en  = fill_roster(roster_en,  en_nurses,  m.x_en,  m.off_en,  hard_requests_en)
    roster_hca = fill_roster(roster_hca, hca_nurses, m.x_hca, m.off_hca, hard_requests_hca)

    print(f"{dept_name} roster built: RN={len(rn_nurses)}, EN={len(en_nurses)}, HCA={len(hca_nurses)}")
    return roster_rn, roster_en, roster_hca, tc


# ---------------------------------------------------------------------------
# Public entry point (called by algo_scheduler.py)
# ---------------------------------------------------------------------------
def run_milp_pipeline(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    non_working_shift_codes=None,
    ward_name="DEFAULT",
    milp_config=None,
    progress_callback=None,
    seed=None,
    time_limit=None,
):
    """
    Main entry point for MILP nurse rostering.

    Parameters
    ----------
    nurses      : list of {"id", "name", "rank"} dicts  (rank A/B/C)
    shifts      : 14-element list of per-day shift-requirement dicts
    hard_requests : leave / non-working day entries (AL, INHT, BL, …) — enforced as hard constraints
    soft_requests : shift preferences with optional priority ("approved" or "pending").
                    Approved requests carry weight 5; pending carry weight 1.
                    Both are soft — the solver satisfies them where possible but may override.
    prev_last_shift : optional previous-period final shift per nurse
    non_working_shift_codes : optional non-working DB shift codes
    ward_name   : retained for pipeline compatibility / logging
    milp_config : optional tuning override dict (typically derived from staffing_json)
                  for soft targets and penalties; hard coverage always comes from shifts

    Returns
    -------
    Standardised roster dict (same shape as GA output)
    """
    if time_limit is None:
        time_limit = max(60, min(300, len(nurses) * 5))
    print("[MILP] Starting MILP roster generation")
    if progress_callback:
        progress_callback(0, 4, 0.0)

    parsed = _parse_inputs(
        nurses,
        shifts,
        hard_requests,
        soft_requests,
        prev_last_shift,
        non_working_shift_codes,
    )

    print(f"[MILP] Inputs parsed — {len(nurses)} nurses, {len(shifts)} days")
    if progress_callback:
        progress_callback(1, 4, 0.0)

    print("[MILP] Building model and running solver (this may take a moment)...")
    if progress_callback:
        progress_callback(2, 4, 0.0)

    try:
        roster_rn, roster_en, roster_hca, tc = _solve(
            rn_list=parsed["rn_list"],
            en_list=parsed["en_list"],
            hca_list=parsed["hca_list"],
            dept_name=ward_name,
            milp_config=milp_config,
            shift_requirements=parsed["shift_requirements"],
            hard_requests_rn=parsed["hard_requests_rn"],
            soft_requests_rn=parsed["soft_requests_rn"],
            annual_leave_rn=parsed["annual_leave_rn"],
            prev_week_last2_rn=parsed["prev_week_last2_rn"],
            nurse_constraints_rn=parsed["nurse_constraints_rn"],
            hard_requests_en=parsed["hard_requests_en"],
            soft_requests_en=parsed["soft_requests_en"],
            annual_leave_en=parsed["annual_leave_en"],
            prev_week_last2_en=parsed["prev_week_last2_en"],
            nurse_constraints_en=parsed["nurse_constraints_en"],
            hard_requests_hca=parsed["hard_requests_hca"],
            soft_requests_hca=parsed["soft_requests_hca"],
            annual_leave_hca=parsed["annual_leave_hca"],
            prev_week_last2_hca=parsed["prev_week_last2_hca"],
            nurse_constraints_hca=parsed["nurse_constraints_hca"],
            non_working_shift_codes=non_working_shift_codes,
            seed=seed,
            time_limit=time_limit,
        )
    except RuntimeError as e:
        print(f"[MILP] Solver failed: {e}")
        if _is_infeasibility_error(e):
            raise MILPInfeasibilityError(f"MILP infeasible: {e}") from e
        raise MILPError(f"MILP solver failed: {e}") from e

    print("[MILP] Solver finished — formatting output")
    if progress_callback:
        progress_callback(4, 4, 0.0)

    return _format_output(
        nurses, roster_rn, roster_en, roster_hca, parsed["num_days"],
        solver_status=str(tc),
    )
