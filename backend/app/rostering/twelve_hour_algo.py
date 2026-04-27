"""
twelve_hour_algo.py
===================
OR-Tools CP-SAT nurse rostering for 12-hour ward schedules.

12-hour ward rules
------------------
* Two shift types only: "A-12" (day, 12 h) and "N-12" (night, 12 h).
* 14-day planning horizon split into two 7-day weeks.
* Each nurse receives exactly 3 day-offs per week → 6 total day-offs over 14 days.
* Overall roster A-12 : N-12 ratio target is 6 : 5
  (i.e. of every 11 working shifts, ~6 are A-12 and ~5 are N-12).
* For Rank-A nurses specifically the A-12 : N-12 ratio target is 2 : 1
  (i.e. of every 3 working shifts a Rank-A nurse does, ~2 are A-12 and ~1 is N-12).

Public API
----------
run_twelve_hour_pipeline(nurses, shifts, *, hard_requests, soft_requests,
                          prev_last_shift, shift_hours,
                          non_working_shift_codes, progress_callback,
                          milp_config) -> dict

The return value mirrors the format produced by ab_ratio_algo and cp_sat_algo so
the rest of the system (algo_scheduler, formatters, tests) needs no changes.
"""

from __future__ import annotations

import logging
import math
import os

try:
    from ortools.sat.python import cp_model
except ModuleNotFoundError:
    cp_model = None

# ── Shift codes ────────────────────────────────────────────────────────────────
# Internal integer codes used throughout the solver.
# A12 = day shift (12 h);  N12 = night shift (12 h)
OFF, A12, N12, AL = 0, 1, 2, 3
ALL_SHIFTS  = [OFF, A12, N12, AL]
WORK_SHIFTS = [A12, N12]

# Human-readable labels written to the output schedule
SHIFT_LABEL = {OFF: "OFF", A12: "A-12", N12: "N-12", AL: "AL"}

# Reverse mapping: accept all reasonable caller-supplied strings
_SHIFT_STR_TO_CODE: dict[str, int] = {
    "A-12": A12, "A12": A12, "A_12": A12, "DAY": A12,
    "N-12": N12, "N12": N12, "N_12": N12, "NIGHT": N12,
    "OFF":  OFF, "DO": OFF, "RD": OFF,
    "AL":   AL,
}

