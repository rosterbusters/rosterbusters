"""Dedicated 12-hour MILP nurse rostering pipeline.

This module adapts the scheduling logic from `schedulling12hr v1.ipynb`
to the backend scheduler contract used by `algo_scheduler.py`.
"""

from __future__ import annotations

import random

import pandas as pd
from pyomo.common.errors import ApplicationError
from pyomo.environ import (
    Binary,
    ConcreteModel,
    ConstraintList,
    NonNegativeReals,
    Objective,
    RangeSet,
    Set,
    SolverFactory,
    TerminationCondition,
    Var,
    minimize,
    value,
)


class TwelveHourMILPError(RuntimeError):
    """Raised when the 12-hour MILP solver fails."""


class TwelveHourMILPInfeasibilityError(TwelveHourMILPError):
    """Raised when the 12-hour inputs are deterministically infeasible."""


_WORK_SHIFTS = {"A", "N"}
_REQUEST_SHIFT_ALIASES = {
    "A-12": "A",
    "A12": "A",
    "A_12": "A",
    "DAY": "A",
    "A": "A",
    "N-12": "N",
    "N12": "N",
    "N_12": "N",
    "NIGHT": "N",
    "N": "N",
    "OFF": "DO",
    "DO": "DO",
    "RD": "DO",
}
_OFF_CODES = {"DO", "OFF", "RD"}
_LEAVE_CODES = {"AL", "HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}
_RANK_TO_CLASS = {"A": "RN", "B": "EN", "C": "HCA"}
_CLASS_TO_RANK = {"RN": "A", "EN": "B", "HCA": "C"}
_CLASS_ORDER = ("RN", "EN", "HCA")
_DEFAULT_WEIGHTS = {
    "dev_shift": 1.0,
    "dev_day": 1.0,
    "pref": 100.0,
    "weekend": 3.0,
    "rest": 25.0,
    "day_smooth": 20.0,
}


def _coerce_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_request_code(raw):
    if raw is None:
        return ""
    normalized = str(raw).strip().upper()
    return _REQUEST_SHIFT_ALIASES.get(normalized, normalized)


def _classify_day_code(raw, non_working_shift_codes=None):
    normalized = _normalize_request_code(raw)
    if normalized in ("", "NAN"):
        return ("NONE", "")
    if normalized in _WORK_SHIFTS:
        return ("WORK_SHIFT", normalized)
    if normalized in _OFF_CODES:
        return ("OFF", normalized)
    if normalized in _LEAVE_CODES:
        return ("EQUIV_LEAVE", normalized)
    non_working = {str(code).strip().upper() for code in (non_working_shift_codes or set())}
    if normalized in non_working:
        return ("OTHER_NONWORK", normalized)
    return ("OTHER_NONWORK", normalized)


def _normalize_last2(entry):
    if entry is None:
        return ("", "")
    if isinstance(entry, dict):
        vals = entry.get("last2", ["", ""])
        vals = list(vals)[:2]
        if len(vals) < 2:
            vals += [""] * (2 - len(vals))
        return tuple(str(v).strip().upper() for v in vals)
    if isinstance(entry, (list, tuple)):
        vals = list(entry)[:2]
        if len(vals) < 2:
            vals += [""] * (2 - len(vals))
        return tuple(str(v).strip().upper() for v in vals)
    return ("", "")


def _carry_state_from_last2(entry):
    d13, d14 = _normalize_last2(entry)
    if d13 == "N" and d14 == "N":
        return "NEED_DO"
    if d14 == "N":
        return "NEED_N_DO"
    return "NONE"


def _build_prev_week_last2(prev_last_shift, id_to_name):
    result = {"RN": {}, "EN": {}, "HCA": {}}
    for nurse_id, raw_shift in (prev_last_shift or {}).items():
        info = id_to_name.get(nurse_id)
        if not info:
            continue
        normalized = _normalize_request_code(raw_shift)
        if normalized == "N":
            result[info["class_name"]][info["name"]] = ("", "N")
        else:
            result[info["class_name"]][info["name"]] = ("", "")
    return result


def _build_shift_requirements(shifts):
    reqs = []
    for day in shifts:
        day_req = {"A": {"RN": 0, "EN": 0, "HCA": 0}, "N": {"RN": 0, "EN": 0, "HCA": 0}}
        a_req = day.get("A-12") or day.get("A12") or day.get("A_12") or {}
        n_req = day.get("N-12") or day.get("N12") or day.get("N_12") or {}
        for class_name, rank in _CLASS_TO_RANK.items():
            day_req["A"][class_name] = _coerce_int(a_req.get(rank, 0), 0)
            day_req["N"][class_name] = _coerce_int(n_req.get(rank, 0), 0)
        reqs.append(day_req)
    return reqs


def _average_daily_requirement(shift_requirements, class_name, shift_code):
    if not shift_requirements:
        return 0
    total = sum(day.get(shift_code, {}).get(class_name, 0) for day in shift_requirements)
    return total / max(len(shift_requirements), 1)


def _default_shift_targets(shift_requirements, class_name, nurse_count):
    if nurse_count <= 0:
        return {"A": 0, "N": 0}
    totals = {
        shift_code: sum(day.get(shift_code, {}).get(class_name, 0) for day in shift_requirements)
        for shift_code in ("A", "N")
    }
    return {
        shift_code: round(total / nurse_count)
        for shift_code, total in totals.items()
    }


def _default_day_targets(shift_requirements, class_name):
    return {
        shift_code: _average_daily_requirement(shift_requirements, class_name, shift_code)
        for shift_code in ("A", "N")
    }


def _parse_request_groups(
    nurses_sorted,
    request_group,
    non_working_shift_codes,
):
    request_group = request_group or {}
    parsed = {"RN": {}, "EN": {}, "HCA": {}}
    overlay = {}

    id_to_info = {}
    for nurse in nurses_sorted:
        class_name = _RANK_TO_CLASS[nurse["rank"]]
        id_to_info[nurse["id"]] = {
            "name": nurse["name"],
            "class_name": class_name,
        }
        parsed[class_name].setdefault(nurse["name"], {})

    for nurse_id, req_list in request_group.items():
        info = id_to_info.get(nurse_id)
        if not info:
            continue
        nurse_name = info["name"]
        class_name = info["class_name"]
        for item in req_list:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            day_idx = _coerce_int(item[0], -1)
            if day_idx < 0:
                continue
            raw_code = item[1]
            day_key = f"Day {day_idx + 1}"
            normalized = _normalize_request_code(raw_code)
            parsed[class_name].setdefault(nurse_name, {})[day_key] = normalized
            kind, _ = _classify_day_code(normalized, non_working_shift_codes)
            if kind in {"EQUIV_LEAVE", "OTHER_NONWORK"}:
                overlay.setdefault(nurse_name, {})[day_idx] = str(raw_code).strip().upper()

    return parsed, overlay, id_to_info


def _format_output(nurses_sorted, roster_rn, roster_en, roster_hca, num_days, penalty_score, leave_overlay):
    name_to_nurse = {n["name"]: n for n in nurses_sorted}
    output_nurses = []
    leave_codes = _LEAVE_CODES | {"AL"}

    for roster_df in (roster_rn, roster_en, roster_hca):
        if roster_df is None or roster_df.empty:
            continue
        for nurse_name in roster_df.index:
            nurse_info = name_to_nurse.get(nurse_name)
            if nurse_info is None:
                continue

            labels = []
            for day_idx in range(num_days):
                code = str(roster_df.loc[nurse_name, f"Day {day_idx + 1}"]).strip().upper()
                if code == "A":
                    labels.append("A-12")
                elif code == "N":
                    labels.append("N-12")
                elif code in _OFF_CODES:
                    labels.append("OFF")
                else:
                    labels.append(code)

            for day_idx, leave_code in (leave_overlay.get(nurse_name) or {}).items():
                if 0 <= day_idx < num_days:
                    labels[day_idx] = leave_code

            off_count = 0
            for idx, label in enumerate(labels):
                if label == "OFF":
                    off_count += 1
                    if off_count % 2 == 0:
                        labels[idx] = "RD"

            output_nurses.append(
                {
                    "id": nurse_info["id"],
                    "name": nurse_info["name"],
                    "rank": nurse_info["rank"],
                    "schedule": labels,
                    "stats": {
                        "total_shifts": sum(
                            1 for label in labels if label not in {"OFF", "RD"} and label not in leave_codes
                        ),
                        "a12_shifts": labels.count("A-12"),
                        "n12_shifts": labels.count("N-12"),
                        "days_off": labels.count("OFF") + labels.count("RD"),
                        "al_days": sum(1 for label in labels if label in leave_codes),
                    },
                }
            )

    output_nurses.sort(key=lambda nurse: nurse["id"])
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days": num_days,
            "num_nurses": len(output_nurses),
            "algorithm": "12HR",
            "penalty_score": penalty_score,
        },
    }


