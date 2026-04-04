from __future__ import annotations

import logging
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
    "coverage_c_am": 600_000,
    "coverage_c_pm": 450_000,
    "coverage_c_night": 300_000,
    "ratio_am": 8_000,
    "ratio_pm": 8_000,
    "ratio_night": 9_000,
    "daily_ratio_am": 3_000,
    "daily_ratio_pm": 3_000,
    "daily_ratio_night": 4_000,
    "rn_night": 18_000,
    "rn_night_over": 18_000,
    "rank_b_night": 18_000,
    "rank_b_night_over": 18_000,
    "rank_c_night": 9_000,
    "rank_c_night_over": 14_000,
    "daily_total_shift_balance": 8_000,
    "daily_total_shift_balance_c": 3_500,
    "daily_ap_balance": 6_000,
    "c_ratio_am": 4_000,
    "c_ratio_pm": 4_200,
    "c_ratio_night": 4_200,
    "c_daily_ratio_am": 1_800,
    "c_daily_ratio_pm": 2_600,
    "c_daily_ratio_night": 2_600,
    "soft_request": 200,
}
_DEFAULT_TIME_LIMIT_S = 60.0
_DEFAULT_AB_SHIFT_RATIO = {
    AM: 3.1,
    PM: 3,
    NIGHT: 2,
}
_DEFAULT_C_SHIFT_RATIO = {
    AM: 2,
    PM: 1,
    NIGHT: 1,
}
_DEFAULT_RN_NIGHT_ALLOWED_EXCESS = 1
_DEFAULT_DAILY_TOTAL_SHIFT_GAP_TARGET = 2
_DEFAULT_DAILY_TOTAL_SHIFT_BALANCE_ENABLED = True
_DEFAULT_AB_RATIO_COVERAGE_MODE = "night_caps_only"

logger = logging.getLogger(__name__)


class ABRatioInfeasibilityError(RuntimeError):
    """Raised when AB-RATIO is deterministically infeasible under current hard rules."""


def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
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


def _normalize_ab_ratio_coverage_mode(value) -> str:
    normalized = str(value).strip().lower() if value is not None else _DEFAULT_AB_RATIO_COVERAGE_MODE
    if normalized in {"current", "with_coverage", "coverage"}:
        return "current"
    if normalized in {"night_caps_only", "no_coverage", "ratio_dominant"}:
        return "night_caps_only"
    return _DEFAULT_AB_RATIO_COVERAGE_MODE


def _to_internal_code(raw, leave_codes: set[str], non_working_codes: set[str]) -> int | None:
    normalized = str(raw).strip().upper()
    if normalized in _SHIFT_STR_TO_CODE:
        return _SHIFT_STR_TO_CODE[normalized]
    if normalized in leave_codes or normalized in non_working_codes:
        return AL
    return None


def _get_shift_pattern(nurse: dict) -> str | None:
    raw = nurse.get("shift_pattern")
    if raw is None:
        return None
    normalized = str(raw).strip().upper()
    if normalized in {"AM_ONLY", "PM_ONLY"}:
        return normalized
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


def _is_disallowed_work_shift(shift_code: int, shift_pattern: str | None, no_night: bool) -> bool:
    if shift_code == AL:
        return False
    if no_night and shift_code == NIGHT:
        return True
    if shift_pattern == "AM_ONLY" and shift_code in {PM, NIGHT}:
        return True
    if shift_pattern == "PM_ONLY" and shift_code in {AM, NIGHT}:
        return True
    return False


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
                raw_target.get(
                    day_idx,
                    raw_target.get(str(day_idx), default_targets[day_idx]),
                ),
                default_targets[day_idx],
            )
            for day_idx in range(num_days)
        ]
    if raw_target is None:
        return list(default_targets)
    default_target = _coerce_int(raw_target, 0)
    return [default_target for _ in range(num_days)]


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


def _normalize_c_shift_ratio(config_ratio) -> dict[int, int]:
    normalized = dict(_DEFAULT_C_SHIFT_RATIO)
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