_LEAVE_CODES = {"HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}

# ── Roster-wide ratio targets ──────────────────────────────────────────────────
# Overall: A-12 : N-12 = 6 : 5  →  fractions of working shifts
_OVERALL_A12_FRAC = 6 / 11   # ≈ 0.545
_OVERALL_N12_FRAC = 5 / 11   # ≈ 0.455

# Rank-A specific: A-12 : N-12 = 2 : 1  →  fractions of their working shifts
_RANK_A_A12_FRAC = 2 / 3     # ≈ 0.667
_RANK_A_N12_FRAC = 1 / 3     # ≈ 0.333

# ── Day-off rule ───────────────────────────────────────────────────────────────
_WEEKLY_DAYOFFS = 3           # per nurse per 7-day week
_TOTAL_DAYOFFS  = 6           # per nurse over 14-day period (2 × 3)

# ── Penalty weights ────────────────────────────────────────────────────────────
W_COVERAGE_SHORT    = 2_000_000   # per missing required nurse on any shift
W_DAYOFF_UNDER      = 1_600_000   # weekly day-off below 3
W_DAYOFF_OVER       = 1_440_000   # weekly day-off above 3 (×0.9)
W_HARD_REQUEST      =   800_000   # unmet hard (approved) shift request
W_SOFT_REQUEST      =     2_000   # unmet soft (pending) shift request
W_OVERALL_RATIO     =    50_000   # deviation from 6:5 overall ratio target
W_RANK_A_RATIO      =    80_000   # deviation from 2:1 Rank-A ratio target
W_DAILY_BALANCE     =     2_000   # day-to-day variation in total working nurses
W_CONSEC_N12        =   300_000   # more than 2 consecutive N-12 shifts
W_POST_NIGHT_OFF    = 1_500_000   # missing mandatory day-off after N-12 block (day 0)

_DEFAULT_TIME_LIMIT_S = 120.0

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.strip().lower() in {"1", "true", "yes", "on"}:
            return True
        if value.strip().lower() in {"0", "false", "no", "off"}:
            return False
    return default


def _to_internal_code(raw, leave_codes: set[str], non_working_codes: set[str]) -> int | None:
    normalized = str(raw).strip().upper()
    if normalized in _SHIFT_STR_TO_CODE:
        return _SHIFT_STR_TO_CODE[normalized]
    if normalized in leave_codes or normalized in non_working_codes:
        return AL
    return None


# ── Greedy warm-start hint ────────────────────────────────────────────────────

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
) -> list[list[int]]:
    """
    Fast O(N×D) greedy schedule to warm-start CP-SAT.

    Strategy:
      1. Pin full-AL nurses and single-day AL/leave requests.
      2. Pin forced day-0 OFFs for post-N12 nurses.
      3. Apply hard shift assignments.
      4. Reserve weekly day-offs (weekends preferred).
      5. Fill remaining days round-robin A-12 / N-12 to respect the 6:5 ratio.
    """
    sched = [[A12] * num_days for _ in range(num_nurses)]
    pinned = [[False] * num_days for _ in range(num_nurses)]

    # Step 1: pin AL nurses and per-day AL requests
    for n in al_nurses_set:
        for d in range(num_days):
            sched[n][d] = AL
            pinned[n][d] = True

    for n in working_nurses:
        for d in al_day_req[n]:
            if d < num_days:
                sched[n][d] = AL
                pinned[n][d] = True

    # Step 2: post-night mandatory OFF on day 0
    for n in post_night_off:
        if 0 < num_days and not pinned[n][0]:
            sched[n][0] = OFF
            pinned[n][0] = True

    # Step 3: hard (approved) shift assignments
    for n in working_nurses:
        for d, code in hard_assignments[n].items():
            if 0 <= d < num_days and not pinned[n][d]:
                sched[n][d] = code
                pinned[n][d] = True

    # Step 4: weekly day-offs (weekends preferred)
    for n in working_nurses:
        for week_idx, w_start in enumerate(range(0, num_days, 7)):
            w_end = min(w_start + 7, num_days)
            target_off = (
                weekly_off_targets[n][week_idx]
                if n in weekly_off_targets and week_idx < len(weekly_off_targets[n])
                else _WEEKLY_DAYOFFS
            )
            existing_off = sum(1 for d in range(w_start, w_end) if sched[n][d] == OFF)
            to_add = max(0, target_off - existing_off)
            candidates = sorted(
                [d for d in range(w_start, w_end) if not pinned[n][d] and sched[n][d] not in (OFF, AL)],
                key=lambda d: (0 if d % 7 in (5, 6) else 1),
            )
            for d in candidates[:to_add]:
                sched[n][d] = OFF
                pinned[n][d] = True

    # Step 5: assign N-12 shifts to approach the 6:5 overall ratio
    # Target ~5/11 of each nurse's working days as N-12
    n12_counts   = [0] * num_nurses
    a12_counts   = [0] * num_nurses
    for n in working_nurses:
        for d in range(num_days):
            if sched[n][d] == N12:
                n12_counts[n] += 1
            elif sched[n][d] == A12:
                a12_counts[n] += 1

    cursor = 0
    wn = list(working_nurses)
    for d in range(num_days):
        for _ in range(len(wn)):
            n = wn[cursor % len(wn)]
            cursor += 1
            if pinned[n][d] or sched[n][d] != A12:
                continue
            total_w = a12_counts[n] + n12_counts[n]
            if total_w == 0:
                continue
            current_n12_frac = n12_counts[n] / total_w
            target_frac = (
                _RANK_A_N12_FRAC if nurse_ranks[n] == "A" else _OVERALL_N12_FRAC
            )
            if current_n12_frac < target_frac:
                # check we won't create 3+ consecutive nights
                consec = 0
                dd = d
                while dd >= 0 and sched[n][dd] == N12:
                    consec += 1
                    dd -= 1
                if consec < 2:
                    sched[n][d] = N12
                    n12_counts[n] += 1
                    a12_counts[n] = max(0, a12_counts[n] - 1)

    return sched