def _build_class_lists(nurses_sorted):
    grouped = {"RN": [], "EN": [], "HCA": []}
    for nurse in nurses_sorted:
        grouped[_RANK_TO_CLASS[nurse["rank"]]].append(nurse["name"])
    return grouped


def _estimate_fixed_nonwork(hard_requests_by_class, class_name, nurse_name, day_count, non_working_shift_codes):
    annual_leave_days = set()
    other_nonwork_days = set()
    for day in range(1, day_count + 1):
        raw = hard_requests_by_class.get(class_name, {}).get(nurse_name, {}).get(f"Day {day}", "")
        kind, _ = _classify_day_code(raw, non_working_shift_codes)
        if kind == "EQUIV_LEAVE":
            annual_leave_days.add(day)
        elif kind == "OTHER_NONWORK":
            other_nonwork_days.add(day)
    return annual_leave_days, other_nonwork_days


def _early_capacity_check(class_lists, shift_requirements, hard_requests_by_class, num_days, non_working_shift_codes):
    for class_name, nurse_names in class_lists.items():
        nurse_count = len(nurse_names)
        if nurse_count == 0:
            total_req = sum(
                day.get(shift_code, {}).get(class_name, 0)
                for day in shift_requirements
                for shift_code in ("A", "N")
            )
            if total_req > 0:
                raise TwelveHourMILPInfeasibilityError(
                    f"12HR {class_name} has 0 staff but demand requires {total_req} total assignments"
                )
            continue

        for week_start in (1, 8):
            week_days = [day for day in range(week_start, min(week_start + 6, num_days) + 1)]
            if not week_days:
                continue
            max_assignable = 4 * nurse_count
            week_req = sum(
                day_req.get(shift_code, {}).get(class_name, 0)
                for day_idx, day_req in enumerate(shift_requirements, 1)
                if day_idx in week_days
                for shift_code in ("A", "N")
            )
            if week_req > max_assignable:
                raise TwelveHourMILPInfeasibilityError(
                    f"12HR {class_name} week starting day {week_start} requires {week_req} shifts but "
                    f"only {max_assignable} working assignments are possible under the 4-shifts-per-week rule"
                )

        for nurse_name in nurse_names:
            annual_leave_days, other_nonwork_days = _estimate_fixed_nonwork(
                hard_requests_by_class,
                class_name,
                nurse_name,
                num_days,
                non_working_shift_codes,
            )
            for week_start in (1, 8):
                week_days = [day for day in range(week_start, min(week_start + 6, num_days) + 1)]
                fixed_nonwork = sum(
                    1 for day in week_days if day in annual_leave_days or day in other_nonwork_days
                )
                if fixed_nonwork > len(week_days) - 4:
                    raise TwelveHourMILPInfeasibilityError(
                        f"12HR nurse '{nurse_name}' has too many fixed non-working days in week starting "
                        f"day {week_start} to still satisfy the notebook's 4 worked shifts per week rule"
                    )


