from __future__ import annotations

import os

try:
    from ortools.sat.python import cp_model
except ModuleNotFoundError:
    cp_model = None

from app.rostering.cp_sat_algo import (
    _LEAVE_CODES,
    AL,
    ALL_SHIFTS,
    AM,
    NIGHT,
    OFF,
    PM,
    SHIFT_LABEL,
    WORK_SHIFTS,
    _build_greedy_hint,
)

_SHIFT_STR_TO_CODE = {
    "AM": AM,
    "A": AM,
    "PM": PM,
    "P": PM,
    "NIGHT": NIGHT,
    "N": NIGHT,
    "OFF": OFF,
    "DO": OFF,
    "RD": OFF,
    "AL": AL,
}

_DEFAULT_WEIGHTS = {
    "coverage_c": 600_000,
    "ratio_am": 8_000,
    "ratio_pm": 8_000,
    "ratio_night": 14_000,
    "daily_ratio_am": 3_000,
    "daily_ratio_pm": 3_000,
    "daily_ratio_night": 5_000,
    "rn_night": 6_000,
    "rn_night_over": 800,
    "class_balance_day": 1_200,
    "class_balance_shift": 700,
    "soft_request": 200,
}
_DEFAULT_TIME_LIMIT_S = 60.0
_DEFAULT_AB_SHIFT_RATIO = {
    AM: 3,
    PM: 3,
    NIGHT: 2,
}
_DEFAULT_RN_NIGHT_ALLOWED_EXCESS = 1


def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_internal_code(raw, leave_codes: set[str], non_working_codes: set[str]) -> int | None:
    normalized = str(raw).strip().upper()
    if normalized in _SHIFT_STR_TO_CODE:
        return _SHIFT_STR_TO_CODE[normalized]
    if normalized in leave_codes or normalized in non_working_codes:
        return AL
    return None


def _build_ab_targets(
    total_slots: int,
    ratio_weights: dict[int, int],
) -> tuple[dict[int, int], dict[int, float]]:
    grand_total = sum(max(int(ratio_weights.get(shift_code, 0)), 0) for shift_code in (AM, PM, NIGHT))
    if total_slots <= 0 or grand_total <= 0:
        return {AM: 0, PM: 0, NIGHT: 0}, {AM: 0.0, PM: 0.0, NIGHT: 0.0}

    exact_targets = {
        shift_code: (total_slots * max(int(ratio_weights.get(shift_code, 0)), 0) / grand_total)
        for shift_code in (AM, PM, NIGHT)
    }
    roster_totals = {
        shift_code: int(exact_targets[shift_code]) for shift_code in (AM, PM, NIGHT)
    }
    assigned = sum(roster_totals.values())
    remainder_order = sorted(
        (AM, PM, NIGHT),
        key=lambda shift_code: (exact_targets[shift_code] - roster_totals[shift_code], -shift_code),
        reverse=True,
    )
    for index in range(total_slots - assigned):
        roster_totals[remainder_order[index % len(remainder_order)]] += 1

    ratios = {
        shift_code: (roster_totals[shift_code] / total_slots if total_slots else 0.0)
        for shift_code in (AM, PM, NIGHT)
    }
    return roster_totals, ratios


def _distribute_targets(total: int, num_days: int) -> list[int]:
    if num_days <= 0:
        return []
    base = total // num_days
    remainder = total % num_days
    return [base + (1 if day_idx < remainder else 0) for day_idx in range(num_days)]


def _weekly_do_target(week_len: int) -> int:
    if week_len <= 0:
        return 0
    return max(1, round(2 * week_len / 7))


def _normalize_ab_shift_ratio(config_ratio) -> dict[int, int]:
    normalized = dict(_DEFAULT_AB_SHIFT_RATIO)
    if isinstance(config_ratio, dict):
        for raw_key, value in config_ratio.items():
            key = str(raw_key).strip().upper()
            if key in {"AM", "A"}:
                normalized[AM] = max(_coerce_int(value, normalized[AM]), 0)
            elif key in {"PM", "P"}:
                normalized[PM] = max(_coerce_int(value, normalized[PM]), 0)
            elif key in {"NIGHT", "N"}:
                normalized[NIGHT] = max(_coerce_int(value, normalized[NIGHT]), 0)
    return normalized


