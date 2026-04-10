from __future__ import annotations

import logging
import math
import os

try:
    from ortools.sat.python import cp_model
except ModuleNotFoundError:
    cp_model = None

# ── Shift codes ───────────────────────────────────────────────────────────────
OFF, AM, PM, NIGHT, AL = 0, 1, 2, 3, 4
ALL_SHIFTS  = [OFF, AM, PM, NIGHT, AL]
WORK_SHIFTS = [AM, PM, NIGHT]
SHIFT_LABEL = {OFF: "OFF", AM: "AM", PM: "PM", NIGHT: "NIGHT", AL: "AL"}

_LEAVE_CODES = {"HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}


def _build_greedy_hint(
    num_nurses: int,
    num_days: int,
    working_nurses: list[int],
    al_nurses_set: set[int],
    al_day_req: list[set],
    post_night_off: set[int],
    demand: list[dict],
) -> list[list[int]]:
    """
    Greedy O(N×D) schedule used to warm-start the CP-SAT solver.

    Strategy:
      1. Pin fixed slots (full-AL nurses, single-day AL requests, post-night OFF).
      2. Assign night blocks round-robin, capped per fortnight.
      3. Add mandatory OFF after every night block.
      4. Reserve 2 voluntary OFFs per week (weekends preferred).
      5. Balance AM vs PM to match daily demand.
    """
    night_constant = math.ceil(((num_nurses * 2) / 3) / 4)
    sched = [[AM] * num_days for _ in range(num_nurses)]

    # Step 1: pin fixed slots
    for n in al_nurses_set:
        for d in range(num_days):
            sched[n][d] = AL

    for n in working_nurses:
        for d in al_day_req[n]:
            if d < num_days:
                sched[n][d] = AL

    for n in post_night_off:
        if 0 not in al_day_req[n]:
            sched[n][0] = OFF

    # Step 2: night blocks, round-robin
    night_counts = [0] * num_nurses
    wn = list(working_nurses)
    cursor = 0

    for d in range(num_days):
        nights_needed = sum(demand[d][NIGHT].get(r, 0) for r in "ABC")
        assigned = 0

        for _ in range(len(wn) * 2):
            if assigned >= nights_needed:
                break
            n = wn[cursor % len(wn)]
            cursor += 1

            if sched[n][d] in (AL, OFF):
                continue
            if d > 0 and sched[n][d - 1] == NIGHT:
                continue
            if night_counts[n] >= night_constant:
                continue

            sched[n][d] = NIGHT
            night_counts[n] += 1
            assigned += 1

            if (
                d + 1 < num_days
                and sched[n][d + 1] not in (AL,)
                and (d + 1) not in al_day_req[n]
                and night_counts[n] < 4
            ):
                sched[n][d + 1] = NIGHT
                night_counts[n] += 1

    # Mandatory OFF after every night block end
    for n in working_nurses:
        for d in range(num_days - 1):
            if sched[n][d] == NIGHT and sched[n][d + 1] != NIGHT:
                if (d + 1) not in al_day_req[n]:
                    sched[n][d + 1] = OFF

    # Step 3: 2 voluntary OFFs per week (weekends preferred)
    for n in working_nurses:
        for w_start in range(0, num_days, 7):
            w_end = min(w_start + 7, num_days)
            existing_off = sum(1 for d in range(w_start, w_end) if sched[n][d] == OFF)
            to_add = max(0, 2 - existing_off)
            candidates = sorted(
                [d for d in range(w_start, w_end) if sched[n][d] not in (OFF, NIGHT, AL)],
                key=lambda d: (0 if d % 7 in (5, 6) else 1),
            )
            for d in candidates[:to_add]:
                sched[n][d] = OFF

    # Step 4: balance AM vs PM to match daily demand
    for d in range(num_days):
        am_count = sum(1 for n in range(num_nurses) if sched[n][d] == AM)
        pm_count = sum(1 for n in range(num_nurses) if sched[n][d] == PM)
        am_needed = sum(demand[d][AM].get(r, 0) for r in "ABC")
        pm_needed = sum(demand[d][PM].get(r, 0) for r in "ABC")

        for n in working_nurses:
            if sched[n][d] != AM:
                continue
            if pm_count < pm_needed and am_count > am_needed:
                sched[n][d] = PM
                pm_count += 1
                am_count -= 1

    return sched

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
    "daily_ratio_am": 6_000,
    "daily_ratio_pm": 6_000,
    "daily_ratio_night": 8_000,
    "daily_ratio_night_overflow": 80_000,
    "daily_ratio_night_overflow_tier2": 110_000,
    "daily_ratio_night_overflow_tier3": 260_000,
    "daily_total_night_overflow": 80_000,
    "daily_total_night_overflow_tier2": 150_000,
    "daily_total_night_overflow_tier3": 320_000,
    "rn_night": 100_000,
    "rn_night_over": 500_000,
    "rank_b_night": 100_000,
    "rank_b_night_over": 500_000,
    "rank_c_night": 9_000,
    "rank_c_night_over": 14_000,
    "isolated_night": 100_000,
    "double_night_pref": 120_000,
    "daily_total_shift_balance": 24_000,
    "daily_total_shift_balance_c": 10_500,
    "daily_ap_balance": 18_000,
    "c_ratio_am": 4_000,
    "c_ratio_pm": 4_200,
    "c_ratio_night": 4_200,
    "c_daily_ratio_am": 3_600,
    "c_daily_ratio_pm": 5_200,
    "c_daily_ratio_night": 5_200,
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
# Soft-request weights: approved shift requests carry higher weight than pending
# but both remain soft — the solver may override either when scheduling constraints demand it.
# hard_requests (leave / non-working days) are always enforced as hard constraints and bypass this.
_DEFAULT_REQUEST_PRIORITY_WEIGHTS = {
    "pending": 1,
    "approved": 5,
}
_DEFAULT_RN_NIGHT_ALLOWED_EXCESS = 1
_DEFAULT_DAILY_TOTAL_SHIFT_GAP_TARGET = 2
_DEFAULT_DAILY_TOTAL_SHIFT_BALANCE_ENABLED = True
_DEFAULT_AB_RATIO_COVERAGE_MODE = "night_caps_only"
_DEFAULT_RANK_A_NIGHT_CAP_MODE = "hard_then_soft"
_DEFAULT_RANK_B_NIGHT_MIN_MODE = "hard_then_soft"
_DEFAULT_WEIGHT_CAP = 1_000_000

logger = logging.getLogger(__name__)


class ABRatioInfeasibilityError(RuntimeError):
    """Raised when AB-RATIO is deterministically infeasible under current hard rules."""


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


def _normalize_ab_ratio_coverage_mode(value) -> str:
    normalized = str(value).strip().lower() if value is not None else _DEFAULT_AB_RATIO_COVERAGE_MODE
    if normalized in {"current", "with_coverage", "coverage"}:
        return "current"
    if normalized in {"night_caps_only", "no_coverage", "ratio_dominant"}:
        return "night_caps_only"
    return _DEFAULT_AB_RATIO_COVERAGE_MODE


def _normalize_rank_night_cap_mode(value, default_mode: str) -> str:
    normalized = str(value).strip().lower() if value is not None else default_mode
    if normalized in {"hard", "strict"}:
        return "hard"
    if normalized in {"hard_then_soft", "strict_then_soft", "fallback_soft"}:
        return "hard_then_soft"
    if normalized in {"soft", "penalty_only"}:
        return "soft"
    return default_mode


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


def _priority_weight(raw_priority, default_weights: dict[str, int]) -> int:
    priority = str(raw_priority).strip().lower() if raw_priority is not None else "pending"
    pending_weight = _coerce_int(default_weights.get("pending", 1), 1)
    approved_weight = _coerce_int(default_weights.get("approved", pending_weight + 1), pending_weight + 1)
    if approved_weight <= pending_weight:
        approved_weight = pending_weight + 1
    effective_weights = dict(default_weights)
    effective_weights["pending"] = pending_weight
    effective_weights["approved"] = approved_weight
    return max(_coerce_int(effective_weights.get(priority, 1), 1), 1)


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
            scaled = int(round(value * scale))
            normalized[key] = max(1, scaled)
    return normalized


def _build_ab_targets(
    total_slots: int,
    ratio_weights: dict[int, float],
) -> tuple[dict[int, int], dict[int, float]]:
    grand_total = sum(max(float(ratio_weights.get(shift_code, 0)), 0.0) for shift_code in (AM, PM, NIGHT))
    if total_slots <= 0 or grand_total <= 0:
        return {AM: 0, PM: 0, NIGHT: 0}, {AM: 0.0, PM: 0.0, NIGHT: 0.0}

    exact_targets = {
        shift_code: (total_slots * max(float(ratio_weights.get(shift_code, 0)), 0.0) / grand_total)
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


def _pattern_weekly_targets(week_len: int, free_days: int, fixed_off_days: int) -> tuple[int, int]:
    base_off_target = max(0, week_len - 4)
    off_target = min(free_days, max(base_off_target, fixed_off_days))
    preferred_target = max(0, free_days - off_target)
    return off_target, preferred_target


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


def _normalize_ab_shift_ratio(config_ratio) -> dict[int, float]:
    normalized = dict(_DEFAULT_AB_SHIFT_RATIO)
    if isinstance(config_ratio, dict):
        for raw_key, value in config_ratio.items():
            key = str(raw_key).strip().upper()
            if key in {"AM", "A"}:
                normalized[AM] = max(_coerce_float(value, normalized[AM]), 0.0)
            elif key in {"PM", "P"}:
                normalized[PM] = max(_coerce_float(value, normalized[PM]), 0.0)
            elif key in {"NIGHT", "N"}:
                normalized[NIGHT] = max(_coerce_float(value, normalized[NIGHT]), 0.0)
    return normalized


def _normalize_c_shift_ratio(config_ratio) -> dict[int, float]:
    normalized = dict(_DEFAULT_C_SHIFT_RATIO)
    if isinstance(config_ratio, dict):
        for raw_key, value in config_ratio.items():
            key = str(raw_key).strip().upper()
            if key in {"AM", "A"}:
                normalized[AM] = max(_coerce_float(value, normalized[AM]), 0.0)
            elif key in {"PM", "P"}:
                normalized[PM] = max(_coerce_float(value, normalized[PM]), 0.0)
            elif key in {"NIGHT", "N"}:
                normalized[NIGHT] = max(_coerce_float(value, normalized[NIGHT]), 0.0)
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
        for item in req_list:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            day_idx, raw_shift = item[0], item[1]
            priority = item[2] if len(item) >= 3 else "pending"
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
            soft_assignments[nurse_idx][day_idx] = (shift_code, _priority_weight(priority, _DEFAULT_REQUEST_PRIORITY_WEIGHTS))

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
    pattern_working_ab = [idx for idx in working_ab if idx in pattern_nurses]
    pattern_working_rank_c = [idx for idx in working_rank_c if idx in pattern_nurses]
    pattern_working_rank_a = [idx for idx in working_rank_a if idx in pattern_nurses]
    pattern_working_rank_b = [idx for idx in working_rank_b if idx in pattern_nurses]
    managed_working_ab = [idx for idx in working_ab if idx not in pattern_nurses]
    managed_working_rank_c = [idx for idx in working_rank_c if idx not in pattern_nurses]
    managed_working_rank_a = [idx for idx in working_rank_a if idx not in pattern_nurses]
    managed_working_rank_b = [idx for idx in working_rank_b if idx not in pattern_nurses]
    ratio_working_ab = [idx for idx in managed_working_ab if idx not in no_night_ids]
    ratio_working_rank_c = [idx for idx in managed_working_rank_c if idx not in no_night_ids]
    ratio_working_rank_a = [idx for idx in managed_working_rank_a if idx not in no_night_ids]
    ratio_working_rank_b = [idx for idx in managed_working_rank_b if idx not in no_night_ids]

    post_night_off: set[int] = set()
    for nurse_id, shift_name in prev_last_shift.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None or nurse_idx in al_nurses_set:
            continue
        if str(shift_name).strip().upper() == "NIGHT":
            post_night_off.add(nurse_idx)

    for nurse_idx in post_night_off:
        forced_day_zero = hard_assignments[nurse_idx].get(0)
        # AB non-pattern nurses use soft carry-N preference — keep their hard requests on day 0
        # (NIGHT on day 0 is a valid carry completion). Other nurses still need the hard OFF.
        if nurse_ranks[nurse_idx] in {"A", "B"} and shift_pattern_by_nurse.get(nurse_idx) is None:
            continue
        if forced_day_zero is not None and forced_day_zero != OFF and 0 not in al_day_req[nurse_idx]:
            del hard_assignments[nurse_idx][0]

    cfg = dict(milp_config or {})
    ratio_weights = dict(_DEFAULT_WEIGHTS)
    ratio_weights.update(cfg.get("ab_ratio_weights") or {})
    ratio_weights["ratio_night"] = _coerce_int(
        cfg.get("night_ratio_weight"), ratio_weights["ratio_night"]
    )
    ratio_weights["daily_ratio_night_overflow"] = _coerce_int(
        cfg.get("daily_ratio_night_overflow_weight"),
        ratio_weights["daily_ratio_night_overflow"],
    )
    ratio_weights["daily_ratio_night_overflow_tier2"] = _coerce_int(
        cfg.get("daily_ratio_night_overflow_tier2_weight"),
        ratio_weights["daily_ratio_night_overflow_tier2"],
    )
    ratio_weights["daily_ratio_night_overflow_tier3"] = _coerce_int(
        cfg.get("daily_ratio_night_overflow_tier3_weight"),
        ratio_weights["daily_ratio_night_overflow_tier3"],
    )
    ratio_weights["daily_total_night_overflow"] = _coerce_int(
        cfg.get("daily_total_night_overflow_weight"),
        ratio_weights["daily_total_night_overflow"],
    )
    ratio_weights["daily_total_night_overflow_tier2"] = _coerce_int(
        cfg.get("daily_total_night_overflow_tier2_weight"),
        ratio_weights["daily_total_night_overflow_tier2"],
    )
    ratio_weights["daily_total_night_overflow_tier3"] = _coerce_int(
        cfg.get("daily_total_night_overflow_tier3_weight"),
        ratio_weights["daily_total_night_overflow_tier3"],
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
    ratio_weights["isolated_night"] = _coerce_int(
        cfg.get("isolated_night_weight"),
        ratio_weights["isolated_night"],
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
    weight_cap = max(_coerce_int(cfg.get("ab_ratio_weight_cap"), _DEFAULT_WEIGHT_CAP), 1)
    ratio_weights = _normalize_ratio_weights(ratio_weights, weight_cap)
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
                    target_do, preferred_target = _pattern_weekly_targets(
                        week_len,
                        free_days,
                        len(fixed_off_days),
                    )
                    expected_work_slots += preferred_target
                else:
                    target_do = max(_weekly_do_target(week_len), len(fixed_off_days))
                    expected_work_slots += max(0, free_days - target_do)
                weekly_targets.append(target_do)

            weekly_targets_by_nurse[nurse_idx] = weekly_targets

        return weekly_targets_by_nurse, expected_work_slots

    ab_weekly_do_targets: dict[int, list[int]] = {}
    expected_ab_work_slots = 0
    if managed_working_ab:
        ab_weekly_do_targets, expected_ab_work_slots = _build_weekly_do_targets_for_group(managed_working_ab)
    if pattern_working_ab:
        _, expected_pattern_ab_work_slots = _build_weekly_do_targets_for_group(pattern_working_ab)
        expected_ab_work_slots += expected_pattern_ab_work_slots

    ab_target_totals, ab_target_ratios = _build_ab_targets(expected_ab_work_slots, ab_shift_ratio)
    ab_daily_targets = {
        shift_code: _distribute_targets(ab_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    expected_a_work_slots = 0
    if managed_working_rank_a:
        _, expected_a_work_slots = _build_weekly_do_targets_for_group(managed_working_rank_a)
    if pattern_working_rank_a:
        _, expected_pattern_a_work_slots = _build_weekly_do_targets_for_group(pattern_working_rank_a)
        expected_a_work_slots += expected_pattern_a_work_slots
    a_target_totals, _ = _build_ab_targets(expected_a_work_slots, ab_shift_ratio)
    a_daily_targets = {
        shift_code: _distribute_targets(a_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    expected_b_work_slots = 0
    if managed_working_rank_b:
        _, expected_b_work_slots = _build_weekly_do_targets_for_group(managed_working_rank_b)
    if pattern_working_rank_b:
        _, expected_pattern_b_work_slots = _build_weekly_do_targets_for_group(pattern_working_rank_b)
        expected_b_work_slots += expected_pattern_b_work_slots
    b_target_totals, _ = _build_ab_targets(expected_b_work_slots, ab_shift_ratio)
    b_daily_targets = {
        shift_code: _distribute_targets(b_target_totals[shift_code], num_days)
        for shift_code in (AM, PM, NIGHT)
    }

    c_weekly_do_targets: dict[int, list[int]] = {}
    expected_c_work_slots = 0
    if managed_working_rank_c:
        c_weekly_do_targets, expected_c_work_slots = _build_weekly_do_targets_for_group(managed_working_rank_c)
    if pattern_working_rank_c:
        _, expected_pattern_c_work_slots = _build_weekly_do_targets_for_group(pattern_working_rank_c)
        expected_c_work_slots += expected_pattern_c_work_slots

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
    rank_a_night_cap_mode = _normalize_rank_night_cap_mode(
        cfg.get("rank_a_night_cap_mode", cfg.get("a_night_cap_mode")),
        _DEFAULT_RANK_A_NIGHT_CAP_MODE,
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
    rank_b_night_min_mode = _normalize_rank_night_cap_mode(
        cfg.get("rank_b_night_min_mode", cfg.get("b_night_min_mode")),
        _DEFAULT_RANK_B_NIGHT_MIN_MODE,
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
        "pattern_working_ab": pattern_working_ab,
        "pattern_working_rank_a": pattern_working_rank_a,
        "pattern_working_rank_b": pattern_working_rank_b,
        "pattern_working_rank_c": pattern_working_rank_c,
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
        "managed_working_ab": managed_working_ab,
        "managed_working_rank_c": managed_working_rank_c,
        "managed_working_rank_a": managed_working_rank_a,
        "managed_working_rank_b": managed_working_rank_b,
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
        "rank_a_night_cap_mode": rank_a_night_cap_mode,
        "rank_b_night_targets": rank_b_night_targets,
        "rank_b_night_caps": rank_b_night_caps,
        "rank_b_night_allowed_excess": rank_b_night_allowed_excess,
        "rank_b_night_min_mode": rank_b_night_min_mode,
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
    """
    Main entry point for AB-RATIO nurse rostering.

    Parameters
    ----------
    nurses      : list of {"id", "name", "rank"} dicts  (rank A/B/C)
    shifts      : 14-element list of per-day shift-requirement dicts
    hard_requests : leave / non-working day entries (AL, INHT, BL, …) — enforced as hard constraints
    soft_requests : shift preferences with optional priority ("approved" or "pending").
                    Approved requests carry weight 5; pending carry weight 1.
                    Both are soft — the solver satisfies them where possible but may override.
    prev_last_shift : optional previous-period final shift per nurse
    """
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
    relax_rank_night_mins = _coerce_bool(debug_cfg.get("_ab_ratio_relax_rank_night_mins"), False)
    relax_rank_a_night_cap = _coerce_bool(debug_cfg.get("_ab_ratio_relax_rank_a_night_cap"), False)
    relax_rank_b_night_min = _coerce_bool(debug_cfg.get("_ab_ratio_relax_rank_b_night_min"), False)
    relax_rank_c_night_cap = _coerce_bool(debug_cfg.get("_ab_ratio_relax_rank_c_night_cap"), False)
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
    pattern_working_ab = parsed["pattern_working_ab"]
    pattern_working_rank_a = parsed["pattern_working_rank_a"]
    pattern_working_rank_b = parsed["pattern_working_rank_b"]
    pattern_working_rank_c = parsed["pattern_working_rank_c"]
    al_nurses_set = parsed["al_nurses_set"]
    al_day_req = parsed["al_day_req"]
    hard_assignments = parsed["hard_assignments"]
    soft_assignments = parsed["soft_assignments"]
    post_night_off = parsed["post_night_off"]
    working_rank_a = parsed["working_rank_a"]
    working_rank_b = parsed["working_rank_b"]
    managed_working_ab = parsed["managed_working_ab"]
    managed_working_rank_c = parsed["managed_working_rank_c"]
    managed_working_rank_a = parsed["managed_working_rank_a"]
    managed_working_rank_b = parsed["managed_working_rank_b"]
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
    rn_night_targets = parsed["rn_night_targets"]
    rn_night_allowed_excess = parsed["rn_night_allowed_excess"]
    rank_a_night_allowed_excess = parsed["rank_a_night_allowed_excess"]
    rank_a_night_cap_mode = parsed["rank_a_night_cap_mode"]
    rank_b_night_allowed_excess = parsed["rank_b_night_allowed_excess"]
    rank_b_night_min_mode = parsed["rank_b_night_min_mode"]
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
        # AB non-pattern nurses use soft carry-N preference on day 0 (handled in AB loop)
        if nurse_idx in managed_working_ab:
            continue
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

    night_ineligible_ids = set(no_night_ids)
    for nurse_idx, shift_pattern in shift_pattern_by_nurse.items():
        if shift_pattern in {"AM_ONLY", "PM_ONLY"}:
            night_ineligible_ids.add(nurse_idx)
    nurses_with_leave_days = {nurse_idx for nurse_idx in working_nurses if al_day_req[nurse_idx]}
    if nurses_with_leave_days:
        logger.warning(
            "[AB-DEBUG] leave-day nurses excluded from min-nights: %s",
            ", ".join(
                f"{nurse_names[nurse_idx]} (#{nurse_idx}, rank {nurse_ranks[nurse_idx]})"
                for nurse_idx in sorted(nurses_with_leave_days)
            ),
        )

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

    for nurse_idx in managed_working_ab:
        total_nights = sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(num_days))
        if (
            nurse_idx not in night_ineligible_ids
            and nurse_idx not in nurses_with_leave_days
            and not relax_min_nights
        ):
            model.Add(total_nights >= 2)
        if nurse_idx in night_ineligible_ids:
            model.Add(total_nights == 0)
        else:
            model.Add(total_nights <= 4)
            for week_start in range(0, num_days, 7):
                week_end = min(week_start + 7, num_days)
                model.Add(
                    sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(week_start, week_end)) <= 2
                )

        total_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(num_days))
        total_non_working = total_do + sum(x[nurse_idx, day_idx, AL] for day_idx in range(num_days))
        if not relax_min_non_working:
            model.Add(total_non_working >= 4)
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
            if not relax_weekly_off:
                model.Add(week_do == ab_weekly_do_targets[nurse_idx][week_index])

        if nurse_idx not in no_night_ids and not relax_no_three_nights:
            for day_idx in range(num_days - 2):
                model.Add(
                    x[nurse_idx, day_idx, NIGHT]
                    + x[nurse_idx, day_idx + 1, NIGHT]
                    + x[nurse_idx, day_idx + 2, NIGHT]
                    <= 2
                )

        if nurse_idx not in no_night_ids and not relax_post_night_rest:
            for day_idx in range(num_days - 1):
                next_non_working = x[nurse_idx, day_idx + 1, OFF] + x[nurse_idx, day_idx + 1, AL]
                model.Add(
                    x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT] <= next_non_working
                )

        # Carry-N continuation: if prev roster ended on N, prefer starting this roster
        # with N (completing the 2N block) rather than resting. Single-N carry is allowed
        # but penalised at double_night_pref weight.
        if nurse_idx in post_night_off and nurse_idx not in no_night_ids and 0 not in al_day_req[nurse_idx]:
            carry_skip = model.NewBoolVar(f"carry_skip_ab_{nurse_idx}")
            model.Add(carry_skip >= 1 - x[nurse_idx, 0, NIGHT])
            add_penalty(carry_skip, weights["double_night_pref"])

        if nurse_idx not in no_night_ids:
            for day_idx in range(num_days):
                # For carry-N nurses, day 0 = N is a valid completion of the previous
                # roster's 2N block — do not penalise it as isolated.
                if day_idx == 0 and nurse_idx in post_night_off:
                    continue
                isolated_night = model.NewBoolVar(f"isolated_night_ab_{nurse_idx}_{day_idx}")
                if day_idx == 0:
                    if num_days == 1:
                        model.Add(isolated_night >= x[nurse_idx, day_idx, NIGHT])
                    else:
                        model.Add(
                            isolated_night
                            >= x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT]
                        )
                elif day_idx == num_days - 1:
                    model.Add(
                        isolated_night
                        >= x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx - 1, NIGHT]
                    )
                else:
                    model.Add(
                        isolated_night
                        >= x[nurse_idx, day_idx, NIGHT]
                        - x[nurse_idx, day_idx - 1, NIGHT]
                        - x[nurse_idx, day_idx + 1, NIGHT]
                    )
                add_penalty(isolated_night, weights["isolated_night"])

    for nurse_idx in managed_working_rank_c:
        total_nights = sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(num_days))
        if (
            nurse_idx not in night_ineligible_ids
            and nurse_idx not in nurses_with_leave_days
            and not relax_min_nights
        ):
            model.Add(total_nights >= 2)
        if nurse_idx in night_ineligible_ids:
            model.Add(total_nights == 0)
        else:
            model.Add(total_nights <= 4)
            for week_start in range(0, num_days, 7):
                week_end = min(week_start + 7, num_days)
                model.Add(
                    sum(x[nurse_idx, day_idx, NIGHT] for day_idx in range(week_start, week_end)) <= 2
                )

        total_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(num_days))
        total_non_working = total_do + sum(x[nurse_idx, day_idx, AL] for day_idx in range(num_days))
        if not relax_min_non_working:
            model.Add(total_non_working >= 4)
        for week_index, week_start in enumerate(range(0, num_days, 7)):
            week_end = min(week_start + 7, num_days)
            week_do = sum(x[nurse_idx, day_idx, OFF] for day_idx in range(week_start, week_end))
            if not relax_weekly_off:
                model.Add(week_do == c_weekly_do_targets[nurse_idx][week_index])

        if nurse_idx not in no_night_ids and not relax_no_three_nights:
            for day_idx in range(num_days - 2):
                model.Add(
                    x[nurse_idx, day_idx, NIGHT]
                    + x[nurse_idx, day_idx + 1, NIGHT]
                    + x[nurse_idx, day_idx + 2, NIGHT]
                    <= 2
                )

        if nurse_idx not in no_night_ids and not relax_post_night_rest:
            for day_idx in range(num_days - 1):
                next_non_working = x[nurse_idx, day_idx + 1, OFF] + x[nurse_idx, day_idx + 1, AL]
                model.Add(
                    x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT] <= next_non_working
                )

        if nurse_idx not in no_night_ids:
            for day_idx in range(num_days):
                isolated_night = model.NewBoolVar(f"isolated_night_c_{nurse_idx}_{day_idx}")
                if day_idx == 0:
                    if num_days == 1:
                        model.Add(isolated_night >= x[nurse_idx, day_idx, NIGHT])
                    else:
                        model.Add(
                            isolated_night
                            >= x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx + 1, NIGHT]
                        )
                elif day_idx == num_days - 1:
                    model.Add(
                        isolated_night
                        >= x[nurse_idx, day_idx, NIGHT] - x[nurse_idx, day_idx - 1, NIGHT]
                    )
                else:
                    model.Add(
                        isolated_night
                        >= x[nurse_idx, day_idx, NIGHT]
                        - x[nurse_idx, day_idx - 1, NIGHT]
                        - x[nurse_idx, day_idx + 1, NIGHT]
                    )
                add_penalty(isolated_night, weights["isolated_night"])

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
        for day_idx in range(num_days - 2):
            model.Add(
                x[nurse_idx, day_idx, OFF]
                + x[nurse_idx, day_idx + 1, OFF]
                + x[nurse_idx, day_idx + 2, OFF]
                <= 2
            )

    ab_am_pm_nurses = managed_working_ab + pattern_working_ab
    a_am_pm_nurses = managed_working_rank_a + pattern_working_rank_a
    b_am_pm_nurses = managed_working_rank_b + pattern_working_rank_b
    c_am_pm_nurses = managed_working_rank_c + pattern_working_rank_c

    ab_target_totals = parsed["ab_target_totals"]
    for shift_code, weight_key in ((AM, "ratio_am"), (PM, "ratio_pm"), (NIGHT, "ratio_night")):
        target_nurses = ab_am_pm_nurses if shift_code in {AM, PM} else ratio_working_ab
        actual_total = model.NewIntVar(0, len(target_nurses) * max(num_days, 1), f"ab_actual_{shift_code}")
        model.Add(
            actual_total
            == sum(
                x[nurse_idx, day_idx, shift_code]
                for nurse_idx in target_nurses
                for day_idx in range(num_days)
            )
        )
        diff = model.NewIntVar(
            -len(target_nurses) * max(num_days, 1),
            len(target_nurses) * max(num_days, 1),
            f"ab_diff_{shift_code}",
        )
        model.Add(diff == actual_total - ab_target_totals[shift_code])
        dev = model.NewIntVar(0, len(target_nurses) * max(num_days, 1), f"ab_dev_{shift_code}")
        model.AddAbsEquality(dev, diff)
        add_penalty(dev, weights[weight_key])

    for group_name, managed_group_nurses, night_group_nurses, group_targets in (
        ("a", a_am_pm_nurses, ratio_working_rank_a, a_daily_targets),
        ("b", b_am_pm_nurses, ratio_working_rank_b, b_daily_targets),
    ):
        for shift_code, weight_key, group_nurses in (
            (AM, "daily_ratio_am", managed_group_nurses),
            (PM, "daily_ratio_pm", managed_group_nurses),
            (NIGHT, "daily_ratio_night", night_group_nurses),
        ):
            if not group_nurses:
                continue
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
                target = group_targets[shift_code][day_idx]
                if group_name == "a" and shift_code == NIGHT:
                    target = rn_night_targets[day_idx]
                model.Add(day_diff == actual_day_total - target)
                day_dev = model.NewIntVar(
                    0,
                    len(group_nurses),
                    f"{group_name}_day_dev_{shift_code}_{day_idx}",
                )
                model.AddAbsEquality(day_dev, day_diff)
                add_penalty(day_dev, weights[weight_key])
                if shift_code == NIGHT:
                    overflow_tier1 = model.NewIntVar(
                        0,
                        len(group_nurses),
                        f"{group_name}_day_night_overflow_{day_idx}",
                    )
                    overflow_tier2 = model.NewIntVar(
                        0,
                        len(group_nurses),
                        f"{group_name}_day_night_overflow_tier2_{day_idx}",
                    )
                    overflow_tier3 = model.NewIntVar(
                        0,
                        len(group_nurses),
                        f"{group_name}_day_night_overflow_tier3_{day_idx}",
                    )
                    model.Add(overflow_tier1 >= actual_day_total - target)
                    model.Add(overflow_tier2 >= actual_day_total - (target + 1))
                    model.Add(overflow_tier3 >= actual_day_total - (target + 2))
                    add_penalty(overflow_tier1, weights["daily_ratio_night_overflow"])
                    add_penalty(overflow_tier2, weights["daily_ratio_night_overflow_tier2"])
                    add_penalty(overflow_tier3, weights["daily_ratio_night_overflow_tier3"])

    for shift_code, weight_key in ((AM, "c_ratio_am"), (PM, "c_ratio_pm"), (NIGHT, "c_ratio_night")):
        c_ratio_nurses = c_am_pm_nurses if shift_code in {AM, PM} else ratio_working_rank_c
        actual_total = model.NewIntVar(0, len(c_ratio_nurses) * max(num_days, 1), f"c_actual_{shift_code}")
        model.Add(
            actual_total
            == sum(
                x[nurse_idx, day_idx, shift_code]
                for nurse_idx in c_ratio_nurses
                for day_idx in range(num_days)
            )
        )
        diff = model.NewIntVar(
            -len(c_ratio_nurses) * max(num_days, 1),
            len(c_ratio_nurses) * max(num_days, 1),
            f"c_diff_{shift_code}",
        )
        model.Add(diff == actual_total - c_target_totals[shift_code])
        dev = model.NewIntVar(0, len(c_ratio_nurses) * max(num_days, 1), f"c_dev_{shift_code}")
        model.AddAbsEquality(dev, diff)
        add_penalty(dev, weights[weight_key])

    for shift_code, weight_key in (
        (AM, "c_daily_ratio_am"),
        (PM, "c_daily_ratio_pm"),
        (NIGHT, "c_daily_ratio_night"),
    ):
        for day_idx in range(num_days):
            c_daily_nurses = c_am_pm_nurses if shift_code in {AM, PM} else ratio_working_rank_c
            actual_day_total = model.NewIntVar(0, len(c_daily_nurses), f"c_day_actual_{shift_code}_{day_idx}")
            model.Add(
                actual_day_total
                == sum(x[nurse_idx, day_idx, shift_code] for nurse_idx in c_daily_nurses)
            )
            day_diff = model.NewIntVar(
                -len(c_daily_nurses),
                len(c_daily_nurses),
                f"c_day_diff_{shift_code}_{day_idx}",
            )
            model.Add(day_diff == actual_day_total - c_daily_targets[shift_code][day_idx])
            day_dev = model.NewIntVar(0, len(c_daily_nurses), f"c_day_dev_{shift_code}_{day_idx}")
            model.AddAbsEquality(day_dev, day_diff)
            add_penalty(day_dev, weights[weight_key])
            if shift_code == NIGHT:
                overflow_tier1 = model.NewIntVar(
                    0,
                    len(ratio_working_rank_c),
                    f"c_day_night_overflow_{day_idx}",
                )
                overflow_tier2 = model.NewIntVar(
                    0,
                    len(ratio_working_rank_c),
                    f"c_day_night_overflow_tier2_{day_idx}",
                )
                overflow_tier3 = model.NewIntVar(
                    0,
                    len(ratio_working_rank_c),
                    f"c_day_night_overflow_tier3_{day_idx}",
                )
                target = c_daily_targets[shift_code][day_idx]
                model.Add(overflow_tier1 >= actual_day_total - target)
                model.Add(overflow_tier2 >= actual_day_total - (target + 1))
                model.Add(overflow_tier3 >= actual_day_total - (target + 2))
                add_penalty(overflow_tier1, weights["daily_ratio_night_overflow"])
                add_penalty(overflow_tier2, weights["daily_ratio_night_overflow_tier2"])
                add_penalty(overflow_tier3, weights["daily_ratio_night_overflow_tier3"])

    total_ratio_night_targets = [
        a_daily_targets[NIGHT][day_idx]
        + b_daily_targets[NIGHT][day_idx]
        + c_daily_targets[NIGHT][day_idx]
        for day_idx in range(num_days)
    ]
    night_pool = ratio_working_rank_a + ratio_working_rank_b + ratio_working_rank_c
    if night_pool:
        for day_idx, target in enumerate(total_ratio_night_targets):
            actual_total_night = model.NewIntVar(0, len(night_pool), f"total_day_night_{day_idx}")
            model.Add(
                actual_total_night
                == sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in night_pool)
            )
            overflow_tier1 = model.NewIntVar(0, len(night_pool), f"total_day_night_overflow_{day_idx}")
            overflow_tier2 = model.NewIntVar(0, len(night_pool), f"total_day_night_overflow_tier2_{day_idx}")
            overflow_tier3 = model.NewIntVar(0, len(night_pool), f"total_day_night_overflow_tier3_{day_idx}")
            model.Add(overflow_tier1 >= actual_total_night - target)
            model.Add(overflow_tier2 >= actual_total_night - (target + 1))
            model.Add(overflow_tier3 >= actual_total_night - (target + 2))
            add_penalty(overflow_tier1, weights["daily_total_night_overflow"])
            add_penalty(overflow_tier2, weights["daily_total_night_overflow_tier2"])
            add_penalty(overflow_tier3, weights["daily_total_night_overflow_tier3"])

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

    for day_idx in range(num_days):
        if not rank_a:
            break
        target = rn_night_targets[day_idx]
        cap = parsed["rank_a_night_caps"][day_idx]
        count_a_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_a)
        allowed_max = cap + max(rank_a_night_allowed_excess, 0)
        if target > 0:
            if (
                rank_a_night_cap_mode in {"hard", "hard_then_soft"}
                and not relax_rank_night_mins
            ):
                model.Add(count_a_night >= target)
            else:
                shortfall_cap = max(target, len(rank_a))
                shortfall = model.NewIntVar(0, shortfall_cap, f"rn_night_shortfall_{day_idx}")
                model.Add(shortfall >= target - count_a_night)
                add_penalty(shortfall, weights["rn_night"])
        if rank_a_night_cap_mode in {"hard", "hard_then_soft"} and not relax_rank_a_night_cap:
            model.Add(count_a_night <= cap)
        else:
            over_cap = model.NewIntVar(0, len(rank_a), f"rn_night_over_{day_idx}")
            model.Add(over_cap >= count_a_night - allowed_max)
            add_penalty(over_cap, weights["rn_night_over"])

    for day_idx in range(num_days):
        if not rank_b:
            break
        target = parsed["rank_b_night_targets"][day_idx]
        cap = parsed["rank_b_night_caps"][day_idx]
        count_b_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_b)
        allowed_max = cap + max(rank_b_night_allowed_excess, 0)
        if target > 0:
            if (
                rank_b_night_min_mode in {"hard", "hard_then_soft"}
                and not relax_rank_night_mins
                and not relax_rank_b_night_min
            ):
                model.Add(count_b_night >= target)
            else:
                shortfall_cap = max(target, len(rank_b))
                shortfall = model.NewIntVar(0, shortfall_cap, f"rank_b_night_shortfall_{day_idx}")
                model.Add(shortfall >= target - count_b_night)
                add_penalty(shortfall, weights["rank_b_night"])
        over_cap = model.NewIntVar(0, len(rank_b), f"rank_b_night_over_{day_idx}")
        model.Add(over_cap >= count_b_night - allowed_max)
        add_penalty(over_cap, weights["rank_b_night_over"])

    for day_idx, cap in enumerate(parsed["rank_c_night_caps"]):
        if not rank_c:
            continue
        count_c_night = sum(x[nurse_idx, day_idx, NIGHT] for nurse_idx in rank_c)
        if not relax_rank_c_night_cap:
            model.Add(count_c_night <= cap)
        else:
            allowed_max = cap + max(rank_c_night_allowed_excess, 0)
            over_cap = model.NewIntVar(0, len(rank_c), f"rank_c_night_over_{day_idx}")
            model.Add(over_cap >= count_c_night - allowed_max)
            add_penalty(over_cap, weights["rank_c_night_over"])

    for nurse_idx in working_nurses:
        hard_days = set(hard_assignments[nurse_idx])
        for day_idx, soft_request in soft_assignments[nurse_idx].items():
            if day_idx in hard_days:
                continue
            shift_code, request_weight = soft_request
            violation = model.NewBoolVar(f"soft_req_{nurse_idx}_{day_idx}_{shift_code}")
            model.Add(violation + x[nurse_idx, day_idx, shift_code] >= 1)
            model.Add(violation <= 1 - x[nurse_idx, day_idx, shift_code])
            add_penalty(violation, weights["soft_request"] * request_weight)

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
        if (
            rank_b_night_min_mode == "hard_then_soft"
            and not relax_rank_night_mins
            and not relax_rank_b_night_min
            and not diagnostic_retry_active
        ):
            retry_config = dict(debug_cfg)
            retry_config["_ab_ratio_relax_rank_b_night_min"] = True
            logger.warning(
                "[AB-DEBUG] strict rank B night minimum infeasible; retrying with soft minimum fallback"
            )
            return run_ab_ratio_pipeline(
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
            rank_a_night_cap_mode == "hard_then_soft"
            and not relax_rank_a_night_cap
            and not diagnostic_retry_active
        ):
            retry_config = dict(debug_cfg)
            retry_config["_ab_ratio_relax_rank_a_night_cap"] = True
            logger.warning(
                "[AB-DEBUG] strict rank A night cap infeasible; retrying with soft cap fallback"
            )
            return run_ab_ratio_pipeline(
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
                ("post_night_rest", {"_ab_ratio_relax_post_night_rest": True}),
                ("min_nights", {"_ab_ratio_relax_min_nights": True}),
                ("min_non_working", {"_ab_ratio_relax_min_non_working": True}),
                ("weekly_off", {"_ab_ratio_relax_weekly_off": True}),
                ("no_three_nights", {"_ab_ratio_relax_no_three_nights": True}),
                ("pattern_exact", {"_ab_ratio_relax_pattern_exact": True}),
                ("rank_night_mins", {"_ab_ratio_relax_rank_night_mins": True}),
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
        if feasible_relaxations == ["rank_night_mins"]:
            raise ABRatioInfeasibilityError(
                "AB-RATIO infeasible: the hard rank A/B daily night minimums cannot be met with the current "
                "night-eligible staffing, leave, and hard-request constraints for this roster period."
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