# ── Input parser ───────────────────────────────────────────────────────────────

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
    """
    Parse and normalise all caller-supplied data into clean internal structures.
    """
    hard_requests   = hard_requests   or {}
    soft_requests   = soft_requests   or {}
    prev_last_shift = prev_last_shift or {}
    non_working_codes = {str(c).strip().upper() for c in (non_working_shift_codes or set())}
    leave_codes = _LEAVE_CODES | {"AL"}

    nurses_sorted = sorted(nurses, key=lambda n: n["id"])
    num_days      = len(shifts)
    num_nurses    = len(nurses_sorted)
    nurse_names   = [n["name"] for n in nurses_sorted]
    nurse_ranks   = [n["rank"] for n in nurses_sorted]
    id_to_idx     = {n["id"]: idx for idx, n in enumerate(nurses_sorted)}
    id_to_name    = {n["id"]: n["name"] for n in nurses_sorted}

    # Demand: per-day, per-shift, per-rank requirements
    # Caller passes shifts as a list of dicts keyed by shift name.
    # For 12-hour wards the expected keys are "A-12" and "N-12".
    demand: list[dict[int, dict[str, int]]] = []
    for day in shifts:
        day_demand: dict[int, dict[str, int]] = {}
        for raw_key, code in (("A-12", A12), ("N-12", N12)):
            req = day.get(raw_key) or day.get(raw_key.replace("-", "")) or {}
            day_demand[code] = {r: _coerce_int(req.get(r, 0), 0) for r in "ABC"}
        demand.append(day_demand)

    # Detect full-AL and per-day AL nurses
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
            code = _to_internal_code(raw_shift, leave_codes, non_working_codes)
            if code is None:
                continue
            if code == AL:
                al_day_req[nurse_idx].add(day_idx)
                leave_overlay.setdefault(id_to_name[nurse_id], {})[day_idx] = (
                    str(raw_shift).strip().upper()
                )
                continue
            hard_assignments[nurse_idx][day_idx] = code

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
            code = _to_internal_code(raw_shift, leave_codes, non_working_codes)
            if code is None or code == AL:
                continue
            weight = 5 if str(priority).strip().lower() == "approved" else 1
            soft_assignments[nurse_idx][day_idx] = (code, weight)

    for nurse_idx, al_days in enumerate(al_day_req):
        if len(al_days) >= num_days:
            al_nurses_set.add(nurse_idx)

    working_nurses = [i for i in range(num_nurses) if i not in al_nurses_set]

    # Post-night OFF on day 0 for nurses whose last shift of the previous period was N-12
    post_night_off: set[int] = set()
    for nurse_id, shift_name in prev_last_shift.items():
        nurse_idx = id_to_idx.get(nurse_id)
        if nurse_idx is None or nurse_idx in al_nurses_set:
            continue
        norm = str(shift_name).strip().upper()
        if norm in {"N-12", "N12", "N_12", "NIGHT"}:
            post_night_off.add(nurse_idx)

    # Weekly OFF targets per nurse (accounting for leave days)
    weekly_off_targets: dict[int, list[int]] = {}
    for n in working_nurses:
        targets = []
        for w_start in range(0, num_days, 7):
            w_end = min(w_start + 7, num_days)
            week_len = w_end - w_start
            leave_days = sum(1 for d in range(w_start, w_end) if d in al_day_req[n])
            free_days = max(0, week_len - leave_days)
            # Proportionally reduce target when leave covers part of the week
            if free_days == 0:
                targets.append(0)
            elif leave_days >= week_len:
                targets.append(0)
            else:
                # Scale 3-per-week target by fraction of week that is free
                targets.append(round(_WEEKLY_DAYOFFS * free_days / week_len))
        weekly_off_targets[n] = targets

    return {
        "nurses_sorted":      nurses_sorted,
        "num_days":           num_days,
        "num_nurses":         num_nurses,
        "nurse_names":        nurse_names,
        "nurse_ranks":        nurse_ranks,
        "demand":             demand,
        "al_nurses_set":      al_nurses_set,
        "al_day_req":         al_day_req,
        "hard_assignments":   hard_assignments,
        "soft_assignments":   soft_assignments,
        "leave_overlay":      leave_overlay,
        "working_nurses":     working_nurses,
        "post_night_off":     post_night_off,
        "weekly_off_targets": weekly_off_targets,
    }


