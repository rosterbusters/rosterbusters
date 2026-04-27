"""
twelve_hour_algo.py
===================
OR-Tools CP-SAT nurse rostering for 12-hour ward schedules.

This module intentionally mirrors the AB-RATIO pipeline structure where it
makes sense, but adapts the model to 12-hour wards:
* Two shift types only: "A-12" and "N-12".
* 14-day planning horizon split into two 7-day weeks.
* Each nurse receives 3 OFF days per week (leave-adjusted).
* Rank-based night controls remain first-class constraints.
"""

from __future__ import annotations

import logging
import math
import os

try:
    from ortools.sat.python import cp_model
except ModuleNotFoundError:
    cp_model = None

OFF, A12, N12, AL = 0, 1, 2, 3
ALL_SHIFTS = [OFF, A12, N12, AL]
WORK_SHIFTS = [A12, N12]
SHIFT_LABEL = {OFF: "OFF", A12: "A-12", N12: "N-12", AL: "AL"}

_SHIFT_STR_TO_CODE: dict[str, int] = {
    "A-12": A12,
    "A12": A12,
    "A_12": A12,
    "DAY": A12,
    "N-12": N12,
    "N12": N12,
    "N_12": N12,
    "NIGHT": N12,
    "OFF": OFF,
    "DO": OFF,
    "RD": OFF,
    "AL": AL,
}