def _emit_infeasibility_diagnostics(parsed: dict) -> None:
    nurse_names = parsed["nurse_names"]
    nurse_ranks = parsed["nurse_ranks"]
    num_days = parsed["num_days"]
    demand = parsed["demand"]
    hard_assignments = parsed["hard_assignments"]
    al_day_req = parsed["al_day_req"]
    post_night_off = parsed["post_night_off"]
    no_night_ids = parsed["no_night_ids"]
    shift_pattern_by_nurse = parsed["shift_pattern_by_nurse"]
    pattern_weekly_do_targets = parsed["pattern_weekly_do_targets"]

    def nurse_label(nurse_idx: int) -> str:
        return f"{nurse_names[nurse_idx]} (#{nurse_idx}, rank {nurse_ranks[nurse_idx]})"

    if no_night_ids:
        logger.warning(
            "[AB-DEBUG] no-night nurses: %s",
            ", ".join(nurse_label(nurse_idx) for nurse_idx in sorted(no_night_ids)),
        )
    pattern_lines = []
    for nurse_idx, shift_pattern in shift_pattern_by_nurse.items():
        if shift_pattern:
            pattern_lines.append(f"{nurse_label(nurse_idx)}={shift_pattern}")
    if pattern_lines:
        logger.warning("[AB-DEBUG] permanent-pattern nurses: %s", ", ".join(pattern_lines))
    if post_night_off:
        logger.warning(
            "[AB-DEBUG] day-0 forced off from previous night: %s",
            ", ".join(nurse_label(nurse_idx) for nurse_idx in sorted(post_night_off)),
        )

    for nurse_idx, assignments in enumerate(hard_assignments):
        hard_night_days = sorted(day_idx for day_idx, shift_code in assignments.items() if shift_code == NIGHT)
        if len(hard_night_days) > 4:
            logger.warning(
                "[AB-DEBUG] nurse has >4 hard night assignments: %s days=%s",
                nurse_label(nurse_idx),
                hard_night_days,
            )
        for start in range(len(hard_night_days) - 2):
            run = hard_night_days[start : start + 3]
            if run[0] + 1 == run[1] and run[1] + 1 == run[2]:
                logger.warning(
                    "[AB-DEBUG] nurse has 3 consecutive hard night assignments: %s days=%s",
                    nurse_label(nurse_idx),
                    run,
                )

    for nurse_idx, shift_pattern in shift_pattern_by_nurse.items():
        if not shift_pattern:
            continue
        preferred_shift = AM if shift_pattern == "AM_ONLY" else PM
        disallowed_shift = PM if shift_pattern == "AM_ONLY" else AM
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            leave_days = sum(1 for day_idx in range(week_start, week_end) if day_idx in al_day_req[nurse_idx])
            free_days = max(0, (week_end - week_start) - leave_days)
            off_target = pattern_weekly_do_targets.get(nurse_idx, [])[week_index]
            preferred_target = free_days - off_target
            hard_preferred_days = sorted(
                day_idx
                for day_idx, shift_code in hard_assignments[nurse_idx].items()
                if week_start <= day_idx < week_end and shift_code == preferred_shift
            )
            hard_off_days = sorted(
                day_idx
                for day_idx, shift_code in hard_assignments[nurse_idx].items()
                if week_start <= day_idx < week_end and shift_code == OFF
            )
            hard_disallowed_days = sorted(
                day_idx
                for day_idx, shift_code in hard_assignments[nurse_idx].items()
                if week_start <= day_idx < week_end and shift_code in {disallowed_shift, NIGHT}
            )
            if len(hard_preferred_days) > preferred_target:
                logger.warning(
                    "[AB-DEBUG] pattern nurse exceeds weekly preferred target: %s week=%s preferred_target=%s hard_days=%s",
                    nurse_label(nurse_idx),
                    week_index + 1,
                    preferred_target,
                    hard_preferred_days,
                )
            if len(hard_off_days) > off_target:
                logger.warning(
                    "[AB-DEBUG] pattern nurse exceeds weekly off target: %s week=%s off_target=%s hard_off_days=%s",
                    nurse_label(nurse_idx),
                    week_index + 1,
                    off_target,
                    hard_off_days,
                )
            if hard_disallowed_days:
                logger.warning(
                    "[AB-DEBUG] pattern nurse has disallowed hard shifts: %s week=%s days=%s",
                    nurse_label(nurse_idx),
                    week_index + 1,
                    hard_disallowed_days,
                )

    for day_idx in range(num_days):
        required_a = demand[day_idx][NIGHT]["A"]
        required_b = demand[day_idx][NIGHT]["B"]
        eligible_a = []
        eligible_b = []
        for nurse_idx, rank in enumerate(nurse_ranks):
            if day_idx in al_day_req[nurse_idx]:
                continue
            if nurse_idx in no_night_ids:
                continue
            if shift_pattern_by_nurse.get(nurse_idx):
                continue
            forced_shift = hard_assignments[nurse_idx].get(day_idx)
            if forced_shift not in {None, NIGHT}:
                continue
            if rank == "A":
                eligible_a.append(nurse_idx)
            elif rank == "B":
                eligible_b.append(nurse_idx)
        if len(eligible_a) < required_a:
            logger.warning(
                "[AB-DEBUG] insufficient rank A night candidates on day %s: required=%s eligible=%s candidates=%s",
                day_idx,
                required_a,
                len(eligible_a),
                [nurse_names[nurse_idx] for nurse_idx in eligible_a],
            )
        if len(eligible_b) < required_b:
            logger.warning(
                "[AB-DEBUG] insufficient rank B night candidates on day %s: required=%s eligible=%s candidates=%s",
                day_idx,
                required_b,
                len(eligible_b),
                [nurse_names[nurse_idx] for nurse_idx in eligible_b],
            )


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
    shift_pattern_by_nurse = {
        idx: _get_shift_pattern(nurse) for idx, nurse in enumerate(nurses_sorted)
    }
    no_night_ids = {
        idx for idx, nurse in enumerate(nurses_sorted) if _has_no_night_constraint(nurse)
    }

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
            if _is_disallowed_work_shift(
                shift_code,
                shift_pattern_by_nurse.get(nurse_idx),
                nurse_idx in no_night_ids,
            ):
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
            if _is_disallowed_work_shift(
                shift_code,
                shift_pattern_by_nurse.get(nurse_idx),
                nurse_idx in no_night_ids,
            ):
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
    working_rank_c = [idx for idx in working_nurses if nurse_ranks[idx] == "C"]
    working_rank_a = [idx for idx in working_ab if nurse_ranks[idx] == "A"]
    working_rank_b = [idx for idx in working_ab if nurse_ranks[idx] == "B"]
    pattern_nurses = {
        idx for idx, pattern in shift_pattern_by_nurse.items() if pattern is not None
    }
    ratio_working_ab = [idx for idx in working_ab if idx not in pattern_nurses]
    ratio_working_rank_c = [idx for idx in working_rank_c if idx not in pattern_nurses]
    ratio_working_rank_a = [idx for idx in working_rank_a if idx not in pattern_nurses]
    ratio_working_rank_b = [idx for idx in working_rank_b if idx not in pattern_nurses]

    post_night_off: set[int] = set()
    for nurse_id, shift_name in prev_last_shift.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None or nurse_idx in al_nurses_set:
            continue
        if str(shift_name).strip().upper() == "NIGHT":
            post_night_off.add(nurse_idx)

    for nurse_idx in post_night_off:
        forced_day_zero = hard_assignments[nurse_idx].get(0)
        if forced_day_zero is not None and forced_day_zero != OFF and 0 not in al_day_req[nurse_idx]:
            del hard_assignments[nurse_idx][0]

    cfg = dict(milp_config or {})
    ratio_weights = dict(_DEFAULT_WEIGHTS)
    ratio_weights.update(cfg.get("ab_ratio_weights") or {})
    ratio_weights["ratio_night"] = _coerce_int(
        cfg.get("night_ratio_weight"), ratio_weights["ratio_night"]
    )
    ratio_weights["soft_request"] = _coerce_int(
        cfg.get("soft_request_weight"), ratio_weights["soft_request"]
    )
    legacy_coverage_c_weight = cfg.get("coverage_c_weight")
    if legacy_coverage_c_weight is not None:
        legacy_coverage_c_weight = _coerce_int(
            legacy_coverage_c_weight,
            ratio_weights["coverage_c_am"],
        )
        ratio_weights["coverage_c_am"] = legacy_coverage_c_weight
        ratio_weights["coverage_c_pm"] = legacy_coverage_c_weight
        ratio_weights["coverage_c_night"] = legacy_coverage_c_weight
    ratio_weights["coverage_c_am"] = _coerce_int(
        cfg.get("coverage_c_am_weight"),
        ratio_weights["coverage_c_am"],
    )
    ratio_weights["coverage_c_pm"] = _coerce_int(
        cfg.get("coverage_c_pm_weight"),
        ratio_weights["coverage_c_pm"],
    )
    ratio_weights["coverage_c_night"] = _coerce_int(
        cfg.get("coverage_c_night_weight"),
        ratio_weights["coverage_c_night"],
    )
    ratio_weights["rn_night"] = _coerce_int(
        cfg.get("rn_night_weight"), ratio_weights["rn_night"]
    )
    ratio_weights["rn_night_over"] = _coerce_int(
        cfg.get("rn_night_over_weight"), ratio_weights["rn_night_over"]
    )
    ratio_weights["rank_b_night"] = _coerce_int(
        cfg.get("rank_b_night_weight"),
        ratio_weights["rank_b_night"],
    )
    ratio_weights["rank_b_night_over"] = _coerce_int(
        cfg.get("rank_b_night_over_weight"),
        ratio_weights["rank_b_night_over"],
    )
    ratio_weights["rank_c_night_over"] = _coerce_int(
        cfg.get("rank_c_night_over_weight"),
        ratio_weights["rank_c_night_over"],
    )
    ratio_weights["rank_c_night"] = _coerce_int(
        cfg.get("rank_c_night_weight"),
        ratio_weights["rank_c_night"],
    )
    ratio_weights["daily_total_shift_balance"] = _coerce_int(
        cfg.get("daily_total_shift_balance_weight"),
        ratio_weights["daily_total_shift_balance"],
    )
    ratio_weights["daily_total_shift_balance_c"] = _coerce_int(
        cfg.get("daily_total_shift_balance_c_weight"),
        ratio_weights["daily_total_shift_balance_c"],
    )
    ratio_weights["daily_ap_balance"] = _coerce_int(
        cfg.get("daily_ap_balance_weight"),
        ratio_weights["daily_ap_balance"],
    )
    ratio_weights["c_ratio_am"] = _coerce_int(
        cfg.get("c_ratio_am_weight"),
        ratio_weights["c_ratio_am"],
    )
    ratio_weights["c_ratio_pm"] = _coerce_int(
        cfg.get("c_ratio_pm_weight"),
        ratio_weights["c_ratio_pm"],
    )
    ratio_weights["c_ratio_night"] = _coerce_int(
        cfg.get("c_ratio_night_weight"),
        ratio_weights["c_ratio_night"],
    )
    ratio_weights["c_daily_ratio_am"] = _coerce_int(
        cfg.get("c_daily_ratio_am_weight"),
        ratio_weights["c_daily_ratio_am"],
    )
    ratio_weights["c_daily_ratio_pm"] = _coerce_int(
        cfg.get("c_daily_ratio_pm_weight"),
        ratio_weights["c_daily_ratio_pm"],
    )
    ratio_weights["c_daily_ratio_night"] = _coerce_int(
        cfg.get("c_daily_ratio_night_weight"),
        ratio_weights["c_daily_ratio_night"],
    )
    ab_shift_ratio = _normalize_ab_shift_ratio(cfg.get("ab_shift_ratio"))
    c_shift_ratio = _normalize_c_shift_ratio(cfg.get("c_shift_ratio"))
    ab_ratio_coverage_mode = _normalize_ab_ratio_coverage_mode(
        cfg.get("ab_ratio_coverage_mode")
    )
    daily_total_shift_balance_enabled = _coerce_bool(
        cfg.get("daily_total_shift_balance_enabled"),
        _DEFAULT_DAILY_TOTAL_SHIFT_BALANCE_ENABLED,
    )
    daily_total_shift_gap_target = max(
        _coerce_int(
            cfg.get("daily_total_shift_gap_target"),
            _DEFAULT_DAILY_TOTAL_SHIFT_GAP_TARGET,
        ),
        0,
    )

    def _build_weekly_do_targets_for_group(group_nurses: list[int]) -> tuple[dict[int, list[int]], int]:
        weekly_targets_by_nurse: dict[int, list[int]] = {}
        expected_work_slots = 0

        for nurse_idx in group_nurses:
            weekly_targets = []
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
                leave_days = sum(
                    1 for day_idx in range(week_start, week_end) if day_idx in al_day_req[nurse_idx]
                )
                week_len = week_end - week_start
                free_days = max(0, week_len - leave_days)
                shift_pattern = shift_pattern_by_nurse.get(nurse_idx)
                if shift_pattern in {"AM_ONLY", "PM_ONLY"}:
                    min_off_days = min(len(fixed_off_days), free_days)
                    preferred_target = min(4, max(0, free_days - min_off_days))
                    target_do = free_days - preferred_target
                    expected_work_slots += preferred_target
                else:
                    target_do = max(_weekly_do_target(week_len), len(fixed_off_days))
                    expected_work_slots += max(0, free_days - target_do)
                weekly_targets.append(target_do)

            weekly_targets_by_nurse[nurse_idx] = weekly_targets

        return weekly_targets_by_nurse, expected_work_slots

    ab_weekly_do_targets: dict[int, list[int]] = {}
    expected_ab_work_slots = 0
    if ratio_working_ab:
        ab_weekly_do_targets, expected_ab_work_slots = _build_weekly_do_targets_for_group(ratio_working_ab)

    ab_target_totals, ab_target_ratios = _build_ab_targets(expected_ab_work_slots, ab_shift_ratio)
    ab_daily_targets = {
        shift_code: _distribute_targets(ab_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    expected_a_work_slots = 0
    if ratio_working_rank_a:
        _, expected_a_work_slots = _build_weekly_do_targets_for_group(ratio_working_rank_a)
    a_target_totals, _ = _build_ab_targets(expected_a_work_slots, ab_shift_ratio)
    a_daily_targets = {
        shift_code: _distribute_targets(a_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    expected_b_work_slots = 0
    if ratio_working_rank_b:
        _, expected_b_work_slots = _build_weekly_do_targets_for_group(ratio_working_rank_b)
    b_target_totals, _ = _build_ab_targets(expected_b_work_slots, ab_shift_ratio)
    b_daily_targets = {
        shift_code: _distribute_targets(b_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    c_weekly_do_targets: dict[int, list[int]] = {}
    expected_c_work_slots = 0
    if ratio_working_rank_c:
        c_weekly_do_targets, expected_c_work_slots = _build_weekly_do_targets_for_group(ratio_working_rank_c)

    pattern_weekly_do_targets: dict[int, list[int]] = {}
    if pattern_nurses:
        pattern_weekly_do_targets, _ = _build_weekly_do_targets_for_group(sorted(pattern_nurses))
    c_target_totals, c_target_ratios = _build_ab_targets(expected_c_work_slots, c_shift_ratio)
    c_daily_targets = {
        shift_code: _distribute_targets(c_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    default_rn_night_targets = [demand[day_idx][NIGHT]["A"] for day_idx in range(num_days)]
    raw_rn_target = cfg.get("rn_night_min_per_day")
    rn_night_targets = _resolve_daily_targets(raw_rn_target, default_rn_night_targets)

    raw_rn_allowed_excess = cfg.get("rn_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS)
    rn_night_allowed_excess = _coerce_int(
        raw_rn_allowed_excess,
        _DEFAULT_RN_NIGHT_ALLOWED_EXCESS,
    )

    default_rank_a_night_caps = [demand[day_idx][NIGHT]["A"] for day_idx in range(num_days)]
    raw_rank_a_cap = cfg.get("rank_a_night_cap_per_day", cfg.get("a_night_cap_per_day"))
    rank_a_night_caps = _resolve_daily_targets(raw_rank_a_cap, default_rank_a_night_caps)
    raw_rank_a_allowed_excess = cfg.get(
        "rank_a_night_allowed_excess",
        cfg.get("a_night_allowed_excess", rn_night_allowed_excess),
    )
    rank_a_night_allowed_excess = _coerce_int(
        raw_rank_a_allowed_excess,
        rn_night_allowed_excess,
    )

    default_rank_b_night_targets = [demand[day_idx][NIGHT]["B"] for day_idx in range(num_days)]
    raw_rank_b_target = cfg.get("rank_b_night_min_per_day", cfg.get("b_night_min_per_day"))
    rank_b_night_targets = _resolve_daily_targets(raw_rank_b_target, default_rank_b_night_targets)
    default_rank_b_night_caps = [demand[day_idx][NIGHT]["B"] for day_idx in range(num_days)]
    raw_rank_b_cap = cfg.get("rank_b_night_cap_per_day", cfg.get("b_night_cap_per_day"))
    rank_b_night_caps = _resolve_daily_targets(raw_rank_b_cap, default_rank_b_night_caps)

    raw_rank_b_allowed_excess = cfg.get(
        "rank_b_night_allowed_excess",
        cfg.get("b_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS),
    )
    rank_b_night_allowed_excess = _coerce_int(
        raw_rank_b_allowed_excess,
        _DEFAULT_RN_NIGHT_ALLOWED_EXCESS,
    )

    default_rank_c_night_caps = [demand[day_idx][NIGHT]["C"] for day_idx in range(num_days)]
    default_rank_c_night_targets = [demand[day_idx][NIGHT]["C"] for day_idx in range(num_days)]
    raw_rank_c_target = cfg.get("rank_c_night_min_per_day", cfg.get("c_night_min_per_day"))
    rank_c_night_targets = _resolve_daily_targets(raw_rank_c_target, default_rank_c_night_targets)
    raw_rank_c_cap = cfg.get("rank_c_night_cap_per_day", cfg.get("c_night_cap_per_day"))
    rank_c_night_caps = _resolve_daily_targets(raw_rank_c_cap, default_rank_c_night_caps)
    raw_rank_c_allowed_excess = cfg.get(
        "rank_c_night_allowed_excess",
        cfg.get("c_night_allowed_excess", _DEFAULT_RN_NIGHT_ALLOWED_EXCESS),
    )
    rank_c_night_allowed_excess = _coerce_int(
        raw_rank_c_allowed_excess,
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
        "shift_pattern_by_nurse": shift_pattern_by_nurse,
        "no_night_ids": no_night_ids,
        "pattern_nurses": pattern_nurses,
        "leave_overlay": leave_overlay,
        "rank_a": rank_a,
        "rank_b": rank_b,
        "rank_c": rank_c,
        "rank_ab": rank_ab,
        "working_nurses": working_nurses,
        "working_ab": working_ab,
        "working_rank_c": working_rank_c,
        "working_rank_a": working_rank_a,
        "working_rank_b": working_rank_b,
        "ratio_working_ab": ratio_working_ab,
        "ratio_working_rank_c": ratio_working_rank_c,
        "ratio_working_rank_a": ratio_working_rank_a,
        "ratio_working_rank_b": ratio_working_rank_b,
        "ab_weekly_do_targets": ab_weekly_do_targets,
        "ab_shift_ratio": ab_shift_ratio,
        "expected_ab_work_slots": expected_ab_work_slots,
        "ab_target_totals": ab_target_totals,
        "ab_target_ratios": ab_target_ratios,
        "ab_daily_targets": ab_daily_targets,
        "a_daily_targets": a_daily_targets,
        "b_daily_targets": b_daily_targets,
        "c_weekly_do_targets": c_weekly_do_targets,
        "pattern_weekly_do_targets": pattern_weekly_do_targets,
        "c_shift_ratio": c_shift_ratio,
        "expected_c_work_slots": expected_c_work_slots,
        "c_target_totals": c_target_totals,
        "c_target_ratios": c_target_ratios,
        "c_daily_targets": c_daily_targets,
        "rn_night_targets": rn_night_targets,
        "rn_night_allowed_excess": rn_night_allowed_excess,
        "rank_a_night_caps": rank_a_night_caps,
        "rank_a_night_allowed_excess": rank_a_night_allowed_excess,
        "rank_b_night_targets": rank_b_night_targets,
        "rank_b_night_caps": rank_b_night_caps,
        "rank_b_night_allowed_excess": rank_b_night_allowed_excess,
        "rank_c_night_targets": rank_c_night_targets,
        "rank_c_night_caps": rank_c_night_caps,
        "rank_c_night_allowed_excess": rank_c_night_allowed_excess,
        "ab_ratio_coverage_mode": ab_ratio_coverage_mode,
        "daily_total_shift_balance_enabled": daily_total_shift_balance_enabled,
        "daily_total_shift_gap_target": daily_total_shift_gap_target,
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
    _emit_infeasibility_diagnostics(parsed)

    debug_cfg = dict(milp_config or {})
    relax_min_nights = _coerce_bool(debug_cfg.get("_ab_ratio_relax_min_nights"), False)
    relax_min_non_working = _coerce_bool(debug_cfg.get("_ab_ratio_relax_min_non_working"), False)
    relax_weekly_off = _coerce_bool(debug_cfg.get("_ab_ratio_relax_weekly_off"), False)
    relax_post_night_rest = _coerce_bool(debug_cfg.get("_ab_ratio_relax_post_night_rest"), False)
    relax_no_three_nights = _coerce_bool(debug_cfg.get("_ab_ratio_relax_no_three_nights"), False)
    relax_pattern_exact = _coerce_bool(debug_cfg.get("_ab_ratio_relax_pattern_exact"), False)
    diagnostic_retry_active = _coerce_bool(debug_cfg.get("_ab_ratio_diag_active"), False)

    if progress_callback:
        progress_callback(1, 4, float("inf"))

    model = cp_model.CpModel()
    num_nurses = parsed["num_nurses"]
    num_days = parsed["num_days"]
    demand = parsed["demand"]
    working_nurses = parsed["working_nurses"]
    working_ab = parsed["working_ab"]
    working_rank_c = parsed["working_rank_c"]
    rank_a = parsed["rank_a"]
    rank_b = parsed["rank_b"]
    rank_c = parsed["rank_c"]
    no_night_ids = parsed["no_night_ids"]
    shift_pattern_by_nurse = parsed["shift_pattern_by_nurse"]
    pattern_nurses = parsed["pattern_nurses"]
    al_nurses_set = parsed["al_nurses_set"]
    al_day_req = parsed["al_day_req"]
    hard_assignments = parsed["hard_assignments"]
    soft_assignments = parsed["soft_assignments"]
    post_night_off = parsed["post_night_off"]
    working_rank_a = parsed["working_rank_a"]
    working_rank_b = parsed["working_rank_b"]
    ratio_working_ab = parsed["ratio_working_ab"]
    ratio_working_rank_c = parsed["ratio_working_rank_c"]
    ratio_working_rank_a = parsed["ratio_working_rank_a"]
    ratio_working_rank_b = parsed["ratio_working_rank_b"]
    ab_weekly_do_targets = parsed["ab_weekly_do_targets"]
    c_weekly_do_targets = parsed["c_weekly_do_targets"]
    pattern_weekly_do_targets = parsed["pattern_weekly_do_targets"]
    ab_daily_targets = parsed["ab_daily_targets"]
    a_daily_targets = parsed["a_daily_targets"]
    b_daily_targets = parsed["b_daily_targets"]
    c_target_totals = parsed["c_target_totals"]
    c_daily_targets = parsed["c_daily_targets"]
    rn_night_allowed_excess = parsed["rn_night_allowed_excess"]
    rank_a_night_allowed_excess = parsed["rank_a_night_allowed_excess"]
    rank_b_night_allowed_excess = parsed["rank_b_night_allowed_excess"]
    rank_c_night_allowed_excess = parsed["rank_c_night_allowed_excess"]
    ab_ratio_coverage_mode = parsed["ab_ratio_coverage_mode"]
    daily_total_shift_balance_enabled = parsed["daily_total_shift_balance_enabled"]
    daily_total_shift_gap_target = parsed["daily_total_shift_gap_target"]
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
        if not relax_post_night_rest and 0 not in al_day_req[nurse_idx]:
            model.Add(x[nurse_idx, 0, OFF] == 1)

    for nurse_idx in working_nurses:
        for day_idx, shift_code in hard_assignments[nurse_idx].items():
            model.Add(x[nurse_idx, day_idx, shift_code] == 1)

    for nurse_idx in no_night_ids:
        for day_idx in range(num_days):
            if day_idx not in al_day_req[nurse_idx]:
                model.Add(x[nurse_idx, day_idx, NIGHT] == 0)

    for nurse_idx, shift_pattern in shift_pattern_by_nurse.items():
        if shift_pattern == "AM_ONLY":
            for day_idx in range(num_days):
                if day_idx not in al_day_req[nurse_idx]:
                    model.Add(x[nurse_idx, day_idx, PM] == 0)
                    model.Add(x[nurse_idx, day_idx, NIGHT] == 0)
        elif shift_pattern == "PM_ONLY":
            for day_idx in range(num_days):
                if day_idx not in al_day_req[nurse_idx]:
                    model.Add(x[nurse_idx, day_idx, AM] == 0)
                    model.Add(x[nurse_idx, day_idx, NIGHT] == 0)

    penalty_vars: list[cp_model.IntVar] = []
    penalty_weights: list[int] = []

    def add_penalty(var: cp_model.IntVar, weight: int) -> None:
        penalty_vars.append(var)
        penalty_weights.append(weight)

    if ab_ratio_coverage_mode == "current":
        c_coverage_weight_by_shift = {
            AM: "coverage_c_am",
            PM: "coverage_c_pm",
            NIGHT: "coverage_c_night",
        }
        for day_idx in range(num_days):
            for shift_code in WORK_SHIFTS:
                req_c = demand[day_idx][shift_code]["C"]
                if req_c <= 0:
                    continue
                count_c = sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in rank_c) if rank_c else 0
                c_short = model.NewIntVar(0, req_c, f"cover_c_{day_idx}_{shift_code}")
                model.Add(c_short >= req_c - count_c)
                add_penalty(c_short, weights[c_coverage_weight_by_shift[shift_code]])

    for nurse_idx in ratio_working_ab:
        total_nights = sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(num_days))
        if not relax_min_nights:
            model.Add(total_nights >= 2)
        model.Add(total_nights <= 4)

        total_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(num_days))
        total_non_working = total_do + sum(x[nurse_idx, day_idx, AL] for day_idx in range(num_days))
        if not relax_min_non_working:
            model.Add(total_non_working >= 4)
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
            if not relax_weekly_off:
                model.Add(week_do == ab_weekly_do_targets[nurse_idx][week_index])

        if not relax_no_three_nights:
            for day_idx in range(num_days - 2):
                model.Add(
                    x[nurse_idx, day_idx, NIGHT]
                    + x[nurse_idx, day_idx + 1, NIGHT]
                    + x[nurse_idx, day_idx + 2, NIGHT]
                    <= 2
                )

        if not relax_post_night_rest:
            for day_idx in range(num_days - 1):
                next_non_working = x[nurse_idx, day_idx + 1, OFF] + x[nurse_idx, day_idx + 1, AL]
                model.Add(
                    x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT] <= next_non_working
                )

        if not relax_post_night_rest:
            if num_days >= 2:
                model.Add(x[nurse_idx, 0, NIGHT] <= x[nurse_idx, 1, NIGHT])
                model.Add(x[nurse_idx, num_days - 1, NIGHT] <= x[nurse_idx, num_days - 2, NIGHT])
            for day_idx in range(1, num_days - 1):
                model.Add(
                    x[nurse_idx, day_idx, NIGHT]
                    <= x[nurse_idx, day_idx - 1, NIGHT] + x[nurse_idx, day_idx + 1, NIGHT]
                )

    for nurse_idx in ratio_working_rank_c:
        total_nights = sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(num_days))
        if not relax_min_nights:
            model.Add(total_nights >= 2)
        model.Add(total_nights <= 4)

        total_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(num_days))
        total_non_working = total_do + sum(x[nurse_idx, day_idx, AL] for day_idx in range(num_days))
        if not relax_min_non_working:
            model.Add(total_non_working >= 4)
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
            if not relax_weekly_off:
                model.Add(week_do == c_weekly_do_targets[nurse_idx][week_index])

        if not relax_no_three_nights:
            for day_idx in range(num_days - 2):
                model.Add(
                    x[nurse_idx, day_idx, NIGHT]
                    + x[nurse_idx, day_idx + 1, NIGHT]
                    + x[nurse_idx, day_idx + 2, NIGHT]
                    <= 2
                )

        if not relax_post_night_rest:
            for day_idx in range(num_days - 1):
                next_non_working = x[nurse_idx, day_idx + 1, OFF] + x[nurse_idx, day_idx + 1, AL]
                model.Add(
                    x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT] <= next_non_working
                )

        if not relax_post_night_rest:
            if num_days >= 2:
                model.Add(x[nurse_idx, 0, NIGHT] <= x[nurse_idx, 1, NIGHT])
                model.Add(x[nurse_idx, num_days - 1, NIGHT] <= x[nurse_idx, num_days - 2, NIGHT])
            for day_idx in range(1, num_days - 1):
                model.Add(
                    x[nurse_idx, day_idx, NIGHT]
                    <= x[nurse_idx, day_idx - 1, NIGHT] + x[nurse_idx, day_idx + 1, NIGHT]
                )

    for nurse_idx in pattern_nurses:
        shift_pattern = shift_pattern_by_nurse.get(nurse_idx)
        preferred_shift = AM if shift_pattern == "AM_ONLY" else PM
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_len = week_end - week_start
            leave_days = sum(
                1 for day_idx in range(week_start, week_end) if day_idx in al_day_req[nurse_idx]
            )
            free_days = max(0, week_len - leave_days)
            off_target = pattern_weekly_do_targets[nurse_idx][week_index]
            preferred_target = free_days - off_target
            if not relax_pattern_exact:
                model.Add(
                    sum(x[nurse_idx, day_idx, preferred_shift] for day_idx in range(week_start, week_end))
                    == preferred_target
                )
                model.Add(
                    sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
                    == off_target
                )

    ab_target_totals = parsed["ab_target_totals"]
    for shift_code, weight_key in ((AM, "ratio_am"), (PM, "ratio_pm"), (NIGHT, "ratio_night")):
        actual_total = model.NewIntVar(0, len(ratio_working_ab) * max(num_days, 1), f"ab_actual_{shift_code}")
        model.Add(
            actual_total
            == sum(
                x[nurse_idx, day_idx, shift_code]
                for nurse_idx in ratio_working_ab
                for day_idx in range(num_days)
            )
        )
        diff = model.NewIntVar(
            -len(ratio_working_ab) * max(num_days, 1),
            len(ratio_working_ab) * max(num_days, 1),
            f"ab_diff_{shift_code}",
        )
        model.Add(diff == actual_total - ab_target_totals[shift_code])
        dev = model.NewIntVar(0, len(ratio_working_ab) * max(num_days, 1), f"ab_dev_{shift_code}")
        model.AddAbsEquality(dev, diff)
        add_penalty(dev, weights[weight_key])

    for group_name, group_nurses, group_targets in (
        ("a", ratio_working_rank_a, a_daily_targets),
        ("b", ratio_working_rank_b, b_daily_targets),
    ):
        if not group_nurses:
            continue
        for shift_code, weight_key in (
            (AM, "daily_ratio_am"),
            (PM, "daily_ratio_pm"),
            (NIGHT, "daily_ratio_night"),
        ):
            for day_idx in range(num_days):
                actual_day_total = model.NewIntVar(
                    0,
                    len(group_nurses),
                    f"{group_name}_day_actual_{shift_code}_{day_idx}",
                )
                model.Add(
                    actual_day_total
                    == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in group_nurses)
                )
                day_diff = model.NewIntVar(
                    -len(group_nurses),
                    len(group_nurses),
                    f"{group_name}_day_diff_{shift_code}_{day_idx}",
                )
                model.Add(day_diff == actual_day_total - group_targets[shift_code][day_idx])
                day_dev = model.NewIntVar(
                    0,
                    len(group_nurses),
                    f"{group_name}_day_dev_{shift_code}_{day_idx}",
                )
                model.AddAbsEquality(day_dev, day_diff)
                add_penalty(day_dev, weights[weight_key])

    for shift_code, weight_key in ((AM, "c_ratio_am"), (PM, "c_ratio_pm"), (NIGHT, "c_ratio_night")):
        actual_total = model.NewIntVar(0, len(ratio_working_rank_c) * max(num_days, 1), f"c_actual_{shift_code}")
        model.Add(
            actual_total
            == sum(
                x[nurse_idx, day_idx, shift_code]
                for nurse_idx in ratio_working_rank_c
                for day_idx in range(num_days)
            )
        )
        diff = model.NewIntVar(
            -len(ratio_working_rank_c) * max(num_days, 1),
            len(ratio_working_rank_c) * max(num_days, 1),
            f"c_diff_{shift_code}",
        )
        model.Add(diff == actual_total - c_target_totals[shift_code])
        dev = model.NewIntVar(0, len(ratio_working_rank_c) * max(num_days, 1), f"c_dev_{shift_code}")
        model.AddAbsEquality(dev, diff)
        add_penalty(dev, weights[weight_key])

    for shift_code, weight_key in (
        (AM, "c_daily_ratio_am"),
        (PM, "c_daily_ratio_pm"),
        (NIGHT, "c_daily_ratio_night"),
    ):
        for day_idx in range(num_days):
            actual_day_total = model.NewIntVar(0, len(ratio_working_rank_c), f"c_day_actual_{shift_code}_{day_idx}")
            model.Add(
                actual_day_total
                == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in ratio_working_rank_c)
            )
            day_diff = model.NewIntVar(
                -len(ratio_working_rank_c),
                len(ratio_working_rank_c),
                f"c_day_diff_{shift_code}_{day_idx}",
            )
            model.Add(day_diff == actual_day_total - c_daily_targets[shift_code][day_idx])
            day_dev = model.NewIntVar(0, len(ratio_working_rank_c), f"c_day_dev_{shift_code}_{day_idx}")
            model.AddAbsEquality(day_dev, day_diff)
            add_penalty(day_dev, weights[weight_key])

    if daily_total_shift_balance_enabled:
        for day_idx in range(num_days):
            for group_name, group_nurses in (("a", ratio_working_rank_a), ("b", ratio_working_rank_b)):
                if not group_nurses:
                    continue
                shift_totals = [
                    model.NewIntVar(0, len(group_nurses), f"day_total_{group_name}_{shift_code}_{day_idx}")
                    for shift_code in WORK_SHIFTS
                ]
                for total_var, shift_code in zip(shift_totals, WORK_SHIFTS):
                    model.Add(
                        total_var
                        == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in group_nurses)
                    )
                day_max = model.NewIntVar(0, len(group_nurses), f"day_total_{group_name}_max_{day_idx}")
                day_min = model.NewIntVar(0, len(group_nurses), f"day_total_{group_name}_min_{day_idx}")
                model.AddMaxEquality(day_max, shift_totals)
                model.AddMinEquality(day_min, shift_totals)
                day_spread = model.NewIntVar(
                    0,
                    len(group_nurses),
                    f"day_total_{group_name}_spread_{day_idx}",
                )
                model.Add(day_spread == day_max - day_min)
                gap_penalty = model.NewIntVar(
                    0,
                    len(group_nurses),
                    f"day_total_{group_name}_gap_penalty_{day_idx}",
                )
                model.Add(gap_penalty >= day_spread - daily_total_shift_gap_target)
                add_penalty(gap_penalty, weights["daily_total_shift_balance"])

                am_total = shift_totals[0]
                pm_total = shift_totals[1]
                ap_diff = model.NewIntVar(
                    -len(group_nurses),
                    len(group_nurses),
                    f"day_total_{group_name}_ap_diff_{day_idx}",
                )
                model.Add(ap_diff == am_total - pm_total)
                ap_dev = model.NewIntVar(
                    0,
                    len(group_nurses),
                    f"day_total_{group_name}_ap_dev_{day_idx}",
                )
                model.AddAbsEquality(ap_dev, ap_diff)
                add_penalty(ap_dev, weights["daily_ap_balance"])

        if ratio_working_rank_c:
            for day_idx in range(num_days):
                c_shift_totals = [
                    model.NewIntVar(0, len(ratio_working_rank_c), f"day_total_c_{shift_code}_{day_idx}")
                    for shift_code in WORK_SHIFTS
                ]
                for total_var, shift_code in zip(c_shift_totals, WORK_SHIFTS):
                    model.Add(
                        total_var
                        == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in ratio_working_rank_c)
                    )
                c_day_max = model.NewIntVar(0, len(ratio_working_rank_c), f"day_total_c_max_{day_idx}")
                c_day_min = model.NewIntVar(0, len(ratio_working_rank_c), f"day_total_c_min_{day_idx}")
                model.AddMaxEquality(c_day_max, c_shift_totals)
                model.AddMinEquality(c_day_min, c_shift_totals)
                c_day_spread = model.NewIntVar(0, len(ratio_working_rank_c), f"day_total_c_spread_{day_idx}")
                model.Add(c_day_spread == c_day_max - c_day_min)
                c_gap_penalty = model.NewIntVar(
                    0,
                    len(ratio_working_rank_c),
                    f"day_total_c_gap_penalty_{day_idx}",
                )
                model.Add(c_gap_penalty >= c_day_spread - daily_total_shift_gap_target)
                add_penalty(c_gap_penalty, weights["daily_total_shift_balance_c"])

    for day_idx, target in enumerate(parsed["rn_night_targets"]):
        if target <= 0 or not rank_a:
            continue
        count_a_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_a)
        shortage = model.NewIntVar(0, target, f"rn_night_short_{day_idx}")
        model.Add(shortage >= target - count_a_night)
        add_penalty(shortage, weights["rn_night"])

    for day_idx, cap in enumerate(parsed["rank_a_night_caps"]):
        if not rank_a:
            continue
        count_a_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_a)
        allowed_max = cap + max(rank_a_night_allowed_excess, 0)
        over_cap = model.NewIntVar(0, len(rank_a), f"rn_night_over_{day_idx}")
        model.Add(over_cap >= count_a_night - allowed_max)
        add_penalty(over_cap, weights["rn_night_over"])

    for day_idx, target in enumerate(parsed["rank_b_night_targets"]):
        if target <= 0 or not rank_b:
            continue
        count_b_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_b)
        shortage = model.NewIntVar(0, target, f"rank_b_night_short_{day_idx}")
        model.Add(shortage >= target - count_b_night)
        add_penalty(shortage, weights["rank_b_night"])

    for day_idx, cap in enumerate(parsed["rank_b_night_caps"]):
        if not rank_b:
            continue
        count_b_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_b)
        allowed_max = cap + max(rank_b_night_allowed_excess, 0)
        over_cap = model.NewIntVar(0, len(rank_b), f"rank_b_night_over_{day_idx}")
        model.Add(over_cap >= count_b_night - allowed_max)
        add_penalty(over_cap, weights["rank_b_night_over"])

    for day_idx, cap in enumerate(parsed["rank_c_night_caps"]):
        if not rank_c:
            continue
        count_c_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_c)
        allowed_max = cap + max(rank_c_night_allowed_excess, 0)
        over_cap = model.NewIntVar(0, len(rank_c), f"rank_c_night_over_{day_idx}")
        model.Add(over_cap >= count_c_night - allowed_max)
        add_penalty(over_cap, weights["rank_c_night_over"])

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
        feasible_relaxations: list[str] = []
        if not diagnostic_retry_active:
            diagnostic_profiles = [
                ("post_night_rest", {"_ab_ratio_relax_post_night_rest": True}),
                ("min_nights", {"_ab_ratio_relax_min_nights": True}),
                ("min_non_working", {"_ab_ratio_relax_min_non_working": True}),
                ("weekly_off", {"_ab_ratio_relax_weekly_off": True}),
                ("no_three_nights", {"_ab_ratio_relax_no_three_nights": True}),
                ("pattern_exact", {"_ab_ratio_relax_pattern_exact": True}),
            ]
            for label, overrides in diagnostic_profiles:
                diag_config = dict(debug_cfg)
                diag_config.update(overrides)
                diag_config["_ab_ratio_diag_active"] = True
                try:
                    run_ab_ratio_pipeline(
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
                    logger.warning(
                        "[AB-DEBUG] diagnostic relaxation still infeasible: %s",
                        label,
                    )
                else:
                    feasible_relaxations.append(label)
                    logger.warning(
                        "[AB-DEBUG] diagnostic relaxation became feasible: %s",
                        label,
                    )
        if feasible_relaxations == ["min_nights"]:
            raise ABRatioInfeasibilityError(
                "AB-RATIO infeasible: the hard minimum 2-night requirement conflicts with the current "
                "no-night, leave, and hard-request constraints for this roster period."
            )
        raise ABRatioInfeasibilityError(
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