# ── Output formatter ───────────────────────────────────────────────────────────

def _format_output(
    nurses_sorted: list[dict],
    schedule: list[list[int]],
    nurse_names: list[str],
    nurse_ranks: list[str],
    num_days: int,
    penalty_score: float,
    leave_overlay: dict[str, dict[int, str]],
) -> dict:
    """
    Convert the raw integer schedule matrix into the standard output dict used
    by the rest of the system.  The format is identical to ab_ratio_algo and
    cp_sat_algo outputs, with the addition of 12-hour shift stats.
    """
    leave_codes    = _LEAVE_CODES | {"AL"}
    name_to_nurse  = {n["name"]: n for n in nurses_sorted}
    output_nurses: list[dict] = []

    for idx, name in enumerate(nurse_names):
        nurse_info = name_to_nurse.get(name)
        if nurse_info is None:
            continue
        raw_codes = schedule[idx] if idx < len(schedule) else [OFF] * num_days
        labels    = [SHIFT_LABEL.get(c, "OFF") for c in raw_codes]

        # Restore original leave-type labels from the overlay
        for day_idx, leave_code in (leave_overlay.get(name) or {}).items():
            if 0 <= day_idx < num_days:
                labels[day_idx] = leave_code

        # Alternate DO / RD on every 2nd plain OFF (mirrors existing algo output)
        off_count = 0
        for i, lbl in enumerate(labels):
            if lbl == "OFF":
                off_count += 1
                if off_count % 2 == 0:
                    labels[i] = "RD"

        output_nurses.append({
            "id":       nurse_info["id"],
            "name":     name,
            "rank":     nurse_ranks[idx],
            "schedule": labels,
            "stats": {
                "total_shifts":  sum(1 for l in labels if l not in {"OFF", "RD"} and l not in leave_codes),
                "a12_shifts":    labels.count("A-12"),
                "n12_shifts":    labels.count("N-12"),
                "days_off":      labels.count("OFF") + labels.count("RD"),
                "al_days":       sum(1 for l in labels if l in leave_codes),
            },
        })

    output_nurses.sort(key=lambda n: n["id"])
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days":      num_days,
            "num_nurses":    len(output_nurses),
            "algorithm":     "12HR",
            "penalty_score": penalty_score,
        },
    }