_LEAVE_CODES = {"HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}
_DEFAULT_TIME_LIMIT_S = 120.0
_DEFAULT_WEIGHT_CAP = 2_000_000
_WEEKLY_DAYOFFS = 3

_DEFAULT_WEIGHTS = {
    "coverage_short": 2_000_000,
    "dayoff_under": 1_600_000,
    "dayoff_over": 1_440_000,
    "overall_ratio_a12": 30_000,
    "overall_ratio_n12": 30_000,
    "rank_a_ratio": 80_000,
    "daily_ratio_a12": 6_000,
    "daily_ratio_n12": 8_000,
    "daily_total_night_overflow": 80_000,
    "daily_total_night_overflow_tier2": 150_000,
    "daily_total_night_overflow_tier3": 320_000,
    "rn_night": 100_000,
    "rn_night_over": 500_000,
    "rank_b_night": 100_000,
    "rank_b_night_over": 500_000,
    "rank_c_night_over": 14_000,
    "min_nights": 100_000,
    "consec_n12": 300_000,
    "isolated_n12": 100_000,
    "double_n12_pref": 120_000,
    "post_night_rest": 1_500_000,
    "daily_total_shift_balance": 24_000,
    "soft_request": 2_000,
}

_DEFAULT_SHIFT_RATIO = {A12: 6.0, N12: 5.0}
_DEFAULT_RANK_A_SHIFT_RATIO = {A12: 2.0, N12: 1.0}
_DEFAULT_RN_NIGHT_ALLOWED_EXCESS = 1
_DEFAULT_RANK_A_NIGHT_CAP_MODE = "hard_then_soft"
_DEFAULT_RANK_B_NIGHT_MIN_MODE = "hard_then_soft"
_DEFAULT_DAILY_TOTAL_SHIFT_GAP_TARGET = 1

logger = logging.getLogger(__name__)


def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def _normalize_rank_night_mode(value, default_mode: str) -> str:
    normalized = str(value).strip().lower() if value is not None else default_mode
    if normalized in {"hard", "strict"}:
        return "hard"
    if normalized in {"hard_then_soft", "strict_then_soft", "fallback_soft"}:
        return "hard_then_soft"
    if normalized in {"soft", "penalty_only"}:
        return "soft"
    return default_mode


def _normalize_ratio(config_ratio, default_ratio: dict[int, float]) -> dict[int, float]:
    normalized = dict(default_ratio)
    if isinstance(config_ratio, dict):
        for raw_key, value in config_ratio.items():
            key = str(raw_key).strip().upper()
            if key in {"A-12", "A12", "A_12", "DAY"}:
                normalized[A12] = max(_coerce_float(value, normalized[A12]), 0.0)
            elif key in {"N-12", "N12", "N_12", "NIGHT"}:
                normalized[N12] = max(_coerce_float(value, normalized[N12]), 0.0)
    return normalized


def _normalize_ratio_weights(weights: dict[str, int], max_weight: int) -> dict[str, int]:
    positive_values = [value for value in weights.values() if value > 0]
    if not positive_values:
        return weights
    current_max = max(positive_values)
    if current_max <= max_weight:
        return weights
    scale = max_weight / current_max
    normalized: dict[str, int] = {}
    for key, value in weights.items():
        if value <= 0:
            normalized[key] = 0
        else:
            normalized[key] = max(1, int(round(value * scale)))
    return normalized


def _priority_weight(raw_priority) -> int:
    return 5 if str(raw_priority).strip().lower() == "approved" else 1


def _resolve_daily_targets(raw_target, default_targets: list[int]) -> list[int]:
    num_days = len(default_targets)
    if isinstance(raw_target, (list, tuple)):
        return [
            _coerce_int(raw_target[day_idx], default_targets[day_idx])
            if day_idx < len(raw_target)
            else default_targets[day_idx]
            for day_idx in range(num_days)
        ]
    if isinstance(raw_target, dict):
        return [
            _coerce_int(
                raw_target.get(day_idx, raw_target.get(str(day_idx), default_targets[day_idx])),
                default_targets[day_idx],
            )
            for day_idx in range(num_days)
        ]
    if raw_target is None:
        return list(default_targets)
    default_value = _coerce_int(raw_target, 0)
    return [default_value for _ in range(num_days)]


def _to_internal_code(raw, leave_codes: set[str], non_working_codes: set[str]) -> int | None:
    normalized = str(raw).strip().upper()
    if normalized in _SHIFT_STR_TO_CODE:
        return _SHIFT_STR_TO_CODE[normalized]
    if normalized in leave_codes or normalized in non_working_codes:
        return AL
    return None


def _has_no_night_constraint(nurse: dict) -> bool:
    if nurse.get("no_night"):
        return True
    for constraint in nurse.get("constraints") or []:
        constraint_type = str(
            constraint.get("constraint_type", constraint.get("type", ""))
        ).strip().upper()
        if constraint_type == "NO_NIGHT":
            return True
    return False


def _leave_adjusted_weekly_do_target(free_days: int, leave_days: int, fixed_off_days: int = 0) -> int:
    if free_days <= 0:
        return 0
    if leave_days >= 5:
        return free_days
    return min(free_days, max(round(_WEEKLY_DAYOFFS * free_days / 7), fixed_off_days))


def _build_shift_targets(total_slots: int, ratio_weights: dict[int, float]) -> tuple[dict[int, int], dict[int, float]]:
    grand_total = sum(max(float(ratio_weights.get(shift_code, 0.0)), 0.0) for shift_code in WORK_SHIFTS)
    if total_slots <= 0 or grand_total <= 0:
        return {A12: 0, N12: 0}, {A12: 0.0, N12: 0.0}

    exact_targets = {
        shift_code: (total_slots * max(float(ratio_weights.get(shift_code, 0.0)), 0.0) / grand_total)
        for shift_code in WORK_SHIFTS
    }
    totals = {shift_code: int(exact_targets[shift_code]) for shift_code in WORK_SHIFTS}
    assigned = sum(totals.values())
    remainder_order = sorted(
        WORK_SHIFTS,
        key=lambda shift_code: (exact_targets[shift_code] - totals[shift_code], -shift_code),
        reverse=True,
    )
    for index in range(total_slots - assigned):
        totals[remainder_order[index % len(remainder_order)]] += 1

    ratios = {shift_code: (totals[shift_code] / total_slots if total_slots else 0.0) for shift_code in WORK_SHIFTS}
    return totals, ratios


def _distribute_targets(total: int, num_days: int) -> list[int]:
    if num_days <= 0:
        return []
    base = total // num_days
    remainder = total % num_days
    return [base + (1 if day_idx < remainder else 0) for day_idx in range(num_days)]


def _emit_infeasibility_diagnostics(parsed: dict) -> None:
    nurse_names = parsed["nurse_names"]
    nurse_ranks = parsed["nurse_ranks"]
    working_nurses = parsed["working_nurses"]
    no_night_ids = parsed["no_night_ids"]
    al_day_req = parsed["al_day_req"]
    demand = parsed["demand"]
    num_days = parsed["num_days"]

    for day_idx in range(num_days):
        eligible_by_rank = {"A": [], "B": [], "C": []}
        for nurse_idx in working_nurses:
            if nurse_idx in no_night_ids or day_idx in al_day_req[nurse_idx]:
                continue
            eligible_by_rank[nurse_ranks[nurse_idx]].append(nurse_idx)
        for rank in "ABC":
            required = demand[day_idx][N12].get(rank, 0)
            if len(eligible_by_rank[rank]) < required:
                logger.warning(
                    "[12HR-DEBUG] insufficient rank %s night candidates on day %s: required=%s eligible=%s candidates=%s",
                    rank,
                    day_idx,
                    required,
                    len(eligible_by_rank[rank]),
                    [nurse_names[nurse_idx] for nurse_idx in eligible_by_rank[rank]],
                )


def _build_greedy_hint(
    num_nurses: int,
    num_days: int,
    working_nurses: list[int],
    nurse_ranks: list[str],
    al_nurses_set: set[int],
    al_day_req: list[set[int]],
    post_night_off: set[int],
    hard_assignments: list[dict[int, int]],
    weekly_off_targets: dict[int, list[int]],
    no_night_ids: set[int],
    rank_a_night_caps: list[int],
    rank_b_night_targets: list[int],
    rank_b_night_caps: list[int],
    rank_c_night_caps: list[int],
) -> list[list[int]]:
    sched = [[A12] * num_days for _ in range(num_nurses)]
    pinned = [[False] * num_days for _ in range(num_nurses)]

    for nurse_idx in al_nurses_set:
        for day_idx in range(num_days):
            sched[nurse_idx][day_idx] = AL
            pinned[nurse_idx][day_idx] = True

    for nurse_idx in working_nurses:
        for day_idx in al_day_req[nurse_idx]:
            if 0 <= day_idx < num_days:
                sched[nurse_idx][day_idx] = AL
                pinned[nurse_idx][day_idx] = True

    for nurse_idx in post_night_off:
        if num_days > 0 and not pinned[nurse_idx][0]:
            sched[nurse_idx][0] = OFF
            pinned[nurse_idx][0] = True

    for nurse_idx in working_nurses:
        for day_idx, shift_code in hard_assignments[nurse_idx].items():
            if 0 <= day_idx < num_days:
                sched[nurse_idx][day_idx] = shift_code
                pinned[nurse_idx][day_idx] = True

    for nurse_idx in working_nurses:
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            target_off = weekly_off_targets.get(nurse_idx, [])
            target = target_off[week_index] if week_index < len(target_off) else _WEEKLY_DAYOFFS
            existing_off = sum(1 for day_idx in range(week_start, week_end) if sched[nurse_idx][day_idx] == OFF)
            to_add = max(0, target - existing_off)
            candidates = sorted(
                [
                    day_idx
                    for day_idx in range(week_start, week_end)
                    if not pinned[nurse_idx][day_idx] and sched[nurse_idx][day_idx] not in (OFF, AL)
                ],
                key=lambda day_idx: (0 if day_idx % 7 in (5, 6) else 1),
            )
            for day_idx in candidates[:to_add]:
                sched[nurse_idx][day_idx] = OFF
                pinned[nurse_idx][day_idx] = True

    total_nights = [0] * num_nurses
    weekly_nights = [[0] * math.ceil(max(num_days, 1) / 7) for _ in range(num_nurses)]
    for nurse_idx in working_nurses:
        for day_idx in range(num_days):
            if sched[nurse_idx][day_idx] == N12:
                total_nights[nurse_idx] += 1
                weekly_nights[nurse_idx][day_idx // 7] += 1

    def can_assign_night(nurse_idx: int, day_idx: int) -> bool:
        if nurse_idx in no_night_ids or pinned[nurse_idx][day_idx]:
            return False
        if sched[nurse_idx][day_idx] in (OFF, AL):
            return False
        if total_nights[nurse_idx] >= 4:
            return False
        week_idx = day_idx // 7
        if weekly_nights[nurse_idx][week_idx] >= 2:
            return False
        if day_idx >= 2 and sched[nurse_idx][day_idx - 1] == N12 and sched[nurse_idx][day_idx - 2] == N12:
            return False
        if day_idx > 0 and sched[nurse_idx][day_idx - 1] == N12:
            return False
        return True

    def assign_night(nurse_idx: int, day_idx: int) -> None:
        sched[nurse_idx][day_idx] = N12
        total_nights[nurse_idx] += 1
        weekly_nights[nurse_idx][day_idx // 7] += 1

    for day_idx in range(num_days):
        rank_pools = {
            "A": [n for n in working_nurses if nurse_ranks[n] == "A"],
            "B": [n for n in working_nurses if nurse_ranks[n] == "B"],
            "C": [n for n in working_nurses if nurse_ranks[n] == "C"],
        }
        assigned_counts = {"A": 0, "B": 0, "C": 0}
        night_caps = {
            "A": rank_a_night_caps[day_idx],
            "B": rank_b_night_caps[day_idx],
            "C": rank_c_night_caps[day_idx],
        }
        night_mins = {"A": 0, "B": rank_b_night_targets[day_idx], "C": 0}

        for rank in ("B", "A", "C"):
            for nurse_idx in rank_pools[rank]:
                if assigned_counts[rank] >= night_caps[rank]:
                    break
                if assigned_counts[rank] < night_mins[rank] and can_assign_night(nurse_idx, day_idx):
                    assign_night(nurse_idx, day_idx)
                    assigned_counts[rank] += 1

        for rank in ("A", "B", "C"):
            for nurse_idx in rank_pools[rank]:
                if assigned_counts[rank] >= night_caps[rank]:
                    break
                if can_assign_night(nurse_idx, day_idx):
                    assign_night(nurse_idx, day_idx)
                    assigned_counts[rank] += 1

    for nurse_idx in working_nurses:
        for day_idx in range(num_days - 1):
            if sched[nurse_idx][day_idx] == N12 and sched[nurse_idx][day_idx + 1] != N12:
                if not pinned[nurse_idx][day_idx + 1] and (day_idx + 1) not in al_day_req[nurse_idx]:
                    sched[nurse_idx][day_idx + 1] = OFF

    return sched


def _parse_inputs(
    nurses,
    shifts,
    hard_requests,
    soft_requests,
    prev_last_shift,
    shift_hours,
    non_working_shift_codes,
    milp_config,
) -> dict:
    hard_requests = hard_requests or {}
    soft_requests = soft_requests or {}
    prev_last_shift = prev_last_shift or {}
    _ = shift_hours
    cfg = dict(milp_config or {})
    non_working_codes = {str(code).strip().upper() for code in (non_working_shift_codes or set())}
    leave_codes = _LEAVE_CODES | {"AL"}

    nurses_sorted = sorted(nurses, key=lambda nurse: nurse["id"])
    num_days = len(shifts)
    num_nurses = len(nurses_sorted)
    nurse_names = [nurse["name"] for nurse in nurses_sorted]
    nurse_ranks = [nurse["rank"] for nurse in nurses_sorted]
    id_to_idx = {nurse["id"]: idx for idx, nurse in enumerate(nurses_sorted)}
    id_to_name = {nurse["id"]: nurse["name"] for nurse in nurses_sorted}
    no_night_ids = {
        idx for idx, nurse in enumerate(nurses_sorted) if _has_no_night_constraint(nurse)
    }

    demand: list[dict[int, dict[str, int]]] = []
    for day in shifts:
        day_demand: dict[int, dict[str, int]] = {}
        for raw_key, code in (("A-12", A12), ("N-12", N12)):
            req = day.get(raw_key) or day.get(raw_key.replace("-", "")) or day.get("DAY" if code == A12 else "NIGHT") or {}
            day_demand[code] = {rank: _coerce_int(req.get(rank, 0), 0) for rank in "ABC"}
        demand.append(day_demand)

    al_nurses_set: set[int] = set()
    al_day_req: list[set[int]] = [set() for _ in range(num_nurses)]
    hard_assignments: list[dict[int, int]] = [{} for _ in range(num_nurses)]
    soft_assignments: list[dict[int, tuple[int, int]]] = [{} for _ in range(num_nurses)]
    leave_overlay: dict[str, dict[int, str]] = {}

    for nurse_id, req_list in hard_requests.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None:
            continue
        for item in req_list:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            day_idx, raw_shift = item[0], item[1]
            if not 0 <= day_idx < num_days:
                continue
            shift_code = _to_internal_code(raw_shift, leave_codes, non_working_codes)
            if shift_code is None:
                continue
            if shift_code == AL:
                al_day_req[nurse_idx].add(day_idx)
                leave_overlay.setdefault(id_to_name[nurse_id], {})[day_idx] = str(raw_shift).strip().upper()
                continue
            if shift_code == N12 and nurse_idx in no_night_ids:
                continue
            hard_assignments[nurse_idx][day_idx] = shift_code

    for nurse_id, req_list in soft_requests.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None:
            continue
        for item in req_list:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            day_idx, raw_shift = item[0], item[1]
            priority = item[2] if len(item) >= 3 else "pending"
            if not 0 <= day_idx < num_days:
                continue
            shift_code = _to_internal_code(raw_shift, leave_codes, non_working_codes)
            if shift_code is None or shift_code == AL:
                continue
            if shift_code == N12 and nurse_idx in no_night_ids:
                continue
            soft_assignments[nurse_idx][day_idx] = (shift_code, _priority_weight(priority))

    for nurse_idx, days in enumerate(al_day_req):
        if len(days) >= num_days:
            al_nurses_set.add(nurse_idx)

    working_nurses = [idx for idx in range(num_nurses) if idx not in al_nurses_set]
    rank_a = [idx for idx in range(num_nurses) if nurse_ranks[idx] == "A"]
    rank_b = [idx for idx in range(num_nurses) if nurse_ranks[idx] == "B"]
    rank_c = [idx for idx in range(num_nurses) if nurse_ranks[idx] == "C"]
    ratio_working_rank_a = [idx for idx in working_nurses if nurse_ranks[idx] == "A" and idx not in no_night_ids]
    ratio_working_rank_b = [idx for idx in working_nurses if nurse_ranks[idx] == "B" and idx not in no_night_ids]
    ratio_working_rank_c = [idx for idx in working_nurses if nurse_ranks[idx] == "C" and idx not in no_night_ids]
    night_eligible = [idx for idx in working_nurses if idx not in no_night_ids]

    post_night_off: set[int] = set()
    for nurse_id, shift_name in prev_last_shift.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None or nurse_idx in al_nurses_set:
            continue
        if str(shift_name).strip().upper() in {"N-12", "N12", "N_12", "NIGHT"}:
            post_night_off.add(nurse_idx)

    def build_weekly_off_targets(group_nurses: list[int]) -> tuple[dict[int, list[int]], int]:
        weekly_targets: dict[int, list[int]] = {}
        expected_work_slots = 0
        for nurse_idx in group_nurses:
            nurse_targets = []
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
                leave_days = sum(1 for day_idx in range(week_start, week_end) if day_idx in al_day_req[nurse_idx])
                week_len = week_end - week_start
                free_days = max(0, week_len - leave_days)
                target_do = _leave_adjusted_weekly_do_target(free_days, leave_days, len(fixed_off_days))
                expected_work_slots += max(0, free_days - target_do)
                nurse_targets.append(target_do)
            weekly_targets[nurse_idx] = nurse_targets
        return weekly_targets, expected_work_slots

    weekly_off_targets, expected_work_slots = build_weekly_off_targets(working_nurses)
    overall_shift_ratio = _normalize_ratio(cfg.get("twelve_hour_shift_ratio"), _DEFAULT_SHIFT_RATIO)
    rank_a_shift_ratio = _normalize_ratio(cfg.get("rank_a_twelve_hour_shift_ratio"), _DEFAULT_RANK_A_SHIFT_RATIO)
    overall_target_totals, _ = _build_shift_targets(expected_work_slots, overall_shift_ratio)

    rank_a_work_slots = sum(
        max(0, 7 - sum(1 for day_idx in range(week_start, min(week_start + 7, num_days)) if day_idx in al_day_req[nurse_idx]) - weekly_off_targets[nurse_idx][week_index])
        for nurse_idx in rank_a
        if nurse_idx in working_nurses
        for week_index, week_start in enumerate(range(0, num_days, 7))
    )
    rank_a_target_totals, _ = _build_shift_targets(rank_a_work_slots, rank_a_shift_ratio)
    overall_daily_targets = {
        shift_code: _distribute_targets(overall_target_totals[shift_code], num_days) for shift_code in WORK_SHIFTS
    }
    rank_a_daily_targets = {
        shift_code: _distribute_targets(rank_a_target_totals[shift_code], num_days) for shift_code in WORK_SHIFTS
    }

    default_rn_night_targets = [demand[day_idx][N12]["A"] for day_idx in range(num_days)]
    rn_night_targets = _resolve_daily_targets(cfg.get("rn_night_min_per_day"), default_rn_night_targets)
    rn_night_allowed_excess = _coerce_int(
        cfg.get("rn_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS),
        _DEFAULT_RN_NIGHT_ALLOWED_EXCESS,
    )

    default_rank_a_caps = [demand[day_idx][N12]["A"] for day_idx in range(num_days)]
    rank_a_night_caps = _resolve_daily_targets(
        cfg.get("rank_a_night_cap_per_day", cfg.get("a_night_cap_per_day")),
        default_rank_a_caps,
    )
    rank_a_night_allowed_excess = _coerce_int(
        cfg.get("rank_a_night_allowed_excess", cfg.get("a_night_allowed_excess", rn_night_allowed_excess)),
        rn_night_allowed_excess,
    )
    rank_a_night_cap_mode = _normalize_rank_night_mode(
        cfg.get("rank_a_night_cap_mode", cfg.get("a_night_cap_mode")),
        _DEFAULT_RANK_A_NIGHT_CAP_MODE,
    )

    default_rank_b_targets = [demand[day_idx][N12]["B"] for day_idx in range(num_days)]
    rank_b_night_targets = _resolve_daily_targets(
        cfg.get("rank_b_night_min_per_day", cfg.get("b_night_min_per_day")),
        default_rank_b_targets,
    )
    default_rank_b_caps = [demand[day_idx][N12]["B"] for day_idx in range(num_days)]
    rank_b_night_caps = _resolve_daily_targets(
        cfg.get("rank_b_night_cap_per_day", cfg.get("b_night_cap_per_day")),
        default_rank_b_caps,
    )
    rank_b_night_allowed_excess = _coerce_int(
        cfg.get("rank_b_night_allowed_excess", cfg.get("b_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS)),
        _DEFAULT_RN_NIGHT_ALLOWED_EXCESS,
    )
    rank_b_night_min_mode = _normalize_rank_night_mode(
        cfg.get("rank_b_night_min_mode", cfg.get("b_night_min_mode")),
        _DEFAULT_RANK_B_NIGHT_MIN_MODE,
    )

    hca_policy = cfg.get("HCA") if isinstance(cfg.get("HCA"), dict) else {}
    default_rank_c_caps = [demand[day_idx][N12]["C"] for day_idx in range(num_days)]
    rank_c_night_caps = _resolve_daily_targets(
        cfg.get("rank_c_night_cap_per_day", cfg.get("c_night_cap_per_day", hca_policy.get("max_night_per_day"))),
        default_rank_c_caps,
    )
    rank_c_night_allowed_excess = _coerce_int(
        cfg.get("rank_c_night_allowed_excess", cfg.get("c_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS)),
        _DEFAULT_RN_NIGHT_ALLOWED_EXCESS,
    )

    weights = dict(_DEFAULT_WEIGHTS)
    weights.update(cfg.get("twelve_hour_weights") or {})
    weights["soft_request"] = _coerce_int(cfg.get("soft_request_weight"), weights["soft_request"])
    weight_cap = max(_coerce_int(cfg.get("twelve_hour_weight_cap"), _DEFAULT_WEIGHT_CAP), 1)
    weights = _normalize_ratio_weights(weights, weight_cap)

    return {
        "cfg": cfg,
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
        "leave_overlay": leave_overlay,
        "working_nurses": working_nurses,
        "rank_a": rank_a,
        "rank_b": rank_b,
        "rank_c": rank_c,
        "ratio_working_rank_a": ratio_working_rank_a,
        "ratio_working_rank_b": ratio_working_rank_b,
        "ratio_working_rank_c": ratio_working_rank_c,
        "night_eligible": night_eligible,
        "no_night_ids": no_night_ids,
        "post_night_off": post_night_off,
        "weekly_off_targets": weekly_off_targets,
        "overall_target_totals": overall_target_totals,
        "overall_daily_targets": overall_daily_targets,
        "rank_a_target_totals": rank_a_target_totals,
        "rank_a_daily_targets": rank_a_daily_targets,
        "rn_night_targets": rn_night_targets,
        "rn_night_allowed_excess": rn_night_allowed_excess,
        "rank_a_night_caps": rank_a_night_caps,
        "rank_a_night_allowed_excess": rank_a_night_allowed_excess,
        "rank_a_night_cap_mode": rank_a_night_cap_mode,
        "rank_b_night_targets": rank_b_night_targets,
        "rank_b_night_caps": rank_b_night_caps,
        "rank_b_night_allowed_excess": rank_b_night_allowed_excess,
        "rank_b_night_min_mode": rank_b_night_min_mode,
        "rank_c_night_caps": rank_c_night_caps,
        "rank_c_night_allowed_excess": rank_c_night_allowed_excess,
        "weights": weights,
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
    output_nurses: list[dict] = []

    for idx, name in enumerate(nurse_names):
        nurse_info = name_to_nurse.get(name)
        if nurse_info is None:
            continue
        raw_codes = schedule[idx] if idx < len(schedule) else [OFF] * num_days
        labels = [SHIFT_LABEL.get(code, "OFF") for code in raw_codes]
        for day_idx, leave_code in (leave_overlay.get(name) or {}).items():
            if 0 <= day_idx < num_days:
                labels[day_idx] = leave_code

        off_count = 0
        for day_idx, label in enumerate(labels):
            if label == "OFF":
                off_count += 1
                if off_count % 2 == 0:
                    labels[day_idx] = "RD"

        output_nurses.append(
            {
                "id": nurse_info["id"],
                "name": name,
                "rank": nurse_ranks[idx],
                "schedule": labels,
                "stats": {
                    "total_shifts": sum(1 for label in labels if label not in {"OFF", "RD"} and label not in leave_codes),
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


def run_twelve_hour_pipeline(
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
            "12HR rostering requires the optional 'ortools' dependency, "
            "but it is not installed in this environment."
        )

    if progress_callback:
        progress_callback(0, 4, float("inf"))

    parsed = _parse_inputs(
        nurses,
        shifts,
        hard_requests,
        soft_requests,
        prev_last_shift,
        shift_hours,
        non_working_shift_codes,
        milp_config,
    )
    _emit_infeasibility_diagnostics(parsed)
    cfg = parsed["cfg"]

    relax_min_nights = _coerce_bool(cfg.get("_12hr_relax_min_nights"), False)
    min_nights_required = max(0, _coerce_int(cfg.get("twelve_hour_min_nights"), 2))
    relax_weekly_off = _coerce_bool(cfg.get("_12hr_relax_weekly_off"), False)
    relax_post_night_rest = _coerce_bool(cfg.get("_12hr_relax_post_night_rest"), False)
    relax_no_three_nights = _coerce_bool(cfg.get("_12hr_relax_no_three_nights"), False)
    relax_rank_night_mins = _coerce_bool(cfg.get("_12hr_relax_rank_night_mins"), False)
    relax_rank_a_night_cap = _coerce_bool(cfg.get("_12hr_relax_rank_a_night_cap"), False)
    relax_rank_b_night_min = _coerce_bool(cfg.get("_12hr_relax_rank_b_night_min"), False)
    relax_rank_c_night_cap = _coerce_bool(cfg.get("_12hr_relax_rank_c_night_cap"), False)
    diagnostic_retry_active = _coerce_bool(cfg.get("_12hr_diag_active"), False)

    if progress_callback:
        progress_callback(1, 4, float("inf"))

    model = cp_model.CpModel()
    num_nurses = parsed["num_nurses"]
    num_days = parsed["num_days"]
    nurse_names = parsed["nurse_names"]
    nurse_ranks = parsed["nurse_ranks"]
    demand = parsed["demand"]
    working_nurses = parsed["working_nurses"]
    rank_a = parsed["rank_a"]
    rank_b = parsed["rank_b"]
    rank_c = parsed["rank_c"]
    ratio_working_rank_a = parsed["ratio_working_rank_a"]
    ratio_working_rank_b = parsed["ratio_working_rank_b"]
    ratio_working_rank_c = parsed["ratio_working_rank_c"]
    night_eligible = parsed["night_eligible"]
    no_night_ids = parsed["no_night_ids"]
    al_nurses_set = parsed["al_nurses_set"]
    al_day_req = parsed["al_day_req"]
    hard_assignments = parsed["hard_assignments"]
    soft_assignments = parsed["soft_assignments"]
    post_night_off = parsed["post_night_off"]
    weekly_off_targets = parsed["weekly_off_targets"]
    weights = parsed["weights"]

    x: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for nurse_idx in range(num_nurses):
        for day_idx in range(num_days):
            for shift_code in ALL_SHIFTS:
                x[nurse_idx, day_idx, shift_code] = model.NewBoolVar(f"x_{nurse_idx}_{day_idx}_{shift_code}")

    for nurse_idx in range(num_nurses):
        for day_idx in range(num_days):
            model.AddExactlyOne([x[nurse_idx, day_idx, shift_code] for shift_code in ALL_SHIFTS])

    for nurse_idx in al_nurses_set:
        for day_idx in range(num_days):
            model.Add(x[nurse_idx, day_idx, AL] == 1)

    for nurse_idx in working_nurses:
        for day_idx in range(num_days):
            model.Add(x[nurse_idx, day_idx, AL] == (1 if day_idx in al_day_req[nurse_idx] else 0))

    for nurse_idx in working_nurses:
        for day_idx, shift_code in hard_assignments[nurse_idx].items():
            if shift_code == N12 and nurse_idx in no_night_ids:
                raise RuntimeError(
                    f"12HR infeasible: nurse '{nurse_names[nurse_idx]}' cannot work N-12 but has a hard night request on day {day_idx}."
                )
            model.Add(x[nurse_idx, day_idx, shift_code] == 1)

    for nurse_idx in no_night_ids:
        for day_idx in range(num_days):
            if day_idx not in al_day_req[nurse_idx]:
                model.Add(x[nurse_idx, day_idx, N12] == 0)

    if not relax_post_night_rest:
        for nurse_idx in post_night_off:
            if 0 not in al_day_req[nurse_idx]:
                model.Add(x[nurse_idx, 0, OFF] == 1)

    penalty_vars: list[cp_model.IntVar] = []
    penalty_weights: list[int] = []

    def add_penalty(var: cp_model.IntVar, weight: int) -> None:
        penalty_vars.append(var)
        penalty_weights.append(weight)

    def add_shortfall(name: str, supplied_expr, required: int, weight: int, cap: int) -> None:
        shortfall = model.NewIntVar(0, max(cap, required, 1), name)
        model.Add(shortfall >= required - supplied_expr)
        add_penalty(shortfall, weight)

    nurses_with_leave_days = {nurse_idx for nurse_idx in working_nurses if al_day_req[nurse_idx]}
    if nurses_with_leave_days:
        logger.warning(
            "[12HR-DEBUG] leave-day nurses excluded from min-nights: %s",
            ", ".join(
                f"{nurse_names[nurse_idx]} (#{nurse_idx}, rank {nurse_ranks[nurse_idx]})"
                for nurse_idx in sorted(nurses_with_leave_days)
            ),
        )

    def add_min_nights_rule(nurse_idx: int, total_nights: cp_model.LinearExpr) -> None:
        if min_nights_required <= 0 or nurse_idx in no_night_ids or nurse_idx in nurses_with_leave_days:
            return
        if not relax_min_nights:
            model.Add(total_nights >= min_nights_required)
            return
        shortfall = model.NewIntVar(0, min_nights_required, f"min_nights_shortfall_{nurse_idx}")
        model.Add(shortfall >= min_nights_required - total_nights)
        add_penalty(shortfall, weights["min_nights"])

    for day_idx in range(num_days):
        req_total = sum(demand[day_idx][N12].get(rank, 0) for rank in "ABC")
        actual_total = model.NewIntVar(0, len(night_eligible), f"n12_total_{day_idx}")
        model.Add(actual_total == sum(x[nurse_idx, day_idx, N12] for nurse_idx in night_eligible))
        add_shortfall(f"coverage_n12_{day_idx}", actual_total, req_total, weights["coverage_short"], len(night_eligible))

        req_a = demand[day_idx][N12]["A"]
        if req_a > 0 and rank_a:
            count_a = model.NewIntVar(0, len(rank_a), f"n12_a_{day_idx}")
            model.Add(count_a == sum(x[nurse_idx, day_idx, N12] for nurse_idx in rank_a))
            add_shortfall(f"coverage_n12_a_{day_idx}", count_a, req_a, weights["coverage_short"], len(rank_a))

        req_ab = demand[day_idx][N12]["A"] + demand[day_idx][N12]["B"]
        if req_ab > 0 and (rank_a or rank_b):
            count_ab = model.NewIntVar(0, len(rank_a) + len(rank_b), f"n12_ab_{day_idx}")
            model.Add(count_ab == sum(x[nurse_idx, day_idx, N12] for nurse_idx in rank_a + rank_b))
            add_shortfall(
                f"coverage_n12_ab_{day_idx}",
                count_ab,
                req_ab,
                weights["coverage_short"] // 2,
                len(rank_a) + len(rank_b),
            )

    for nurse_idx in working_nurses:
        total_nights = sum(x[nurse_idx, day_idx, N12] for day_idx in range(num_days))
        add_min_nights_rule(nurse_idx, total_nights)
        if nurse_idx in no_night_ids:
            model.Add(total_nights == 0)
        else:
            model.Add(total_nights <= 4)
            for week_start in range(0, num_days, 7):
                week_end = min(week_start + 7, num_days)
                model.Add(sum(x[nurse_idx, day_idx, N12] for day_idx in range(week_start, week_end)) <= 2)

        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_off = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
            target = weekly_off_targets[nurse_idx][week_index]
            if not relax_weekly_off:
                model.Add(week_off == target)
            else:
                under = model.NewIntVar(0, max(target, 1), f"week_off_under_{nurse_idx}_{week_index}")
                over = model.NewIntVar(0, max(week_end - week_start, 1), f"week_off_over_{nurse_idx}_{week_index}")
                model.Add(under >= target - week_off)
                model.Add(over >= week_off - target)
                add_penalty(under, weights["dayoff_under"])
                add_penalty(over, weights["dayoff_over"])

        if nurse_idx not in no_night_ids:
            for day_idx in range(num_days - 2):
                if not relax_no_three_nights:
                    model.Add(
                        x[nurse_idx, day_idx, N12]
                        + x[nurse_idx, day_idx + 1, N12]
                        + x[nurse_idx, day_idx + 2, N12]
                        <= 2
                    )
                else:
                    over = model.NewIntVar(0, 1, f"consec_n12_{nurse_idx}_{day_idx}")
                    model.Add(
                        over
                        >= x[nurse_idx, day_idx, N12]
                        + x[nurse_idx, day_idx + 1, N12]
                        + x[nurse_idx, day_idx + 2, N12]
                        - 2
                    )
                    add_penalty(over, weights["consec_n12"])

            for day_idx in range(num_days - 1):
                next_non_working = x[nurse_idx, day_idx + 1, OFF] + x[nurse_idx, day_idx + 1, AL]
                if not relax_post_night_rest:
                    model.Add(x[nurse_idx, day_idx, N12] - x[nurse_idx, day_idx + 1, N12] <= next_non_working)
                else:
                    violation = model.NewIntVar(0, 1, f"post_night_rest_{nurse_idx}_{day_idx}")
                    model.Add(violation >= x[nurse_idx, day_idx, N12] - x[nurse_idx, day_idx + 1, N12] - next_non_working)
                    add_penalty(violation, weights["post_night_rest"])

            for day_idx in range(num_days):
                if day_idx == 0 and nurse_idx in post_night_off:
                    continue
                if day_idx == num_days - 1:
                    continue
                isolated = model.NewBoolVar(f"isolated_n12_{nurse_idx}_{day_idx}")
                if day_idx == 0:
                    model.Add(isolated >= x[nurse_idx, day_idx, N12] - x[nurse_idx, day_idx + 1, N12])
                else:
                    model.Add(
                        isolated
                        >= x[nurse_idx, day_idx, N12]
                        - x[nurse_idx, day_idx - 1, N12]
                        - x[nurse_idx, day_idx + 1, N12]
                    )
                add_penalty(isolated, weights["isolated_n12"])

    overall_target_totals = parsed["overall_target_totals"]
    actual_a12_total = model.NewIntVar(0, len(working_nurses) * max(num_days, 1), "overall_a12_total")
    actual_n12_total = model.NewIntVar(0, len(working_nurses) * max(num_days, 1), "overall_n12_total")
    model.Add(actual_a12_total == sum(x[nurse_idx, day_idx, A12] for nurse_idx in working_nurses for day_idx in range(num_days)))
    model.Add(actual_n12_total == sum(x[nurse_idx, day_idx, N12] for nurse_idx in working_nurses for day_idx in range(num_days)))
    for shift_code, actual_total, weight_key in (
        (A12, actual_a12_total, "overall_ratio_a12"),
        (N12, actual_n12_total, "overall_ratio_n12"),
    ):
        diff = model.NewIntVar(
            -len(working_nurses) * max(num_days, 1),
            len(working_nurses) * max(num_days, 1),
            f"overall_diff_{shift_code}",
        )
        model.Add(diff == actual_total - overall_target_totals[shift_code])
        dev = model.NewIntVar(0, len(working_nurses) * max(num_days, 1), f"overall_dev_{shift_code}")
        model.AddAbsEquality(dev, diff)
        add_penalty(dev, weights[weight_key])

    for nurse_idx in ratio_working_rank_a:
        total_work = sum(x[nurse_idx, day_idx, shift_code] for day_idx in range(num_days) for shift_code in WORK_SHIFTS)
        n12_count = sum(x[nurse_idx, day_idx, N12] for day_idx in range(num_days))
        diff_over = model.NewIntVar(0, num_days * 3, f"rank_a_ratio_over_{nurse_idx}")
        diff_under = model.NewIntVar(0, num_days * 3, f"rank_a_ratio_under_{nurse_idx}")
        model.Add(diff_over >= total_work - 3 * n12_count)
        model.Add(diff_under >= 3 * n12_count - total_work)
        add_penalty(diff_over, weights["rank_a_ratio"])
        add_penalty(diff_under, weights["rank_a_ratio"])

    overall_daily_targets = parsed["overall_daily_targets"]
    for day_idx in range(num_days):
        for shift_code, weight_key in ((A12, "daily_ratio_a12"), (N12, "daily_ratio_n12")):
            actual_day_total = model.NewIntVar(0, len(working_nurses), f"overall_day_total_{shift_code}_{day_idx}")
            model.Add(actual_day_total == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in working_nurses))
            day_diff = model.NewIntVar(-len(working_nurses), len(working_nurses), f"overall_day_diff_{shift_code}_{day_idx}")
            model.Add(day_diff == actual_day_total - overall_daily_targets[shift_code][day_idx])
            day_dev = model.NewIntVar(0, len(working_nurses), f"overall_day_dev_{shift_code}_{day_idx}")
            model.AddAbsEquality(day_dev, day_diff)
            add_penalty(day_dev, weights[weight_key])

    if ratio_working_rank_a:
        rank_a_daily_targets = parsed["rank_a_daily_targets"]
        for day_idx in range(num_days):
            actual_rank_a_n12 = model.NewIntVar(0, len(ratio_working_rank_a), f"rank_a_day_n12_{day_idx}")
            model.Add(actual_rank_a_n12 == sum(x[nurse_idx, day_idx, N12] for nurse_idx in ratio_working_rank_a))
            day_diff = model.NewIntVar(-len(ratio_working_rank_a), len(ratio_working_rank_a), f"rank_a_day_diff_{day_idx}")
            model.Add(day_diff == actual_rank_a_n12 - rank_a_daily_targets[N12][day_idx])
            day_dev = model.NewIntVar(0, len(ratio_working_rank_a), f"rank_a_day_dev_{day_idx}")
            model.AddAbsEquality(day_dev, day_diff)
            add_penalty(day_dev, weights["rank_a_ratio"])

    if night_eligible:
        total_night_targets = [
            demand[day_idx][N12]["A"] + demand[day_idx][N12]["B"] + demand[day_idx][N12]["C"]
            for day_idx in range(num_days)
        ]
        for day_idx, target in enumerate(total_night_targets):
            actual_total_night = model.NewIntVar(0, len(night_eligible), f"total_day_n12_{day_idx}")
            model.Add(actual_total_night == sum(x[nurse_idx, day_idx, N12] for nurse_idx in night_eligible))
            overflow_tier1 = model.NewIntVar(0, len(night_eligible), f"total_day_n12_overflow_{day_idx}")
            overflow_tier2 = model.NewIntVar(0, len(night_eligible), f"total_day_n12_overflow_tier2_{day_idx}")
            overflow_tier3 = model.NewIntVar(0, len(night_eligible), f"total_day_n12_overflow_tier3_{day_idx}")
            model.Add(overflow_tier1 >= actual_total_night - target)
            model.Add(overflow_tier2 >= actual_total_night - (target + 1))
            model.Add(overflow_tier3 >= actual_total_night - (target + 2))
            add_penalty(overflow_tier1, weights["daily_total_night_overflow"])
            add_penalty(overflow_tier2, weights["daily_total_night_overflow_tier2"])
            add_penalty(overflow_tier3, weights["daily_total_night_overflow_tier3"])

    if ratio_working_rank_a:
        for day_idx in range(num_days):
            count_a_night = sum(x[nurse_idx, day_idx, N12] for nurse_idx in rank_a)
            target = parsed["rn_night_targets"][day_idx]
            cap = parsed["rank_a_night_caps"][day_idx]
            allowed_max = cap + max(parsed["rank_a_night_allowed_excess"], 0)
            if target > 0:
                if parsed["rank_a_night_cap_mode"] in {"hard", "hard_then_soft"} and not relax_rank_night_mins:
                    model.Add(count_a_night >= target)
                else:
                    shortfall = model.NewIntVar(0, max(target, len(rank_a)), f"rn_night_shortfall_{day_idx}")
                    model.Add(shortfall >= target - count_a_night)
                    add_penalty(shortfall, weights["rn_night"])
            if parsed["rank_a_night_cap_mode"] in {"hard", "hard_then_soft"} and not relax_rank_a_night_cap:
                model.Add(count_a_night <= cap)
            else:
                over_cap = model.NewIntVar(0, len(rank_a), f"rn_night_over_{day_idx}")
                model.Add(over_cap >= count_a_night - allowed_max)
                add_penalty(over_cap, weights["rn_night_over"])

    if ratio_working_rank_b or rank_b:
        for day_idx in range(num_days):
            count_b_night = sum(x[nurse_idx, day_idx, N12] for nurse_idx in rank_b)
            target = parsed["rank_b_night_targets"][day_idx]
            cap = parsed["rank_b_night_caps"][day_idx]
            allowed_max = cap + max(parsed["rank_b_night_allowed_excess"], 0)
            if target > 0:
                if parsed["rank_b_night_min_mode"] in {"hard", "hard_then_soft"} and not relax_rank_night_mins and not relax_rank_b_night_min:
                    model.Add(count_b_night >= target)
                else:
                    shortfall = model.NewIntVar(0, max(target, len(rank_b)), f"rank_b_night_shortfall_{day_idx}")
                    model.Add(shortfall >= target - count_b_night)
                    add_penalty(shortfall, weights["rank_b_night"])
            over_cap = model.NewIntVar(0, max(len(rank_b), 1), f"rank_b_night_over_{day_idx}")
            model.Add(over_cap >= count_b_night - allowed_max)
            add_penalty(over_cap, weights["rank_b_night_over"])

    if rank_c:
        for day_idx, cap in enumerate(parsed["rank_c_night_caps"]):
            count_c_night = sum(x[nurse_idx, day_idx, N12] for nurse_idx in rank_c)
            if not relax_rank_c_night_cap:
                model.Add(count_c_night <= cap)
            else:
                allowed_max = cap + max(parsed["rank_c_night_allowed_excess"], 0)
                over_cap = model.NewIntVar(0, len(rank_c), f"rank_c_night_over_{day_idx}")
                model.Add(over_cap >= count_c_night - allowed_max)
                add_penalty(over_cap, weights["rank_c_night_over"])

    if parsed["cfg"].get("daily_total_shift_balance_enabled", True):
        daily_gap_target = max(
            _coerce_int(parsed["cfg"].get("daily_total_shift_gap_target"), _DEFAULT_DAILY_TOTAL_SHIFT_GAP_TARGET),
            0,
        )
        for day_idx in range(num_days):
            shift_totals = [
                model.NewIntVar(0, len(working_nurses), f"day_total_{shift_code}_{day_idx}") for shift_code in WORK_SHIFTS
            ]
            for total_var, shift_code in zip(shift_totals, WORK_SHIFTS):
                model.Add(total_var == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in working_nurses))
            day_max = model.NewIntVar(0, len(working_nurses), f"day_total_max_{day_idx}")
            day_min = model.NewIntVar(0, len(working_nurses), f"day_total_min_{day_idx}")
            model.AddMaxEquality(day_max, shift_totals)
            model.AddMinEquality(day_min, shift_totals)
            spread = model.NewIntVar(0, len(working_nurses), f"day_total_spread_{day_idx}")
            model.Add(spread == day_max - day_min)
            gap_penalty = model.NewIntVar(0, len(working_nurses), f"day_total_gap_penalty_{day_idx}")
            model.Add(gap_penalty >= spread - daily_gap_target)
            add_penalty(gap_penalty, weights["daily_total_shift_balance"])

    for nurse_idx in working_nurses:
        hard_days = set(hard_assignments[nurse_idx])
        for day_idx, (shift_code, request_weight) in soft_assignments[nurse_idx].items():
            if day_idx in hard_days or day_idx in al_day_req[nurse_idx]:
                continue
            violation = model.NewBoolVar(f"soft_req_{nurse_idx}_{day_idx}_{shift_code}")
            model.Add(violation + x[nurse_idx, day_idx, shift_code] >= 1)
            model.Add(violation <= 1 - x[nurse_idx, day_idx, shift_code])
            add_penalty(violation, weights["soft_request"] * request_weight)

    if progress_callback:
        progress_callback(2, 4, float("inf"))

    if penalty_vars:
        model.Minimize(cp_model.LinearExpr.WeightedSum(penalty_vars, penalty_weights))

    hint_sched = _build_greedy_hint(
        num_nurses,
        num_days,
        working_nurses,
        nurse_ranks,
        al_nurses_set,
        al_day_req,
        post_night_off,
        hard_assignments,
        weekly_off_targets,
        no_night_ids,
        parsed["rank_a_night_caps"],
        parsed["rank_b_night_targets"],
        parsed["rank_b_night_caps"],
        parsed["rank_c_night_caps"],
    )
    for nurse_idx in range(num_nurses):
        for day_idx in range(num_days):
            hinted_shift = hint_sched[nurse_idx][day_idx]
            for shift_code in ALL_SHIFTS:
                model.AddHint(x[nurse_idx, day_idx, shift_code], 1 if shift_code == hinted_shift else 0)

    if progress_callback:
        progress_callback(3, 4, float("inf"))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(cfg.get("twelve_hour_time_limit_s", _DEFAULT_TIME_LIMIT_S))
    solver.parameters.num_search_workers = max(1, (os.cpu_count() or 2) - 1)
    solver.parameters.log_search_progress = False

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if (
            parsed["rank_b_night_min_mode"] == "hard_then_soft"
            and not relax_rank_night_mins
            and not relax_rank_b_night_min
            and not diagnostic_retry_active
        ):
            retry_config = dict(cfg)
            retry_config["_12hr_relax_rank_b_night_min"] = True
            logger.warning("[12HR-DEBUG] strict rank B night minimum infeasible; retrying with soft minimum fallback")
            return run_twelve_hour_pipeline(
                nurses,
                shifts,
                hard_requests=hard_requests,
                soft_requests=soft_requests,
                prev_last_shift=prev_last_shift,
                shift_hours=shift_hours,
                non_working_shift_codes=non_working_shift_codes,
                progress_callback=progress_callback,
                milp_config=retry_config,
            )
        if (
            parsed["rank_a_night_cap_mode"] == "hard_then_soft"
            and not relax_rank_a_night_cap
            and not diagnostic_retry_active
        ):
            retry_config = dict(cfg)
            retry_config["_12hr_relax_rank_a_night_cap"] = True
            logger.warning("[12HR-DEBUG] strict rank A night cap infeasible; retrying with soft cap fallback")
            return run_twelve_hour_pipeline(
                nurses,
                shifts,
                hard_requests=hard_requests,
                soft_requests=soft_requests,
                prev_last_shift=prev_last_shift,
                shift_hours=shift_hours,
                non_working_shift_codes=non_working_shift_codes,
                progress_callback=progress_callback,
                milp_config=retry_config,
            )

        feasible_relaxations: list[str] = []
        if not diagnostic_retry_active:
            diagnostic_profiles = [
                ("post_night_rest", {"_12hr_relax_post_night_rest": True}),
                ("min_nights", {"_12hr_relax_min_nights": True}),
                ("weekly_off", {"_12hr_relax_weekly_off": True}),
                ("no_three_nights", {"_12hr_relax_no_three_nights": True}),
                ("rank_night_mins", {"_12hr_relax_rank_night_mins": True}),
            ]
            for label, overrides in diagnostic_profiles:
                diag_config = dict(cfg)
                diag_config.update(overrides)
                diag_config["_12hr_diag_active"] = True
                try:
                    run_twelve_hour_pipeline(
                        nurses,
                        shifts,
                        hard_requests=hard_requests,
                        soft_requests=soft_requests,
                        prev_last_shift=prev_last_shift,
                        shift_hours=shift_hours,
                        non_working_shift_codes=non_working_shift_codes,
                        progress_callback=None,
                        milp_config=diag_config,
                    )
                except RuntimeError:
                    logger.warning("[12HR-DEBUG] diagnostic relaxation still infeasible: %s", label)
                else:
                    feasible_relaxations.append(label)
                    logger.warning("[12HR-DEBUG] diagnostic relaxation became feasible: %s", label)

        if not relax_min_nights and feasible_relaxations == ["min_nights"]:
            retry_config = dict(cfg)
            retry_config["_12hr_relax_min_nights"] = True
            logger.warning(
                "[12HR-DEBUG] hard minimum %s-night requirement infeasible; retrying with soft minimum fallback",
                min_nights_required,
            )
            return run_twelve_hour_pipeline(
                nurses,
                shifts,
                hard_requests=hard_requests,
                soft_requests=soft_requests,
                prev_last_shift=prev_last_shift,
                shift_hours=shift_hours,
                non_working_shift_codes=non_working_shift_codes,
                progress_callback=progress_callback,
                milp_config=retry_config,
            )

        if feasible_relaxations == ["rank_night_mins"]:
            raise RuntimeError(
                "12HR infeasible: the hard rank A/B daily night minimums cannot be met with the current "
                "night-demand mix, leave requests, and available rank coverage."
            )

        raise RuntimeError(
            f"12HR CP-SAT solver returned '{solver.StatusName(status)}' - no feasible solution found."
        )

    schedule: list[list[int]] = []
    for nurse_idx in range(num_nurses):
        row: list[int] = []
        for day_idx in range(num_days):
            assigned = OFF
            for shift_code in ALL_SHIFTS:
                if solver.Value(x[nurse_idx, day_idx, shift_code]):
                    assigned = shift_code
                    break
            row.append(assigned)
        schedule.append(row)

    penalty_score = solver.ObjectiveValue() if penalty_vars else 0.0
    if progress_callback:
        progress_callback(4, 4, penalty_score)

    return _format_output(
        parsed["nurses_sorted"],
        schedule,
        nurse_names,
        nurse_ranks,
        num_days,
        penalty_score,
        parsed["leave_overlay"],
    )