def parse_ab_ratio_inputs(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    milp_config: dict | None = None,
):
    hard_requests = hard_requests or {}
    soft_requests = soft_requests or {}
    prev_last_shift = prev_last_shift or {}
    _ = shift_hours
    non_working_codes = {
        str(code).strip().upper() for code in (non_working_shift_codes or set())
    }
    leave_codes = _LEAVE_CODES | {"AL"}

    nurses_sorted = sorted(nurses, key=lambda nurse: nurse["id"])
    num_days = len(shifts)
    num_nurses = len(nurses_sorted)
    nurse_names = [nurse["name"] for nurse in nurses_sorted]
    nurse_ranks = [nurse["rank"] for nurse in nurses_sorted]
    id_to_idx = {nurse["id"]: idx for idx, nurse in enumerate(nurses_sorted)}
    id_to_name = {nurse["id"]: nurse["name"] for nurse in nurses_sorted}

    demand = []
    for day in shifts:
        day_demand = {}
        for shift_name, shift_code in (("AM", AM), ("PM", PM), ("NIGHT", NIGHT)):
            req = day.get(shift_name, {}) or {}
            day_demand[shift_code] = {
                rank: _coerce_int(req.get(rank, 0), 0) for rank in ("A", "B", "C")
            }
        demand.append(day_demand)

    al_nurses_set: set[int] = set()
    al_day_req: list[set[int]] = [set() for _ in range(num_nurses)]
    hard_assignments: list[dict[int, int]] = [{} for _ in range(num_nurses)]
    soft_assignments: list[dict[int, int]] = [{} for _ in range(num_nurses)]
    leave_overlay: dict[str, dict[int, str]] = {}

    for nurse_id, req_list in hard_requests.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None:
            continue
        for day_idx, raw_shift in req_list:
            if not 0 <= day_idx < num_days:
                continue
            shift_code = _to_internal_code(raw_shift, leave_codes, non_working_codes)
            if shift_code is None:
                continue
            if shift_code == AL:
                al_day_req[nurse_idx].add(day_idx)
                leave_overlay.setdefault(id_to_name[nurse_id], {})[day_idx] = str(raw_shift).strip().upper()
                continue
            hard_assignments[nurse_idx][day_idx] = shift_code

    for nurse_id, req_list in soft_requests.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None:
            continue
        for day_idx, raw_shift in req_list:
            if not 0 <= day_idx < num_days:
                continue
            shift_code = _to_internal_code(raw_shift, leave_codes, non_working_codes)
            if shift_code is None:
                continue
            soft_assignments[nurse_idx][day_idx] = shift_code

    for nurse_idx, days in enumerate(al_day_req):
        if len(days) >= num_days:
            al_nurses_set.add(nurse_idx)

    working_nurses = [idx for idx in range(num_nurses) if idx not in al_nurses_set]
    rank_a = [idx for idx in range(num_nurses) if nurse_ranks[idx] == "A"]
    rank_b = [idx for idx in range(num_nurses) if nurse_ranks[idx] == "B"]
    rank_c = [idx for idx in range(num_nurses) if nurse_ranks[idx] == "C"]
    rank_ab = [idx for idx in range(num_nurses) if nurse_ranks[idx] in {"A", "B"}]
    working_ab = [idx for idx in working_nurses if nurse_ranks[idx] in {"A", "B"}]
    working_rank_a = [idx for idx in working_ab if nurse_ranks[idx] == "A"]
    working_rank_b = [idx for idx in working_ab if nurse_ranks[idx] == "B"]

    post_night_off: set[int] = set()
    for nurse_id, shift_name in prev_last_shift.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None or nurse_idx in al_nurses_set:
            continue
        if str(shift_name).strip().upper() == "NIGHT":
            post_night_off.add(nurse_idx)

    cfg = dict(milp_config or {})
    ratio_weights = dict(_DEFAULT_WEIGHTS)
    ratio_weights.update(cfg.get("ab_ratio_weights") or {})
    ratio_weights["ratio_night"] = _coerce_int(
        cfg.get("night_ratio_weight"), ratio_weights["ratio_night"]
    )
    ratio_weights["soft_request"] = _coerce_int(
        cfg.get("soft_request_weight"), ratio_weights["soft_request"]
    )
    ratio_weights["rn_night"] = _coerce_int(
        cfg.get("rn_night_weight"), ratio_weights["rn_night"]
    )
    ratio_weights["rn_night_over"] = _coerce_int(
        cfg.get("rn_night_over_weight"), ratio_weights["rn_night_over"]
    )
    ab_shift_ratio = _normalize_ab_shift_ratio(cfg.get("ab_shift_ratio"))

    ab_weekly_do_targets: dict[int, list[int]] = {}
    expected_ab_work_slots = 0
    for nurse_idx in working_ab:
        weekly_targets = []
        total_do_target = 0
        for week_start in range(0, num_days, 7):
            week_end = min(week_start + 7, num_days)
            fixed_off_days = {
                day_idx
                for day_idx in range(week_start, week_end)
                if hard_assignments[nurse_idx].get(day_idx) == OFF
            }
            if (
                nurse_idx in post_night_off
                and week_start <= 0 < week_end
                and 0 not in al_day_req[nurse_idx]
                and hard_assignments[nurse_idx].get(0) != OFF
            ):
                fixed_off_days.add(0)
            target_do = max(_weekly_do_target(week_end - week_start), len(fixed_off_days))
            weekly_targets.append(target_do)
            total_do_target += target_do
        ab_weekly_do_targets[nurse_idx] = weekly_targets
        expected_ab_work_slots += max(0, num_days - len(al_day_req[nurse_idx]) - total_do_target)

    ab_target_totals, ab_target_ratios = _build_ab_targets(expected_ab_work_slots, ab_shift_ratio)
    ab_daily_targets = {
        shift_code: _distribute_targets(ab_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    default_rn_night_targets = [demand[day_idx][NIGHT]["A"] for day_idx in range(num_days)]
    raw_rn_target = cfg.get("rn_night_min_per_day")
    if isinstance(raw_rn_target, (list, tuple)):
        rn_night_targets = [
            _coerce_int(raw_rn_target[day_idx], default_rn_night_targets[day_idx])
            if day_idx < len(raw_rn_target)
            else default_rn_night_targets[day_idx]
            for day_idx in range(num_days)
        ]
    elif isinstance(raw_rn_target, dict):
        rn_night_targets = [
            _coerce_int(
                raw_rn_target.get(
                    day_idx,
                    raw_rn_target.get(str(day_idx), default_rn_night_targets[day_idx]),
                ),
                default_rn_night_targets[day_idx],
            )
            for day_idx in range(num_days)
        ]
    elif raw_rn_target is None:
        rn_night_targets = list(default_rn_night_targets)
    else:
        default_target = _coerce_int(raw_rn_target, 0)
        rn_night_targets = [default_target for _ in range(num_days)]

    raw_rn_allowed_excess = cfg.get("rn_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS)
    rn_night_allowed_excess = _coerce_int(
        raw_rn_allowed_excess,
        _DEFAULT_RN_NIGHT_ALLOWED_EXCESS,
    )

    return {
        "nurses_sorted": nurses_sorted,
        "nurse_names": nurse_names,
        "nurse_ranks": nurse_ranks,
        "num_days": num_days,
        "num_nurses": num_nurses,
        "demand": demand,
        "al_nurses_set": al_nurses_set,
        "al_day_req": al_day_req,
        "hard_assignments": hard_assignments,
        "soft_assignments": soft_assignments,
        "post_night_off": post_night_off,
        "leave_overlay": leave_overlay,
        "rank_a": rank_a,
        "rank_b": rank_b,
        "rank_c": rank_c,
        "rank_ab": rank_ab,
        "working_nurses": working_nurses,
        "working_ab": working_ab,
        "working_rank_a": working_rank_a,
        "working_rank_b": working_rank_b,
        "ab_weekly_do_targets": ab_weekly_do_targets,
        "ab_shift_ratio": ab_shift_ratio,
        "expected_ab_work_slots": expected_ab_work_slots,
        "ab_target_totals": ab_target_totals,
        "ab_target_ratios": ab_target_ratios,
        "ab_daily_targets": ab_daily_targets,
        "rn_night_targets": rn_night_targets,
        "rn_night_allowed_excess": rn_night_allowed_excess,
        "weights": ratio_weights,
    }


def _format_output(
    nurses_sorted: list[dict],
    schedule: list[list[int]],
    nurse_names: list[str],
    nurse_ranks: list[str],
    num_days: int,
    penalty_score: float,
    leave_overlay: dict[str, dict[int, str]],
) -> dict:
    leave_codes = _LEAVE_CODES | {"AL"}
    name_to_nurse = {nurse["name"]: nurse for nurse in nurses_sorted}
    output_nurses = []

    for idx, name in enumerate(nurse_names):
        nurse_info = name_to_nurse.get(name)
        if nurse_info is None:
            continue
        nurse_codes = schedule[idx] if idx < len(schedule) else [OFF] * num_days
        schedule_labels = [SHIFT_LABEL.get(code, "OFF") for code in nurse_codes]
        for day_idx, leave_code in (leave_overlay.get(name) or {}).items():
            if 0 <= day_idx < num_days:
                schedule_labels[day_idx] = leave_code

        off_count = 0
        for day_idx, label in enumerate(schedule_labels):
            if label == "OFF":
                off_count += 1
                if off_count % 2 == 0:
                    schedule_labels[day_idx] = "RD"

        output_nurses.append(
            {
                "id": nurse_info["id"],
                "name": name,
                "rank": nurse_ranks[idx],
                "schedule": schedule_labels,
                "stats": {
                    "total_shifts": sum(
                        1 for label in schedule_labels if label not in {"OFF", "RD"} and label not in leave_codes
                    ),
                    "am_shifts": schedule_labels.count("AM"),
                    "pm_shifts": schedule_labels.count("PM"),
                    "night_shifts": schedule_labels.count("NIGHT"),
                    "days_off": schedule_labels.count("OFF") + schedule_labels.count("RD"),
                    "al_days": sum(1 for label in schedule_labels if label in leave_codes),
                },
            }
        )

    output_nurses.sort(key=lambda nurse: nurse["id"])
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days": num_days,
            "num_nurses": len(output_nurses),
            "algorithm": "AB-RATIO",
            "penalty_score": penalty_score,
        },
    }


def run_ab_ratio_pipeline(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    progress_callback=None,
    milp_config: dict | None = None,
):
    if cp_model is None:
        raise RuntimeError(
            "AB-RATIO requires the optional 'ortools' dependency, but it is not installed in this environment."
        )

    if progress_callback:
        progress_callback(0, 4, float("inf"))

    parsed = parse_ab_ratio_inputs(
        nurses,
        shifts,
        hard_requests=hard_requests,
        soft_requests=soft_requests,
        prev_last_shift=prev_last_shift,
        shift_hours=shift_hours,
        non_working_shift_codes=non_working_shift_codes,
        milp_config=milp_config,
    )

    if progress_callback:
        progress_callback(1, 4, float("inf"))

    model = cp_model.CpModel()
    num_nurses = parsed["num_nurses"]
    num_days = parsed["num_days"]
    demand = parsed["demand"]
    working_nurses = parsed["working_nurses"]
    working_ab = parsed["working_ab"]
    rank_a = parsed["rank_a"]
    rank_b = parsed["rank_b"]
    rank_c = parsed["rank_c"]
    al_nurses_set = parsed["al_nurses_set"]
    al_day_req = parsed["al_day_req"]
    hard_assignments = parsed["hard_assignments"]
    soft_assignments = parsed["soft_assignments"]
    post_night_off = parsed["post_night_off"]
    working_rank_a = parsed["working_rank_a"]
    working_rank_b = parsed["working_rank_b"]
    ab_weekly_do_targets = parsed["ab_weekly_do_targets"]
    ab_daily_targets = parsed["ab_daily_targets"]
    rn_night_allowed_excess = parsed["rn_night_allowed_excess"]
    weights = parsed["weights"]

    x = {}
    for nurse_idx in range(num_nurses):
        for day_idx in range(num_days):
            for shift_code in ALL_SHIFTS:
                x[nurse_idx, day_idx, shift_code] = model.NewBoolVar(
                    f"x_{nurse_idx}_{day_idx}_{shift_code}"
                )

    for nurse_idx in range(num_nurses):
        for day_idx in range(num_days):
            model.AddExactlyOne([x[nurse_idx, day_idx, shift_code] for shift_code in ALL_SHIFTS])

    for nurse_idx in al_nurses_set:
        for day_idx in range(num_days):
            model.Add(x[nurse_idx, day_idx, AL] == 1)

    for nurse_idx in working_nurses:
        for day_idx in range(num_days):
            if day_idx not in al_day_req[nurse_idx]:
                model.Add(x[nurse_idx, day_idx, AL] == 0)

    for nurse_idx in working_nurses:
        for day_idx in al_day_req[nurse_idx]:
            model.Add(x[nurse_idx, day_idx, AL] == 1)

    for nurse_idx in post_night_off:
        if 0 not in al_day_req[nurse_idx]:
            model.Add(x[nurse_idx, 0, OFF] == 1)

    for nurse_idx in working_nurses:
        for day_idx, shift_code in hard_assignments[nurse_idx].items():
            model.Add(x[nurse_idx, day_idx, shift_code] == 1)

    penalty_vars: list[cp_model.IntVar] = []
    penalty_weights: list[int] = []

    def add_penalty(var: cp_model.IntVar, weight: int) -> None:
        penalty_vars.append(var)
        penalty_weights.append(weight)

    for day_idx in range(num_days):
        for shift_code in WORK_SHIFTS:
            req_c = demand[day_idx][shift_code]["C"]
            if req_c <= 0:
                continue
            count_c = sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in rank_c) if rank_c else 0
            c_short = model.NewIntVar(0, req_c, f"cover_c_{day_idx}_{shift_code}")
            model.Add(c_short >= req_c - count_c)
            add_penalty(c_short, weights["coverage_c"])

    for nurse_idx in working_ab:
        total_nights = sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(num_days))
        model.Add(total_nights >= 2)
        model.Add(total_nights <= 4)

        total_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(num_days))
        total_non_working = total_do + sum(x[nurse_idx, day_idx, AL] for day_idx in range(num_days))
        model.Add(total_non_working >= 4)
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
            model.Add(week_do == ab_weekly_do_targets[nurse_idx][week_index])

        for day_idx in range(num_days - 2):
            model.Add(
                x[nurse_idx, day_idx, NIGHT]
                + x[nurse_idx, day_idx + 1, NIGHT]
                + x[nurse_idx, day_idx + 2, NIGHT]
                <= 2
            )

        for day_idx in range(num_days - 1):
            next_non_working = x[nurse_idx, day_idx + 1, OFF] + x[nurse_idx, day_idx + 1, AL]
            model.Add(
                x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT] <= next_non_working
            )

        if num_days >= 2:
            model.Add(x[nurse_idx, 0, NIGHT] <= x[nurse_idx, 1, NIGHT])
            model.Add(x[nurse_idx, num_days - 1, NIGHT] <= x[nurse_idx, num_days - 2, NIGHT])
        for day_idx in range(1, num_days - 1):
            model.Add(
                x[nurse_idx, day_idx, NIGHT]
                <= x[nurse_idx, day_idx - 1, NIGHT] + x[nurse_idx, day_idx + 1, NIGHT]
            )

    ab_target_totals = parsed["ab_target_totals"]
    for shift_code, weight_key in ((AM, "ratio_am"), (PM, "ratio_pm"), (NIGHT, "ratio_night")):
        actual_total = model.NewIntVar(0, len(working_ab) * max(num_days, 1), f"ab_actual_{shift_code}")
        model.Add(
            actual_total
            == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in working_ab for day_idx in range(num_days))
        )
        diff = model.NewIntVar(
            -len(working_ab) * max(num_days, 1),
            len(working_ab) * max(num_days, 1),
            f"ab_diff_{shift_code}",
        )
        model.Add(diff == actual_total - ab_target_totals[shift_code])
        dev = model.NewIntVar(0, len(working_ab) * max(num_days, 1), f"ab_dev_{shift_code}")
        model.AddAbsEquality(dev, diff)
        add_penalty(dev, weights[weight_key])

    for shift_code, weight_key in (
        (AM, "daily_ratio_am"),
        (PM, "daily_ratio_pm"),
        (NIGHT, "daily_ratio_night"),
    ):
        for day_idx in range(num_days):
            actual_day_total = model.NewIntVar(0, len(working_ab), f"ab_day_actual_{shift_code}_{day_idx}")
            model.Add(
                actual_day_total
                == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in working_ab)
            )
            day_diff = model.NewIntVar(
                -len(working_ab),
                len(working_ab),
                f"ab_day_diff_{shift_code}_{day_idx}",
            )
            model.Add(day_diff == actual_day_total - ab_daily_targets[shift_code][day_idx])
            day_dev = model.NewIntVar(0, len(working_ab), f"ab_day_dev_{shift_code}_{day_idx}")
            model.AddAbsEquality(day_dev, day_diff)
            add_penalty(day_dev, weights[weight_key])

    for day_idx, target in enumerate(parsed["rn_night_targets"]):
        if target <= 0 or not rank_a:
            continue
        count_a_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_a)
        shortage = model.NewIntVar(0, target, f"rn_night_short_{day_idx}")
        model.Add(shortage >= target - count_a_night)
        add_penalty(shortage, weights["rn_night"])
        allowed_max = target + max(rn_night_allowed_excess, 0)
        over_cap = model.NewIntVar(0, len(rank_a), f"rn_night_over_{day_idx}")
        model.Add(over_cap >= count_a_night - allowed_max)
        add_penalty(over_cap, weights["rn_night_over"])

    if working_rank_a and working_rank_b:
        a_pool = len(working_rank_a)
        b_pool = len(working_rank_b)
        daily_balance_bound = len(working_ab) * max(a_pool, b_pool)
        shift_balance_bound = max(len(working_rank_a), len(working_rank_b)) * max(a_pool, b_pool)

        for day_idx in range(num_days):
            total_a_day = sum(
                x[nurse_idx, day_idx, shift_code]
                for nurse_idx in working_rank_a
                for shift_code in WORK_SHIFTS
            )
            total_b_day = sum(
                x[nurse_idx, day_idx, shift_code]
                for nurse_idx in working_rank_b
                for shift_code in WORK_SHIFTS
            )
            daily_balance_diff = model.NewIntVar(
                -daily_balance_bound,
                daily_balance_bound,
                f"class_balance_day_diff_{day_idx}",
            )
            model.Add(daily_balance_diff == total_a_day * b_pool - total_b_day * a_pool)
            daily_balance_dev = model.NewIntVar(
                0,
                daily_balance_bound,
                f"class_balance_day_dev_{day_idx}",
            )
            model.AddAbsEquality(daily_balance_dev, daily_balance_diff)
            add_penalty(daily_balance_dev, weights["class_balance_day"])

            for shift_code in WORK_SHIFTS:
                total_a_shift = sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in working_rank_a)
                total_b_shift = sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in working_rank_b)
                shift_balance_diff = model.NewIntVar(
                    -shift_balance_bound,
                    shift_balance_bound,
                    f"class_balance_shift_diff_{day_idx}_{shift_code}",
                )
                model.Add(shift_balance_diff == total_a_shift * b_pool - total_b_shift * a_pool)
                shift_balance_dev = model.NewIntVar(
                    0,
                    shift_balance_bound,
                    f"class_balance_shift_dev_{day_idx}_{shift_code}",
                )
                model.AddAbsEquality(shift_balance_dev, shift_balance_diff)
                add_penalty(shift_balance_dev, weights["class_balance_shift"])

    for nurse_idx in working_nurses:
        hard_days = set(hard_assignments[nurse_idx])
        for day_idx, shift_code in soft_assignments[nurse_idx].items():
            if day_idx in hard_days:
                continue
            violation = model.NewBoolVar(f"soft_req_{nurse_idx}_{day_idx}_{shift_code}")
            model.Add(violation + x[nurse_idx, day_idx, shift_code] >= 1)
            model.Add(violation <= 1 - x[nurse_idx, day_idx, shift_code])
            add_penalty(violation, weights["soft_request"])

    if progress_callback:
        progress_callback(2, 4, float("inf"))

    if penalty_vars:
        model.Minimize(cp_model.LinearExpr.WeightedSum(penalty_vars, penalty_weights))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(
        (milp_config or {}).get("ab_ratio_time_limit_s", _DEFAULT_TIME_LIMIT_S)
    )
    solver.parameters.num_search_workers = max(1, (os.cpu_count() or 2) - 1)
    solver.parameters.randomize_search = False
    solver.parameters.log_search_progress = False

    hint_sched = _build_greedy_hint(
        num_nurses,
        num_days,
        working_nurses,
        al_nurses_set,
        al_day_req,
        post_night_off,
        demand,
    )
    for nurse_idx in range(num_nurses):
        for day_idx in range(num_days):
            hinted_shift = hint_sched[nurse_idx][day_idx]
            for shift_code in ALL_SHIFTS:
                model.AddHint(x[nurse_idx, day_idx, shift_code], 1 if shift_code == hinted_shift else 0)

    if progress_callback:
        progress_callback(3, 4, float("inf"))

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(
            f"AB-RATIO solver returned '{solver.StatusName(status)}' - no feasible solution found."
        )

    schedule = []
    for nurse_idx in range(num_nurses):
        nurse_schedule = []
        for day_idx in range(num_days):
            assigned = OFF
            for shift_code in ALL_SHIFTS:
                if solver.Value(x[nurse_idx, day_idx, shift_code]):
                    assigned = shift_code
                    break
            nurse_schedule.append(assigned)
        schedule.append(nurse_schedule)

    penalty_score = solver.ObjectiveValue() if penalty_vars else 0.0
    if progress_callback:
        progress_callback(4, 4, penalty_score)

    return _format_output(
        parsed["nurses_sorted"],
        schedule,
        parsed["nurse_names"],
        parsed["nurse_ranks"],
        num_days,
        penalty_score,
        parsed["leave_overlay"],
    )