# ── Main pipeline ──────────────────────────────────────────────────────────────

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
    """
    Generate a nurse roster for a 12-hour ward using OR-Tools CP-SAT.

    Parameters
    ----------
    nurses : list[dict]
        Each dict must have ``id``, ``name``, ``rank`` (A/B/C).
    shifts : list[dict]
        14-element list.  Each element is a dict with keys ``"A-12"`` and
        ``"N-12"``; the value is a rank-demand dict e.g. ``{"A": 2, "B": 3}``.
    hard_requests : dict, optional
        ``{nurse_id: [(day_idx, shift_name), ...]}``.  Enforced as hard
        constraints (leave days, non-working codes, approved shift locks).
    soft_requests : dict, optional
        Same shape as hard_requests.  The solver satisfies these where possible.
    prev_last_shift : dict, optional
        ``{nurse_id: shift_name}`` — last shift of the preceding period.
        Nurses whose previous shift was N-12 receive a mandatory OFF on day 0.
    shift_hours : dict, optional
        Ignored for 12-hour wards (both shifts are always 12 h) but accepted
        for API compatibility.
    non_working_shift_codes : set, optional
        Additional shift codes that should be treated as AL (leave).
    progress_callback : callable, optional
        Called as ``callback(step, total_steps, penalty)`` at key stages.
    milp_config : dict, optional
        Solver tuning overrides (e.g. ``twelve_hour_time_limit_s``).

    Returns
    -------
    dict
        ``{"nurses": [...], "metadata": {...}}`` — identical schema to the
        8-hour algo outputs, with ``"a12_shifts"`` and ``"n12_shifts"`` stats
        instead of ``"am_shifts"`` / ``"pm_shifts"`` / ``"night_shifts"``.
    """
    if cp_model is None:
        raise RuntimeError(
            "12HR rostering requires the optional 'ortools' dependency, "
            "but it is not installed in this environment."
        )

    if progress_callback:
        progress_callback(0, 4, float("inf"))

    cfg     = dict(milp_config or {})
    parsed  = _parse_inputs(
        nurses, shifts, hard_requests, soft_requests,
        prev_last_shift, shift_hours, non_working_shift_codes, milp_config,
    )

    num_nurses        = parsed["num_nurses"]
    num_days          = parsed["num_days"]
    nurse_names       = parsed["nurse_names"]
    nurse_ranks       = parsed["nurse_ranks"]
    demand            = parsed["demand"]
    al_nurses_set     = parsed["al_nurses_set"]
    al_day_req        = parsed["al_day_req"]
    hard_assignments  = parsed["hard_assignments"]
    soft_assignments  = parsed["soft_assignments"]
    working_nurses    = parsed["working_nurses"]
    post_night_off    = parsed["post_night_off"]
    weekly_off_targets = parsed["weekly_off_targets"]

    rank_a = [i for i in range(num_nurses) if nurse_ranks[i] == "A"]
    rank_b = [i for i in range(num_nurses) if nurse_ranks[i] == "B"]
    rank_c = [i for i in range(num_nurses) if nurse_ranks[i] == "C"]

    if progress_callback:
        progress_callback(1, 4, float("inf"))

    # ── Build CP-SAT model ────────────────────────────────────────────────────
    model = cp_model.CpModel()

    # x[n, d, s] = 1 iff nurse n is assigned shift s on day d
    x: dict[tuple[int, int, int], cp_model.IntVar] = {
        (n, d, s): model.NewBoolVar(f"x_{n}_{d}_{s}")
        for n in range(num_nurses)
        for d in range(num_days)
        for s in ALL_SHIFTS
    }

    # Exactly one shift per nurse per day
    for n in range(num_nurses):
        for d in range(num_days):
            model.AddExactlyOne([x[n, d, s] for s in ALL_SHIFTS])

    # ── Hard / fixed assignments ───────────────────────────────────────────────
    # Full-AL nurses
    for n in al_nurses_set:
        for d in range(num_days):
            model.Add(x[n, d, AL] == 1)

    # Per-day AL requests for non-full-AL nurses
    for n in working_nurses:
        for d in range(num_days):
            if d in al_day_req[n]:
                model.Add(x[n, d, AL] == 1)
            else:
                model.Add(x[n, d, AL] == 0)

    # Mandatory day-off on day 0 for post-N12 nurses
    for n in post_night_off:
        if 0 not in al_day_req[n]:
            model.Add(x[n, 0, OFF] == 1)

    # Hard shift requests
    for n in working_nurses:
        for d, code in hard_assignments[n].items():
            if d not in al_day_req[n]:
                model.Add(x[n, d, code] == 1)

    # ── Objective / penalty accumulator ───────────────────────────────────────
    penalty_vars:    list[cp_model.IntVar] = []
    penalty_weights: list[int]             = []

    def _add_penalty(var: cp_model.IntVar, weight: int) -> None:
        penalty_vars.append(var)
        penalty_weights.append(weight)

    def _shortage(name: str, cap: int, required: int, supplied_expr, weight: int):
        v = model.NewIntVar(0, max(cap, 1), name)
        model.Add(v >= required - supplied_expr)
        _add_penalty(v, weight)
        return v

    def _excess(name: str, cap: int, supplied_expr, limit: int, weight: int):
        v = model.NewIntVar(0, cap, name)
        model.Add(v >= supplied_expr - limit)
        _add_penalty(v, weight)
        return v

    # ── 1. Shift coverage ─────────────────────────────────────────────────────
    for d in range(num_days):
        for s in WORK_SHIFTS:
            req_A = demand[d][s].get("A", 0)
            req_B = demand[d][s].get("B", 0)
            req_C = demand[d][s].get("C", 0)
            total_req = req_A + req_B + req_C
            if total_req == 0:
                continue

            cnt_A = sum(x[n, d, s] for n in rank_a) if rank_a else 0
            cnt_B = sum(x[n, d, s] for n in rank_b) if rank_b else 0
            cnt_C = sum(x[n, d, s] for n in rank_c) if rank_c else 0
            cnt_tot = cnt_A + cnt_B + cnt_C

            _shortage(f"cov_tot_{d}_{s}", total_req, total_req, cnt_tot, W_COVERAGE_SHORT)
            if req_A > 0:
                _shortage(f"cov_a_{d}_{s}", req_A, req_A, cnt_A, W_COVERAGE_SHORT)
            if req_A + req_B > 0:
                _shortage(f"cov_ab_{d}_{s}", req_A + req_B, req_A + req_B,
                          cnt_A + cnt_B, W_COVERAGE_SHORT // 2)

    # ── 2. Weekly day-off constraint: exactly 3 per nurse per week ─────────────
    # Implemented as penalised under/over rather than hard equality so that the
    # solver remains feasible when leave days consume working slots.
    for n in working_nurses:
        for week_idx, w_start in enumerate(range(0, num_days, 7)):
            w_end = min(w_start + 7, num_days)
            leave_days_this_week = sum(1 for d in range(w_start, w_end) if d in al_day_req[n])
            free_days = max(0, (w_end - w_start) - leave_days_this_week)

            target = (
                weekly_off_targets[n][week_idx]
                if n in weekly_off_targets and week_idx < len(weekly_off_targets[n])
                else min(_WEEKLY_DAYOFFS, free_days)
            )
            if free_days == 0 or target == 0:
                continue

            off_expr = sum(x[n, d, OFF] for d in range(w_start, w_end))
            _shortage(
                f"do_under_{n}_{week_idx}",
                target, target, off_expr, W_DAYOFF_UNDER,
            )
            _excess(
                f"do_over_{n}_{week_idx}",
                free_days - target, off_expr, target, W_DAYOFF_OVER,
            )

    # ── 3. No more than 2 consecutive N-12 shifts ──────────────────────────────
    for n in working_nurses:
        for d in range(num_days - 2):
            three_consec = x[n, d, N12] + x[n, d + 1, N12] + x[n, d + 2, N12]
            over = model.NewIntVar(0, 1, f"consec_n12_{n}_{d}")
            model.Add(over >= three_consec - 2)
            _add_penalty(over, W_CONSEC_N12)

    # ── 4. Overall A-12 : N-12 ratio target (6 : 5 across all nurses) ─────────
    # We penalise the absolute deviation from the target for each working nurse.
    for n in working_nurses:
        total_work = sum(x[n, d, s] for d in range(num_days) for s in WORK_SHIFTS)
        a12_count  = sum(x[n, d, A12] for d in range(num_days))
        n12_count  = sum(x[n, d, N12] for d in range(num_days))

        # Expected N-12 = total_work * 5/11  →  11 * n12 ≈ 5 * total_work
        # Penalise |11 * n12 − 5 * total_work|  (integer arithmetic, multiply through)
        diff_over  = model.NewIntVar(0, num_days * 11, f"ratio_over_{n}")
        diff_under = model.NewIntVar(0, num_days * 11, f"ratio_under_{n}")
        model.Add(diff_over  >= 5 * total_work - 11 * n12_count)
        model.Add(diff_under >= 11 * n12_count - 5 * total_work)
        _add_penalty(diff_over,  W_OVERALL_RATIO)
        _add_penalty(diff_under, W_OVERALL_RATIO)

    # ── 5. Rank-A specific ratio target (2 : 1) ────────────────────────────────
    for n in rank_a:
        if n not in working_nurses:
            continue
        a12_count = sum(x[n, d, A12] for d in range(num_days))
        n12_count = sum(x[n, d, N12] for d in range(num_days))

        # 3 * n12 ≈ 1 * total_work  →  penalise |3 * n12 − (a12 + n12)|
        total_work = a12_count + n12_count
        diff_over  = model.NewIntVar(0, num_days * 3, f"ra_ratio_over_{n}")
        diff_under = model.NewIntVar(0, num_days * 3, f"ra_ratio_under_{n}")
        model.Add(diff_over  >= 1 * total_work - 3 * n12_count)
        model.Add(diff_under >= 3 * n12_count - 1 * total_work)
        _add_penalty(diff_over,  W_RANK_A_RATIO)
        _add_penalty(diff_under, W_RANK_A_RATIO)

    # ── 6. Soft shift requests ─────────────────────────────────────────────────
    for n in working_nurses:
        hard_days = set(hard_assignments[n])
        for d, (code, req_weight) in soft_assignments[n].items():
            if d in hard_days or d in al_day_req[n]:
                continue
            viol = model.NewBoolVar(f"soft_{n}_{d}_{code}")
            model.Add(viol + x[n, d, code] >= 1)
            model.Add(viol <= 1 - x[n, d, code])
            _add_penalty(viol, W_SOFT_REQUEST * req_weight)

    # ── 7. Day-to-day working-nurse balance ────────────────────────────────────
    if num_days >= 2:
        daily_totals = [
            sum(x[n, d, s] for n in working_nurses for s in WORK_SHIFTS)
            for d in range(num_days)
        ]
        for d in range(num_days - 1):
            gap = model.NewIntVar(0, num_nurses, f"daily_gap_{d}")
            model.Add(gap >= daily_totals[d]     - daily_totals[d + 1])
            model.Add(gap >= daily_totals[d + 1] - daily_totals[d])
            _add_penalty(gap, W_DAILY_BALANCE)

    if progress_callback:
        progress_callback(2, 4, float("inf"))

    # ── Objective ─────────────────────────────────────────────────────────────
    if penalty_vars:
        model.Minimize(cp_model.LinearExpr.WeightedSum(penalty_vars, penalty_weights))

    # ── Warm-start hint ───────────────────────────────────────────────────────
    hint_sched = _build_greedy_hint(
        num_nurses, num_days, working_nurses, nurse_ranks,
        al_nurses_set, al_day_req, post_night_off,
        hard_assignments, weekly_off_targets,
    )
    for n in range(num_nurses):
        for d in range(num_days):
            for s in ALL_SHIFTS:
                model.AddHint(x[n, d, s], 1 if hint_sched[n][d] == s else 0)

    if progress_callback:
        progress_callback(3, 4, float("inf"))

    # ── Solve ─────────────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(
        cfg.get("twelve_hour_time_limit_s", _DEFAULT_TIME_LIMIT_S)
    )
    solver.parameters.num_search_workers = max(1, (os.cpu_count() or 2) - 1)
    solver.parameters.log_search_progress = False

    status = solver.Solve(model)
    status_str = solver.StatusName(status)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(
            f"12HR CP-SAT solver returned '{status_str}' — no feasible solution found. "
            "Verify that nurse demand, leave requests, and day-off requirements are "
            "mutually consistent."
        )

    # ── Extract solution ──────────────────────────────────────────────────────
    schedule: list[list[int]] = []
    for n in range(num_nurses):
        row: list[int] = []
        for d in range(num_days):
            assigned = OFF
            for s in ALL_SHIFTS:
                if solver.Value(x[n, d, s]):
                    assigned = s
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