def _solve_12hr(
    *,
    nurses_sorted,
    shift_requirements,
    hard_requests_by_class,
    soft_requests_by_class,
    leave_overlay,
    prev_week_last2,
    milp_config,
    non_working_shift_codes,
):
    cfg = dict(milp_config or {})
    weights = dict(_DEFAULT_WEIGHTS)
    weights.update(cfg.get("weights") or {})
    solver_name = cfg.get("solver_name", "gurobi")
    seed = cfg.get("seed")
    time_limit = cfg.get("twelve_hour_time_limit_s", cfg.get("time_limit", 120))

    num_days = len(shift_requirements)
    if num_days != 14:
        raise TwelveHourMILPInfeasibilityError(
            f"12HR MILP expects a 14-day horizon, received {num_days} days"
        )

    class_lists = _build_class_lists(nurses_sorted)
    _early_capacity_check(
        class_lists,
        shift_requirements,
        hard_requests_by_class,
        num_days,
        non_working_shift_codes,
    )

    rng = random.Random(seed)
    rn_nurses = list(class_lists["RN"])
    en_nurses = list(class_lists["EN"])
    hca_nurses = list(class_lists["HCA"])
    rng.shuffle(rn_nurses)
    rng.shuffle(en_nurses)
    rng.shuffle(hca_nurses)

    DAYS = list(range(1, num_days + 1))
    SHIFTS = ["A", "N"]
    WEEK1 = list(range(1, 8))
    WEEK2 = list(range(8, 15))
    WEEKEND_DAYS = [6, 7, 13, 14]

    day_targets = {}
    shift_targets = {}
    for class_name, nurse_list in (("RN", rn_nurses), ("EN", en_nurses), ("HCA", hca_nurses)):
        class_cfg = cfg.get(class_name, {})
        day_targets[class_name] = dict(class_cfg.get("day_target") or _default_day_targets(shift_requirements, class_name))
        shift_targets[class_name] = dict(
            class_cfg.get("shift_target") or _default_shift_targets(shift_requirements, class_name, len(nurse_list))
        )

    m = ConcreteModel()
    m.D = RangeSet(1, num_days)
    m.S = Set(initialize=SHIFTS)
    m.N_RN = Set(initialize=rn_nurses)
    m.N_EN = Set(initialize=en_nurses)
    m.N_HCA = Set(initialize=hca_nurses)

    m.x_rn = Var(m.N_RN, m.D, m.S, within=Binary)
    m.x_en = Var(m.N_EN, m.D, m.S, within=Binary)
    m.x_hca = Var(m.N_HCA, m.D, m.S, within=Binary)

    m.off_rn = Var(m.N_RN, m.D, within=Binary)
    m.off_en = Var(m.N_EN, m.D, within=Binary)
    m.off_hca = Var(m.N_HCA, m.D, within=Binary)

    for group, nurses in (("rn", rn_nurses), ("en", en_nurses), ("hca", hca_nurses)):
        model_set = getattr(m, f"N_{group.upper()}")
        setattr(m, f"dev_A_{group}", Var(model_set, within=NonNegativeReals))
        setattr(m, f"dev_N_{group}", Var(model_set, within=NonNegativeReals))
        setattr(m, f"dev_day_{group}", Var(m.D, m.S, within=NonNegativeReals))
        setattr(m, f"day_total_{group}", Var(RangeSet(2, num_days), within=NonNegativeReals))
        setattr(m, f"weekend_dev_{group}", Var(model_set, within=NonNegativeReals))
        setattr(m, f"rest_violation_{group}", Var(model_set, within=Binary))
        setattr(m, f"pref_violate_{group}", Var(model_set, m.D, within=Binary))

    m.cons = ConstraintList()

    def add_n_n_do_constraints(class_nurses, x_var, off_var, prev_week_last2_dict):
        for nurse_name in class_nurses:
            prev_d13, prev_d14 = _normalize_last2(prev_week_last2_dict.get(nurse_name))
            prev14_is_n = 1 if prev_d14 == "N" else 0
            prev13_is_n = 1 if prev_d13 == "N" else 0

            for day in range(1, num_days - 1):
                m.cons.add(x_var[nurse_name, day, "N"] + x_var[nurse_name, day + 1, "N"] + x_var[nurse_name, day + 2, "N"] <= 2)

            if prev13_is_n == 1 and prev14_is_n == 1:
                m.cons.add(x_var[nurse_name, 1, "N"] == 0)
            if prev14_is_n == 1 and num_days >= 2:
                m.cons.add(x_var[nurse_name, 1, "N"] + x_var[nurse_name, 2, "N"] <= 1)

            for day in range(1, num_days):
                m.cons.add(x_var[nurse_name, day, "N"] - x_var[nurse_name, day + 1, "N"] <= off_var[nurse_name, day + 1])
            for day in range(1, num_days - 1):
                m.cons.add(x_var[nurse_name, day, "N"] + x_var[nurse_name, day + 1, "N"] - 1 <= off_var[nurse_name, day + 2])

            if prev14_is_n == 1:
                m.cons.add(1 - x_var[nurse_name, 1, "N"] <= off_var[nurse_name, 1])
                if num_days >= 2:
                    m.cons.add(x_var[nurse_name, 1, "N"] <= off_var[nurse_name, 2])
            if prev13_is_n == 1 and prev14_is_n == 1:
                m.cons.add(off_var[nurse_name, 1] == 1)

    def add_nurse_rules(class_name, class_nurses, x_var, off_var, hard_requests_dict, prev_week_last2_dict):
        for nurse_name in class_nurses:
            annual_leave_days = set()
            other_nonwork_days = set()
            carry_state = _carry_state_from_last2(prev_week_last2_dict.get(nurse_name))

            for day in DAYS:
                raw = hard_requests_dict.get(nurse_name, {}).get(f"Day {day}", "")
                kind, _ = _classify_day_code(raw, non_working_shift_codes)
                if kind == "EQUIV_LEAVE":
                    annual_leave_days.add(day)
                elif kind == "OTHER_NONWORK":
                    other_nonwork_days.add(day)

            if carry_state == "NEED_DO":
                m.cons.add(off_var[nurse_name, 1] == 1)
                for shift_code in SHIFTS:
                    m.cons.add(x_var[nurse_name, 1, shift_code] == 0)
            elif carry_state == "NEED_N_DO":
                m.cons.add(off_var[nurse_name, 1] == 0)
                m.cons.add(x_var[nurse_name, 1, "N"] == 1)
                m.cons.add(x_var[nurse_name, 1, "A"] == 0)
                if num_days >= 2:
                    m.cons.add(off_var[nurse_name, 2] == 1)
                    for shift_code in SHIFTS:
                        m.cons.add(x_var[nurse_name, 2, shift_code] == 0)

            for day in DAYS:
                if carry_state == "NEED_DO" and day == 1:
                    continue
                if carry_state == "NEED_N_DO" and day in {1, 2}:
                    continue

                raw = hard_requests_dict.get(nurse_name, {}).get(f"Day {day}", "")
                kind, val = _classify_day_code(raw, non_working_shift_codes)

                if kind == "WORK_SHIFT":
                    m.cons.add(off_var[nurse_name, day] == 0)
                    for shift_code in SHIFTS:
                        m.cons.add(x_var[nurse_name, day, shift_code] == (1 if shift_code == val else 0))
                elif kind == "OFF":
                    m.cons.add(off_var[nurse_name, day] == 1)
                    for shift_code in SHIFTS:
                        m.cons.add(x_var[nurse_name, day, shift_code] == 0)
                elif kind in {"EQUIV_LEAVE", "OTHER_NONWORK"} or day in annual_leave_days or day in other_nonwork_days:
                    m.cons.add(off_var[nurse_name, day] == 0)
                    for shift_code in SHIFTS:
                        m.cons.add(x_var[nurse_name, day, shift_code] == 0)
                else:
                    m.cons.add(sum(x_var[nurse_name, day, shift_code] for shift_code in SHIFTS) + off_var[nurse_name, day] == 1)

            m.cons.add(sum(x_var[nurse_name, day, shift_code] for day in WEEK1 for shift_code in SHIFTS) == 4)
            m.cons.add(sum(x_var[nurse_name, day, shift_code] for day in WEEK2 for shift_code in SHIFTS) == 4)

            if any(day in WEEK1 for day in other_nonwork_days):
                m.cons.add(sum(off_var[nurse_name, day] for day in WEEK1) >= 2)
            if any(day in WEEK2 for day in other_nonwork_days):
                m.cons.add(sum(off_var[nurse_name, day] for day in WEEK2) >= 2)

            for day in range(1, num_days):
                m.cons.add(x_var[nurse_name, day, "N"] + x_var[nurse_name, day + 1, "A"] <= 1)

    add_nurse_rules("RN", rn_nurses, m.x_rn, m.off_rn, hard_requests_by_class["RN"], prev_week_last2["RN"])
    add_nurse_rules("EN", en_nurses, m.x_en, m.off_en, hard_requests_by_class["EN"], prev_week_last2["EN"])
    add_nurse_rules("HCA", hca_nurses, m.x_hca, m.off_hca, hard_requests_by_class["HCA"], prev_week_last2["HCA"])

    add_n_n_do_constraints(rn_nurses, m.x_rn, m.off_rn, prev_week_last2["RN"])
    add_n_n_do_constraints(en_nurses, m.x_en, m.off_en, prev_week_last2["EN"])
    add_n_n_do_constraints(hca_nurses, m.x_hca, m.off_hca, prev_week_last2["HCA"])

    cov_maps = {
        "RN": {(day, shift_code): sum(m.x_rn[nurse_name, day, shift_code] for nurse_name in rn_nurses) for day in DAYS for shift_code in SHIFTS},
        "EN": {(day, shift_code): sum(m.x_en[nurse_name, day, shift_code] for nurse_name in en_nurses) for day in DAYS for shift_code in SHIFTS},
        "HCA": {(day, shift_code): sum(m.x_hca[nurse_name, day, shift_code] for nurse_name in hca_nurses) for day in DAYS for shift_code in SHIFTS},
    }

    for day in DAYS:
        for shift_code in SHIFTS:
            total_required = 0
            total_coverage = 0
            for class_name in _CLASS_ORDER:
                required = shift_requirements[day - 1].get(shift_code, {}).get(class_name, 0)
                coverage = cov_maps[class_name][(day, shift_code)]
                m.cons.add(coverage >= required)
                total_required += required
                total_coverage += coverage
            m.cons.add(total_coverage >= total_required)

    for day in range(2, num_days + 1):
        rn_total_today = sum(m.x_rn[nurse_name, day, shift_code] for nurse_name in rn_nurses for shift_code in SHIFTS)
        rn_total_prev = sum(m.x_rn[nurse_name, day - 1, shift_code] for nurse_name in rn_nurses for shift_code in SHIFTS)
        m.cons.add(rn_total_today - rn_total_prev <= m.day_total_rn[day])
        m.cons.add(rn_total_prev - rn_total_today <= m.day_total_rn[day])

        en_total_today = sum(m.x_en[nurse_name, day, shift_code] for nurse_name in en_nurses for shift_code in SHIFTS)
        en_total_prev = sum(m.x_en[nurse_name, day - 1, shift_code] for nurse_name in en_nurses for shift_code in SHIFTS)
        m.cons.add(en_total_today - en_total_prev <= m.day_total_en[day])
        m.cons.add(en_total_prev - en_total_today <= m.day_total_en[day])

        hca_total_today = sum(m.x_hca[nurse_name, day, shift_code] for nurse_name in hca_nurses for shift_code in SHIFTS)
        hca_total_prev = sum(m.x_hca[nurse_name, day - 1, shift_code] for nurse_name in hca_nurses for shift_code in SHIFTS)
        m.cons.add(hca_total_today - hca_total_prev <= m.day_total_hca[day])
        m.cons.add(hca_total_prev - hca_total_today <= m.day_total_hca[day])

    def add_shift_balance(class_name, class_nurses, x_var, dev_a, dev_n):
        targets = shift_targets[class_name]
        target_a = targets.get("A", 0)
        target_n = targets.get("N", 0)
        for nurse_name in class_nurses:
            total_a = sum(x_var[nurse_name, day, "A"] for day in DAYS)
            total_n = sum(x_var[nurse_name, day, "N"] for day in DAYS)
            m.cons.add(total_a - target_a <= dev_a[nurse_name])
            m.cons.add(-(total_a - target_a) <= dev_a[nurse_name])
            m.cons.add(total_n - target_n <= dev_n[nurse_name])
            m.cons.add(-(total_n - target_n) <= dev_n[nurse_name])

    add_shift_balance("RN", rn_nurses, m.x_rn, m.dev_A_rn, m.dev_N_rn)
    add_shift_balance("EN", en_nurses, m.x_en, m.dev_A_en, m.dev_N_en)
    add_shift_balance("HCA", hca_nurses, m.x_hca, m.dev_A_hca, m.dev_N_hca)

    for class_name, class_nurses, dev_day in (
        ("RN", rn_nurses, m.dev_day_rn),
        ("EN", en_nurses, m.dev_day_en),
        ("HCA", hca_nurses, m.dev_day_hca),
    ):
        targets = day_targets[class_name]
        cov_map = cov_maps[class_name]
        for day in DAYS:
            for shift_code in SHIFTS:
                y_val = cov_map[(day, shift_code)]
                target = targets.get(shift_code, 0)
                m.cons.add(y_val - target <= dev_day[day, shift_code])
                m.cons.add(-(y_val - target) <= dev_day[day, shift_code])

    def add_soft_preferences(class_nurses, x_var, hard_requests_dict, soft_requests_dict, pref_violate):
        for nurse_name in class_nurses:
            for day in DAYS:
                hard_kind, _ = _classify_day_code(
                    hard_requests_dict.get(nurse_name, {}).get(f"Day {day}", ""),
                    non_working_shift_codes,
                )
                if hard_kind != "NONE":
                    continue
                soft_kind, soft_val = _classify_day_code(
                    soft_requests_dict.get(nurse_name, {}).get(f"Day {day}", ""),
                    non_working_shift_codes,
                )
                if soft_kind == "WORK_SHIFT":
                    m.cons.add(x_var[nurse_name, day, soft_val] >= 1 - pref_violate[nurse_name, day])
                elif soft_kind in {"OFF", "EQUIV_LEAVE", "OTHER_NONWORK"}:
                    m.cons.add(sum(x_var[nurse_name, day, shift_code] for shift_code in SHIFTS) <= pref_violate[nurse_name, day])

    add_soft_preferences(rn_nurses, m.x_rn, hard_requests_by_class["RN"], soft_requests_by_class["RN"], m.pref_violate_rn)
    add_soft_preferences(en_nurses, m.x_en, hard_requests_by_class["EN"], soft_requests_by_class["EN"], m.pref_violate_en)
    add_soft_preferences(hca_nurses, m.x_hca, hard_requests_by_class["HCA"], soft_requests_by_class["HCA"], m.pref_violate_hca)

    def add_weekend_fairness(class_nurses, x_var, weekend_dev):
        for nurse_name in class_nurses:
            weekend_nights = sum(x_var[nurse_name, day, "N"] for day in WEEKEND_DAYS)
            m.cons.add(weekend_nights - 1.0 <= weekend_dev[nurse_name])
            m.cons.add(-(weekend_nights - 1.0) <= weekend_dev[nurse_name])

    add_weekend_fairness(rn_nurses, m.x_rn, m.weekend_dev_rn)
    add_weekend_fairness(en_nurses, m.x_en, m.weekend_dev_en)
    add_weekend_fairness(hca_nurses, m.x_hca, m.weekend_dev_hca)

    def add_prev_week_rest(class_nurses, x_var, prev_week_last2_dict, rest_violation):
        for nurse_name in class_nurses:
            _, prev_last = _normalize_last2(prev_week_last2_dict.get(nurse_name))
            if prev_last == "N":
                worked_day1 = sum(x_var[nurse_name, 1, shift_code] for shift_code in SHIFTS)
                m.cons.add(rest_violation[nurse_name] >= worked_day1)
            else:
                m.cons.add(rest_violation[nurse_name] >= 0)

    add_prev_week_rest(rn_nurses, m.x_rn, prev_week_last2["RN"], m.rest_violation_rn)
    add_prev_week_rest(en_nurses, m.x_en, prev_week_last2["EN"], m.rest_violation_en)
    add_prev_week_rest(hca_nurses, m.x_hca, prev_week_last2["HCA"], m.rest_violation_hca)

    m.obj = Objective(
        expr=(
            weights["dev_shift"] * sum(m.dev_A_rn[nurse_name] + m.dev_N_rn[nurse_name] for nurse_name in rn_nurses)
            + weights["dev_day"] * sum(m.dev_day_rn[day, shift_code] for day in DAYS for shift_code in SHIFTS)
            + weights["pref"] * sum(m.pref_violate_rn[nurse_name, day] for nurse_name in rn_nurses for day in DAYS)
            + weights["weekend"] * sum(m.weekend_dev_rn[nurse_name] for nurse_name in rn_nurses)
            + weights["rest"] * sum(m.rest_violation_rn[nurse_name] for nurse_name in rn_nurses)
            + weights["day_smooth"] * sum(m.day_total_rn[day] for day in range(2, num_days + 1))
            + weights["dev_shift"] * sum(m.dev_A_en[nurse_name] + m.dev_N_en[nurse_name] for nurse_name in en_nurses)
            + weights["dev_day"] * sum(m.dev_day_en[day, shift_code] for day in DAYS for shift_code in SHIFTS)
            + weights["pref"] * sum(m.pref_violate_en[nurse_name, day] for nurse_name in en_nurses for day in DAYS)
            + weights["weekend"] * sum(m.weekend_dev_en[nurse_name] for nurse_name in en_nurses)
            + weights["rest"] * sum(m.rest_violation_en[nurse_name] for nurse_name in en_nurses)
            + weights["day_smooth"] * sum(m.day_total_en[day] for day in range(2, num_days + 1))
            + weights["dev_shift"] * sum(m.dev_A_hca[nurse_name] + m.dev_N_hca[nurse_name] for nurse_name in hca_nurses)
            + weights["dev_day"] * sum(m.dev_day_hca[day, shift_code] for day in DAYS for shift_code in SHIFTS)
            + weights["pref"] * sum(m.pref_violate_hca[nurse_name, day] for nurse_name in hca_nurses for day in DAYS)
            + weights["weekend"] * sum(m.weekend_dev_hca[nurse_name] for nurse_name in hca_nurses)
            + weights["rest"] * sum(m.rest_violation_hca[nurse_name] for nurse_name in hca_nurses)
            + weights["day_smooth"] * sum(m.day_total_hca[day] for day in range(2, num_days + 1))
        ),
        sense=minimize,
    )

    solver = SolverFactory(solver_name)
    if solver is None:
        raise TwelveHourMILPError(f"12HR MILP solver '{solver_name}' is not available")

    try:
        available = solver.available(False)
    except TypeError:
        available = solver.available()
    except Exception as exc:
        raise TwelveHourMILPError(
            f"12HR MILP solver '{solver_name}' availability check failed: {exc}"
        ) from exc

    if not available:
        raise TwelveHourMILPError(f"12HR MILP solver '{solver_name}' is not available")

    if time_limit is not None:
        if str(solver_name).lower() == "cbc":
            solver.options["seconds"] = float(time_limit)
        else:
            solver.options["TimeLimit"] = float(time_limit)

    if str(solver_name).lower() == "gurobi":
        solver.options["MIPGap"] = 0.01
        solver.options["Threads"] = 0
        solver.options["Presolve"] = 2

    try:
        res = solver.solve(m, tee=False)
    except ApplicationError as exc:
        raise TwelveHourMILPError(
            f"12HR MILP solver '{solver_name}' could not be executed: {exc}"
        ) from exc

    tc = res.solver.termination_condition
    if tc not in {TerminationCondition.optimal, TerminationCondition.maxTimeLimit}:
        raise TwelveHourMILPError(f"12HR solver infeasible or not optimal: {tc}")

    day_cols = [f"Day {day}" for day in DAYS]
    roster_rn = pd.DataFrame(index=rn_nurses, columns=day_cols)
    roster_en = pd.DataFrame(index=en_nurses, columns=day_cols)
    roster_hca = pd.DataFrame(index=hca_nurses, columns=day_cols)

    def fill_roster(roster_df, class_nurses, x_var, off_var, hard_requests_dict):
        for nurse_name in class_nurses:
            for day in DAYS:
                day_key = f"Day {day}"
                raw = hard_requests_dict.get(nurse_name, {}).get(day_key, "")
                kind, val = _classify_day_code(raw, non_working_shift_codes)
                if kind in {"OFF", "EQUIV_LEAVE", "OTHER_NONWORK"}:
                    roster_df.loc[nurse_name, day_key] = val
                elif value(off_var[nurse_name, day]) > 0.5:
                    roster_df.loc[nurse_name, day_key] = "DO"
                else:
                    assigned = None
                    for shift_code in SHIFTS:
                        if value(x_var[nurse_name, day, shift_code]) > 0.5:
                            assigned = shift_code
                            break
                    roster_df.loc[nurse_name, day_key] = assigned if assigned else "DO"
        return roster_df.reindex(sorted(roster_df.index)).copy()

    roster_rn = fill_roster(roster_rn, rn_nurses, m.x_rn, m.off_rn, hard_requests_by_class["RN"])
    roster_en = fill_roster(roster_en, en_nurses, m.x_en, m.off_en, hard_requests_by_class["EN"])
    roster_hca = fill_roster(roster_hca, hca_nurses, m.x_hca, m.off_hca, hard_requests_by_class["HCA"])

    penalty_score = float(value(m.obj))
    return _format_output(
        nurses_sorted,
        roster_rn,
        roster_en,
        roster_hca,
        num_days,
        penalty_score,
        leave_overlay,
    )


def run_twelve_hour_milp_pipeline(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    progress_callback=None,
    milp_config=None,
):
    """Public scheduler-compatible entry point for the 12-hour MILP."""
    del shift_hours

    if progress_callback:
        progress_callback(0, 4, float("inf"))

    nurses_sorted = sorted(nurses, key=lambda nurse: nurse["id"])
    hard_requests_by_class, hard_leave_overlay, id_to_info = _parse_request_groups(
        nurses_sorted,
        hard_requests,
        non_working_shift_codes,
    )
    soft_requests_by_class, soft_leave_overlay, _ = _parse_request_groups(
        nurses_sorted,
        soft_requests,
        non_working_shift_codes,
    )
    leave_overlay = dict(hard_leave_overlay)
    for nurse_name, days in soft_leave_overlay.items():
        leave_overlay.setdefault(nurse_name, {}).update(days)

    shift_requirements = _build_shift_requirements(shifts)
    prev_week_last2 = _build_prev_week_last2(prev_last_shift or {}, id_to_info)

    if progress_callback:
        progress_callback(1, 4, float("inf"))

    result = _solve_12hr(
        nurses_sorted=nurses_sorted,
        shift_requirements=shift_requirements,
        hard_requests_by_class=hard_requests_by_class,
        soft_requests_by_class=soft_requests_by_class,
        leave_overlay=leave_overlay,
        prev_week_last2=prev_week_last2,
        milp_config=milp_config,
        non_working_shift_codes=non_working_shift_codes,
    )

    if progress_callback:
        progress_callback(4, 4, result.get("metadata", {}).get("penalty_score", 0.0))

    return result
